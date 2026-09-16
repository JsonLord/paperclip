import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPullRequest, JulesApiClient } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

describe("JulesApiClient", () => {
  it("creates sessions with the documented source context and plan policy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "session-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new JulesApiClient("https://jules.example/v1alpha/", "secret");
    await client.createSession({
      prompt: "Do the work",
      source: "sources/acme",
      startingBranch: "main",
      requirePlanApproval: true,
      title: "Validate demand",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://jules.example/v1alpha/sessions");
    expect(JSON.parse(String(init.body))).toEqual({
      prompt: "Do the work",
      sourceContext: { source: "sources/acme", githubRepoContext: { startingBranch: "main" } },
      title: "Validate demand",
      requirePlanApproval: true,
      automationMode: "AUTO_CREATE_PR",
    });
    expect(String(init.body)).not.toContain("repository");
  });

  it("supports paginated source, session, and activity discovery", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sources: [{ name: "sources/acme" }], nextPageToken: "source-next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessions: [{ id: "session-1" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ activities: [{ id: "activity-1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new JulesApiClient("https://jules.example/v1alpha", "secret");

    await expect(client.listSources()).resolves.toEqual({ items: [{ name: "sources/acme" }], nextPageToken: "source-next" });
    await expect(client.listSessions("next page")).resolves.toEqual({ items: [{ id: "session-1" }], nextPageToken: undefined });
    await expect(client.listActivities("session/1")).resolves.toEqual({ items: [{ id: "activity-1" }], nextPageToken: undefined });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://jules.example/v1alpha/sources",
      "https://jules.example/v1alpha/sessions?pageToken=next%20page",
      "https://jules.example/v1alpha/sessions/session%2F1/activities",
    ]);
  });

  it("extracts only a pull request output and never treats the Jules session URL as a PR", () => {
    expect(extractPullRequest({
      id: "session-1",
      outputs: [{}, { pullRequest: { url: "https://github.com/acme/company/pull/7", title: "Result" } }],
    })).toEqual({ url: "https://github.com/acme/company/pull/7", title: "Result", description: undefined });
    expect(extractPullRequest({ id: "session-2" })).toBeNull();
  });
});
