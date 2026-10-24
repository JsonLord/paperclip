import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { agents, issues } from "@paperclipai/db";
import { agentHandoffService, MAX_HANDOFF_DEPTH, renderHandoffDescription } from "../services/agent-handoff.js";
import { fakeDb } from "./fixtures/fake-db.js";

const fleet = () => ([
  { id: "a-pdf", companyId: "co", name: "PDF Engine Architect", title: "PDF Compilation", status: "idle", adapterType: "jules", metadata: { founderosTemplateId: "pdf,pdf-engine,pdf-architect" } },
  { id: "a-docs", companyId: "co", name: "Document Compiler", title: "Documentation", status: "idle", adapterType: "jules", metadata: { founderosTemplateId: "docs,documentation,document-compiler" } },
  { id: "a-pres", companyId: "co", name: "Data Presentationalist", title: "Dashboards", status: "idle", adapterType: "hermes_local", metadata: { founderosTemplateId: "presentationalist,dashboard" } },
  { id: "a-sales", companyId: "co", name: "Commercial Lead", title: "Sales", status: "paused", adapterType: "jules", metadata: { founderosTemplateId: "sales,prospect" } },
  { id: "a-out", companyId: "other", name: "Elsewhere Agent", title: " Stranger", status: "idle", adapterType: "jules", metadata: { founderosTemplateId: "stranger" } },
] as Record<string, any>[]);

const harness = (rows: Array<[unknown, Record<string, any>[]]> = [], overrides: Parameters<typeof agentHandoffService>[1] = {}) => {
  const store = fakeDb([[agents, fleet()], [issues, []], ...rows]);
  // The real issue service validates the full create schema (labels, workspace policy, goal
  // resolution) against tables this fixture does not seed. Handing it a create that records what
  // was asked for keeps the test about the handoff contract — status, assignee, lineage, wake —
  // and lets a bad create body show up as an assertion on `store`, not as an unrelated schema error.
  let sequence = 0;
  const issues_ = overrides.issues ?? {
    create: async (companyId: string, input: Record<string, any>) => {
      const row = { id: `new-${++sequence}`, companyId, ...input };
      (store.rows.get(issues) ?? store.rows.get(issues)!).push(row);
      return { id: row.id, identifier: `CMP-${sequence}` };
    },
  };
  return { store, handoff: agentHandoffService(store.db as Db, { ...overrides, issues: issues_ }) };
};

/** The shape of a normal ask, so each test only states the thing it is changing. */
const ask = (over = {}) => ({ companyId: "co", fromAgentId: "a-pdf", toRole: "docs", title: "Render the plan", need: "A PDF of business-case/PLAN.md", ...over });

const wakeCalls: Array<{ agentId: string; options: Record<string, unknown> }> = [];
const wakeOk = async (agentId: string, options: Record<string, unknown>) => { wakeCalls.push({ agentId, options }); };

describe("resolving a role the way a worker would say it", () => {
  it("matches an exact alias before anything fuzzy", async () => {
    const { handoff } = harness();
    expect((await handoff.resolveRole("co", "pdf")).kind).toBe("found");
    expect((await handoff.resolveRole("co", "document compiler")).kind).toBe("found");
  });

  it("refuses to guess between two agents that both fit", async () => {
    // A worker writing "the architect" means one of them and cannot see which. Silently picking
    // one routes the deliverable to the wrong agent with no signal anywhere — a wrong answer is
    // worse than a refusal, because a refusal is something the agent can report.
    const crowded = fleet().concat([{ id: "a-arch", companyId: "co", name: "Solution Architect", title: "", status: "idle", adapterType: "jules", metadata: { founderosTemplateId: "arch" } }]);
    const { handoff } = harness([[agents, crowded]]);
    const resolved = await handoff.resolveRole("co", "architect");
    expect(resolved.kind).toBe("ambiguous");
    if (resolved.kind === "ambiguous") expect(resolved.candidates.length).toBeGreaterThan(1);
  });

  it("cannot address an agent in another company", async () => {
    const { handoff } = harness();
    expect((await handoff.resolveRole("co", "Elsewhere Agent")).kind).toBe("unknown");
  });
});

