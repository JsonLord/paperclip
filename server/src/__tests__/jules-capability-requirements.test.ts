import { describe, expect, it } from "vitest";
import { resolveJulesExecutionRequirements } from "../services/jules-capacity-broker.js";

describe("what a Jules dispatch is allowed to require", () => {
  it("drops firm, which the worker can never hold", () => {
    // Nearly every FounderOS goal template declares requiredCapabilities: ["firm"].
    // That is true of the goal and false of the worker: the CLI cannot exist where
    // Jules runs, so leaving it in denied every catalog-goal dispatch forever.
    const requirements = resolveJulesExecutionRequirements(
      { outcomeTemplate: "bootstrap" },
      { goalSupport: { capabilities: ["firm", "github"] } },
    );
    expect(requirements.requiredCapabilities).toEqual(["github"]);
  });

  it("drops it from an explicit session spec too", () => {
    const requirements = resolveJulesExecutionRequirements(
      { sessionSpec: { capabilities: ["firm"] } },
      {},
    );
    expect(requirements.requiredCapabilities).toEqual([]);
  });

  it("treats a template's own capabilities as advisory, not as an admission gate", () => {
    // market_research's library default declares context7, but a worker with no MCP
    // servers produced a sourced landscape — the template capability must not deny the
    // dispatch. Only what the operator set on the goal is a hard requirement.
    const requirements = resolveJulesExecutionRequirements(
      { outcomeTemplate: "market_research" },
      { goalSupport: { capabilities: ["firm", "linear"] } },
    );
    expect(requirements.requiredCapabilities).toEqual(["linear"]);
    expect(requirements.requiredCapabilities).not.toContain("context7");
  });

  it("leaves the firm write scope alone — the files are still the contract", () => {
    const requirements = resolveJulesExecutionRequirements({ outcomeTemplate: "bootstrap" }, {});
    expect(requirements.writeScopes).toContain("firm/**");
  });
});
