import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { agents, approvals, companies, goals, heartbeatRuns, issueComments, issues } from "@paperclipai/db";
import { OPS_AUTHOR, opsApplierService, opsStatusService, parseOpsDocument, writeStatusFile } from "../services/ops-applier.js";
import { fakeDb } from "./fixtures/fake-db.js";

function store() {
  return fakeDb([
    [companies, [{ id: "c1", name: "aux" }, { id: "c2", name: "Humanise LLMs" }]],
    [agents, [
      { id: "a1", companyId: "c1", name: "Market Analyst" },
      { id: "a2", companyId: "c1", name: "Founder Manager" },
      { id: "a9", companyId: "c2", name: "Market Analyst" },
    ]],
    [goals, [{ id: "g1", companyId: "c1", title: "Round 1" }]],
    [issues, [{ id: "i1", companyId: "c1", title: "Map the competitor landscape", status: "todo", priority: "high", assigneeAgentId: "a1", goalId: "g1" }]],
    [approvals, [{ id: "ap1", companyId: "c1", type: "outreach", status: "pending", requestedByAgentId: "a1", createdAt: new Date("2026-09-24T09:00:00Z"), payload: { secretish: "do-not-export" } }]],
    [heartbeatRuns, [{ id: "r1", companyId: "c1", agentId: "a1", status: "succeeded", startedAt: new Date("2026-09-24T10:35:00Z"), finishedAt: new Date("2026-09-24T10:45:00Z"), error: null }]],
    [issueComments, []],
  ]);
}
const doc = (ops: unknown[]) => ({ apiVersion: "paperclip.ops/v1" as const, operations: ops as never });

describe("ops applier", () => {
  it("rejects anything that is not a v1 ops document", () => {
    expect(parseOpsDocument("{oops")).toEqual({ error: "not valid JSON" });
    const wrongVersion = parseOpsDocument(JSON.stringify({ apiVersion: "v2", operations: [] }));
    expect("error" in wrongVersion).toBe(true);
    const noOps = parseOpsDocument(JSON.stringify({ apiVersion: "paperclip.ops/v1", operations: [] }));
    expect("error" in noOps).toBe(true);
  });

  it("refuses operations outside the allowlist", () => {
    for (const op of ["agent.create", "secret.set", "company.delete", "issue.delete"]) {
      const parsed = parseOpsDocument(JSON.stringify({ apiVersion: "paperclip.ops/v1", operations: [{ op, company: "aux" }] }));
      expect("error" in parsed).toBe(true);
    }
  });

  it("creates a goal and an issue, resolving names to ids", async () => {
    const s = store();
    const result = await opsApplierService(s.db as Db).apply(doc([
      { op: "goal.create", company: "aux", title: "Round 2", level: "team", status: "active", parentGoalTitle: "Round 1", ownerAgent: "Founder Manager" },
      { op: "issue.create", company: "aux", title: "Re-scan pricing", goalTitle: "Round 2", assignee: "Market Analyst", status: "todo", priority: "high" },
    ]));
    expect(result).toMatchObject({ applied: 2, skipped: 0 });
    const goal = (s.rows.get(goals) ?? []).find((g) => g.title === "Round 2");
    expect(goal).toMatchObject({ companyId: "c1", parentId: "g1", ownerAgentId: "a2", level: "team", status: "active" });
    const issue = (s.rows.get(issues) ?? []).find((i) => i.title === "Re-scan pricing");
    expect(issue).toMatchObject({ companyId: "c1", assigneeAgentId: "a1", status: "todo", priority: "high" });
  });

  it("resolves names within the named company only", async () => {
    const s = store();
    await opsApplierService(s.db as Db).apply(doc([
      { op: "issue.create", company: "Humanise LLMs", title: "Other company task", assignee: "Market Analyst" },
    ]));
    const created = (s.rows.get(issues) ?? []).find((i) => i.title === "Other company task");
    // Both companies have a "Market Analyst"; the one in the named company must win.
    expect(created).toMatchObject({ companyId: "c2", assigneeAgentId: "a9" });
  });

  it("is idempotent: an existing title is skipped, not duplicated", async () => {
    const s = store();
    const svc = opsApplierService(s.db as Db);
    const payload = doc([
      { op: "goal.create", company: "aux", title: "Round 1" },
      { op: "issue.create", company: "aux", title: "Map the competitor landscape" },
    ]);
    expect(await svc.apply(payload)).toMatchObject({ applied: 0, skipped: 2 });
    expect((s.rows.get(goals) ?? []).filter((g) => g.title === "Round 1")).toHaveLength(1);
    expect((s.rows.get(issues) ?? []).filter((i) => i.title === "Map the competitor landscape")).toHaveLength(1);
  });

  it("promotes an issue, which is how the round chain advances", async () => {
    const s = store();
    const result = await opsApplierService(s.db as Db).apply(doc([
      { op: "issue.update", company: "aux", title: "Map the competitor landscape", status: "done" },
    ]));
    expect(result.applied).toBe(1);
    expect((s.rows.get(issues) ?? [])[0].status).toBe("done");
  });

  it("stops on the first bad reference and reports it, leaving the rest unapplied", async () => {
    const s = store();
    const result = await opsApplierService(s.db as Db).apply(doc([
      { op: "issue.create", company: "aux", title: "First", status: "backlog" },
      { op: "issue.create", company: "aux", title: "Second", assignee: "Nobody" },
      { op: "issue.create", company: "aux", title: "Third", status: "backlog" },
    ]));
    expect(result.applied).toBe(1);
    expect(result.error).toMatch(/unknown agent "Nobody"/);
    const titles = (s.rows.get(issues) ?? []).map((i) => i.title);
    expect(titles).toContain("First");
    expect(titles).not.toContain("Third");
  });

  it("reports an unknown company rather than guessing", async () => {
    const s = store();
    const result = await opsApplierService(s.db as Db).apply(doc([
      { op: "issue.create", company: "not-a-company", title: "X" },
    ]));
    expect(result.error).toMatch(/unknown company/);
    expect(result.applied).toBe(0);
  });
});

