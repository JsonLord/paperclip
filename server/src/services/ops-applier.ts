import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies, goals, instanceSettings, issues } from "@paperclipai/db";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";

/**
 * Apply declarative operations committed to a GitHub repository.
 *
 * The control plane's mutating API needs a board session, which an operator working
 * from outside the deployment does not have; the alternative was baking every change
 * into the boot script and restarting. This polls a repository instead, so a change is
 * a commit: no restart, no credential handed around, and the history of what was asked
 * for lives in git next to the company's own files.
 *
 * SECURITY: whoever can push to the ops repository can create goals and issues and
 * move issues between statuses. That is the whole point, but it means the repository
 * is a control surface — keep it private and restrict who can push. The allowlist
 * below is deliberately narrow: no secrets, no adapter configuration, no agent
 * creation, no deletions. Anything destructive stays a deliberate human action.
 */

const opSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("goal.create"),
    company: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    level: z.enum(["company", "team", "agent", "task"]).optional(),
    status: z.enum(["planned", "active", "achieved", "cancelled"]).optional(),
    parentGoalTitle: z.string().optional(),
    ownerAgent: z.string().optional(),
    acceptanceCriteria: z.array(z.string()).optional(),
    cannotCompleteIf: z.array(z.string()).optional(),
    outputPaths: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal("issue.create"),
    company: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    goalTitle: z.string().optional(),
    assignee: z.string().optional(),
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
  }),
  z.object({
    op: z.literal("issue.update"),
    company: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    assignee: z.string().optional(),
  }),
]);

export const opsDocumentSchema = z.object({
  apiVersion: z.literal("paperclip.ops/v1"),
  description: z.string().optional(),
  operations: z.array(opSchema).min(1).max(100),
});
export type OpsDocument = z.infer<typeof opsDocumentSchema>;

/** Parse a document, returning the reason rather than throwing on malformed input. */
export function parseOpsDocument(raw: string): { doc: OpsDocument } | { error: string } {
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return { error: "not valid JSON" } }
  const parsed = opsDocumentSchema.safeParse(json);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 300) };
  return { doc: parsed.data };
}

export function opsApplierService(db: Db) {
  async function resolveCompany(ref: string) {
    const rows = await db.select().from(companies);
    return rows.find((c) => c.id === ref || (c.name ?? "").trim() === ref.trim()) ?? null;
  }
  async function resolveAgent(companyId: string, ref: string) {
    const rows = await db.select().from(agents).where(eq(agents.companyId, companyId));
    return rows.find((a) => a.id === ref || (a.name ?? "").trim() === ref.trim()) ?? null;
  }
  async function resolveGoal(companyId: string, title: string) {
    const rows = await db.select().from(goals).where(eq(goals.companyId, companyId));
    return rows.find((g) => (g.title ?? "").trim() === title.trim()) ?? null;
  }
  async function resolveIssue(companyId: string, title: string) {
    const rows = await db.select().from(issues).where(eq(issues.companyId, companyId));
    return rows.find((i) => (i.title ?? "").trim() === title.trim()) ?? null;
  }

  /** Apply one document. Operations run in order; the first failure stops the document. */
  async function apply(doc: OpsDocument): Promise<{ applied: number; skipped: number; error?: string }> {
    let applied = 0;
    let skipped = 0;
    for (const [index, operation] of doc.operations.entries()) {
      const company = await resolveCompany(operation.company);
      if (!company) return { applied, skipped, error: `operation ${index}: unknown company "${operation.company}"` };

      if (operation.op === "goal.create") {
        if (await resolveGoal(company.id, operation.title)) { skipped += 1; continue }
        const parent = operation.parentGoalTitle ? await resolveGoal(company.id, operation.parentGoalTitle) : null;
        if (operation.parentGoalTitle && !parent) return { applied, skipped, error: `operation ${index}: unknown parent goal "${operation.parentGoalTitle}"` };
        const owner = operation.ownerAgent ? await resolveAgent(company.id, operation.ownerAgent) : null;
        if (operation.ownerAgent && !owner) return { applied, skipped, error: `operation ${index}: unknown agent "${operation.ownerAgent}"` };
        await db.insert(goals).values({
          companyId: company.id, title: operation.title, description: operation.description ?? null,
          level: operation.level ?? "task", status: operation.status ?? "planned",
          parentId: parent?.id ?? null, ownerAgentId: owner?.id ?? null,
          acceptanceCriteria: operation.acceptanceCriteria ?? [],
          cannotCompleteIf: operation.cannotCompleteIf ?? [],
          outputPaths: operation.outputPaths ?? [],
        });
        applied += 1;
        continue;
      }

      if (operation.op === "issue.create") {
        if (await resolveIssue(company.id, operation.title)) { skipped += 1; continue }
        const goal = operation.goalTitle ? await resolveGoal(company.id, operation.goalTitle) : null;
        if (operation.goalTitle && !goal) return { applied, skipped, error: `operation ${index}: unknown goal "${operation.goalTitle}"` };
        const assignee = operation.assignee ? await resolveAgent(company.id, operation.assignee) : null;
        if (operation.assignee && !assignee) return { applied, skipped, error: `operation ${index}: unknown agent "${operation.assignee}"` };
        await db.insert(issues).values({
          companyId: company.id, title: operation.title, description: operation.description ?? null,
          goalId: goal?.id ?? null, assigneeAgentId: assignee?.id ?? null,
          status: operation.status ?? "backlog", priority: operation.priority ?? "medium",
        });
        applied += 1;
        continue;
      }

      // issue.update
      const issue = await resolveIssue(company.id, operation.title);
      if (!issue) return { applied, skipped, error: `operation ${index}: unknown issue "${operation.title}"` };
      const assignee = operation.assignee ? await resolveAgent(company.id, operation.assignee) : null;
      if (operation.assignee && !assignee) return { applied, skipped, error: `operation ${index}: unknown agent "${operation.assignee}"` };
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (operation.status) patch.status = operation.status;
      if (operation.priority) patch.priority = operation.priority;
      if (assignee) patch.assigneeAgentId = assignee.id;
      await db.update(issues).set(patch).where(and(eq(issues.id, issue.id), eq(issues.companyId, company.id)));
      applied += 1;
    }
    return { applied, skipped };
  }

  async function readState(): Promise<Record<string, string>> {
    const row = await db.select().from(instanceSettings).limit(1).then((rows) => rows[0]);
    const experimental = (row?.experimental ?? {}) as Record<string, unknown>;
    const state = experimental.opsApplied;
    return state && typeof state === "object" ? { ...(state as Record<string, string>) } : {};
  }
  async function writeState(next: Record<string, string>) {
    const row = await db.select().from(instanceSettings).limit(1).then((rows) => rows[0]);
    const experimental = { ...((row?.experimental ?? {}) as Record<string, unknown>), opsApplied: next };
    if (row) await db.update(instanceSettings).set({ experimental, updatedAt: new Date() }).where(eq(instanceSettings.id, row.id));
    else await db.insert(instanceSettings).values({ experimental });
  }

  return { apply, readState, writeState, resolveCompany };
}

