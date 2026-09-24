import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, approvals, companies, companyJulesSources, goals, heartbeatRuns, instanceSettings, issueComments, issues, julesProfiles, julesProfileSources, julesSessions } from "@paperclipai/db";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { heartbeatService } from "./heartbeat.js";
import { secretService } from "./secrets.js";

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
    op: z.literal("goal.update"),
    company: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(["planned", "active", "achieved", "cancelled"]).optional(),
    description: z.string().optional(),
    ownerAgent: z.string().optional(),
  }),
  z.object({
    op: z.literal("issue.comment"),
    company: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1).max(8000),
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

/** Author recorded on comments applied from the ops repository. */
export const OPS_AUTHOR = "ops-repo";

export function opsApplierService(db: Db) {
  const heartbeat = heartbeatService(db);
  /**
   * Wake an assignee the way the HTTP routes do. The applier writes through drizzle
   * rather than the routes, so without this an issue made actionable from the ops
   * repository would sit there until some unrelated event happened to wake the agent.
   * Backlog never wakes anyone, matching the issue create route.
   */
  async function wakeAssignee(agentId: string | null, issueId: string, status: string, mutation: string) {
    if (!agentId || status === "backlog") return;
    await heartbeat
      .wakeup(agentId, {
        source: "assignment", triggerDetail: "system", reason: "issue_assigned",
        payload: { issueId, mutation }, requestedByActorType: "user", requestedByActorId: OPS_AUTHOR,
        contextSnapshot: { issueId, source: `ops.${mutation}` },
      })
      .catch((err) => logger.warn({ err, issueId }, "ops: failed to wake assignee"));
  }

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
        const [created] = await db.insert(issues).values({
          companyId: company.id, title: operation.title, description: operation.description ?? null,
          goalId: goal?.id ?? null, assigneeAgentId: assignee?.id ?? null,
          status: operation.status ?? "backlog", priority: operation.priority ?? "medium",
        }).returning();
        await wakeAssignee(assignee?.id ?? null, created?.id ?? "", operation.status ?? "backlog", "create");
        applied += 1;
        continue;
      }

      if (operation.op === "goal.update") {
        const goal = await resolveGoal(company.id, operation.title);
        if (!goal) return { applied, skipped, error: `operation ${index}: unknown goal "${operation.title}"` };
        const owner = operation.ownerAgent ? await resolveAgent(company.id, operation.ownerAgent) : null;
        if (operation.ownerAgent && !owner) return { applied, skipped, error: `operation ${index}: unknown agent "${operation.ownerAgent}"` };
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (operation.status) patch.status = operation.status;
        if (operation.description !== undefined) patch.description = operation.description;
        if (owner) patch.ownerAgentId = owner.id;
        await db.update(goals).set(patch).where(and(eq(goals.id, goal.id), eq(goals.companyId, company.id)));
        applied += 1;
        continue;
      }

      if (operation.op === "issue.comment") {
        const target = await resolveIssue(company.id, operation.title);
        if (!target) return { applied, skipped, error: `operation ${index}: unknown issue "${operation.title}"` };
        // Attributed to the operator, not to an agent: a comment arriving through the
        // ops repository is a human steering the work, and the audit trail should say so.
        await db.insert(issueComments).values({ companyId: company.id, issueId: target.id, authorUserId: OPS_AUTHOR, body: operation.body });
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
      await wakeAssignee(assignee?.id ?? issue.assigneeAgentId ?? null, issue.id, operation.status ?? issue.status, "update");
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

/**
 * Build the status snapshot written back to the ops repository each cycle.
 *
 * This is the read half of the loop: an operator steering from outside has no board
 * session, so without it they would be acting on a backup dump up to a day old.
 *
 * Only structural fields are exported. Descriptions and comment bodies are left out —
 * they are free text that can accumulate anything, and the snapshot's job is to say
 * what state the company is in, not to mirror its contents. Approval payloads are
 * summarised to their type and age: enough to see that a decision is waiting and how
 * long it has waited, without copying what is being approved.
 */
export function opsStatusService(db: Db) {
  const secrets = secretService(db);

  /**
   * Why Jules state is exported at all.
   *
   * A Jules dispatch that is refused never reaches the remote service, and the refusal
   * is recorded in `heartbeat_runs` and `jules_capacity_events` — both of which the
   * backup deliberately drops, so a container restart erases every trace of why ten
   * remote workers are sitting idle. `jules_sessions` and the binding tables do survive,
   * and together they answer the only questions worth asking from outside: is a source
   * bound, does a profile hold a credential this company can actually read, and has a
   * remote session ever been created.
   *
   * Credentials are reported as readable or not. The value never leaves the deployment.
   */
  async function julesState(companyId: string, agentName: Map<string, string | null>) {
    const [sourceRows, profileRows, mappingRows, sessionRows] = await Promise.all([
      db.select().from(companyJulesSources).where(eq(companyJulesSources.companyId, companyId)),
      db.select().from(julesProfiles),
      db.select().from(julesProfileSources),
      db.select().from(julesSessions).where(eq(julesSessions.companyId, companyId)),
    ]);
    const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
    const sources = [];
    for (const source of sourceRows) {
      const bound = mappingRows.filter((mapping) => mapping.companySourceId === source.id);
      const profiles = [];
      for (const mapping of bound) {
        const profile = profileById.get(mapping.profileId);
        if (!profile) continue;
        const credential = await secrets
          .resolveSecretValue(companyId, profile.secretRef, "latest")
          .then(() => "readable" as const)
          .catch(() => "unreadable" as const);
        profiles.push({
          name: profile.name, status: profile.status, enabled: profile.enabled, mappingStatus: mapping.status,
          credential, capabilities: profile.capabilities ?? [],
          capabilityReadiness: Object.fromEntries(Object.entries(profile.capabilityReadiness ?? {}).map(([key, value]) => [key, value?.status ?? "configured"])),
        });
      }
      sources.push({
        repository: source.repository, source: source.source, startingBranch: source.startingBranch,
        enabled: source.enabled, requiredCapabilities: source.requiredCapabilities ?? [], profiles,
      });
    }
    const recentSessions = [...sessionRows]
      .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime())
      .slice(0, 20)
      .map((session) => ({
        agent: agentName.get(session.agentId) ?? null, status: session.status,
        julesSessionId: session.julesSessionId, pullRequestUrl: session.pullRequestUrl ?? null,
        completionCandidate: session.completionCandidate, waitReason: session.waitReason ?? null,
        reconciliationError: session.reconciliationError ? String(session.reconciliationError).slice(0, 200) : null,
        startedAt: session.startedAt, finishedAt: session.finishedAt,
      }));
    return { sources, sessionCount: sessionRows.length, recentSessions };
  }

  async function snapshot(): Promise<Record<string, unknown>> {
    const companyRows = await db.select().from(companies);
    const out: Array<Record<string, unknown>> = [];
    for (const company of companyRows) {
      const [agentRows, goalRows, issueRows, approvalRows, runRows] = await Promise.all([
        db.select().from(agents).where(eq(agents.companyId, company.id)),
        db.select().from(goals).where(eq(goals.companyId, company.id)),
        db.select().from(issues).where(eq(issues.companyId, company.id)),
        db.select().from(approvals).where(and(eq(approvals.companyId, company.id), eq(approvals.status, "pending"))),
        db.select().from(heartbeatRuns).where(eq(heartbeatRuns.companyId, company.id)),
      ]);
      const agentName = new Map(agentRows.map((a) => [a.id, a.name]));
      const goalTitle = new Map(goalRows.map((g) => [g.id, g.title]));
      const recentRuns = [...runRows]
        .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime())
        .slice(0, 20);
      out.push({
        id: company.id,
        name: company.name,
        repository: company.firmGithubRepo ?? null,
        agents: agentRows.map((a) => ({ name: a.name, adapter: a.adapterType, status: a.status, pauseReason: a.pauseReason ?? null })),
        goals: goalRows.map((g) => ({ title: g.title, level: g.level, status: g.status, owner: agentName.get(g.ownerAgentId ?? "") ?? null })),
        issues: issueRows.map((i) => ({ title: i.title, status: i.status, priority: i.priority, assignee: agentName.get(i.assigneeAgentId ?? "") ?? null, goal: goalTitle.get(i.goalId ?? "") ?? null })),
        approvalsPending: approvalRows.map((a) => ({ type: a.type, requestedBy: agentName.get(a.requestedByAgentId ?? "") ?? null, waitingSince: a.createdAt })),
        recentRuns: recentRuns.map((r) => ({ agent: agentName.get(r.agentId) ?? null, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt, errorCode: r.errorCode ?? null, error: r.error ? String(r.error).slice(0, 200) : null })),
        jules: await julesState(company.id, agentName),
      });
    }
    return { generatedAt: new Date().toISOString(), note: "Written by the Space each ops cycle. Read-only mirror; edit nothing here.", companies: out };
  }
  return { snapshot };
}

