import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildHermesConfig(values: CreateConfigValues): Record<string, unknown> {
  return {
    model: values.model || "anthropic/claude-sonnet-4",
    timeoutSec: 300,
    persistSession: true,
    ...(values.cwd ? { cwd: values.cwd } : {}),
    ...(values.command ? { hermesCommand: values.command } : {}),
    ...(values.extraArgs ? { extraArgs: values.extraArgs.split(/\s+/).filter(Boolean) } : {}),
    ...(values.promptTemplate ? { promptTemplate: values.promptTemplate } : {}),
  };
}
