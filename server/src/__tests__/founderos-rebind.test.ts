import { describe, expect, it } from "vitest";
import type { Db } from "@paperclipai/db";
import { agents, companies, companyJulesSources, companyRepositoryBindings, founderosBootstraps, issues, julesProfileSources } from "@paperclipai/db";
import { FOUNDEROS_CONTEXT_VERSION, JULES_SOURCE_PAUSE_REASON } from "../services/founderos-bootstrap.js";
import { founderOsRebindService, julesWorkerRebindPatch } from "../services/founderos-rebind.js";
import { fakeDb } from "./fixtures/fake-db.js";

const companyId = "company-1";
const binding = { repository: "acme/company", source: "sources/acme", startingBranch: "main" };
function store(overrides: { issueStatus?: string; seedInspection?: Record<string, unknown>; workers?: any[] } = {}) {
  return fakeDb([
    [companies, [{ id: companyId, name: "Acme", firmGithubRepo: "acme/company" }]],
    [companyRepositoryBindings, [{ id: "binding-1", companyId, repository: "acme/company", defaultBranch: "main" }]],
    [agents, overrides.workers ?? [{ id: "worker-1", companyId, adapterType: "jules", status: "paused", pauseReason: JULES_SOURCE_PAUSE_REASON, adapterConfig: { repository: "acme/company", source: "", startingBranch: "main", outcomeTemplate: "bootstrap" }, metadata: { deploymentReady: false } }]],
    [issues, [{ id: "issue-1", companyId, status: overrides.issueStatus ?? "blocked", assigneeAgentId: "worker-1" }]],
    [founderosBootstraps, [{ id: "bootstrap-1", companyId, contextVersion: FOUNDEROS_CONTEXT_VERSION, status: "blocked", installedCommit: "commit-1", nativeIds: { issueId: "issue-1" }, seedInspection: overrides.seedInspection ?? { overviewPresent: true, websitePresent: true, readiness: "Jules Source unavailable: none" } }]],
  ]);
}
const resolver = (result: any) => ({ sourceResolver: { resolve: async () => result } });

