import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { activityLog, agents, approvals, companies, companyJulesSources, goals, heartbeatRuns, issueApprovals, issueComments, issues, issueWorkProducts, julesCallbackEvents, julesSessions, projects, resourcePackSnapshots } from "@paperclipai/db";
import { julesCallbackService } from "../services/jules-callbacks.js";
import { createJulesOutboxReconciler } from "../services/jules-outbox.js";

export function callbackDb() {
  const session = { id: "session-row", companyId: "company-a", profileId: "profile", companySourceId: "source-a", paperclipRunId: "run-a", julesSessionId: "remote-a", agentId: "agent-a", goalId: "goal-a", projectId: "project-a", issueId: "issue-a", outcomeId: "issue-a", status: "IN_PROGRESS", capabilityVersion: 1, completionCandidate: false, pullRequestUrl: null, pullRequestTitle: null, pullRequestDescription: null, resultJson: null, finishedAt: null };
  const issue = { id: "issue-a", companyId: "company-a", identifier: "ACME-1", title: "Validate offer", description: "Validate demand", status: "in_progress", priority: "high" };
  const rows = new Map<unknown, Record<string, unknown>[]>([
    [julesSessions, [session]], [heartbeatRuns, [{ id: "run-a", status: "succeeded", contextSnapshot: { objective: "Validate demand", writeScopes: ["business-case/**"], externalActionPolicy: "APPROVAL_REQUIRED", linear: { mode: "CREATE_PROJECT", projectId: "linear-1" } } }]],
    [companies, [{ id: "company-a", name: "Acme", description: "Vision" }]], [agents, [{ id: "agent-a", name: "Researcher", role: "researcher", title: "Market Research" }]],
    [goals, [{ id: "goal-a", companyId: "company-a", title: "Validate", level: "company", parentId: null, description: "Evidence", requiredSkills: ["research"], supportPacks: [], requiredCapabilities: ["context7"], inputPaths: ["company/OVERVIEW.md"], outputPaths: ["business-case/**"], acceptanceCriteria: ["Cited"], cannotCompleteIf: ["No sources"] }]],
    [projects, [{ id: "project-a", name: "Validation", description: "Project", status: "in_progress" }]], [issues, [issue]],
    [companyJulesSources, [{ id: "source-a", companyId: "company-a", repository: "acme/company", source: "sources/acme", startingBranch: "main" }]],
    [approvals, []], [issueApprovals, []], [issueWorkProducts, []], [julesCallbackEvents, []], [activityLog, []], [issueComments, []], [resourcePackSnapshots, []],
  ]);
  const query = () => {
    let selected: Record<string, unknown>[] = [];
    const chain = { from: (table: unknown) => { selected = rows.get(table) ?? []; return chain; }, where: () => chain, limit: () => chain, orderBy: () => chain, then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(selected).then(resolve, reject) };
    return chain;
  };
  const db: Record<string, unknown> = {
    select: query,
    insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => {
      const target = rows.get(table) ?? [];
      rows.set(table, target);
      const duplicate = table === julesCallbackEvents && target.some((item) => item.sessionId === value.sessionId && item.eventId === value.eventId);
      const inserted = duplicate ? [] : [{ id: `${String((table as { _: { name: string } })?._?.name ?? "row")}-${target.length + 1}`, ...value }];
      target.push(...inserted);
      const result = { onConflictDoNothing: () => result, returning: async () => inserted, then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) };
      return result;
    } }),
    update: (table: unknown) => ({ set: (patch: Record<string, unknown>) => ({ where: () => {
      const target = rows.get(table) ?? [];
      target.forEach((item) => Object.assign(item, patch));
      const result = { returning: async () => target, then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) };
      return result;
    } }) }),
  };
  db.transaction = (callback: (tx: unknown) => Promise<unknown>) => callback(db);
  return { db: db as unknown as Db, rows, session, issue };
}

