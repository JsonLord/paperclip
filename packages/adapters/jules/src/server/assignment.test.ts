import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "./execute.js";

afterEach(() => vi.unstubAllGlobals());

const run = async (context: Record<string, unknown>) => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "remote-1", state: "QUEUED" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ activities: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await execute({
    runId: "run-1",
    agent: { id: "agent-1", companyId: "company-1", name: "Market Analyst", adapterType: "jules", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { env: { JULES_API_KEY: "secret" }, source: "sources/acme", repository: "acme/co", outcomeTemplate: "bootstrap", maxWaitSec: 0 },
    context,
    onLog: async () => {},
  });
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body ?? "{}")) as { prompt?: string; title?: string };
  return body;
};

describe("dispatching a Jules session for a Paperclip issue", () => {
  it("puts the assignment in the prompt, since the remote worker cannot read it from Paperclip", async () => {
    const body = await run({
      assignment: {
        issueId: "issue-1",
        title: "Map the competitor landscape",
        description: "Ten platforms, with pricing sources.",
        priority: "high",
        goal: "Round 1",
      },
    });
    expect(body.prompt).toContain("Map the competitor landscape");
    expect(body.prompt).toContain("Ten platforms, with pricing sources.");
    // The remote session list is otherwise fifteen identically named template sessions.
    expect(body.title).toBe("Map the competitor landscape");
  });

  it("falls back to the template when a run carries no issue", async () => {
    const body = await run({});
    expect(body.prompt).not.toContain("## Assigned outcome");
    expect(body.title).toBe("Bootstrap company model");
  });

  it("ignores an assignment with no usable title", async () => {
    const body = await run({ assignment: { description: "orphaned" } });
    expect(body.prompt).not.toContain("## Assigned outcome");
    expect(body.prompt).not.toContain("orphaned");
  });
});
