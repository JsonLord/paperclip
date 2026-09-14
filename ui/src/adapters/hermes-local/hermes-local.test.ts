import { describe, expect, it } from "vitest";
import { buildHermesConfig } from "./build-config";
import { parseHermesStdoutLine } from "./parse-stdout";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";

const values: CreateConfigValues = {
  adapterType: "hermes_local",
  cwd: "/workspace/company",
  promptTemplate: "Manage {{companyName}}",
  model: "openai/gpt-4.1",
  thinkingEffort: "",
  chrome: false,
  dangerouslySkipPermissions: false,
  search: false,
  dangerouslyBypassSandbox: false,
  command: "hermes",
  args: "",
  extraArgs: "--verbose",
  envVars: "",
  envBindings: {},
  url: "",
  bootstrapPrompt: "",
  maxTurnsPerRun: 50,
  heartbeatEnabled: true,
  intervalSec: 300,
};

describe("Hermes local UI adapter", () => {
  it("builds the bundled founder-manager configuration", () => {
    expect(buildHermesConfig(values)).toMatchObject({
      model: "openai/gpt-4.1",
      cwd: "/workspace/company",
      hermesCommand: "hermes",
      persistSession: true,
      extraArgs: ["--verbose"],
    });
  });

  it("maps Hermes manager output into transcript entries", () => {
    expect(parseHermesStdoutLine("[hermes] Starting", "2026-09-11T00:00:00Z")[0]).toMatchObject({ kind: "system" });
    expect(parseHermesStdoutLine("A managerial decision", "2026-09-11T00:00:00Z")[0]).toMatchObject({ kind: "assistant" });
  });
});
