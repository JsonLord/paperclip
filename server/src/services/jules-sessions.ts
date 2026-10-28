import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  julesCapacityEvents,
  julesSessionActivities,
  julesRepositoryLeases,
  julesSessions,
} from "@paperclipai/db";
import type { JulesSessionStatus } from "@paperclipai/shared";
import type { JulesActivity, JulesPage, JulesRemoteSession } from "@paperclipai/adapter-jules/server";
import { extractPullRequest } from "@paperclipai/adapter-jules/server";

export const JULES_REMOTE_POLLABLE_STATES: readonly JulesSessionStatus[] = [
  "DISPATCHING",
  "QUEUED",
  "PLANNING",
  "AWAITING_PLAN_APPROVAL",
  "AWAITING_USER_FEEDBACK",
  "IN_PROGRESS",
  "PAUSED",
  "REVISION_REQUESTED",
];

export interface JulesRemoteReader {
  getSession(id: string): Promise<JulesRemoteSession>;
  listActivities(id: string, pageToken?: string): Promise<JulesPage<JulesActivity>>;
}

export interface JulesLifecycleHooks {
  onRemoteCompleted?(session: typeof julesSessions.$inferSelect): Promise<void> | void;
  onPlanApprovalRequired?(session: typeof julesSessions.$inferSelect): Promise<void> | void;
  onUserFeedbackRequired?(session: typeof julesSessions.$inferSelect): Promise<void> | void;
  onRemoteFailed?(session: typeof julesSessions.$inferSelect): Promise<void> | void;
  onRemoteOrphaned?(session: typeof julesSessions.$inferSelect): Promise<void> | void;
  onCapacityReleased?(session: typeof julesSessions.$inferSelect): Promise<void> | void;
}

export interface AttachJulesSessionInput {
  companyId: string;
  profileId: string;
  companySourceId: string;
  paperclipRunId: string;
  julesSessionId: string;
  agentId: string;
  goalId?: string | null;
  projectId?: string | null;
  issueId?: string | null;
  outcomeId?: string | null;
  remoteState?: string | null;
  retryOfSessionId?: string | null;
  retryOfRunId?: string | null;
  retryNumber?: number;
  retryReason?: string | null;
}

function normalizeRemoteState(value: string | null | undefined): JulesSessionStatus {
  const state = String(value ?? "QUEUED").trim().toUpperCase();
  switch (state) {
    case "DISPATCHING":
    case "QUEUED":
    case "PLANNING":
    case "AWAITING_PLAN_APPROVAL":
    case "AWAITING_USER_FEEDBACK":
    case "IN_PROGRESS":
    case "PAUSED":
    case "REVISION_REQUESTED":
      return state;
    case "COMPLETED":
    case "SUCCEEDED":
      return "COMPLETED_UNVALIDATED";
    case "FAILED":
    case "CANCELLED":
      return "FAILED";
    default:
      return "ORPHANED";
  }
}

function remoteStateOf(session: JulesRemoteSession): JulesSessionStatus {
  return normalizeRemoteState(session.state ?? session.status);
}

