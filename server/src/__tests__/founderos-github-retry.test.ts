import { afterEach, describe, expect, it } from "vitest";
import { githubFounderOsRepositoryWriter, githubRequestRuntime, githubRetryDelayMs, mapWithConcurrency } from "../services/founderos-github.js";

const defaults = { ...githubRequestRuntime };
afterEach(() => Object.assign(githubRequestRuntime, defaults));

function stubGithub(responder: (url: string, init: RequestInit) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: string[] = [];
  const slept: number[] = [];
  Object.assign(githubRequestRuntime, {
    sleep: async (ms: number) => void slept.push(ms),
    fetch: async (url: any, init: any = {}) => {
      calls.push(`${init.method ?? "GET"} ${String(url)}`);
      const { status, body, headers } = responder(String(url), init);
      return { ok: status >= 200 && status < 300, status, headers: { get: (name: string) => headers?.[name.toLowerCase()] ?? null }, json: async () => body ?? {} } as unknown as Response;
    },
  });
  return { calls, slept };
}

// A bootstrap creates one blob per managed file, and GitHub answers those bursts with a
// transient 503 often enough that a single un-retried failure aborted a real import.
const bootstrapResponses: Record<string, unknown> = {
  "git/ref/heads": { object: { sha: "base-sha" } },
  "git/commits/base-sha": { tree: { sha: "base-tree" } },
  "git/blobs": { sha: "blob-sha" },
  "git/trees": { sha: "tree-sha" },
  "git/commits": { sha: "commit-sha" },
  "pulls": { html_url: "https://github.com/acme/company/pull/1" },
};
function bootstrapBody(url: string) {
  for (const [fragment, body] of Object.entries(bootstrapResponses)) if (url.includes(fragment)) return body;
  return {};
}

describe("FounderOS GitHub bootstrap resilience", () => {
  it("waits longer on each retry and honours Retry-After", () => {
    expect(githubRetryDelayMs(0)).toBeLessThan(githubRetryDelayMs(1));
    expect(githubRetryDelayMs(1)).toBeLessThan(githubRetryDelayMs(2));
    expect(githubRetryDelayMs(9)).toBeLessThanOrEqual(8_000);
    expect(githubRetryDelayMs(0, "2")).toBe(2_000);
    expect(githubRetryDelayMs(0, "600")).toBe(30_000);
    expect(githubRetryDelayMs(0, "not-a-number")).toBe(githubRetryDelayMs(0));
  });

  it("retries a transient 503 instead of failing the import", async () => {
    let blobAttempts = 0;
    const stub = stubGithub((url) => {
      if (url.includes("git/blobs") && ++blobAttempts <= 2) return { status: 503, headers: { "retry-after": "1" } };
      return { status: 200, body: bootstrapBody(url) };
    });
    const result = await githubFounderOsRepositoryWriter("token").createBootstrapPullRequest({ repository: "acme/company", baseBranch: "main", title: "Install", files: { "a.md": "a", "b.md": "b" } });
    expect(result.url).toBe("https://github.com/acme/company/pull/1");
    expect(blobAttempts).toBe(4);
    expect(stub.slept).toEqual([1_000, 1_000]);
  });

  it("gives up on a persistent failure and reports the status", async () => {
    stubGithub((url) => (url.includes("git/blobs") ? { status: 503 } : { status: 200, body: bootstrapBody(url) }));
    await expect(githubFounderOsRepositoryWriter("token").createBootstrapPullRequest({ repository: "acme/company", baseBranch: "main", title: "Install", files: { "a.md": "a" } }))
      .rejects.toThrow("GitHub bootstrap request failed (503)");
  });

  it("does not retry a status that will never succeed", async () => {
    let attempts = 0;
    stubGithub((url) => { if (url.includes("git/blobs")) { attempts += 1; return { status: 404 } } return { status: 200, body: bootstrapBody(url) } });
    await expect(githubFounderOsRepositoryWriter("token").createBootstrapPullRequest({ repository: "acme/company", baseBranch: "main", title: "Install", files: { "a.md": "a" } }))
      .rejects.toThrow("(404)");
    expect(attempts).toBe(1);
  });

  it("keeps the blob burst below the configured concurrency", async () => {
    let inFlight = 0; let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (value) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return value * 2;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
  });
});
