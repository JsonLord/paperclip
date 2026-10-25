import { describe, expect, it } from "vitest";
import { founderOsDeploymentGoalTemplates, founderOsWorkforce, validateDeploymentCatalog } from "../services/founderos-deployment-catalog.js";
import { listServerAdapters } from "../adapters/registry.js";

describe("FounderOS deployment catalog", () => {
  it("registers every canonical Goal with native acceptance criteria", () => {
    const result = validateDeploymentCatalog();
    expect(result.errors).toEqual([]);
    expect(result.goalIds).toEqual(expect.arrayContaining(["validate-problem", "analyze-market", "validate-demand", "validate-commercial-commitment", "observe-product-usage", "validate-retention", "analyze-unit-economics", "compile-business-model-canvas", "compile-bpw-financial-plan", "compile-business-plan", "compile-pitch", "prepare-kickstarter-case"]));
    expect(founderOsDeploymentGoalTemplates.every((goal) => goal.acceptanceCriteria.length > 0)).toBe(true);
  });

  it("has a native Jules employee capable of owning every registered Goal", () => {
    for (const goal of founderOsDeploymentGoalTemplates) {
      expect(founderOsWorkforce.some((worker) => [worker.key, ...worker.roleAliases].some((role) => role.includes(goal.recommendedOwnerRole) || goal.recommendedOwnerRole.includes(role))), goal.id).toBe(true);
    }
  });

  it("ships the Hermes manager and Jules execution adapters", () => {
    expect(listServerAdapters().map((adapter) => adapter.type)).toEqual(["hermes_local", "jules"]);
  });
});
