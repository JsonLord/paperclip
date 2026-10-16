# Validation control plane review report

## Git and governing requirements

Source branch: `origin/codex/continue-implementation`, fetched HEAD `0eba2bb8dce7093b77ccb952f71fea91edee6da8`.
Feature branch: `codex/validation-control-plane-v1`. The implementation and its pre-coding note are committed together; the final commit SHA is reported in the chat and is available from `git log -1`.

The uploaded validation-company requirements govern this change. `doc/VALIDATION-CONTROL-PLANE.md` describes the implemented contracts and limitations; SPEC.md and SPEC-implementation.md point to it for the opt-in mode. No production-engineering workforce was added.

## Architecture and database

Added a company-scoped programme, explicit pause history, adaptive phase proposals, canonical Nodepad projections, evidence gates, deterministic warnings/priorities, CEO context, Founder Direction/Statement, decision inbox/journal/reviews, management cycles, reporter hooks, scoped Actions runtime and handoff contracts. Reused the native CEO identity, comments/wakeups, document revisions, heartbeat/session machinery, Jules lifecycle, work products, budgets and activity logs. The task resolver enforces Actions/Hermes/Jules selection; product/backend work is rejected and an idempotent founder engineering dependency is queued.

Migration `0062_validation_control_plane.sql` adds five tables and company mode, issue intent and profile pool columns. It inserts the shared pool before backfilling old profiles and enforcing its foreign key. Existing company, Firm, worker and session data is retained. Legacy mode remains the company default. Physical pool quota changes are intentional: all Paperclip starts share a conservative 90/24h cap until actual account grouping is configured, independently of concurrency.

The complete API list and secure configuration paths are in `doc/VALIDATION-CONTROL-PLANE.md`. No credentials are embedded in configuration examples or committed files.

## Errors and corrections

| Finding | Outcome |
| --- | --- |
| Repository checkout initially fetched only master; a normal fetch did not expose the requested starting branch | Explicitly fetched the remote branch and branched from its current SHA |
| Checked-in Jules adapter lockfile entry omits a declared workspace dependency | Frozen install still fails; used manifest resolution with lockfile writing disabled, consistent with PR CI while preserving the CI-owned lockfile |
| Earlier master-only companies-route test lacked a firmService mock | Reported during onboarding; this defect is absent on the requested source branch and its corresponding test passes here |
| Quota could multiply across profile/company records, with reservations scoped to one repository | Added physical pooling, global cap, cross-repository reservations and serialized admission |
| Retry sessions emitted both session_started and session_retry_started and could consume two starts | Count distinct native sessions |
| Fixed same-repository burst limit blocked disjoint scopes | Removed the arbitrary burst ceiling; pool concurrency and scope collision safety remain |
| Scope checks were company-local; segment wildcards could miss overlap | Check across companies and case-insensitive repository identity; conservatively compare wildcard roots |
| Bound scope leases could expire while a remote session still existed | Unreleased bound leases continue protecting writes |
| Founder Statement revision update initially omitted baseRevisionId | Use existing document revision checks; integration regression passes |
| Fresh development instance lacked the local agent JWT key | Initialized through Paperclip’s native helper, preserved existing keys on repeat, restarted and verified JWT readiness without printing its value |
| Initial idempotency comparison depended on JSON key order | Compare structured values, including after PostgreSQL JSONB round trips |
| New policy could be bypassed through generic document or root-goal APIs | Protect reserved Founder Statement key/constraints and founder-owned Vision updates through those APIs |
| Starting an already opted-in company initially conflicted with its own assignment policy | Create Direction unassigned within the transaction, then bind the programme and assign the CEO |
| Issue-level workflow overrides could redirect Actions dispatch | Use the founder-owned company workflow binding at dispatch and verify company repository/secret scope |

Dependency installation reports existing better-auth/better-call peer-version warnings (Drizzle/Zod). They did not prevent typecheck, tests, startup or build. Vite reports existing large generated chunks; the production build completes. There is no configured lint command; it is reported as unavailable, not passed.

## Validation evidence

- Full `pnpm test:run`: 140 test files; 824 passed, 1 skipped, 0 failed. The pre-existing skip is retained.
- New validation suites: 45 passed (26 policy/provider-boundary tests and 19 PostgreSQL integration tests).
- `pnpm -r typecheck`: passed across the workspace.
- `pnpm build`: passed, including the UI and CLI bundles.
- `pnpm db:generate`: no further schema changes after the saved migration.
- `pnpm check:tokens`: passed.
- Prettier checks on new TypeScript files: passed; `git diff --check`: passed.
- Fresh runtime: 63 migrations applied; health returned status=ok/bootstrapStatus=ready; companies returned a JSON array; UI HTML and client scripts were served locally.
- Live provider tests: not run. No PASS_LIVE claim is made.

## Fixture vertical slice

All steps below are PASS_LOCAL against real migrated PostgreSQL and injected provider fixtures:

| Steps | Result |
| --- | --- |
| 1–4: founder Vision, persistent CEO/programme, target hypothesis and evidence gap | Native rows and canonical scoped projection established |
| 5–6: Scout-equivalent collection task and result | Typed ethnography selects Hermes; sourced collection comment is persisted |
| 7–8: Customer Investigator-equivalent workflow and evidence candidate | Actions dispatch/reconciliation and artifact retrieval exercised; provenance-bearing Nodepad candidate submitted idempotently |
| 9–11: Nodepad movement, Reporter wakeup and next action | Read-only revision advances; Reporter API wakes the existing CEO; deterministic action factors are exposed |
| 12–14: justified fake door, Jules selection and returned result | Interview/context gate passes; broker admits disjoint frontend work; existing Jules lifecycle reconciles fixture completion as COMPLETED_UNVALIDATED |
| 15–17: intelligence-compatible state, CEO reflection and founder question | Summary/management cycle and decision record persisted; question appears in Founder Direction |
| 18–19: founder reply and continuation | Board answer/comment invokes the existing CEO wakeup path; current management state remains available |
| 20: no backend/product dispatch | Backend issue assignment rejected, founder dependency queued, no backend issue created |

The fixture completion is a candidate, never invented customer evidence or a live service pass.

## Deferred integrations and readiness

Deferred as requested: full 45-agent Agency workforce, full Founder Intelligence dashboard, remote Hermes binding, external simulation provider (`INTEGRATION_PENDING`), Explee, Juno and the full commercial lead-provider layer. Search and contact/outreach remain separately gated; no broad autonomous lead generation was implemented.

The local control-plane implementation and fixture workflow pass. Live operation remains READY_CONFIG/BLOCKED_EXTERNAL: the real Nodepad installation's API contract must be supplied/verified or its documented bridge implemented, then company Nodepad/GitHub/Jules secret bindings, reviewed workflow and Hermes runtime must be configured and opted into live validation. The HTTP Nodepad bridge contract is explicit; compatibility with a native Nodepad installation has not been demonstrated. Do not interpret fixture tests as completing that integration.

No secret values were printed or committed. No live provider jobs, production external actions, public deployment, auto-merge or production deployment were performed. The branch is left for review; it is not merged automatically.

Overall operational verdict: `VALIDATION_CONTROL_PLANE_NOT_READY` for live autonomous use until the concrete provider/configuration prerequisites above are verified. Local mechanics are `PASS_LOCAL`.
