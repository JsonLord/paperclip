import { afterEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { activityLog, julesCapacityEvents, julesSessions } from "@paperclipai/db";
import { createJulesReconciler } from "../services/jules-reconciler.js";
import { fakeDb } from "./fixtures/fake-db.js";

const ENV = ["JULES_REQUIRE_HUMAN_PLAN_APPROVAL"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
});

const session = {
  id: "session-row", companyId: "company-a", profileId: "profile-a", companySourceId: "source-a",
  paperclipRunId: "run-a", agentId: "agent-a", julesSessionId: "remote-1", issueId: "issue-a",
  goalId: null, projectId: null, status: "AWAITING_PLAN_APPROVAL", completionCandidate: false,
  pullRequestUrl: null, resultJson: null, finishedAt: null, capabilityVersion: 1,
};

function harness() {
  const store = fakeDb(
    [[julesSessions, [{ ...session }]], [activityLog, []], [julesCapacityEvents, []]],
    { unique: [[julesCapacityEvents, ["sessionId", "eventType"]]] },
  );
  const approvePlan = vi.fn(async () => {});
  const remote = {
    approvePlan,
    getSession: async () => ({ id: "remote-1", state: "AWAITING_PLAN_APPROVAL" }),
    listActivities: async () => ({ items: [] }),
  };
  const reconciler = createJulesReconciler(store.db as Db, { remoteForSession: async () => remote as never });
  return { store, approvePlan, reconciler };
}

describe("a Jules session waiting on its plan", () => {
  it("is approved, because nothing else in the deployment ever could", async () => {
    delete process.env.JULES_REQUIRE_HUMAN_PLAN_APPROVAL;
    const h = harness();
    await h.reconciler.reconcileNow();
    expect(h.approvePlan).toHaveBeenCalledWith("remote-1");
    expect((h.store.rows.get(activityLog) ?? []).map((r) => r.action)).toContain("jules.session.plan_approved");
  });

  it("is held for a human when the deployment asks for that, and says so", async () => {
    process.env.JULES_REQUIRE_HUMAN_PLAN_APPROVAL = "1";
    const h = harness();
    await h.reconciler.reconcileNow();
    expect(h.approvePlan).not.toHaveBeenCalled();
    // The old behaviour was silence: the session stalled with no trace anywhere.
    expect((h.store.rows.get(activityLog) ?? []).map((r) => r.action)).toContain("jules.session.plan_awaiting_human");
  });

  it("does not fail the reconciliation cycle when approval errors", async () => {
    delete process.env.JULES_REQUIRE_HUMAN_PLAN_APPROVAL;
    const h = harness();
    h.approvePlan.mockRejectedValueOnce(new Error("Jules is having a moment"));
    await expect(h.reconciler.reconcileNow()).resolves.toMatchObject({ failed: 0 });
  });

  it("approves once, however many cycles observe the same waiting session", async () => {
    delete process.env.JULES_REQUIRE_HUMAN_PLAN_APPROVAL;
    const h = harness();
    await h.reconciler.reconcileNow();
    await h.reconciler.reconcileNow();
    await h.reconciler.reconcileNow();
    expect(h.approvePlan).toHaveBeenCalledTimes(1);
  });

  it("rescues a session that was already waiting before the process started", async () => {
    // The state never transitions again after a restart, so an edge-triggered rescue
    // would skip exactly the sessions that have been stuck longest.
    delete process.env.JULES_REQUIRE_HUMAN_PLAN_APPROVAL;
    const h = harness();
    await h.reconciler.reconcileNow();
    expect(h.approvePlan).toHaveBeenCalledWith("remote-1");
  });
});
