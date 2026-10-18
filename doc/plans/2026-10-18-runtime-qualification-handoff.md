# Runtime qualification v1 — external handoff

Only two live capacity-consuming checks remain: one successful GitHub Actions run and one static fake-door Jules session. Local failure, retry, quota, ambiguity and cancellation paths are already qualified; do not spend another live start reproducing them.

## Exact code and default-branch preparation

- Repository: `JsonLord/paperclip`.
- Runtime code SHA and qualification ref: **`5edad177af3fb246314d76d8cb7db702736b377a`**.
- Runtime branch: `codex/runtime-qualification-v1` (later documentation commits do not change that pinned executable code).
- Verified source ancestor: `930ae22aee2d2ee5f4229d148d5733709cdb1d6c`.
- Default branch: **`master`**. Observed at `8f9f8ea950e6d5f448893d66090a6a516e0302ae`; the qualification workflow is absent there.
- **`BLOCKED_DEFAULT_BRANCH_WORKFLOW_DISCOVERY`** until the workflow exists on `master`.
- Clean add-file workflow patch: **`7ff4608f2bfbd0f8f6e46cec7c0eca0cea815778`**, published on `codex/runtime-qualification-workflow-master`.
- Runtime-lineage workflow commit: `28a8f81ed0b21fc2c5bad4dfb9ed9a6df6597969`. Do not cherry-pick this modify-file version onto a master tree lacking the file; use the add-file patch above.

With authority to change the default branch, fetch the auxiliary branch, cherry-pick `7ff4608` onto a review branch based on current master, and use the repository's normal merge/review process. Codex did **not** merge/push `master`. The add-file patch was actually cherry-picked onto the observed master in a detached throwaway worktree and verified to change only `.github/workflows/paperclip-validation-qualification.yml`. It has only `workflow_dispatch`, read-only checkout, synthetic file creation and artifact upload; adding it schedules no work.

## Inputs supplied by the deployment

Use a dedicated synthetic qualification company, never a real customer's canonical workspace. Supply its company UUID, company-scoped GitHub secret reference UUID, enabled Jules profile UUID and verified Jules source name. These deployment identifiers/credentials do not exist in Codex and are deliberately not invented.

The company must have an opted-in Validation Programme, the imported Agency roster, an authorized `JsonLord/paperclip` repository binding, a source/profile mapping for that repository and the current additive migrations. Its qualification fixture must explicitly contain active `H-021`, gaps `dataset_analysis` and `fake_door`, and the synthetic fake-door readiness used by the deterministic golden test. The later frontend step uses CONCENTRATE. All fixture advancement must be labeled **TEST FIXTURE: external canonical state advanced independently**. Do not write synthetic interview/qualification data to a real Nodepad workspace or convert a blocked evidence submission to a hypothesis.

Read-only preparation:

```sh
node scripts/runtime-qualification-preflight.mjs qualification-config.json
```

Configuration file (references only, never credential values):

```json
{
  "companyId": "<company UUID>",
  "actionsSecretRef": "<company-scoped secret UUID>",
  "julesProfileId": "<enabled profile UUID>",
  "julesSource": "<verified sources/... name>",
  "repositoryBound": true
}
```

The script outputs the exact checked-out SHA, workflow configuration, correlation/artifact expectations and bounded fake-door task. It makes **no** provider calls. `repositoryBound` in this file is a deployment declaration; verify it against the authenticated native endpoint:

`GET /api/companies/<companyId>/validation/runtime-preflight`

That endpoint checks real native repository/configuration/source mappings and resolves credentials through the company boundary without printing their values. Workflow/ref discovery remains `NEEDS_EXTERNAL_CHECK`; use GitHub's read-only workflow discovery once the default-branch patch lands. Missing configuration is a blocker, not permission to substitute a runtime.

## One real GitHub Actions run

Configure through the founder-only native endpoint:

`PUT /api/companies/<companyId>/validation/runtime-bindings/actions`

```json
{
  "repository": "JsonLord/paperclip",
  "workflow": "paperclip-validation-qualification.yml",
  "ref": "5edad177af3fb246314d76d8cb7db702736b377a",
  "githubSecretRef": "<company-scoped secret UUID>",
  "workforcePacketInput": "workforce_packet",
  "inputs": { "force_failure": "false" }
}
```

The secret needs Actions dispatch/read and artifact-read access to this repository. Do not put its value in a workflow input, prompt or report. The workflow path is `.github/workflows/paperclip-validation-qualification.yml`.

Activate one analysis task through `POST /api/companies/<companyId>/workforce/activate`:

