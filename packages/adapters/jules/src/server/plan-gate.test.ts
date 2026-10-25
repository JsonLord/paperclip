import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "./execute.js";
import { createJulesSessionSpec, JULES_OUTCOME_TEMPLATES } from "../prompts.js";

afterEach(() => vi.unstubAllGlobals());
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

async function createdWith(config: Record<string, unknown>) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(ok({ id: "remote-1", state: "QUEUED" }))
    .mockResolvedValueOnce(ok({ activities: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await execute({
    runId: "run-1",
    agent: { id: "agent-1", companyId: "company-1", name: "Market Analyst", adapterType: "jules", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { env: { JULES_API_KEY: "secret" }, source: "sources/acme", repository: "acme/co", outcomeTemplate: "bootstrap", maxWaitSec: 0, ...config },
    context: {},
    onLog: async () => {},
  });
  return JSON.parse(String(fetchMock.mock.calls[0][1]?.body ?? "{}")) as { requirePlanApproval?: boolean; prompt?: string };
}

describe("the plan gate on a new session", () => {
  it("is not set when the deployment auto-approves", async () => {
    // Two sessions were lost to this gate: each generated a correct plan, waited, and
    // terminated reporting COMPLETED with nothing written. Creating the session without
    // it leaves no window to miss, rather than a window nobody was watching.
    expect((await createdWith({ autoApprovePlan: true })).requirePlanApproval).toBe(false);
  });

  it("is still set when it is not", async () => {
    expect((await createdWith({})).requirePlanApproval).toBe(true);
  });

  it("is overridden by an explicit session spec, which states its own execution terms", async () => {
    const spec = createJulesSessionSpec({
      company: { id: "company-1", name: "aux", repository: "acme/co" },
      paperclip: { runId: "run-1", agentId: "agent-1" },
      role: JULES_OUTCOME_TEMPLATES.bootstrap.role,
      execution: { source: "sources/acme", startingBranch: "main", requirePlanApproval: true },
      capabilities: [], writeScope: ["firm/**"], linear: { mode: "NONE" },
      objective: "o", inputs: [], requiredOutputs: [], acceptanceCriteria: [], cannotCompleteIf: [],
      externalActions: "APPROVAL_REQUIRED",
    });
    expect((await createdWith({ autoApprovePlan: true, sessionSpec: spec })).requirePlanApproval).toBe(true);
  });
});
