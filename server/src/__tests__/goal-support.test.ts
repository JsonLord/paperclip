import { describe, expect, it } from "vitest";
import { resolveGoalSupportFromRows } from "../services/goal-support.js";

const date = new Date("2026-01-01T00:00:00Z");
const goal = {
  id: "goal-1", companyId: "company-1", title: "Prepare pitch", description: null, level: "task", status: "active", parentId: null, ownerAgentId: null,
  requiredSkills: ["pitch-storytelling"], supportPacks: [{ id: "pitch.bpw-10-step", version: "1.0.0", required: true }, { id: "design.gogh", required: false }],
  requiredCapabilities: ["stitch"], inputPaths: ["business-case/**"], outputPaths: ["pitch/PITCH_DECK.*"], acceptanceCriteria: ["Claims map to evidence"], cannotCompleteIf: ["Problem evidence is missing"], createdAt: date, updatedAt: date,
};

describe("goal support resolver", () => {
  it("resolves an exact immutable pack snapshot into repo-local read paths", () => {
    const result = resolveGoalSupportFromRows(goal, [{ id: "snapshot-1", companyId: "company-1", packId: "pitch.bpw-10-step", version: "1.0.0", tier: "goal_specific", installedPath: ".founderos/support/pitch/bpw-10-step", sourceRepo: "JsonLord/FounderOS-DEMO", sourceCommit: "abcdef1", manifest: { purpose: "Create an evidence-grounded pitch", files: [{ path: "RESOURCE.md", required: true }, { path: "source/10-step-template.pdf", required: true }], qualityGates: ["No invented traction"] }, installedAt: date, createdAt: date }]);
    expect(result.packs[0].readPaths).toEqual([".founderos/support/pitch/bpw-10-step/RESOURCE.md", ".founderos/support/pitch/bpw-10-step/source/10-step-template.pdf"]);
    expect(result.packs[0]).toMatchObject({ version: "1.0.0", sourceCommit: "abcdef1" });
    expect(result.missingRequiredPacks).toEqual([]);
  });

  it("blocks only missing required packs", () => {
    expect(resolveGoalSupportFromRows(goal, []).missingRequiredPacks).toEqual(["pitch.bpw-10-step@1.0.0"]);
  });
});
