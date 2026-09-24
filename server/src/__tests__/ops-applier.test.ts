import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { agents, companies, goals, issues } from "@paperclipai/db";
import { opsApplierService, parseOpsDocument } from "../services/ops-applier.js";
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
    [issues, [{ id: "i1", companyId: "c1", title: "Map the competitor landscape", status: "todo" }]],
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
