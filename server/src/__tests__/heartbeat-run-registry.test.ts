import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns } from "@paperclipai/db";
import { activeRunExecutions, heartbeatService } from "../services/heartbeat.js";
import { fakeDb } from "./fixtures/fake-db.js";

// heartbeatService is a factory: the scheduler in index.ts and the issue, agent,
// approval, company and cost routes each build their own. A run executes inside one
// instance while the scheduler's reaper runs in another, so the in-flight registry
// has to be shared by the module rather than owned per instance.
function storeWithRunningRun(updatedAt: Date) {
  return fakeDb([[heartbeatRuns, [{
    id: "run-1", agentId: "agent-1", companyId: "company-1",
    status: "running", updatedAt, startedAt: updatedAt,
  }]]]);
}

describe("heartbeat in-flight run registry", () => {
  it("reaps a run no instance is executing once it is stale", async () => {
    const store = storeWithRunningRun(new Date(Date.now() - 10 * 60 * 1000));
    const scheduler = heartbeatService(store.db as Db);
    const result = await scheduler.reapOrphanedRuns({ staleThresholdMs: 5 * 60 * 1000 });
    expect(result.reaped).toBe(1);
    expect((store.rows.get(heartbeatRuns) ?? [])[0].status).not.toBe("running");
  });

  it("leaves a fresh run alone", async () => {
    const store = storeWithRunningRun(new Date());
    const scheduler = heartbeatService(store.db as Db);
    const result = await scheduler.reapOrphanedRuns({ staleThresholdMs: 5 * 60 * 1000 });
    expect(result.reaped).toBe(0);
    expect((store.rows.get(heartbeatRuns) ?? [])[0].status).toBe("running");
  });

  it("does not reap a long run another instance is executing", async () => {
    // The real failure: a 900s Hermes run dispatched by the issues route was declared
    // "Process lost" by the scheduler at exactly the 5 minute mark while still working,
    // because the scheduler's instance had its own empty registry.
    const store = storeWithRunningRun(new Date(Date.now() - 10 * 60 * 1000));
    const executor = heartbeatService(store.db as Db);
    const scheduler = heartbeatService(store.db as Db);
    expect(executor).not.toBe(scheduler);

    activeRunExecutions.add("run-1");
    try {
      const result = await scheduler.reapOrphanedRuns({ staleThresholdMs: 5 * 60 * 1000 });
      expect(result.reaped).toBe(0);
      expect((store.rows.get(heartbeatRuns) ?? [])[0].status).toBe("running");
    } finally {
      activeRunExecutions.delete("run-1");
    }
  });
});
