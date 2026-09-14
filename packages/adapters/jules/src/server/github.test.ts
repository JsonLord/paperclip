import { describe, expect, it, vi } from "vitest";
import { testGitHubConnection } from "./github.js";

describe("GitHub deployment connection test", () => {
  it("verifies repository access and reports its default branch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }));
    await expect(testGitHubConnection("acme/company", { token: "secret", fetchImpl })).resolves.toEqual({ ok: true, status: 200, repository: "acme/company", defaultBranch: "main" });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.github.com/repos/acme/company", expect.objectContaining({ method: "GET" }));
  });

  it("does not expose credentials when access fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "token secret-token invalid" }), { status: 401 }));
    const result = await testGitHubConnection("acme/private", { token: "secret-token", fetchImpl });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
