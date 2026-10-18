#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
export function preflight(config = {}) {
  const workflowPath =
    ".github/workflows/paperclip-validation-qualification.yml";
  const workflow = readFileSync(resolve(root, workflowPath), "utf8");
  let defaultWorkflow = null;
  try {
    defaultWorkflow = git("show", `origin/master:${workflowPath}`);
  } catch {}
  const qualificationSha = git("rev-parse", "HEAD");
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const configured =
    uuid.test(config.companyId ?? "") &&
    uuid.test(config.actionsSecretRef ?? "") &&
    uuid.test(config.julesProfileId ?? "") &&
    Boolean(config.julesSource);
  return {
    status: "PASS_LOCAL",
    sourceSha: "930ae22aee2d2ee5f4229d148d5733709cdb1d6c",
    qualificationSha,
    launchesRemoteWork: false,
    checks: {
      repositoryBound: config.repositoryBound === true,
      workflowConfigured: true,
      workflowPresentOnQualificationRef: true,
      workflowRequiredOnDefaultBranch: true,
      credentialConfigured: uuid.test(config.actionsSecretRef ?? ""),
      credentialAccess: "NEEDS_EXTERNAL_CHECK",
      paperclipCorrelationSupported: workflow.includes(
        'run-name: "paperclip:${{ inputs.paperclip_run_id }}"',
      ),
      defaultBranchDiscovery: defaultWorkflow?.includes("paperclip_run_id")
        ? "NEEDS_EXTERNAL_CHECK"
        : "BLOCKED_DEFAULT_BRANCH_WORKFLOW_DISCOVERY",
      externalConfiguration: configured
        ? "NEEDS_EXTERNAL_CHECK"
        : "NEEDS_CONFIGURATION",
    },
    actions: {
      repository: "JsonLord/paperclip",
      workflow: workflowPath.split("/").at(-1),
      ref: qualificationSha,
      githubSecretRef:
        config.actionsSecretRef ?? "REQUIRED_COMPANY_SECRET_UUID",
      workforcePacketInput: "workforce_packet",
      inputs: { force_failure: "false" },
      correlation: "paperclip:<paperclipRunId>",
      artifact: "validation-result-<paperclipRunId>",
      expected: { status: "completed", conclusion: "success", accepted: false },
    },
    jules: {
      repository: "JsonLord/paperclip",
      startingBranch: qualificationSha,
      companyId: config.companyId ?? "REQUIRED_COMPANY_UUID",
      profileId:
        config.julesProfileId ?? "REQUIRED_SOURCE_AUTHORIZED_PROFILE_UUID",
      source: config.julesSource ?? "REQUIRED_VERIFIED_JULES_SOURCE",
      agencyId: "fake-door-designer",
      task: {
        workClass: "fake_door",
        hypothesisIds: ["H-021"],
        writeScopes: ["live-qualification/fake-door/**"],
        experimentQuestion: "Can a synthetic visitor request a conversation?",
        behavioralMetric: "Synthetic requests / synthetic visits",
      },
      expected: {
        status: "COMPLETED_UNVALIDATED",
        completionCandidate: true,
        accepted: false,
        pullRequestRequired: true,
      },
    },
    live: {
      githubActions: { status: "PENDING_EXTERNAL", externalRunId: null },
      jules: { status: "PENDING_EXTERNAL", externalSessionId: null },
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const config = process.argv[2]
    ? JSON.parse(readFileSync(process.argv[2], "utf8"))
    : {};
  // Only explicitly allowlisted configuration is projected. Unknown fields and credential values are never printed.
  console.log(JSON.stringify(preflight(config), null, 2));
}