describe("ops applier — steering operations", () => {
  it("updates a goal status, which is how a round is closed", async () => {
    const s = store();
    const r = await opsApplierService(s.db as Db).apply(doc([
      { op: "goal.update", company: "aux", title: "Round 1", status: "achieved" },
    ]));
    expect(r.applied).toBe(1);
    expect((s.rows.get(goals) ?? [])[0].status).toBe("achieved");
  });

  it("comments on an issue, attributed to the ops repo rather than an agent", async () => {
    const s = store();
    const r = await opsApplierService(s.db as Db).apply(doc([
      { op: "issue.comment", company: "aux", title: "Map the competitor landscape", body: "Narrow to flow testing only." },
    ]));
    expect(r.applied).toBe(1);
    const comment = (s.rows.get(issueComments) ?? [])[0];
    expect(comment).toMatchObject({ companyId: "c1", issueId: "i1", authorUserId: OPS_AUTHOR });
    expect(comment.authorAgentId).toBeUndefined();
  });

  it("still refuses to approve — the gate must stay human", () => {
    for (const op of ["approval.approve", "approval.reject", "agent.pause", "secret.set"]) {
      const parsed = parseOpsDocument(JSON.stringify({ apiVersion: "paperclip.ops/v1", operations: [{ op, company: "aux", title: "x" }] }));
      expect("error" in parsed).toBe(true);
    }
  });

  it("corrects a goal's required capabilities, which otherwise needs a redeploy", async () => {
    const s = store();
    const svc = opsApplierService(s.db as Db);
    // A goal asking for a capability no profile holds denies every dispatch against it.
    expect(await svc.apply(doc([{ op: "goal.update", company: "aux", title: "Round 1", requiredCapabilities: ["github"] }]))).toMatchObject({ applied: 1 });
    expect((s.rows.get(goals) ?? [])[0].requiredCapabilities).toEqual(["github"]);
  });

  it("reports unknown goals and issues rather than creating them", async () => {
    const s = store();
    const svc = opsApplierService(s.db as Db);
    expect((await svc.apply(doc([{ op: "goal.update", company: "aux", title: "Nope", status: "active" }]))).error).toMatch(/unknown goal/);
    expect((await svc.apply(doc([{ op: "issue.comment", company: "aux", title: "Nope", body: "hi" }]))).error).toMatch(/unknown issue/);
  });
});

