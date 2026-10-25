import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { approvals, documents, issueComments, issueWorkProducts, julesSessions } from "@paperclipai/db";
import { runProductivityService } from "../services/run-productivity.js";
import { fakeDb } from "./fixtures/fake-db.js";

const startedAt = new Date("2026-09-24T10:00:00Z");
const after = new Date("2026-09-24T10:05:00Z");
const base = { companyId: "c1", agentId: "a1", runId: "r1", issueId: "i1", startedAt };
const empty = () => fakeDb([[issueWorkProducts, []], [issueComments, []], [documents, []], [julesSessions, []], [approvals, []]]);
const assess = (store: ReturnType<typeof fakeDb>, input = base) => runProductivityService(store.db as Db).assess(input);

describe("whether a run left anything behind", () => {
  it("reports an empty success, which an exit code cannot", async () => {
    // Three subsystems were observed exiting 0 having touched nothing.
    expect(await assess(empty())).toEqual({ assessed: true, produced: false, signals: [] });
  });

  it("counts a work product the run created", async () => {
    const store = empty();
    store.rows.get(issueWorkProducts)!.push({ id: "wp1", companyId: "c1", issueId: "i1", createdByRunId: "r1" });
    expect(await assess(store)).toMatchObject({ produced: true, signals: ["work_product"] });
  });

  it("counts a comment the agent wrote on its own issue", async () => {
    const store = empty();
    store.rows.get(issueComments)!.push({ id: "ic1", companyId: "c1", issueId: "i1", authorAgentId: "a1", createdAt: after });
    expect(await assess(store)).toMatchObject({ produced: true, signals: ["comment"] });
  });

  it("does not count another agent's comment on the same issue", async () => {
    const store = empty();
    store.rows.get(issueComments)!.push({ id: "ic1", companyId: "c1", issueId: "i1", authorAgentId: "someone-else", createdAt: after });
    expect(await assess(store)).toMatchObject({ produced: false });
  });

  it("treats a dispatched Jules session as work handed on, not work dropped", async () => {
    const store = empty();
    store.rows.get(julesSessions)!.push({ id: "js1", companyId: "c1", paperclipRunId: "r1" });
    expect(await assess(store)).toMatchObject({ produced: true, signals: ["jules_session"] });
  });

  it("counts an approval the agent raised — asking is a result", async () => {
    const store = empty();
    store.rows.get(approvals)!.push({ id: "ap1", companyId: "c1", requestedByAgentId: "a1", createdAt: after });
    expect(await assess(store)).toMatchObject({ produced: true, signals: ["approval"] });
  });

  it("does not judge a run that was never dispatched against an outcome", async () => {
    expect(await assess(empty(), { ...base, issueId: null })).toEqual({ assessed: false, produced: false, signals: [] });
  });

  it("does not judge a run it cannot bound in time", async () => {
    // Without a start, every comment the agent ever wrote would count as this run's.
    expect(await assess(empty(), { ...base, startedAt: null })).toEqual({ assessed: false, produced: false, signals: [] });
  });
});
