import { describe, expect, it, vi } from "vitest";
import { companyJulesSources, julesSessions } from "@paperclipai/db";
import { fakeDb } from "./fixtures/fake-db.js";
import { providerArtifactReaderService } from "../services/artifact-reader.js";

// MOCKED GitHub responses (no live provider calls). Genuine live retrieval requires a real
// session + PR and is exercised only during an authorized live qualification.
function resp(json: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => json }; }
function seeded(overrides: { source?: Record<string, unknown>; session?: Record<string, unknown> } = {}) {
  const source = { id: "src1", companyId: "company-a", repository: "owner/repo", startingBranch: "main", ...(overrides.source || {}) };
  const session = { id: "s1", companyId: "company-a", companySourceId: "src1", agentId: "a1", issueId: "i1", paperclipRunId: "run-1", julesSessionId: "remote-1", status: "COMPLETED_UNVALIDATED", pullRequestUrl: "https://github.com/owner/repo/pull/7", ...(overrides.session || {}) };
  return fakeDb([[companyJulesSources, [source]], [julesSessions, [session]]] as never);
}

describe("provider artifact reader (mocked GitHub)", () => {
  it("retrieves a PR artifact with immutable provenance", async () => {
    const { db } = seeded();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/pulls/7")) return resp({ head: { sha: "a".repeat(40) }, base: { repo: { full_name: "owner/repo" }, ref: "main" } });
      if (url.includes("/compare/main...")) return resp({ files: [{ filename: "qualification/out.md", type: "file", size: 20 }], merge_base_commit: { sha: "b".repeat(40) }, base: { ref: "main" } });
      if (url.includes("/contents/")) return resp({ content: Buffer.from("paperclip_run_id: run-1").toString("base64") });
      return resp({}, 404);
    }) as unknown as typeof fetch;
    const result = await providerArtifactReaderService(db as never, { githubToken: "ghp_test", fetchImpl }).readForRun({ companyId: "company-a", paperclipRunId: "run-1" });
    expect(result.artifactRetrieved).toBe(true);
    expect(result.code).toBe("ARTIFACT_RETRIEVED");
    expect(result.product?.headSha).toBe("a".repeat(40));
    expect(result.product?.paths).toEqual(["qualification/out.md"]);
    expect(result.product?.bodies?.["qualification/out.md"]).toContain("run-1");
    expect(result.product?.prMetadataVerified).toBe(true);
    expect(result.contentHash).toMatch(/^sha256:/);
  });
  it("reports a recoverable failure when the deployment has no GitHub token", async () => {
    const { db } = seeded();
    const fetchImpl = vi.fn(async () => resp({}, 200)) as unknown as typeof fetch;
    const result = await providerArtifactReaderService(db as never, { githubToken: "", fetchImpl }).readForRun({ companyId: "company-a", paperclipRunId: "run-1" });
    expect(result.artifactRetrieved).toBe(false);
    expect(result.code).toBe("GITHUB_TOKEN_MISSING");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("classifies a missing session without creating remote work", async () => {
    const { db } = seeded();
    const result = await providerArtifactReaderService(db as never, { githubToken: "ghp_test", fetchImpl: async () => resp({}) as never }).readForRun({ companyId: "company-a", paperclipRunId: "nope" });
    expect(result.code).toBe("NO_JULES_SESSION");
  });
  it("marks a GitHub rejection recoverable, not synthesized", async () => {
    const { db } = seeded();
    const fetchImpl = vi.fn(async () => resp({}, 404)) as unknown as typeof fetch;
    const result = await providerArtifactReaderService(db as never, { githubToken: "ghp_test", fetchImpl }).readForRun({ companyId: "company-a", paperclipRunId: "run-1" });
    expect(result.artifactRetrieved).toBe(false);
    expect(result.code).toBe("GITHUB_READ_REJECTED");
    expect(result.status).toBe(404);
  });
  it("supports a branch-only output resolved through the commits API", async () => {
    const { db } = seeded({ session: { pullRequestUrl: null } });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/commits/main")) return resp({ sha: "c".repeat(40) });
      if (url.includes("/compare/main...")) return resp({ files: [{ filename: "out.md", type: "file", size: 10 }], merge_base_commit: { sha: "d".repeat(40) }, base: { ref: "main" } });
      if (url.includes("/contents/")) return resp({ content: Buffer.from("x").toString("base64") });
      return resp({}, 404);
    }) as unknown as typeof fetch;
    const result = await providerArtifactReaderService(db as never, { githubToken: "ghp_test", fetchImpl }).readForRun({ companyId: "company-a", paperclipRunId: "run-1" });
    expect(result.artifactRetrieved).toBe(true);
    expect(result.product?.headSha).toBe("c".repeat(40));
    expect(result.product?.branch).toBe("main");
  });
  it("refuses a cross-company source binding", async () => {
    const { db } = seeded({ source: { companyId: "company-b" } });
    const result = await providerArtifactReaderService(db as never, { githubToken: "ghp_test", fetchImpl: async () => resp({}) as never }).readForRun({ companyId: "company-a", paperclipRunId: "run-1" });
    expect(result.code).toBe("SOURCE_BINDING_MISMATCH");
  });
});
