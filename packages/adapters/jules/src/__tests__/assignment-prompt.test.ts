import { describe, expect, it } from "vitest";
import { createJulesSessionSpec, JULES_OUTCOME_TEMPLATES, renderJulesPrompt } from "../prompts.js";

const base = (extra: Partial<Parameters<typeof createJulesSessionSpec>[0]> = {}) => {
  const template = JULES_OUTCOME_TEMPLATES.bootstrap;
  return createJulesSessionSpec({
    company: { id: "company-1", name: "aux", repository: "acme/company" },
    paperclip: { runId: "run-1", agentId: "agent-1", outcomeId: "issue-1" },
    role: template.role,
    execution: { source: "sources/acme", startingBranch: "main", requirePlanApproval: true },
    capabilities: [...template.capabilities],
    writeScope: [...template.writeScope],
    linear: { mode: "NONE" },
    objective: template.objective,
    inputs: [],
    requiredOutputs: [...template.requiredOutputs],
    acceptanceCriteria: [...template.acceptanceCriteria],
    cannotCompleteIf: [...template.cannotCompleteIf],
    externalActions: "APPROVAL_REQUIRED",
    ...extra,
  });
};

describe("the assigned outcome in a Jules prompt", () => {
  it("names the issue the session was dispatched for", () => {
    const prompt = renderJulesPrompt(base({
      assignment: {
        title: "Map the competitor landscape",
        description: "Cover the ten platforms an evaluator would shortlist.",
        priority: "high",
        goal: "Round 1 — Define aux",
      },
    }));
    expect(prompt).toContain("## Assigned outcome");
    expect(prompt).toContain("Map the competitor landscape");
    expect(prompt).toContain("Cover the ten platforms an evaluator would shortlist.");
    expect(prompt).toContain("- Priority: high");
    expect(prompt).toContain("- Goal: Round 1 — Define aux");
  });

  it("says what to fall back on when the issue carries no description", () => {
    const prompt = renderJulesPrompt(base({ assignment: { title: "Restate the idea" } }));
    expect(prompt).toContain("- Priority: unspecified");
    expect(prompt).toContain("No description was supplied");
  });

  it("omits the section entirely when no assignment travelled with the run", () => {
    expect(renderJulesPrompt(base())).not.toContain("## Assigned outcome");
  });
});

describe("the completion protocol", () => {
  it("does not order a CLI the startup rules say will never exist", () => {
    const prompt = renderJulesPrompt(base());
    // Startup step 4 and completion step 2 contradicted each other: the worker was told
    // the CLI is absent, then told completion was forbidden unless it ran the CLI.
    expect(prompt).toContain("Do NOT run `firm`");
    expect(prompt).not.toContain("Run `firm build` after changes");
    expect(prompt).toContain("firm/schemas/");
  });

  it("never falls back to naming firm as the required capability", () => {
    expect(renderJulesPrompt(base({ capabilities: [] })))
      .toContain("Required capabilities: none beyond the repository itself.");
  });
});
