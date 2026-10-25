import { describe, expect, it } from "vitest";
import { JULES_OUTCOME_TEMPLATES } from "../prompts.js";

describe("Jules and the Firm CLI", () => {
  it("never requires the firm capability", () => {
    // Jules runs on Google's infrastructure; the CLI cannot be installed there, so a
    // template demanding it made every admission fail with CAPABILITY_MISSING.
    for (const [id, template] of Object.entries(JULES_OUTCOME_TEMPLATES)) {
      expect((template as { capabilities: string[] }).capabilities, id).not.toContain("firm");
    }
  });

  it("asks only for what an agent without the CLI can assert", () => {
    const text = JSON.stringify(JULES_OUTCOME_TEMPLATES);
    expect(text).not.toContain("firm build passes");
    expect(text).not.toContain("Firm validation fails");
  });

  it("still routes firm state through the repository files", () => {
    const text = JSON.stringify(JULES_OUTCOME_TEMPLATES);
    // The layout stays the contract — Jules edits firm/*.firm as text.
    expect(text).toContain("firm/company.firm");
    expect(text).toContain("firm/strategy.firm");
  });
});