describe("FounderOS Jules source rebind", () => {
  it("binds the source, resumes the paused workforce, and unblocks the bootstrap issue", async () => {
    const s = store();
    const result = await founderOsRebindService(s.db, resolver({ source: "sources/acme", profileId: "profile-1", accessible: true })).rebindJulesSource(companyId);
    expect(result).toMatchObject({ rebound: true, repository: "acme/company", source: "sources/acme", profileId: "profile-1", agentsResumed: 1, issuesUnblocked: 1 });
    expect(s.rows.get(companyJulesSources)?.[0]).toMatchObject({ companyId, repository: "acme/company", source: "sources/acme", enabled: true });
    expect(s.rows.get(julesProfileSources)?.[0]).toMatchObject({ profileId: "profile-1", status: "active" });
    expect(s.rows.get(issues)?.[0].status).toBe("todo");
    expect(s.rows.get(founderosBootstraps)?.[0]).toMatchObject({ status: "awaiting_context_pr" });
    expect(s.rows.get(founderosBootstraps)?.[0].seedInspection.readiness).toBeNull();
  });

  it("changes nothing when no profile can see the repository", async () => {
    const s = store();
    const result = await founderOsRebindService(s.db, resolver({ source: "", accessible: false, reason: "No configured Jules profile exposes the imported GitHub repository" })).rebindJulesSource(companyId);
    expect(result).toMatchObject({ rebound: false, agentsResumed: 0, issuesUnblocked: 0 });
    expect(result.reason).toMatch(/No configured Jules profile/);
    expect(s.rows.get(companyJulesSources)).toBeUndefined();
    expect(s.rows.get(agents)?.[0].status).toBe("paused");
    expect(s.rows.get(issues)?.[0].status).toBe("blocked");
  });

  it("keeps the bootstrap issue blocked while the seed itself is incomplete", async () => {
    const s = store({ seedInspection: { overviewPresent: false, websitePresent: true } });
    const result = await founderOsRebindService(s.db, resolver({ source: "sources/acme", profileId: "profile-1", accessible: true })).rebindJulesSource(companyId);
    expect(result).toMatchObject({ rebound: true, issuesUnblocked: 0 });
    expect(s.rows.get(issues)?.[0].status).toBe("blocked");
    expect(s.rows.get(founderosBootstraps)?.[0]).toMatchObject({ status: "blocked" });
    expect(s.rows.get(founderosBootstraps)?.[0].seedInspection.readiness).toBe("Missing company/OVERVIEW.md");
  });

  it("refuses a company with no bound repository", async () => {
    const s = fakeDb([[companies, [{ id: companyId, name: "Acme", firmGithubRepo: null }]]]);
    const result = await founderOsRebindService(s.db, resolver({ source: "sources/acme", accessible: true })).rebindJulesSource(companyId);
    expect(result).toMatchObject({ rebound: false, repository: null });
    expect(result.reason).toMatch(/no bound GitHub repository/);
  });

  it("leaves another company's workforce and an operator-paused worker untouched", async () => {
    const s = store({ workers: [
      { id: "worker-1", companyId, adapterType: "jules", status: "paused", pauseReason: JULES_SOURCE_PAUSE_REASON, adapterConfig: { source: "" }, metadata: {} },
      { id: "worker-2", companyId, adapterType: "jules", status: "paused", pauseReason: "Budget hard stop", adapterConfig: { source: "" }, metadata: {} },
      { id: "manager", companyId, adapterType: "hermes_local", status: "idle", pauseReason: null, adapterConfig: {}, metadata: {} },
      { id: "other-co", companyId: "company-2", adapterType: "jules", status: "paused", pauseReason: JULES_SOURCE_PAUSE_REASON, adapterConfig: { source: "" }, metadata: {} },
    ] });
    const result = await founderOsRebindService(s.db, resolver({ source: "sources/acme", profileId: "profile-1", accessible: true })).rebindJulesSource(companyId);
    expect(result.agentsResumed).toBe(1);
    const byId = Object.fromEntries((s.rows.get(agents) ?? []).map((a) => [a.id, a]));
    expect(byId["worker-1"]).toMatchObject({ status: "idle", pauseReason: null });
    expect(byId["worker-1"].adapterConfig.source).toBe("sources/acme");
    expect(byId["worker-2"]).toMatchObject({ status: "paused", pauseReason: "Budget hard stop" });
    expect(byId["worker-2"].adapterConfig.source).toBe("sources/acme");
    expect(byId["manager"].adapterConfig).toEqual({});
    expect(byId["other-co"]).toMatchObject({ status: "paused" });
    expect(byId["other-co"].adapterConfig.source).toBe("");
  });

  it("re-points every worker but only resumes the ones the bootstrap paused", () => {
    const bootstrapPaused = julesWorkerRebindPatch({ status: "paused", pauseReason: JULES_SOURCE_PAUSE_REASON, adapterConfig: { outcomeTemplate: "bootstrap", source: "" }, metadata: { deploymentReady: false } }, binding);
    expect(bootstrapPaused.resumable).toBe(true);
    expect(bootstrapPaused.patch).toMatchObject({ status: "idle", pauseReason: null });
    expect(bootstrapPaused.patch.adapterConfig).toMatchObject({ outcomeTemplate: "bootstrap", repository: "acme/company", source: "sources/acme", startingBranch: "main" });
    expect(bootstrapPaused.patch.metadata).toMatchObject({ deploymentReady: true });

    const operatorPaused = julesWorkerRebindPatch({ status: "paused", pauseReason: "Budget hard stop", adapterConfig: {}, metadata: null }, binding);
    expect(operatorPaused.resumable).toBe(false);
    expect(operatorPaused.patch).not.toHaveProperty("status");
    expect(operatorPaused.patch).not.toHaveProperty("pauseReason");
    expect(operatorPaused.patch.adapterConfig).toMatchObject({ source: "sources/acme" });

    const alreadyRunning = julesWorkerRebindPatch({ status: "busy", pauseReason: null, adapterConfig: {}, metadata: {} }, binding);
    expect(alreadyRunning.resumable).toBe(false);
    expect(alreadyRunning.patch).not.toHaveProperty("status");
  });
});
