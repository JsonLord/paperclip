# Achieved-work review: deterministic validation and bounded result control

**Date:** 2026-09-15
**Scope:** deterministic result validation, persisted validation/manager audit records, structured Hermes judgment, same-session correction, and bounded brokered retry foundations.

## Implemented runtime surface

- Added `founderos-validation` with an immutable `PASS | PASS_WITH_WARNINGS | FAIL | BLOCKED` result, contract hashing, validator versioning, and idempotent persistence per session/commit/contract/version.
- Added actual GitHub PR snapshot loading. It rejects a non-company repository before reading it, reads PR/base/head metadata, changed paths, check runs, and changed-file content at the PR head commit. It never interprets a Jules session URL as a PR URL.
- Deterministic checks cover required files/directories, declared output paths, JSON/YAML structure, repository/base/head identity, required CI, actual changed paths versus write scope, known and patterned credentials with redacted diagnostics, company Firm workspace/build results through an injected adapter, evidence existence/provenance, quantitative-claim provenance, cannot-complete gates, and approved external actions.
- Added a dedicated Founder Manager service with strict JSON schema enforcement for `ACCEPT`, `REVISE_SAME_SESSION`, `RETRY_NEW_SESSION`, `WAIT`, `ESCALATE`, and `FAIL_OUTCOME`; malformed/unknown output is rejected. A hard deterministic failure cannot be overridden by an `ACCEPT` verdict.
- Added an OpenAI-compatible Hermes provider configured only through `FOUNDER_MANAGER_BASE_URL`, `FOUNDER_MANAGER_API_KEY`, and `FOUNDER_MANAGER_MODEL` (default model alias `alias-fast`). Credential values are not persisted or logged.
- Added `julesOutcomeController`. It enforces `COMPLETED_UNVALIDATED -> VALIDATING`, persists validation, skips acceptance judgment for hard failures, uses `AWAITING_MANAGER_JUDGMENT` for judgeable results, and applies native Issue/Activity effects for accept, wait, escalation, and business-outcome failure.
- `REVISE_SAME_SESSION` calls an injected existing-session sender with defect-specific findings, declared write scope, preservation instructions, and increments `revisionCount`; it does not create a session or record a start. Default maximum: two.
- `RETRY_NEW_SESSION` calls an explicitly broker-required scheduler boundary and records retry scheduling in native Activity. Durable session attachment now accepts retry ancestry and records idempotent `session_retry_started`. Default maximum: one.
- `WAIT` persists reason/wake condition without a new Jules start. `ACCEPT` marks only the bound native Issue complete; it does not mark parent Goals achieved and explicitly records `autoMerge: false`.

## Schema and migration

Migration `0044_amused_pete_wisdom.sql` adds:

- `jules_validation_results`, including native IDs, validated commit, contract hash/version, findings, evidence, and hard-failure status;
- `jules_manager_decisions`, including strict verdict data, reason, criteria, revision instructions, human/wait data, and configured provider/model names;
- durable revision, retry ancestry/count/reason, and wait fields on `jules_sessions`.

These records make the result history reconstructible after restart without Hermes conversation memory.

## Tests executed

- Server TypeScript typecheck.
- 19 focused tests across deterministic validation, all six manager verdicts and invalid output, hard-failure override prevention, and bounded revision/retry policy.
- Repository-wide typecheck/test/build are reported separately at handoff; pre-existing baseline/environment failures are not attributed to this slice.

## Spec status

- `adaptations_spec.md` §9 deterministic validator: **PARTIAL**. Core checks, actual GitHub snapshot reader, security/write-scope enforcement, Firm adapter boundary, and durable results exist. GitHub changed-file pagination beyond 100 files and richer resource-manifest/company-ID schemas remain.
- §10 founder-manager: **PARTIAL**. `result_judge`, deterministic failure diagnosis, retry-decision interfaces, strict output, configured OpenAI-compatible provider, and hard-policy enforcement exist. The broader triage/bundle/session-worthiness/plan/next-action loop remains intentionally unimplemented.
- §11 same-session revision: **PARTIAL**. Controller behavior, targeted correction messages, persisted counts, same-session sender boundary, and retry ancestry are implemented. Production composition still must bind `sendRevision` to the selected profile's runtime secret and `JulesApiClient.sendMessage`, and bind the fresh-retry scheduler to the heartbeat/broker dispatcher.

## Known limitations

- This change does not pretend the full completion-to-validation production composition is complete: callback/reconciler hooks do not yet construct the validation contract and invoke `julesOutcomeController` automatically. That composition needs an explicit job/retry mechanism so transient GitHub, Firm, or manager outages cannot lose work.
- The Firm adapter is intentionally a strict company-workspace interface; the current Firm architecture cannot yet provide the required branch-at-commit build safely.
- YAML checking is conservative and validates common manifest mappings/lists; full YAML schema validation should be introduced with the resource-manifest schemas.
- Native Activity and Issue status are used; the current native Inbox has no standalone write service suitable for deterministic escalation, so escalation is visible via Issue/Activity pending that native integration.

## Recommended next slice

Implement the restart-safe **validation orchestration job**: consume completion-candidate hooks, build contracts from live Goal/Issue/support-pack context, load the GitHub snapshot, run the company-repository Firm adapter, invoke the controller, bind same-session messages to runtime `secret_ref`, and route fresh retries through the existing capacity broker. Include crash/restart integration tests and then complete the Firm company-workspace refactor before business-content packs.
