import { describe, expect, it } from "vitest";
import { createJulesSessionSpec, JULES_OUTCOME_TEMPLATES, renderJulesPrompt } from "./prompts.js";

describe("FounderOS Jules prompt templates", () => {
  it("provides every validation-stage template", () => {
    expect(Object.keys(JULES_OUTCOME_TEMPLATES)).toEqual([
      "bootstrap", "venture_thesis", "market_research", "icp", "prospects", "interviews", "offer",
      "content", "channel_test", "fake_door", "commitment", "concierge", "retention", "economics", "red_team",
    ]);
  });

  it("renders the complete startup, evidence, governance, and completion contract", () => {
    const template = JULES_OUTCOME_TEMPLATES.fake_door;
    const prompt = renderJulesPrompt(createJulesSessionSpec({
      company: { id: "company-1", name: "Acme", repository: "acme/company" },
      paperclip: { runId: "run-1", agentId: "agent-1", outcomeId: "outcome-1" },
      role: template.role,
      execution: { source: "sources/acme", startingBranch: "main", requirePlanApproval: true },
      capabilities: [...template.capabilities], writeScope: [...template.writeScope],
      linear: { mode: "CREATE_PROJECT" }, objective: template.objective, inputs: ["company/OVERVIEW.md"],
      requiredOutputs: [...template.requiredOutputs], acceptanceCriteria: [...template.acceptanceCriteria],
      cannotCompleteIf: [...template.cannotCompleteIf], externalActions: "APPROVAL_REQUIRED",
      support: { skills: ["bpw-pitch"], packs: [{ id: "pitch.bpw-10-step", version: "1.0.0", purpose: "Pitch layout", readPaths: [".founderos/support/pitch/RESOURCE.md"], qualityGates: ["No invented traction"] }], missingRequiredPacks: [] },
    }));
    expect(prompt).toContain("firm build");
    expect(prompt).toContain("Generated analysis is not market evidence");
    expect(prompt).toContain("Do not merge your own PR");
    expect(prompt).toContain("completion candidate");
    expect(prompt).toContain("Remaining new-session budget: **0**");
    expect(prompt).toContain(".founderos/support/pitch/RESOURCE.md");
    expect(prompt).toContain("No invented traction");
  });
});
