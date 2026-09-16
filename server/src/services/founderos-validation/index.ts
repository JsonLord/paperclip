import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { julesValidationResults } from "@paperclipai/db";
import type { DeterministicValidationInput, DeterministicValidationResult, ValidationFinding } from "./types.js";
export * from "./types.js";

export const FOUNDEROS_VALIDATOR_VERSION = "founderos-validator/v1";
const secretPatterns = [/(?:authorization\s*:\s*bearer|api[_-]?key|token|secret)\s*[=:]\s*["']?[A-Za-z0-9_./+\-=]{12,}/i, /pc_run_[A-Za-z0-9_-]{16,}/, /AIza[0-9A-Za-z_-]{30,}/];
const norm = (p: string) => p.replace(/^\.\//, "").replace(/\\/g, "/");
function globRegex(glob: string) { return new RegExp(`^${norm(glob).split("**").map((x) => x.split("*").map(escapeRegex).join("[^/]*")).join(".*")}$`); }
function escapeRegex(value: string) { return value.replace(/[|\\{}()[\]^$+?.-]/g, "\\$&"); }
export function pathAllowed(path: string, scopes: string[]) { const p = norm(path); return scopes.some((scope) => globRegex(scope).test(p)); }
function validYaml(value: string) {
  if (/\t/.test(value) || /^\s*[:}\]]/m.test(value)) return false;
  const lines = value.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  return lines.length > 0 && lines.every((line) => /^\s*(?:-\s+[^:]+(?::.*)?|[^:#][^:]*:\s*.*)$/.test(line));
}
function contractHash(input: DeterministicValidationInput) {
  const contract = { repository: input.repository, baseBranch: input.baseBranch, requiredOutputs: input.requiredOutputs, outputPaths: input.outputPaths, requiredChecks: input.requiredChecks, writeScope: input.writeScope, requiredEvidenceIds: input.requiredEvidenceIds, cannotCompleteIf: input.cannotCompleteIf, externalActions: input.externalActions?.map(({ type, executed, approvalId, approved }) => ({ type, executed, approvalId, approved })) };
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}
export function validateFounderOsResult(input: DeterministicValidationInput, now = new Date()): DeterministicValidationResult {
  const passed: ValidationFinding[] = [], failed: ValidationFinding[] = [], warnings: ValidationFinding[] = [];
  const add = (ok: boolean, code: string, message: string, hard = false, blocked = false, path?: string) => (ok ? passed : failed).push({ code, message, path, hard: ok ? undefined : hard, severity: ok ? "warning" : blocked ? "blocked" : "error" });
  const files = new Map(input.files.map((f) => [norm(f.path), f]));
  for (const required of input.requiredOutputs) {
    const p = norm(required); const directory = p.endsWith("/") || p.endsWith("/**"); const prefix = p.replace(/\/?\*\*$/, "").replace(/\/$/, "");
    add(directory ? [...files.keys()].some((x) => x === prefix || x.startsWith(`${prefix}/`)) : files.has(p), "required_output", `Required output ${p} ${directory ? "directory" : "file"} ${directory ? "contains content" : "exists"}`, true, false, p);
  }
  for (const file of input.files) {
    if ((input.outputPaths?.length ?? 0) > 0) add(pathAllowed(file.path, input.outputPaths!), "output_path", `Output path ${file.path} is declared`, false, false, file.path);
    if (/\.json$/i.test(file.path) && file.content != null) { try { JSON.parse(file.content); add(true, "json_parse", `${file.path} parses as JSON`, false, false, file.path); } catch { add(false, "json_parse", `${file.path} is invalid JSON`, true, false, file.path); } }
    if (/\.ya?ml$/i.test(file.path) && file.content != null) add(validYaml(file.content), "yaml_parse", `${file.path} parses as YAML`, true, false, file.path);
  }
  const pr = input.pullRequest;
  if (input.requirePullRequest) add(Boolean(pr?.exists), "pr_exists", "Required pull request exists", true);
  if (pr?.exists) {
    add(pr.repository === input.repository, "repository", "Pull request targets the bound company repository", true);
    add(pr.baseBranch === input.baseBranch, "base_branch", "Pull request targets the expected base branch", true);
    add(pr.headCommit === input.commitSha, "head_commit", "Validated commit is the pull request head", true);
    for (const changed of pr.changedFiles) add(pathAllowed(changed, input.writeScope), "write_scope", `Changed path ${changed} is within declared write scope`, true, false, changed);
    for (const check of input.requiredChecks ?? []) { const found = pr.checks.find((c) => c.name === check); if (!found || found.status === "pending") failed.push({ code: "ci_pending", message: `Required check ${check} is pending`, severity: "blocked" }); else add(found.status === "success", "ci_check", `Required check ${check} passed`, false); }
  }
  for (const file of input.files) {
    const value = file.content ?? ""; const known = (input.knownSecretValues ?? []).some((secret) => secret.length >= 8 && value.includes(secret));
    const pattern = secretPatterns.some((regex) => regex.test(value));
    if (known || pattern) failed.push({ code: "secret_leak", message: `Potential credential found in ${file.path}; value redacted`, path: file.path, severity: "error", hard: true });
  }
  if (input.firm?.required) { add(input.firm.workspaceRepository === input.repository, "firm_workspace", "Firm workspace belongs to the company repository", true); add((input.firm.buildBeforePassed ?? true) === true, "firm_build_before", "Firm build before changes passed", true); add((input.firm.buildAfterPassed ?? input.firm.buildPassed) === true, "firm_build_after", "Firm build after changes passed", true); }
  const evidence = new Set(input.reportedEvidenceIds ?? []);
  for (const id of input.requiredEvidenceIds ?? []) add(evidence.has(id), "evidence_exists", `Required evidence ${id} exists`, false);
  for (const claim of input.quantitativeClaims ?? []) add(!claim.generated && claim.evidenceIds.length > 0 && claim.evidenceIds.every((id) => evidence.has(id)), "claim_provenance", `Quantitative claim has non-generated evidence provenance`, false);
  for (const action of input.externalActions ?? []) if (action.executed) add(Boolean(action.approvalId && action.approved), "external_action_approval", `Executed ${action.type} action has native approval`, true);
  for (const gate of input.cannotCompleteIf ?? []) { if (typeof gate === "string") warnings.push({ code: "semantic_gate", message: gate, severity: "warning" }); else if (gate.active) (gate.semantic ? warnings : failed).push({ code: gate.code, message: `Cannot-complete condition ${gate.code} is active`, severity: gate.semantic ? "warning" : "error", hard: !gate.semantic }); }
  const hardFailure = failed.some((f) => f.hard); const blocked = failed.some((f) => f.severity === "blocked");
  return { status: blocked && !hardFailure ? "BLOCKED" : failed.length ? "FAIL" : warnings.length ? "PASS_WITH_WARNINGS" : "PASS", hardFailure, passed, failed, warnings, evidence: [...evidence].map((id) => ({ type: "evidence", id })), validatedCommit: input.commitSha, validatedAt: now.toISOString(), validatorVersion: FOUNDEROS_VALIDATOR_VERSION, contractHash: contractHash(input) };
}

export function founderOsValidationService(db: Db) {
  async function persist(input: DeterministicValidationInput, result: DeterministicValidationResult, sessionId: string) {
    const values = { companyId: input.companyId, goalId: input.goalId, projectId: input.projectId, issueId: input.issueId, agentId: input.agentId, paperclipRunId: input.paperclipRunId, sessionId, validatedCommit: result.validatedCommit, contractHash: result.contractHash, validatorVersion: result.validatorVersion, status: result.status, hardFailure: result.hardFailure, passed: result.passed as unknown as Record<string, unknown>[], failed: result.failed as unknown as Record<string, unknown>[], warnings: result.warnings as unknown as Record<string, unknown>[], evidence: result.evidence as unknown as Record<string, unknown>[], resultJson: result as unknown as Record<string, unknown> };
    const [created] = await db.insert(julesValidationResults).values(values).onConflictDoNothing().returning();
    return created ?? db.select().from(julesValidationResults).where(and(eq(julesValidationResults.sessionId, sessionId), eq(julesValidationResults.validatedCommit, result.validatedCommit), eq(julesValidationResults.contractHash, result.contractHash), eq(julesValidationResults.validatorVersion, result.validatorVersion))).limit(1).then((rows) => rows[0]);
  }
  return { validate: validateFounderOsResult, persist };
}
export { loadGitHubValidationSnapshot } from "./github-checks.js";
export { validateFirmWorkspace, type FirmValidationAdapter } from "./firm.js";