describe("refusing the requests that would deadlock a fleet", () => {
  it("will not let an agent hand work to itself", async () => {
    const { handoff } = harness();
    expect(await handoff.requestHandoff(ask({ toRole: "pdf" }))).toMatchObject({ ok: false, code: "self_request" });
  });

  it("will not wake a paused peer", async () => {
    const { handoff } = harness();
    expect(await handoff.requestHandoff(ask({ toRole: "sales" }))).toMatchObject({ ok: false, code: "assignee_unavailable" });
  });

  it("names the loop rather than closing it", async () => {
    // a-docs asked a-pdf for this; a-pdf asking a-docs back is the cycle that leaves both waiting.
    const seeded = [[issues, [{ id: "i1", companyId: "co", status: "in_progress", assigneeAgentId: "a-pdf", createdByAgentId: "a-docs", parentId: null, requestDepth: 1 }]]] as Array<[unknown, Record<string, any>[]]>;
    const { handoff } = harness(seeded);
    const result = await handoff.requestHandoff(ask({ fromIssueId: "i1" }));
    expect(result).toMatchObject({ ok: false, code: "cycle" });
    if (!result.ok) expect(result.message).toContain("loop");
  });

  it("stops a chain that has already passed through the whole fleet", async () => {
    const chain: Record<string, any>[] = [];
    const creators = ["a-sales", "a-pres", "a-docs", "a-pdf", "a-out"];
    creators.forEach((creator, index) => chain.push({ id: `d${index}`, companyId: "co", status: "todo", assigneeAgentId: "a-pdf", createdByAgentId: creator, parentId: index ? `d${index - 1}` : null, requestDepth: index + 1 }));
    const { handoff } = harness([[issues, chain]]);
    const result = await handoff.requestHandoff(ask({ fromAgentId: "a-pres", fromIssueId: `d${chain.length - 1}` }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["too_deep", "cycle"]).toContain(result.code);
    expect(MAX_HANDOFF_DEPTH).toBeLessThan(creators.length + 1);
  });

  it("refuses on company structure with a revisable reason, not a crash", async () => {
    const { handoff } = harness();
    const unknown = await handoff.requestHandoff(ask({ toRole: "the graphic person" }));
    expect(unknown).toMatchObject({ ok: false, code: "unknown_role" });
    if (!unknown.ok) expect(unknown.message).toMatch(/directory|name/i);
  });
});

describe("a handoff that succeeds is an ordinary assigned issue", () => {
  it("creates out of backlog, assigns the peer, and wakes them", async () => {
    const { store, handoff } = harness([], { wake: wakeOk });
    wakeCalls.length = 0;
    const result = await handoff.requestHandoff(ask());
    expect(result).toMatchObject({ ok: true, assignee: { id: "a-docs", name: "Document Compiler" }, woke: true, depth: 1 });

    // `backlog` never wakes an assignee, and waking is the entire point of a handoff.
    const created = (store.rows.get(issues) ?? []).at(-1);
    expect(created).toMatchObject({ status: "todo", assigneeAgentId: "a-docs", createdByAgentId: "a-pdf", companyId: "co" });
    expect(created.requestDepth).toBe(1);

    // Woken the way the board wakes an assignee, so the peer cannot tell the two apart.
    expect(wakeCalls).toHaveLength(1);
    expect(wakeCalls[0]!.agentId).toBe("a-docs");
    expect(wakeCalls[0]!.options).toMatchObject({ source: "assignment", reason: "issue_assigned" });
  });

  it("reports a wake that failed instead of swallowing it", async () => {
    // A handoff whose wake was lost sits in `todo` forever with nobody coming. That must be a
    // visible result, not a floating promise that rejected quietly.
    const { handoff } = harness([], { wake: async () => { throw new Error("heartbeat unavailable"); } });
    expect(await handoff.requestHandoff(ask())).toMatchObject({ ok: true, woke: false, wakeError: "heartbeat unavailable" });
  });

  it("inherits the goal and project of the issue being helped", async () => {
    const seeded = [[issues, [{ id: "i1", companyId: "co", status: "in_progress", assigneeAgentId: "a-pdf", createdByAgentId: null, parentId: null, goalId: "goal-7", projectId: "proj-3" }]]] as Array<[unknown, Record<string, any>[]]>;
    const { store, handoff } = harness(seeded, { wake: wakeOk });
    await handoff.requestHandoff(ask({ fromIssueId: "i1" }));
    const created = (store.rows.get(issues) ?? []).at(-1);
    // Loose work at company level is work the board stops seeing.
    expect(created).toMatchObject({ goalId: "goal-7", projectId: "proj-3", parentId: "i1" });
  });
});

  it("writes to the caller's transaction and leaves the wake until it commits", async () => {
    // A handoff created on the ambient connection while the caller is mid-transaction commits on
    // its own: the caller rolls back, the peer keeps an assigned issue nobody asked for, and the
    // retry asks again on top of it. Waking early has the mirror problem — the peer is roused for
    // an issue that is not yet visible. Both are refused here rather than arranged quietly.
    const calls: string[] = [];
    const own = fakeDb([[agents, fleet()], [issues, []]]);
    let created: Record<string, any> | null = null;
    const handoff = agentHandoffService(own.db as Db, {
      wake: async () => { calls.push("wake"); },
      issues: { create: async () => { calls.push("create"); created = { id: "tx-1", identifier: "CMP-9" }; return { id: "tx-1", identifier: "CMP-9" }; } },
    });
    const result = await handoff.requestHandoff(ask(), { database: own.db as Db, deferWake: true });
    expect(result).toMatchObject({ ok: true, woke: false, wakePending: true });
    // Nothing has been woken: that call belongs to the caller, after its commit.
    expect(calls).toEqual(["create"]);
    if (result.ok && result.wakePending) {
      await handoff.wakeAssignee({ issueId: result.issueId, requesterId: "a-pdf", targetId: result.assignee.id });
    }
    expect(calls).toEqual(["create", "wake"]);
    expect(created).not.toBeNull();
  });

describe("the directory a worker is allowed to ask", () => {
  it("excludes itself, foreign companies, and agents that cannot work", async () => {
    const { handoff } = harness();
    const directory = await handoff.peerDirectory("co", "a-pdf");
    expect(directory.map((peer) => peer.name)).not.toContain("PDF Engine Architect");
    expect(directory.map((peer) => peer.name)).not.toContain("Elsewhere Agent");
    const paused = directory.find((peer) => peer.name === "Commercial Lead");
    expect(paused).toMatchObject({ available: false });
    expect(paused!.note).toMatch(/paused/);
    expect(directory.every((peer) => peer.askKey.length > 0)).toBe(true);
  });
});

describe("what the peer actually reads", () => {
  it("stands alone: who asked, what is needed, and how to return it", () => {
    const body = renderHandoffDescription({
      requesterName: "Document Compiler",
      need: "Render business-case/PLAN.md to PDF",
      inputs: ["business-case/PLAN.md"],
      acceptance: ["The PDF opens and paginates"],
    });
    expect(body).toContain("Requested by Document Compiler");
    expect(body).toContain("business-case/PLAN.md");
    expect(body).toContain("The PDF opens and paginates");
    // The return path is a mention, because mentions are what wake the requester.
    expect(body).toContain("@Document Compiler");
    // Closing the requester's issue would skip the step where they check the work.
    expect(body).toMatch(/Do not close the requester's own issue/);
  });
});