interface OpsFile { path: string; sha: string; content: string }

/** Fetch every .json under the configured path at the repository's default branch. */
export async function fetchOpsFiles(repo: string, path: string, token: string, fetchImpl = fetch): Promise<OpsFile[]> {
  const base = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": "paperclip-ops-applier" };
  const listing = await fetchImpl(`${base}/repos/${repo}/contents/${path}`, { headers });
  if (!listing.ok) return [];
  const entries = (await listing.json()) as Array<{ name: string; path: string; sha: string; type: string }>;
  const files: OpsFile[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry.type !== "file" || !entry.name.endsWith(".json")) continue;
    const blob = await fetchImpl(`${base}/repos/${repo}/contents/${entry.path}`, { headers: { ...headers, accept: "application/vnd.github.raw" } });
    if (!blob.ok) continue;
    files.push({ path: entry.path, sha: entry.sha, content: await blob.text() });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

let opsTimer: NodeJS.Timeout | null = null;

export function startOpsApplier(db: Db): void {
  if (opsTimer) return;
  const repo = process.env.PAPERCLIP_OPS_REPO?.trim();
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!repo || !token) return;
  const path = process.env.PAPERCLIP_OPS_PATH?.trim() || "ops";
  const intervalMs = Math.max(60_000, Number(process.env.PAPERCLIP_OPS_INTERVAL_MS) || 300_000);
  const svc = opsApplierService(db);

  const tick = async () => {
    const files = await fetchOpsFiles(repo, path, token);
    if (!files.length) return;
    const state = await svc.readState();
    let changed = false;
    for (const file of files) {
      // The sha changes when the file changes, so an edited document is applied again;
      // the per-operation existence checks keep that from duplicating anything.
      if (state[file.path] === file.sha) continue;
      const parsed = parseOpsDocument(file.content);
      if ("error" in parsed) {
        logger.warn({ file: file.path, reason: parsed.error }, "ops: document rejected");
        state[file.path] = file.sha; changed = true; // do not re-read a malformed file every tick
        continue;
      }
      const result = await svc.apply(parsed.doc);
      if (result.error) {
        logger.warn({ file: file.path, ...result }, "ops: document failed — leaving it to retry");
        continue;
      }
      logger.info({ file: file.path, ...result }, "ops: document applied");
      state[file.path] = file.sha; changed = true;
    }
    if (changed) await svc.writeState(state);
  };

  const run = () => { void tick().catch((err) => logger.error({ err }, "ops: apply cycle failed")) };
  setTimeout(run, 20_000);
  opsTimer = setInterval(run, intervalMs);
  logger.info({ repo, path, intervalMs }, "ops applier started");
}
