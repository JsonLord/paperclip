# Agency Supervisor v1 live handoff

The controller runs outside HF against existing native authenticated APIs. The
native application fixes on this review branch are **not deployed**. Do not
redeploy, reimport agents, edit PR #14, or use the old divergent workforce branch.

## Prerequisites and read-only gate

Secure environment settings: `PAPERCLIP_ADMIN_EMAIL`,
`PAPERCLIP_ADMIN_PASSWORD`, and `HF_TOKEN`. Never put values in commands or files.
The existing native API client uses an in-memory cookie jar, refuses redirects,
and never retries mutations. Provider credentials remain inside Paperclip.

```sh
python scripts/test-agency-supervisor.py
pnpm -r typecheck
pnpm test:run --maxWorkers=2 --minWorkers=1
pnpm build
pnpm check:tokens
python scripts/agency-supervisor-preflight.py --catalog /tmp/agency-api-source
```

The catalog checkout must contain commit
`cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09`. Preflight checks the exact HF revision,
stable RUNNING state, PR #14 head, roster 48/45/0, 37 new paused agents, source,
no live native runs and ten read-only canonical routing cases. An HTTP 401 or
Space revision/state drift stops live work; it never triggers a deployment.
Immediately before dispatch also inspect native Jules readiness/capacity and
ensure the company has no unresolved remote work. Activation repeats the native
run/source and unknown-remote gates and the native broker owns final admission.

## Exact bounded workflow configuration

Use pinned `catalog/workflows.json` workflow **validate-problem**:

1. `hypothesis-formulator`, skill `hypothesis-framing`.
2. `evidence-auditor`, skill `evidence-audit`, after step 1 PASS.

Use one unique workflow UUID, one unassigned backlog control issue, and two new
unassigned backlog step issues in AUX. Persist each create intent locally before
POST; if a response is unknown, find the unique marker through read-only native
issue listing rather than repeating the POST. Do not reuse the PR #14 issue.

Each step needs a board-authored native issue document key `agency-task` containing
JSON with these fields (substitute the workflow UUID and canonical role):

```json
{
  "agencyId": "hypothesis-formulator",
  "requiredSkills": ["hypothesis-framing"],
  "repository": "JsonLord/aux-company",
  "branch": "main",
  "writeScopes": ["live-qualification/agency-supervisor/WORKFLOW_UUID/hypothesis-formulator.md"],
  "requiredOutputs": ["live-qualification/agency-supervisor/WORKFLOW_UUID/hypothesis-formulator.md"],
  "qualification": "synthetic",
  "provenanceRequired": true,
  "requirePR": true,
  "externalActions": false,
  "productionEngineering": false,
  "leaseSeconds": 1200
}
```

Step 1 objective: frame one explicitly synthetic AUX repository assumption and a
testable hypothesis using only existing repository context. Record limitations;
do not invent customers, interviews, market observations or measurement results.
Step 2 substitutes `evidence-auditor`, `evidence-audit` and its own filename. Audit
only the validated upstream body supplied by the controller; identify unsupported
claims and external evidence still needed. The upstream PR is not merged.
Both issues prohibit all other file changes, outreach, spend, publication,
deployment, customer contact, production engineering and agent delegation.

```sh
python scripts/agency-supervisor.py init --control-issue CONTROL_ID --max-active 1 --apply
python scripts/agency-supervisor.py workflow-create --control-issue CONTROL_ID --catalog /tmp/agency-api-source --workflow validate-problem --issues STEP1_ID,STEP2_ID --key WORKFLOW_UUID --apply
python scripts/agency-supervisor.py workflow-advance --control-issue CONTROL_ID --catalog /tmp/agency-api-source --key WORKFLOW_UUID --apply
python scripts/agency-supervisor.py reconcile --control-issue CONTROL_ID --key ACTIVATION_ID --apply
```

Poll **reconcile**, using the returned stable activation ID. Restarting the local
controller is safe. Never invoke a second activation/wake to recover an uncertain
response. After step 1 PASS, explicitly advance once for step 2. After step 2
PASS, advance to AWAITING_FOUNDER_REVIEW. A FAIL/REVIEW_REQUIRED stops the chain;
no replacement specialist or session is authorized by this qualification.
`--catalog` is essential when advancing: reused roles have legacy adapter configs
and require their pinned canonical persona through the per-issue override.

```sh
python scripts/agency-supervisor.py founder-packet --control-issue CONTROL_ID --key WORKFLOW_UUID
python scripts/agency-supervisor.py founder-review --control-issue CONTROL_ID --key WORKFLOW_UUID --apply
python scripts/agency-supervisor.py founder-reconcile --control-issue CONTROL_ID --key WORKFLOW_UUID --apply
python scripts/agency-supervisor.py status --control-issue CONTROL_ID
```

Founder review is one explicit Hermes wake with only the validated packet and a
no-tools/no-delegation instruction. Require an actual structured model decision
SUPPORTED / UNSUPPORTED / NEEDS_EXTERNAL_EVIDENCE with reason; no prompt echo.
This is not technical sandbox enforcement of a compromised agent. Native runtime
permissions, budgets and approvals remain authoritative. Synthetic artifact PASS
does not authorize canonical evidence acceptance or merging.

## Recovery and final verification

`stop --key ACTIVATION_ID --apply` pauses the agent but retains its remote
reservation until native reconciliation proves terminal. Lease expiry behaves
the same way. No automatic redispatch, TTL-based replacement, or provider poller
is introduced. PREPARING without a confirmed native run requires operator review;
an unknown write that cannot be read back stays reserved. Do not edit the journal
to manufacture success. Journal initialization cannot overwrite existing state.

Final checks: at most two new specialist runs/sessions total, one per role;
all 37 newly imported specialists paused and the reused auditor paused; 48 agents,
45 unique canonical IDs; no live native runs; each product bound to current run,
issue, agent, remote session, repository, branch, immutable head and required file;
all products still `needs_board_review`, accepted false; PR #14 unchanged; HF
revision unchanged; no external action. Fetch the next periodic backup and verify
the workflow journal, runs, products and paused roster are present before claiming
fresh post-qualification backup PASS. Record exact external IDs in the report.
