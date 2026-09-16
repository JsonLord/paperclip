import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import type { FirmValidationAdapter } from "./founderos-validation/firm.js";

export interface FirmBuildResult { workspace: string; phase: "before" | "after"; success: boolean; exitCode: number | null; version: string | null; diagnostics: string; startedAt: string; finishedAt: string }
function redact(value: string, secrets: string[]) { let result = value; for (const secret of secrets) if (secret.length >= 8) result = result.split(secret).join("[REDACTED]"); return result.replace(/(?:authorization\s*:\s*bearer|api[_-]?key|token|secret)\s*[=:]\s*\S+/gi, "credential=[REDACTED]"); }
function run(command: string, args: string[], cwd: string, secrets: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => { const child = spawn(command, args, { cwd, env: { PATH: process.env.PATH, HOME: process.env.HOME }, shell: false }); let output = ""; child.stdout.on("data", (x) => output += x); child.stderr.on("data", (x) => output += x); child.on("error", reject); child.on("close", (code) => resolve({ code, output: redact(output, secrets).slice(0, 32_000) })); });
}
export function firmCliRuntime(options: { command?: string; buildArgs?: string[]; versionArgs?: string[] } = {}) {
  const command = options.command ?? process.env.FIRM_CLI_PATH ?? "firm";
  async function version(cwd: string, secrets: string[]) { const result = await run(command, options.versionArgs ?? ["--version"], cwd, secrets); return result.code === 0 ? result.output.trim() : null; }
  return {
    detect: async () => { if (command.includes(path.sep)) await access(command); const found = await version(process.cwd(), []); if (!found) throw new Error("Firm CLI is not available"); return found; },
    build: async (input: { companyRepositoryPath: string; phase: "before" | "after"; knownSecrets?: string[] }): Promise<FirmBuildResult> => {
      const repositoryRoot = path.resolve(input.companyRepositoryPath); const workspace = path.resolve(repositoryRoot, "firm");
      if (!workspace.startsWith(repositoryRoot + path.sep)) throw new Error("Firm workspace escapes company repository");
      await access(workspace); const startedAt = new Date().toISOString(); let toolVersion: string | null = null;
      try { toolVersion = await version(workspace, input.knownSecrets ?? []); } catch { toolVersion = null; }
      const result = await run(command, options.buildArgs ?? ["build"], workspace, input.knownSecrets ?? []);
      return { workspace, phase: input.phase, success: result.code === 0, exitCode: result.code, version: toolVersion, diagnostics: result.output, startedAt, finishedAt: new Date().toISOString() };
    },
    asValidationAdapter: (repository: string, repositoryPath: string): FirmValidationAdapter => ({ validate: async (input) => { if (input.repository !== repository) throw new Error("Firm build repository does not match company binding"); const result = await run(command, options.buildArgs ?? ["build"], path.resolve(repositoryPath, "firm"), []); return { workspaceRepository: repository, buildPassed: result.code === 0, foundEntityIds: [], diagnostics: [result.output] }; } }),
  };
}