/** Commit the snapshot, creating or updating it. No-op when the content is unchanged. */
export async function writeStatusFile(repo: string, path: string, token: string, body: string, fetchImpl = fetch): Promise<"created" | "updated" | "unchanged" | "failed"> {
  const base = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": "paperclip-ops-applier", "content-type": "application/json" };
  const existing = await fetchImpl(`${base}/repos/${repo}/contents/${path}`, { headers });
  let sha: string | undefined;
  if (existing.ok) {
    const meta = (await existing.json()) as { sha?: string; content?: string };
    sha = meta.sha;
    if (meta.content && Buffer.from(meta.content, "base64").toString("utf8") === body) return "unchanged";
  }
  const response = await fetchImpl(`${base}/repos/${repo}/contents/${path}`, {
    method: "PUT", headers,
    body: JSON.stringify({ message: "ops: status snapshot", content: Buffer.from(body, "utf8").toString("base64"), ...(sha ? { sha } : {}) }),
  });
  if (!response.ok) return "failed";
  return sha ? "updated" : "created";
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
  const statusPath = process.env.PAPERCLIP_OPS_STATUS_PATH?.trim() || "status/state.json";
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

  const status = opsStatusService(db);
  const publishStatus = async () => {
    // The snapshot is what an operator reads before deciding anything, so a stale one
    // is worse than none: it is republished every cycle regardless of whether any
    // document applied.
    const body = `${JSON.stringify(await status.snapshot(), null, 2)}\n`;
    const result = await writeStatusFile(repo, statusPath, token, body);
    if (result === "failed") logger.warn({ repo, path: statusPath }, "ops: status snapshot could not be written");
  };

  const run = () => {
    void tick()
      .catch((err) => logger.error({ err }, "ops: apply cycle failed"))
      .finally(() => { void publishStatus().catch((err) => logger.error({ err }, "ops: status publish failed")) });
  };
  setTimeout(run, 20_000);
  opsTimer = setInterval(run, intervalMs);
  logger.info({ repo, path, statusPath, intervalMs }, "ops applier started");
}