describe("Jules callback native promotion", () => {
  it("promotes every event once into the same native organizational context", async () => {
    const store = callbackDb();
    const hooks = { onMeaningfulProgress: vi.fn(), onBlockerReported: vi.fn(), onArtifactReported: vi.fn(), onApprovalRequested: vi.fn(), onWorkstreamProposed: vi.fn(), onCompletionCandidate: vi.fn() };
    const service = julesCallbackService(store.db, hooks);
    const events = [
      ["progress", { eventId: "progress-1", summary: "Completed three variants and verified browser checks." }],
      ["blocker", { eventId: "blocker-1", description: "Deployment approval is required", severity: "high", requiresHuman: true, requiresApproval: true }],
      ["artifact", { eventId: "artifact-1", title: "Market analysis", path: "business-case/MARKET_ANALYSIS.md", commitSha: "abc123" }],
      ["approval", { eventId: "approval-1", actionType: "deployment", summary: "Approve deployment" }],
      ["proposal", { eventId: "proposal-1", proposalType: "experiment", title: "Pricing test" }],
      ["complete", { eventId: "complete-1", pullRequest: { url: "https://github.com/acme/company/pull/1", title: "Result" } }],
    ] as const;
    for (const [type, payload] of events) {
      expect((await service.promote(store.session as never, type, payload)).applied).toBe(true);
      expect((await service.promote(store.session as never, type, payload)).duplicate).toBe(true);
    }
    expect(store.rows.get(julesCallbackEvents)).toHaveLength(6);
    expect(store.rows.get(activityLog)).toHaveLength(6);
    expect(store.rows.get(issueComments)).toHaveLength(1);
    expect(store.rows.get(issueWorkProducts)).toHaveLength(1);
    expect(store.rows.get(approvals)).toHaveLength(1);
    expect(store.issue.status).toBe("blocked");
    expect(store.session).toMatchObject({ status: "COMPLETED_UNVALIDATED", completionCandidate: true });
    expect(store.session.status).not.toBe("ACCEPTED");
    expect(hooks.onCompletionCandidate).toHaveBeenCalledTimes(1);
    expect(store.session).toMatchObject({ companyId: "company-a", agentId: "agent-a", goalId: "goal-a", projectId: "project-a", issueId: "issue-a" });
  });

  it("does not promote low-value telemetry and never allows self-approval", async () => {
    const store = callbackDb();
    const service = julesCallbackService(store.db);
    await service.promote(store.session as never, "progress", { eventId: "noise", summary: "Ran 5 commands" });
    expect(store.rows.get(activityLog)).toHaveLength(0);
    await expect(service.promote(store.session as never, "approval", { eventId: "bad", status: "approved" })).rejects.toThrow(/cannot resolve/);
    expect(store.rows.get(approvals)).toHaveLength(0);
  });

  it("returns authoritative live context without secrets", async () => {
    const store = callbackDb();
    const context = await julesCallbackService(store.db).getContext(store.session as never);
    expect(context).toMatchObject({ run: { id: "run-a" }, company: { id: "company-a" }, agent: { id: "agent-a" }, goal: { id: "goal-a" }, project: { id: "project-a" }, issue: { id: "issue-a" }, repository: { name: "acme/company", source: "sources/acme", branch: "main" } });
    expect(context.acceptanceCriteria).toEqual(["Cited"]);
    expect(JSON.stringify(context)).not.toMatch(/API_KEY|RUN_TOKEN|Bearer/);
  });

  it("applies a bound GitHub outbox event exactly once", async () => {
    const store = callbackDb();
    const event = { version: "founderos.outbox/v1", eventId: "outbox-progress", runId: "run-a", sessionId: "remote-a", type: "progress", payload: { summary: "Completed durable outbox work and verified the artifacts." } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: "outbox-progress.json", type: "file", download_url: "https://raw.example/event" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(event), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: "outbox-progress.json", type: "file", download_url: "https://raw.example/event" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(event), { status: 200 }));
    const outbox = createJulesOutboxReconciler(store.db, { fetchImpl });
    expect(await outbox.reconcileSession(store.session as never)).toEqual({ discovered: 1, applied: 1 });
    expect(await outbox.reconcileSession(store.session as never)).toEqual({ discovered: 1, applied: 0 });
    expect(store.rows.get(activityLog)).toHaveLength(1);
  });
});
