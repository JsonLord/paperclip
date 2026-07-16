import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Force the plain-text fallback path: point the CLI at a command that does not
// exist so detectCli() resolves to unavailable, and isolate the workspace root.
const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "paperclip-firm-test-"));
process.env.PAPERCLIP_FIRM_HOME = tmpRoot;
process.env.PAPERCLIP_FIRM_CLI = "paperclip-nonexistent-firm-cli-xyz";

const { firmService } = await import("../services/firm.ts");
const { companyContextCache, COMPANY_SCOPE_KEY } = await import("../services/company-context-cache.ts");

const COMPANY = "11111111-1111-1111-1111-111111111111";

describe("firmService (plain-text fallback)", () => {
  beforeAll(async () => {
    // Prime CLI detection cache as unavailable.
    const detection = await firmService().detectCli(true);
    expect(detection.available).toBe(false);
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    companyContextCache.clear();
  });

  it("ensureWorkspace is idempotent and records the company name", async () => {
    const firm = firmService();
    const first = await firm.ensureWorkspace(COMPANY, "Acme Inc");
    expect(first.companyId).toBe(COMPANY);
    expect(first.companyName).toBe("Acme Inc");
    expect(await firm.isInitialized(COMPANY)).toBe(true);

    const second = await firm.ensureWorkspace(COMPANY, "Acme Inc");
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("links projects and lists them", async () => {
    const firm = firmService();
    await firm.linkProject({ companyId: COMPANY, projectId: "proj-a", name: "Website", repoUrl: "https://example.com/web.git" });
    await firm.linkProject({ companyId: COMPANY, projectId: "proj-b", name: "API" });

    const records = await firm.listProjectRecords(COMPANY);
    expect(records.map((r) => r.name).sort()).toEqual(["API", "Website"]);
    expect(records.find((r) => r.projectId === "proj-a")?.repoUrl).toBe("https://example.com/web.git");
  });

  it("renders a snapshot from plain-text records and warms the cache", async () => {
    const firm = firmService();
    const meta = await firm.writeSnapshot(COMPANY);
    expect(meta.cliUsed).toBe(false);
    expect(meta.projectCount).toBe(2);

    const contextFile = readFileSync(path.join(firm.companyFirmDir(COMPANY), "context.md"), "utf-8");
    expect(contextFile).toContain("Acme Inc");
    expect(contextFile).toContain("Website");
    expect(contextFile).toContain("API");

    // Snapshot wrote through to the warm cache.
    expect(companyContextCache.peek(COMPANY, COMPANY_SCOPE_KEY)?.content).toContain("Website");
  });

  it("getContext returns warm content and is fresh right after a snapshot", async () => {
    const firm = firmService();
    await firm.writeSnapshot(COMPANY);

    const ctx = await firm.getContext({ companyId: COMPANY });
    expect(ctx).toContain("Acme Inc");
    expect(await firm.isStale(COMPANY)).toBe(false);
  });

  it("getContext hydrates from disk on a cold cache", async () => {
    const firm = firmService();
    await firm.writeSnapshot(COMPANY);
    companyContextCache.clear();

    const ctx = await firm.getContext({ companyId: COMPANY });
    expect(ctx).toContain("Acme Inc");
    expect(companyContextCache.peek(COMPANY, COMPANY_SCOPE_KEY)?.content).toContain("Acme Inc");
  });

  it("getContext returns null for a company with no workspace", async () => {
    const firm = firmService();
    const ctx = await firm.getContext({ companyId: "no-such-company" });
    expect(ctx).toBeNull();
  });

  it("isStale is true when there is no snapshot, and respects maxAge", async () => {
    const firm = firmService();
    const fresh = "22222222-2222-2222-2222-222222222222";
    expect(await firm.isStale(fresh)).toBe(true);

    await firm.ensureWorkspace(fresh, "Beta");
    await firm.writeSnapshot(fresh);
    // Far in the future relative to maxAge → stale.
    expect(await firm.isStale(fresh, 1_000, Date.now() + 10_000)).toBe(true);
  });

  it("lists only initialized company workspaces", async () => {
    const firm = firmService();
    await firm.ensureWorkspace(COMPANY, "Acme Inc");
    const ids = await firm.listInitializedCompanyIds();
    expect(ids).toContain(COMPANY);
  });
});
