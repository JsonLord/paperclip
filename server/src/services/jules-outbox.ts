import { eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyJulesSources, julesSessions } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { julesCallbackService, type JulesCallbackEventType } from "./jules-callbacks.js";

const OUTBOX_TYPES: Record<string, JulesCallbackEventType> = { progress: "progress", blocker: "blocker", artifact: "artifact", proposal: "proposal", approval: "approval", complete: "complete" };
const OUTBOX_SESSION_STATES = ["QUEUED", "PLANNING", "AWAITING_PLAN_APPROVAL", "AWAITING_USER_FEEDBACK", "IN_PROGRESS", "PAUSED", "REVISION_REQUESTED"];

export interface FounderOsOutboxEvent {
  version: "founderos.outbox/v1"; eventId: string; runId: string; sessionId: string;
  type: keyof typeof OUTBOX_TYPES; payload: Record<string, unknown>;
}

export function validateOutboxEvent(value: unknown, session: typeof julesSessions.$inferSelect): FounderOsOutboxEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed FounderOS outbox event");
  const event = value as Partial<FounderOsOutboxEvent>;
  if (event.version !== "founderos.outbox/v1" || typeof event.eventId !== "string" || !event.eventId || typeof event.payload !== "object" || !event.payload || Array.isArray(event.payload) || !event.type || !OUTBOX_TYPES[event.type]) throw new Error("Malformed FounderOS outbox event");
  if (event.runId !== session.paperclipRunId || event.sessionId !== session.julesSessionId) throw new Error("Outbox event does not match bound run/session namespace");
  for (const key of ["companyId", "agentId", "goalId", "projectId", "issueId"] as const) {
    const expected = key === "companyId" ? session.companyId : key === "agentId" ? session.agentId : key === "goalId" ? session.goalId : key === "projectId" ? session.projectId : session.issueId;
    if (event.payload[key] != null && event.payload[key] !== expected) throw new Error(`Outbox ${key} contradicts persisted binding`);
  }
  return event as FounderOsOutboxEvent;
}

/** `https://github.com/<owner>/<repo>/pull/<n>` — the only PR URL shape Jules returns. */
export function parsePullRequestUrl(url: string | null | undefined): { repo: string; number: number } | null {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec((url ?? "").trim());
  if (!match) return null;
  return { repo: match[1], number: Number(match[2]) };
}

export function createJulesOutboxReconciler(db: Db, options: { fetchImpl?: typeof fetch; githubToken?: string } = {}) {
  const callbacks = julesCallbackService(db);
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.githubToken ?? process.env.GITHUB_TOKEN;
  const headers = { accept: "application/vnd.github+json", "user-agent": "paperclip-founderos-outbox", ...(token ? { authorization: `Bearer ${token}` } : {}) };

  /**
   * The head branch of the session's pull request, or null when it has none yet or the
   * lookup fails. A failure here must not abort reconciliation: the starting branch is
   * still worth reading, and a transient GitHub error is not a reason to drop events.
   */
  async function pullRequestHeadRef(session: typeof julesSessions.$inferSelect): Promise<string | null> {
    const parsed = parsePullRequestUrl(session.pullRequestUrl);
    if (!parsed) return null;
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${parsed.repo}/pulls/${parsed.number}`, { headers });
      if (!response.ok) return null;
      const pull = await response.json() as { head?: { ref?: string } };
      return pull.head?.ref?.trim() || null;
    } catch (error) {
      logger.warn({ err: error, runId: session.paperclipRunId }, "Jules outbox could not resolve the pull request head");
      return null;
    }
  }

  async function reconcileSession(session: typeof julesSessions.$inferSelect) {
    const source = await db.select().from(companyJulesSources).where(eq(companyJulesSources.id, session.companySourceId)).limit(1).then((rows) => rows[0] ?? null);
    if (!source || source.companyId !== session.companyId) throw new Error("Jules source binding is missing or cross-company");
    const namespace = `.founderos/outbox/${session.paperclipRunId}`;
    // The outbox carries blockers and approval requests raised WHILE a session runs, and
    // a session's work lives on its pull request branch: it is told not to merge, so
    // nothing it writes reaches the starting branch until a human accepts the candidate.
    // Reading only the starting branch therefore stranded exactly the events that are
    // worth reading early. Prefer the PR head, and keep the starting branch as the
    // fallback for a session that has not opened one yet.
    const refs = [await pullRequestHeadRef(session), source.startingBranch].filter((ref): ref is string => Boolean(ref));
    let entries: Array<{ name?: string; download_url?: string; type?: string }> | null = null;
    for (const ref of refs) {
      const listUrl = `https://api.github.com/repos/${source.repository}/contents/${namespace}?ref=${encodeURIComponent(ref)}`;
      const response = await fetchImpl(listUrl, { headers });
      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`GitHub outbox list failed with HTTP ${response.status}`);
      entries = await response.json() as Array<{ name?: string; download_url?: string; type?: string }>;
      break;
    }
    if (!entries) return { discovered: 0, applied: 0 };
    let discovered = 0;
    let applied = 0;
    for (const entry of entries) {
      if (entry.type !== "file" || !entry.name?.endsWith(".json") || !entry.download_url) continue;
      discovered += 1;
      const eventResponse = await fetchImpl(entry.download_url, { headers });
      if (!eventResponse.ok) continue;
      const event = validateOutboxEvent(await eventResponse.json(), session);
      const result = await callbacks.promote(session, OUTBOX_TYPES[event.type], { ...event.payload, eventId: event.eventId, runId: event.runId, sessionId: event.sessionId, transport: "github_outbox" });
      if (result.applied) applied += 1;
    }
    return { discovered, applied };
  }

  async function reconcileNow() {
    const sessions = await db.select().from(julesSessions).where(inArray(julesSessions.status, OUTBOX_SESSION_STATES));
    for (const session of sessions) {
      try { await reconcileSession(session); }
      catch (error) { logger.error({ err: error, runId: session.paperclipRunId }, "FounderOS GitHub outbox reconciliation failed"); }
    }
  }
  return { reconcileSession, reconcileNow };
}

export function startJulesOutboxReconciler(db: Db) {
  const reconciler = createJulesOutboxReconciler(db);
  void reconciler.reconcileNow();
  const timer = setInterval(() => void reconciler.reconcileNow(), Number(process.env.JULES_OUTBOX_INTERVAL_MS || 60_000));
  timer.unref();
  return { ...reconciler, stop: () => clearInterval(timer) };
}