```json
{
  "eventKey": "runtime-qualification-v1:actions:one",
  "eventType": "research_gap",
  "gap": "dataset_analysis",
  "stage": "analysis",
  "agencyId": "customer-investigator",
  "hypothesisId": "H-021",
  "sourceGapRef": "dataset_analysis",
  "datasetRefs": ["synthetic-fixture:runtime-qualification/interviews"],
  "reason": "Qualify runtime transport only; synthetic output is not evidence",
  "validationTask": { "workClass": "analysis", "hypothesisIds": ["H-021"], "writeScopes": [] },
  "economics": { "informationGain": 0, "timeToSignalHours": 1, "cashCostCents": 0, "founderMinutes": 0, "julesStarts": 0, "externalInteractionBurden": "None" }
}
```

Use the returned activation/member/task and native heartbeat history to obtain `<paperclipRunId>` and the native Actions record. **Do not also invoke `gh workflow run`**, which would create an extra untracked run. Retry only this same event key/native run; an ambiguous dispatch must be reconciled, not recreated. Native reconciliation: `POST /api/companies/<companyId>/validation/actions/<actionsRecordId>/reconcile`.

Expected exact remote title: **`paperclip:<paperclipRunId>`**. Expected artifact: **`validation-result-<paperclipRunId>`**, containing `result.json` with the identical UUID, `synthetic: true`, `accepted: false`, `canonicalEvidence: false`. Expected terminal status: `completed`, conclusion `success`, `completionCandidate: true`, `accepted: false`. Record the real GitHub run ID and URL, reconciled native record and artifact ID. Retrieve through the existing company-scoped artifact endpoint. Complete the synthetic specialist activation with its registered artifact and `no_material_result`; do not claim accepted evidence.

## One real Jules fake-door session

Use the same dedicated company after its **independent synthetic fixture** reaches the tested readiness gate. Configure the existing source/broker and founder-only runtime binding:

`PUT /api/companies/<companyId>/validation/runtime-bindings/jules`

```json
{
  "repository": "JsonLord/paperclip",
  "startingBranch": "5edad177af3fb246314d76d8cb7db702736b377a"
}
```

The company's enabled `companyJulesSources.startingBranch` must also equal that SHA, since the broker's source binding controls the admitted ref. The enabled profile/source mapping must expose this repository; the broker resolves its company-accessible credential. Do not create an independent quota/profile reserve.

Use **Fake-Door Designer**, stable Agency ID `fake-door-designer`; resolve its company-local native UUID from the roster rather than inventing one. Activate exactly once:

```json
{
  "eventKey": "runtime-qualification-v1:jules:one",
  "eventType": "research_gap",
  "gap": "fake_door",
  "stage": "frontend",
  "agencyId": "fake-door-designer",
  "hypothesisId": "H-021",
  "sourceGapRef": "fake_door",
  "datasetRefs": [],
  "reason": "Create only live-qualification/fake-door/index.html and style.css: a static synthetic fake door with a local-only button response. No backend, database, auth, API, analytics, real form submission, deployment, outreach or external dependencies. Open one PR; this is runtime qualification, not demand evidence.",
  "validationTask": {
    "workClass": "fake_door",
    "hypothesisIds": ["H-021"],
    "writeScopes": ["live-qualification/fake-door/**"],
    "experimentQuestion": "Can a synthetic visitor request a conversation through the static prototype?",
    "behavioralMetric": "Synthetic button responses / synthetic visits"
  },
  "economics": { "informationGain": 0, "timeToSignalHours": 1, "cashCostCents": 0, "founderMinutes": 0, "julesStarts": 1, "externalInteractionBurden": "None; synthetic only" }
}
```

If plan approval is required, approve only this bounded static prototype through existing governance; never remove a human approval gate silently. A provider plan interaction consumes no extra session start. No production-backend work is eligible. Do not widen the scope if admission fails.

Record the provider-issued Jules session ID, native heartbeat/session/profile/source IDs, admitted repository/ref/write scope and lease, plus the actual PR URL. Expected lifecycle is **`COMPLETED_UNVALIDATED`**, `completionCandidate: true`, `accepted: false`; PR review stays pending and the lease is released after terminal reconciliation. Completion without a PR is **FAILED**, not evidence. Temporary/unknown remote state or an interrupted create retains its lease and must be reconciled; never invoke a second create to recover it. A future explicit policy-approved attempt needs a new native run and admission.

## Evidence and stop rules

`PASS_LIVE` requires the actual corresponding external run/session ID and successful reconciliation. Neither synthetic artifact nor PR validates a hypothesis/experiment. Nodepad remains separately blocked/unqualified. On failed/transient/ambiguous access, report the exact external blocker and stop spending starts. Return the two real provider IDs and URLs, native records and artifact/lease observations; no broader validation-control-plane live-ready verdict is authorized.
