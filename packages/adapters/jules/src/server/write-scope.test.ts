import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "./execute.js";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

async function promptFor(goalSupport: Record<string, unknown>) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(ok({ id: "remote-1", state: "QUEUED" }))
    .mockResolvedValueOnce(ok({ activities: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await execute({
    runId: "run-1",
    agent: { id: "agent-1", companyId: "company-1", name: "Market Analyst", adapterType: "jules", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { env: { JULES_API_KEY: "secret" }, source: "sources/acme", repository: "acme/co", outcomeTemplate: "bootstrap", maxWaitSec: 0 },
    context: { goalSupport },
    onLog: async () => {},
  });
  return String(JSON.parse(String(fetchMock.mock.calls[0][1]?.body ?? "{}")).prompt ?? "");
}

const scopeLine = (prompt: string) => prompt.slice(prompt.indexOf("Write only within:")).split("\n")[0];

describe("what a session is permitted to write", () => {
  it("covers the outputs the same contract requires", async () => {
    // These were unioned into requiredOutputs but not into writeScope, so the session
    // was told to produce a file and, four sections later, forbidden to write it. The
    // compliant response is to do nothing and finish — which is what a real one did.
    const prompt = await promptFor({ outputPaths: ["business-case/MARKET_ANALYSIS.md", "evidence/market/**"] });
    expect(prompt).toContain("- business-case/MARKET_ANALYSIS.md");
    const scope = scopeLine(prompt);
    expect(scope).toContain("business-case/MARKET_ANALYSIS.md");
    expect(scope).toContain("evidence/market/**");
  });

  it("keeps the template's own scope as well", async () => {
    const scope = scopeLine(await promptFor({ outputPaths: ["evidence/market/**"] }));
    expect(scope).toContain("firm/**");
    expect(scope).toContain("company/**");
  });

  it("honours an explicit contract write scope", async () => {
    const scope = scopeLine(await promptFor({ writeScope: ["website/**"], outputPaths: [] }));
    expect(scope).toContain("website/**");
  });

  it("widens nothing when the goal declares no outputs", async () => {
    const scope = scopeLine(await promptFor({}));
    expect(scope).toBe("Write only within: `company/**`, `firm/**`, `business-case/VALIDATION_PIPELINE.md`, `.founderos/**`.");
  });
});