describe("ops status snapshot", () => {
  it("reports the state an operator needs to steer", async () => {
    const s = store();
    const snap = await opsStatusService(s.db as Db).snapshot() as any;
    const aux = snap.companies.find((c: any) => c.name === "aux");
    expect(aux.issues[0]).toMatchObject({ title: "Map the competitor landscape", status: "todo", assignee: "Market Analyst", goal: "Round 1" });
    expect(aux.agents.map((a: any) => a.name)).toContain("Founder Manager");
    expect(aux.approvalsPending[0]).toMatchObject({ type: "outreach", requestedBy: "Market Analyst" });
    expect(aux.recentRuns[0]).toMatchObject({ agent: "Market Analyst", status: "succeeded" });
    expect(snap.generatedAt).toBeTruthy();
  });

  it("does not export approval payloads or free text", async () => {
    const s = store();
    const body = JSON.stringify(await opsStatusService(s.db as Db).snapshot());
    expect(body).not.toContain("do-not-export");
    expect(body).not.toContain("payload");
    expect(body).not.toContain("description");
  });

  it("skips the commit when the snapshot is unchanged", async () => {
    const body = '{"a":1}';
    const calls: string[] = [];
    const fake = (async (url: any, init: any = {}) => {
      calls.push(`${init.method ?? "GET"} ${String(url)}`);
      return { ok: true, json: async () => ({ sha: "s1", content: Buffer.from(body, "utf8").toString("base64") }) } as unknown as Response;
    }) as unknown as typeof fetch;
    expect(await writeStatusFile("o/r", "status/state.json", "t", body, fake)).toBe("unchanged");
    expect(calls.filter((c) => c.startsWith("PUT"))).toHaveLength(0);
  });

  it("creates the file when it does not exist yet", async () => {
    const seen: any[] = [];
    const fake = (async (_url: any, init: any = {}) => {
      if ((init.method ?? "GET") === "GET") return { ok: false, json: async () => ({}) } as unknown as Response;
      seen.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;
    expect(await writeStatusFile("o/r", "status/state.json", "t", "{}", fake)).toBe("created");
    expect(seen[0].sha).toBeUndefined();
    expect(Buffer.from(seen[0].content, "base64").toString("utf8")).toBe("{}");
  });
});

describe("ops applier — waking the assignee", () => {
  // The applier writes through drizzle, not the HTTP routes, so it has to wake agents
  // itself or an issue made actionable from the repo would simply sit there.
  it("creates a backlog issue without waking anyone", async () => {
    const s = store();
    const r = await opsApplierService(s.db as Db).apply(doc([
      { op: "issue.create", company: "aux", title: "Quiet task", assignee: "Market Analyst", status: "backlog" },
    ]));
    expect(r.applied).toBe(1);
    const created = (s.rows.get(issues) ?? []).find((i) => i.title === "Quiet task");
    expect(created).toMatchObject({ status: "backlog", assigneeAgentId: "a1" });
  });

  it("reassigns an issue to another agent, which is how work moves off a blocked worker", async () => {
    const s = store();
    const r = await opsApplierService(s.db as Db).apply(doc([
      { op: "issue.update", company: "aux", title: "Map the competitor landscape", assignee: "Founder Manager", status: "todo" },
    ]));
    expect(r.applied).toBe(1);
    expect((s.rows.get(issues) ?? [])[0]).toMatchObject({ assigneeAgentId: "a2", status: "todo" });
  });
});
