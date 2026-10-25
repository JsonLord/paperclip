import { describe, expect, it } from "vitest";
import { createJulesSessionSpec, JULES_OUTCOME_TEMPLATES, renderJulesPrompt } from "../prompts.js";

const prompt = renderJulesPrompt(createJulesSessionSpec({
  company: { id: "c1", name: "aux", repository: "acme/co" },
  paperclip: { runId: "r1", agentId: "a1", outcomeId: "i1" },
  role: JULES_OUTCOME_TEMPLATES.bootstrap.role,
  execution: { source: "s", startingBranch: "main", requirePlanApproval: false },
  capabilities: [], writeScope: ["firm/**"], linear: { mode: "NONE" },
  objective: "o", inputs: [], requiredOutputs: [], acceptanceCriteria: [], cannotCompleteIf: [],
  externalActions: "APPROVAL_REQUIRED",
}));

describe("the evidence-discipline contract", () => {
  it("defines a source as something openable and forbids minting IDs for categories", () => {
    // PR #3 gave five behaviours/topics source IDs; that is the thing to prevent.
    expect(prompt).toMatch(/A source is something another person can open/);
    expect(prompt).toMatch(/category, a topic, or a description of a behaviour is not a source/);
  });

  it("asks for directional correctness, not precise figures", () => {
    expect(prompt).toMatch(/directionally right matters more than being precise/);
    expect(prompt).toMatch(/order of magnitude and the pricing model/);
    expect(prompt).toMatch(/Never write a figure you recalled as though you read it/);
  });

  it("binds the verified status to an actual fetch, in prose and in Firm records", () => {
    expect(prompt).toMatch(/`verified` means you fetched the source this run/);
    expect(prompt).toMatch(/Firm records too/);
  });

  it("makes community signal first-class and names the absence as a finding", () => {
    expect(prompt).toMatch(/practitioners say in their own words is first-class/);
    expect(prompt).toMatch(/say the social signal is missing/);
  });

  it("requires engaging with counter-evidence", () => {
    expect(prompt).toMatch(/Include what cuts against the thesis/);
    expect(prompt).toMatch(/has not been researched, it has been assembled/);
  });
});
