import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const workflow = readFileSync(
  new URL(
    "../../../.github/workflows/paperclip-validation-qualification.yml",
    import.meta.url,
  ),
  "utf8",
);
describe("safe workflow and non-dispatching preflight", () => {
  it("pins read-only actions, preserves correlation and always uploads synthetic unaccepted results", () => {
    expect(workflow).toContain(
      'run-name: "paperclip:${{ inputs.paperclip_run_id }}"',
    );
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain('"accepted": False');
    expect(workflow).toContain('"synthetic": True');
    expect(workflow).toContain("if: always()");
    expect(workflow).not.toContain("secrets.");
    expect(workflow).not.toMatch(/\brun:.*\$\{\{/);
    expect(workflow).toContain(
      'if [ "$FORCE_FAILURE" = "true" ]; then exit 1; fi',
    );
  });
  it("executes the workflow artifact generator safely and preserves controlled failure metadata", () => {
    const start = workflow.indexOf("          import json,");
    const end = workflow.indexOf("          PY", start);
    const code = workflow
      .slice(start, end)
      .split("\n")
      .map((l) => (l.startsWith("          ") ? l.slice(10) : l))
      .join("\n");
    const result = execFileSync(
      "python3",
      [
        "-c",
        `import tempfile,os\nos.chdir(tempfile.mkdtemp())\n${code}\nprint(pathlib.Path("output/result.json").read_text())`,
      ],
      {
        env: {
          ...process.env,
          PAPERCLIP_RUN_ID: "10000000-0000-4000-8000-000000000001",
          FORCE_FAILURE: "true",
        },
        encoding: "utf8",
      },
    );
    expect(JSON.parse(result)).toMatchObject({
      synthetic: true,
      accepted: false,
      controlledFailure: true,
      paperclip_run_id: "10000000-0000-4000-8000-000000000001",
    });
  });
  it("produces an explicit preflight without dispatch or invented external IDs", () => {
    const result = JSON.parse(
      execFileSync("node", ["scripts/runtime-qualification-preflight.mjs"], {
        cwd: root,
        encoding: "utf8",
      }),
    );
    expect(result.launchesRemoteWork).toBe(false);
    expect(result.checks.credentialConfigured).toBe(false);
    expect(result.checks.credentialAccess).toBe("NEEDS_EXTERNAL_CHECK");
    expect(result.live.githubActions.externalRunId).toBeNull();
    expect(result.jules.expected.accepted).toBe(false);
  });
});
