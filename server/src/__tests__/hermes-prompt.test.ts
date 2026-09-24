import { describe, expect, it } from "vitest";
import { HERMES_PROMPT_TEMPLATE, curlExamplesIn, withHermesPromptTemplate } from "../services/hermes-prompt.js";

describe("hermes_local prompt template", () => {
  it("authenticates in every curl example it shows the agent", () => {
    const examples = curlExamplesIn(HERMES_PROMPT_TEMPLATE);
    // The adapter's own default omits the header everywhere, which is the bug this fixes.
    expect(examples.length).toBeGreaterThan(4);
    for (const example of examples) expect(example).toContain('-H "Authorization: Bearer $PAPERCLIP_API_KEY"');
  });

  it("sends the run id on every call that modifies an issue", () => {
    for (const example of curlExamplesIn(HERMES_PROMPT_TEMPLATE)) {
      const mutating = example.includes("-X POST") || example.includes("-X PATCH");
      expect(mutating === example.includes('-H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID"')).toBe(true);
    }
  });

  it("never embeds a token value, only the variable", () => {
    expect(HERMES_PROMPT_TEMPLATE).not.toMatch(/Bearer\s+(?!\$PAPERCLIP_API_KEY)[A-Za-z0-9._-]{8,}/);
    expect(HERMES_PROMPT_TEMPLATE).not.toContain("pcp_");
  });

  it("applies only to hermes_local", () => {
    expect(withHermesPromptTemplate({}, "hermes_local").applied).toBe(true);
    expect(withHermesPromptTemplate({}, "jules").applied).toBe(false);
    expect(withHermesPromptTemplate({}, "jules").config).toEqual({});
  });

  it("never overrides a template an operator configured", () => {
    const pinned = { promptTemplate: "my own template" };
    const result = withHermesPromptTemplate(pinned, "hermes_local");
    expect(result.applied).toBe(false);
    expect(result.config).toBe(pinned);
  });

  it("treats a blank configured template as absent", () => {
    const result = withHermesPromptTemplate({ promptTemplate: "   " }, "hermes_local");
    expect(result.applied).toBe(true);
    expect(result.config.promptTemplate).toBe(HERMES_PROMPT_TEMPLATE);
  });

  it("keeps the adapter's placeholders so rendering still works", () => {
    for (const token of ["{{agentName}}", "{{agentId}}", "{{companyId}}", "{{paperclipApiUrl}}", "{{taskId}}", "{{#taskId}}", "{{/taskId}}", "{{#noTask}}", "{{/noTask}}"]) {
      expect(HERMES_PROMPT_TEMPLATE).toContain(token);
    }
  });
});
