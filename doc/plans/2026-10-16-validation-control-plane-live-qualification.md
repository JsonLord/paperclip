# Validation control-plane qualification — corrected runtime matrix

Updated 2026-10-18 from verified source `930ae22aee2d2ee5f4229d148d5733709cdb1d6c` on isolated `codex/runtime-qualification-v1`. Runtime code: `5edad177af3fb246314d76d8cb7db702736b377a`.

Earlier revisions of this report called simulated dispatch, mock output and hypothesis creation `PASS_LIVE`. Those claims had no recorded real run/session IDs and are not reused as qualification evidence. History remains in Git. This report distinguishes deterministic code, native integration and actual external execution.

| Capability | Status | Evidence / remaining gate |
| --- | --- | --- |
| Source lineage and prior Nodepad remote code gate | PASS | Verified ancestor `930ae22`; frozen contract files unchanged |
| Typed Nodepad candidate contract | PASS_LOCAL | Existing discriminated union, six operations and strict per-type authorization tests |
| Evidence/hypothesis separation | PASS_LOCAL | Existing HTTP evidence tests still prove no fallback to `/hypotheses` |
| Nodepad live reads | PENDING_EXTERNAL | Prior unsupported claims are not a recorded verified canonical reread |
| Nodepad canonical evidence writes | BLOCKED_EXTERNAL | Golden slice deliberately receives `BLOCKED_EXTERNAL_NODEPAD_EVIDENCE_WRITE`; no accepted candidate, hypothesis or canonical movement is fabricated |
| Actions provider/adapter | PASS_LOCAL | Exact correlation, pagination/ambiguity, outcome distinction, safe workflow |
| Actions dispatch/restart/reconciliation | PASS_INTEGRATION | Real PostgreSQL, controlled remote provider, one dispatch across restart/ambiguity |
| Actions artifacts and isolation | PASS_INTEGRATION | Company-scoped credential resolution/retrieval; native work-product idempotency; no leaked credential values |
| Actions real remote run | PENDING_EXTERNAL | No provider-issued run ID exists from this phase |
| Default-branch workflow patch | PASS | Add-file commit `7ff4608f2bfbd0f8f6e46cec7c0eca0cea815778` cleanly tested on observed master; master unchanged |
| Default-branch discovery now | BLOCKED_DEFAULT_BRANCH_WORKFLOW_DISCOVERY | Workflow absent from observed `master` at `8f9f8ea`; external authorized application of the patch is required |
| Jules physical quota/concurrency | PASS_LOCAL | Shared 90-start pool, no engineering reserve, native concurrent reservation tests |
| Jules leases, creation and lifecycle | PASS_INTEGRATION | Durable pre-POST intent, restart/concurrent no-duplicate creation, uncertain lease retention, terminal/PR reconciliation |
| Jules real remote session | PENDING_EXTERNAL | No provider-issued live session ID exists from this phase |
| Engineering dependency boundary | PASS_LOCAL | Typed and natural-language backend/database/auth/API cases rejected before any Actions row, lease, capacity event or session allocation |
| Positive frontend control | PASS_INTEGRATION | Ready synthetic fake door uses only `live-qualification/fake-door/**` and remains Jules-eligible |
| Runtime golden slice and CEO reflection | PASS_INTEGRATION | Agency → Actions artifact → typed evidence block → independently labeled fixture advance → Jules PR candidate → CEO reflection |
| Runtime preflight | PASS_LOCAL | CLI does not launch work; authenticated API checks real company bindings and credential access without printing values |

`PASS_LOCAL` means deterministic unit/local testing. `PASS_INTEGRATION` means native cross-component Paperclip integration with explicitly injected external providers. `PASS_LIVE` requires actual provider interaction and a provider-issued identifier (and canonical reread when relevant). Mocks never satisfy it.

Local verification: 915 tests passed, 1 skipped, 144 files; workspace typecheck/build, token policy and whitespace checks pass. Additive migration regeneration reports no schema changes. The later host-metric observation is also checked by the 50-test native integration run. No environmental test failure is hidden.

The full requested test invocation has no configured server `test` script in this lineage. Its executable equivalent, `pnpm exec vitest run server/src/__tests__/validation-integration.test.ts`, was run, along with the full root suite and dedicated runtime test files.

One safe workflow commit on runtime lineage (`28a8f81`) plus one clean master add-file patch (`7ff4608`) are prepared. No divergent Jules qualification history was merged. No merge or push to `master`, live Actions dispatch, Jules session, deploy or outreach was performed.

See [external handoff](2026-10-18-runtime-qualification-handoff.md) for exact pinned configurations and stop rules. Nodepad live qualification remains separate. **The whole validation control plane is not declared live-ready.**