function parseRemoteTime(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sameBinding(row: typeof julesSessions.$inferSelect, input: AttachJulesSessionInput): boolean {
  return row.companyId === input.companyId
    && row.profileId === input.profileId
    && row.companySourceId === input.companySourceId
    && row.julesSessionId === input.julesSessionId
    && row.agentId === input.agentId
    && row.goalId === (input.goalId ?? null)
    && row.projectId === (input.projectId ?? null)
    && row.issueId === (input.issueId ?? null);
}

export function julesSessionService(db: Db, hooks: JulesLifecycleHooks = {}) {
  async function getByRunId(paperclipRunId: string) {
    return db.select().from(julesSessions).where(eq(julesSessions.paperclipRunId, paperclipRunId)).limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async function attachDispatchedSession(input: AttachJulesSessionInput) {
    return db.transaction(async (tx) => {
      const existing = await tx.select().from(julesSessions)
        .where(eq(julesSessions.paperclipRunId, input.paperclipRunId)).limit(1)
        .then((rows) => rows[0] ?? null);
      if (existing) {
        if (!sameBinding(existing, input)) {
          throw new Error(`Jules run ${input.paperclipRunId} is already bound to a different remote session or native context`);
        }
        return existing;
      }

      const status = normalizeRemoteState(input.remoteState);
      const [created] = await tx.insert(julesSessions).values({
        companyId: input.companyId,
        profileId: input.profileId,
        companySourceId: input.companySourceId,
        paperclipRunId: input.paperclipRunId,
        julesSessionId: input.julesSessionId,
        agentId: input.agentId,
        goalId: input.goalId ?? null,
        projectId: input.projectId ?? null,
        issueId: input.issueId ?? null,
        outcomeId: input.outcomeId ?? input.issueId ?? null,
        status,
        completionCandidate: status === "COMPLETED_UNVALIDATED",
        retryOfSessionId: input.retryOfSessionId ?? null,
        retryOfRunId: input.retryOfRunId ?? null,
        retryNumber: input.retryNumber ?? 0,
        retryReason: input.retryReason ?? null,
      }).returning();
      await tx.insert(julesCapacityEvents).values({
        profileId: input.profileId,
        companyId: input.companyId,
        sessionId: created.id,
        eventType: "session_started",
        details: { paperclipRunId: input.paperclipRunId },
      }).onConflictDoNothing();
      if ((input.retryNumber ?? 0) > 0) await tx.insert(julesCapacityEvents).values({
        profileId: input.profileId,
        companyId: input.companyId,
        sessionId: created.id,
        eventType: "session_retry_started",
        details: { retryOfSessionId: input.retryOfSessionId, retryOfRunId: input.retryOfRunId, retryNumber: input.retryNumber, retryReason: input.retryReason },
      }).onConflictDoNothing();
      await tx.update(julesRepositoryLeases).set({ sessionId: created.id })
        .where(eq(julesRepositoryLeases.paperclipRunId, input.paperclipRunId));
      return created;
    });
  }

  async function createOrResumeRemoteSession(
    input: Omit<AttachJulesSessionInput, "julesSessionId" | "remoteState">,
    createRemote: () => Promise<JulesRemoteSession>,
  ) {
    const existing = await getByRunId(input.paperclipRunId);
    if (existing) return existing;
    const remote = await createRemote();
    if (!remote.id) throw new Error("Jules create-session response did not contain an id");
    // attachDispatchedSession commits the complete native binding before this
    // method returns control to the dispatcher.
    return attachDispatchedSession({
      ...input,
      julesSessionId: remote.id,
      remoteState: remote.state ?? remote.status,
    });
  }

  async function storeActivities(session: typeof julesSessions.$inferSelect, remote: JulesRemoteReader) {
    let pageToken: string | undefined;
    let lastActivityId: string | null = session.lastActivityId;
    do {
      const page = await remote.listActivities(session.julesSessionId, pageToken);
      for (const activity of page.items) {
        const activityId = activity.id ?? activity.name;
        if (!activityId) continue;
        await db.insert(julesSessionActivities).values({
          companyId: session.companyId,
          sessionId: session.id,
          activityId,
          remoteCreatedAt: parseRemoteTime(activity.createTime),
          payload: activity,
        }).onConflictDoNothing();
        lastActivityId = activityId;
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return lastActivityId;
  }

  async function runTransitionHooks(previous: JulesSessionStatus, current: typeof julesSessions.$inferSelect) {
    if (previous === current.status) return;
    switch (current.status as JulesSessionStatus) {
      case "COMPLETED_UNVALIDATED": await hooks.onRemoteCompleted?.(current); break;
      case "AWAITING_PLAN_APPROVAL": await hooks.onPlanApprovalRequired?.(current); break;
      case "AWAITING_USER_FEEDBACK": await hooks.onUserFeedbackRequired?.(current); break;
      case "FAILED": await hooks.onRemoteFailed?.(current); break;
      case "ORPHANED": await hooks.onRemoteOrphaned?.(current); break;
    }
    if (["COMPLETED_UNVALIDATED", "FAILED", "ORPHANED"].includes(current.status)) {
      await hooks.onCapacityReleased?.(current);
    }
  }

  async function markOrphaned(session: typeof julesSessions.$inferSelect, reason: string) {
    const now = new Date();
    const [updated] = await db.update(julesSessions).set({
      status: "ORPHANED",
      reconciliationError: reason,
      lastReconciledAt: now,
      finishedAt: now,
      updatedAt: now,
    }).where(and(eq(julesSessions.id, session.id), eq(julesSessions.status, session.status))).returning();
    const result = updated ?? await db.select().from(julesSessions).where(eq(julesSessions.id, session.id)).limit(1).then((rows) => rows[0]);
    if (updated) {
      await db.update(julesRepositoryLeases).set({ releasedAt: now })
        .where(and(eq(julesRepositoryLeases.sessionId, session.id), isNull(julesRepositoryLeases.releasedAt)));
      await db.insert(julesCapacityEvents).values({ profileId: session.profileId, companyId: session.companyId, sessionId: session.id, eventType: "session_orphaned", details: { reason } }).onConflictDoNothing();
      await runTransitionHooks(session.status as JulesSessionStatus, result);
    }
    return result;
  }

  async function reconcile(session: typeof julesSessions.$inferSelect, remote: JulesRemoteReader) {
    let remoteSession: JulesRemoteSession;
    try {
      remoteSession = await remote.getSession(session.julesSessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/\b404\b|not found|unknown session/i.test(message)) return markOrphaned(session, message);
      await db.update(julesSessions).set({ reconciliationError: message, lastReconciledAt: new Date(), updatedAt: new Date() }).where(eq(julesSessions.id, session.id));
      throw error;
    }

    const status = remoteStateOf(remoteSession);
    if (status === "ORPHANED") return markOrphaned(session, `Unknown Jules remote state: ${remoteSession.state ?? remoteSession.status ?? "missing"}`);
    const lastActivityId = await storeActivities(session, remote);
    const pullRequest = extractPullRequest(remoteSession);
    const now = new Date();
    const terminal = ["COMPLETED_UNVALIDATED", "FAILED"].includes(status);
    if (!terminal) {
      await db.update(julesRepositoryLeases).set({ expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000) })
        .where(and(eq(julesRepositoryLeases.sessionId, session.id), isNull(julesRepositoryLeases.releasedAt)));
    }
    const [updated] = await db.update(julesSessions).set({
      status,
      lastActivityId,
      pullRequestUrl: pullRequest?.url ?? session.pullRequestUrl,
      pullRequestTitle: pullRequest?.title ?? session.pullRequestTitle,
      pullRequestDescription: pullRequest?.description ?? session.pullRequestDescription,
      remoteUpdatedAt: parseRemoteTime(remoteSession.updateTime) ?? session.remoteUpdatedAt,
      lastReconciledAt: now,
      reconciliationError: null,
      completionCandidate: status === "COMPLETED_UNVALIDATED",
      resultJson: { ...(session.resultJson ?? {}), remoteState: remoteSession.state ?? remoteSession.status ?? null },
      finishedAt: terminal ? (session.finishedAt ?? now) : null,
      updatedAt: now,
    }).where(and(eq(julesSessions.id, session.id), eq(julesSessions.status, session.status))).returning();

    const result = updated ?? await db.select().from(julesSessions).where(eq(julesSessions.id, session.id)).limit(1).then((rows) => rows[0]);
    if (updated && status !== session.status && terminal) {
      await db.update(julesRepositoryLeases).set({ releasedAt: now })
        .where(and(eq(julesRepositoryLeases.sessionId, session.id), isNull(julesRepositoryLeases.releasedAt)));
      await db.insert(julesCapacityEvents).values({
        profileId: session.profileId,
        companyId: session.companyId,
        sessionId: session.id,
        eventType: status === "FAILED" ? "session_failed" : "session_completed",
        details: { paperclipRunId: session.paperclipRunId },
      }).onConflictDoNothing();
    }
    if (updated) await runTransitionHooks(session.status as JulesSessionStatus, result);
    return result;
  }

  return {
    getByRunId,
    createOrResumeRemoteSession,
    attachDispatchedSession,
    reconcile,
    listReconciliationCandidates: () => db.select().from(julesSessions)
      .where(inArray(julesSessions.status, [...JULES_REMOTE_POLLABLE_STATES])),
  };
}

export { normalizeRemoteState };
