import { describe, expect, it } from "vitest";
import { currentExecutionIdentity, renderExecutionIdentity, validateArtifactProvenance } from "./execution-identity.js";
const oldRun = "225b7f24-cab0-4d23-b22a-220f40940168";
const current = "78b24170-ba16-4c33-b640-5ea8f3032d0b";
const identity = currentExecutionIdentity({ runId: current, agentId: "agent", companyId: "company", issueId: "issue", history: `Previous failed receipt: ${oldRun}` });
describe("PR #14 immutable execution provenance regression", () => {
  it("classifies the historical receipt without deleting it or overriding the actual run", () => {
    expect(identity.currentExecution.runId).toBe(current);
    expect(identity.historicalRunIds).toEqual([oldRun]);
    const prompt = renderExecutionIdentity(identity);
    expect(prompt).toContain(`CURRENT_PAPERCLIP_RUN_ID = ${current}`);
    expect(prompt).toContain(`HISTORICAL_RUN_IDS = ${oldRun}`);
    expect(prompt).toContain("HISTORICAL CONTEXT");
  });
  it("rejects the exact wrong ID submitted in PR14, including the legacy Run ID spelling", () => {
    for (const body of [`paperclip_run_id: ${oldRun}`, `Run ID: ${oldRun}`]) {
      expect(validateArtifactProvenance(body, identity.currentExecution, true).findings).toContain("RUN_CORRELATION_MISMATCH");
    }
  });
  it("accepts current provenance, never a completion or approval claim", () => {
    expect(validateArtifactProvenance(`paperclip_run_id: ${current}\npaperclip_agent_id: agent\npaperclip_issue_id: issue`, identity.currentExecution, true).verdict).toBe("PASS");
  });
  it("fails closed on missing, conflicting or foreign issue/agent/session declarations", () => {
    expect(validateArtifactProvenance("normal business prose", identity.currentExecution, true).verdict).toBe("REVIEW_REQUIRED");
    expect(validateArtifactProvenance(`paperclip_run_id: ${current}\npaperclip_run_id: ${oldRun}`, identity.currentExecution, true).verdict).toBe("FAIL");
    expect(validateArtifactProvenance(`paperclip_run_id: ${current}\npaperclip_issue_id: foreign`, identity.currentExecution, false).verdict).toBe("FAIL");
  });
});
