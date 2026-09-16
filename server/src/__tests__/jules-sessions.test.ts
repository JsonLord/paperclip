import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { julesCapacityEvents, julesRepositoryLeases, julesSessionActivities, julesSessions } from "@paperclipai/db";
import { julesSessionService, type AttachJulesSessionInput, type JulesRemoteReader } from "../services/jules-sessions.js";

type SessionRow = typeof julesSessions.$inferSelect;

function fakeDb() {
  const sessions: SessionRow[] = [];
  const activities: Array<Record<string, unknown>> = [];
  const capacityEvents: Array<Record<string, unknown>> = [];
  const leases: Array<Record<string, unknown>> = [];

  const query = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
    return chain;
  };

  const db = {
    select: () => query(sessions),
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => {
        const values = Array.isArray(value) ? value : [value];
        const inserted = values.map((item) => ({ id: `row-${sessions.length + activities.length + capacityEvents.length + 1}`, createdAt: new Date(), updatedAt: new Date(), startedAt: new Date(), finishedAt: null, resultJson: null, lastActivityId: null, pullRequestUrl: null, pullRequestTitle: null, pullRequestDescription: null, remoteUpdatedAt: null, lastReconciledAt: null, reconciliationError: null, ...item }));
        if (table === julesSessions) sessions.push(...inserted as unknown as SessionRow[]);
        if (table === julesSessionActivities) {
          for (const row of inserted) {
            if (!activities.some((existing) => existing.sessionId === row.sessionId && existing.activityId === row.activityId)) activities.push(row);
          }
        }
        if (table === julesCapacityEvents) {
          for (const row of inserted) {
            if (!capacityEvents.some((existing) => existing.sessionId === row.sessionId && existing.eventType === row.eventType)) capacityEvents.push(row);
          }
        }
        const result = {
          onConflictDoNothing: () => result,
          returning: () => Promise.resolve(inserted),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(undefined).then(resolve, reject),
        };
        return result;
      },
    }),
    update: (table: unknown) => ({ set: (patch: Record<string, unknown>) => ({
      where: () => {
        if (table === julesSessions && sessions[0]) sessions[0] = { ...sessions[0], ...patch };
        const affectedLeases = table === julesRepositoryLeases ? leases.filter((lease) => !lease.releasedAt) : [];
        affectedLeases.forEach((lease) => Object.assign(lease, patch));
        const result = {
          returning: () => Promise.resolve(table === julesSessions ? (sessions[0] ? [sessions[0]] : []) : affectedLeases),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(undefined).then(resolve, reject),
        };
        return result;
      },
    }) }),
    transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };
  return { db: db as unknown as Db, sessions, activities, capacityEvents, leases };
}

const binding: AttachJulesSessionInput = {
  companyId: "00000000-0000-4000-8000-000000000001",
  profileId: "00000000-0000-4000-8000-000000000002",
  companySourceId: "00000000-0000-4000-8000-000000000003",
  paperclipRunId: "00000000-0000-4000-8000-000000000004",
  julesSessionId: "remote-1",
  agentId: "00000000-0000-4000-8000-000000000005",
  goalId: "00000000-0000-4000-8000-000000000006",
  projectId: "00000000-0000-4000-8000-000000000007",
  issueId: "00000000-0000-4000-8000-000000000008",
};

function remote(state: string, extras: Record<string, unknown> = {}): JulesRemoteReader {
  return {
    getSession: vi.fn().mockResolvedValue({ id: "remote-1", state, ...extras }),
    listActivities: vi.fn().mockResolvedValue({ items: [{ id: "activity-1", createTime: "2026-09-14T12:00:00Z" }] }),
  };
}

describe("durable Jules session lifecycle", () => {
  it("survives restart without duplicate dispatch and preserves native bindings through completion", async () => {
    const store = fakeDb();
    const firstProcess = julesSessionService(store.db);
    const createRemote = vi.fn().mockResolvedValue({ id: binding.julesSessionId, state: "QUEUED" });
    const { julesSessionId: _remoteId, remoteState: _remoteState, ...dispatchBinding } = binding;
    await firstProcess.createOrResumeRemoteSession(dispatchBinding, createRemote);
    expect(store.sessions[0].status).toBe("QUEUED");
    await firstProcess.reconcile(store.sessions[0], remote("PLANNING"));
    expect(store.sessions[0].status).toBe("PLANNING");
    await firstProcess.reconcile(store.sessions[0], remote("IN_PROGRESS"));

    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]).toMatchObject({ status: "IN_PROGRESS", agentId: binding.agentId, goalId: binding.goalId, projectId: binding.projectId, issueId: binding.issueId });

    // A new service instance represents Paperclip restarting against the same durable database.
    const afterRestart = julesSessionService(store.db);
    await afterRestart.createOrResumeRemoteSession(dispatchBinding, createRemote);
    expect(store.sessions).toHaveLength(1);
    expect(createRemote).toHaveBeenCalledTimes(1);

    store.leases.push({ id: "lease-1", sessionId: store.sessions[0].id, releasedAt: null });

    await afterRestart.reconcile(store.sessions[0], remote("COMPLETED", {
      updateTime: "2026-09-14T13:00:00Z",
      outputs: [{ pullRequest: { url: "https://github.com/acme/company/pull/9", title: "Outcome" } }],
    }));
    expect(store.sessions[0]).toMatchObject({
      status: "COMPLETED_UNVALIDATED",
      completionCandidate: true,
      pullRequestUrl: "https://github.com/acme/company/pull/9",
      pullRequestTitle: "Outcome",
      agentId: binding.agentId,
      goalId: binding.goalId,
      projectId: binding.projectId,
      issueId: binding.issueId,
    });
    expect(store.sessions[0].status).not.toBe("ACCEPTED");
    expect(store.leases[0].releasedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["QUEUED", "QUEUED"],
    ["PLANNING", "PLANNING"],
    ["AWAITING_PLAN_APPROVAL", "AWAITING_PLAN_APPROVAL"],
    ["AWAITING_USER_FEEDBACK", "AWAITING_USER_FEEDBACK"],
    ["FAILED", "FAILED"],
  ])("preserves remote state %s as %s", async (remoteState, expected) => {
    const store = fakeDb();
    const service = julesSessionService(store.db);
    await service.attachDispatchedSession(binding);
    await service.reconcile(store.sessions[0], remote(remoteState));
    expect(store.sessions[0].status).toBe(expected);
  });

  it("runs transition hooks once and stores activity refreshes idempotently", async () => {
    const store = fakeDb();
    const onPlanApprovalRequired = vi.fn();
    const service = julesSessionService(store.db, { onPlanApprovalRequired });
    await service.attachDispatchedSession(binding);
    await service.reconcile(store.sessions[0], remote("AWAITING_PLAN_APPROVAL"));
    await service.reconcile(store.sessions[0], remote("AWAITING_PLAN_APPROVAL"));
    expect(onPlanApprovalRequired).toHaveBeenCalledTimes(1);
    expect(store.activities).toHaveLength(1);
  });

  it("marks missing remote mappings orphaned instead of creating replacements", async () => {
    const store = fakeDb();
    const service = julesSessionService(store.db);
    await service.attachDispatchedSession(binding);
    await service.reconcile(store.sessions[0], {
      getSession: vi.fn().mockRejectedValue(new Error("Jules API 404: session not found")),
      listActivities: vi.fn(),
    });
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0].status).toBe("ORPHANED");
    expect(store.capacityEvents.some((event) => event.eventType === "session_orphaned")).toBe(true);
  });
});
