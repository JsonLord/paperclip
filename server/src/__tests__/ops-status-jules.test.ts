import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { agents, approvals, companies, companyJulesSources, goals, heartbeatRuns, issueComments, issues, julesProfiles, julesProfileSources, julesSessions } from "@paperclipai/db";
import { fakeDb } from "./fixtures/fake-db.js";

const resolveSecretValue = vi.fn();
vi.mock("../services/secrets.js", () => ({ secretService: () => ({ resolveSecretValue }) }));
const { opsStatusService } = await import("../services/ops-applier.js");

function store() {
  return fakeDb([
    [companies, [{ id: "c1", name: "aux" }]],
    [agents, [{ id: "a1", companyId: "c1", name: "Market Analyst", adapterType: "jules", status: "error" }]],
    [goals, []],
    [issues, []],
    [approvals, []],
    [heartbeatRuns, [{ id: "r1", companyId: "c1", agentId: "a1", status: "failed", startedAt: new Date("2026-09-24T10:00:00Z"), finishedAt: new Date("2026-09-24T10:00:02Z"), errorCode: "jules_source_access_missing", error: "Company has no enabled Jules source for the requested repository" }]],
    [issueComments, []],
    [companyJulesSources, [{ id: "s1", companyId: "c1", repository: "JsonLord/aux-company", source: "sources/aux", startingBranch: "main", enabled: true, requiredCapabilities: [] }]],
    [julesProfiles, [
      { id: "p1", name: "jules-c1-1", status: "active", enabled: true, secretRef: "sec-ok", capabilities: ["github"], capabilityReadiness: { context7: { status: "missing" } } },
      { id: "p2", name: "jules-c1-2", status: "active", enabled: true, secretRef: "sec-dead", capabilities: [], capabilityReadiness: {} },
    ]],
    [julesProfileSources, [
      { id: "m1", profileId: "p1", companySourceId: "s1", status: "active" },
      { id: "m2", profileId: "p2", companySourceId: "s1", status: "active" },
    ]],
    [julesSessions, [{ id: "js1", companyId: "c1", agentId: "a1", julesSessionId: "remote-1", status: "COMPLETED", pullRequestUrl: "https://github.com/JsonLord/aux-company/pull/9", completionCandidate: true, waitReason: null, reconciliationError: null, startedAt: new Date("2026-09-24T11:00:00Z"), finishedAt: null, pullRequestDescription: "do-not-export" }]],
  ]);
}

describe("Jules state in the ops status snapshot", () => {
  it("says whether a source is bound and whether its profiles hold a readable credential", async () => {
    resolveSecretValue.mockImplementation(async (_company: string, ref: string) => {
      if (ref === "sec-dead") throw new Error("sealed with a master key this deployment no longer has");
      return "value";
    });
    const snap = await opsStatusService(store().db as Db).snapshot() as any;
    const jules = snap.companies[0].jules;
    expect(jules.sources[0]).toMatchObject({ repository: "JsonLord/aux-company", source: "sources/aux", enabled: true });
    expect(jules.sources[0].profiles).toEqual([
      { name: "jules-c1-1", status: "active", enabled: true, mappingStatus: "active", credential: "readable", capabilities: ["github"], capabilityReadiness: { context7: "missing" } },
      { name: "jules-c1-2", status: "active", enabled: true, mappingStatus: "active", credential: "unreadable", capabilities: [], capabilityReadiness: {} },
    ]);
  });

  it("exports the sessions that survive a restore, and the run failure code that does not", async () => {
    resolveSecretValue.mockResolvedValue("value");
    const snap = await opsStatusService(store().db as Db).snapshot() as any;
    const company = snap.companies[0];
    expect(company.jules.sessionCount).toBe(1);
    expect(company.jules.recentSessions[0]).toMatchObject({ agent: "Market Analyst", status: "COMPLETED", julesSessionId: "remote-1", completionCandidate: true });
    // Without the code, a denial and a remote failure read identically from outside.
    expect(company.recentRuns[0]).toMatchObject({ errorCode: "jules_source_access_missing" });
  });

  it("still exports no credential value and no free text", async () => {
    resolveSecretValue.mockResolvedValue("super-secret-jules-key");
    const body = JSON.stringify(await opsStatusService(store().db as Db).snapshot());
    expect(body).not.toContain("super-secret-jules-key");
    expect(body).not.toContain("sec-ok");
    expect(body).not.toContain("do-not-export");
  });
});
