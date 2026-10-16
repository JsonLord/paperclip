# Idea-validation control plane

The supplied validation-company requirements govern this feature instead of the production-engineering assumptions in `SPEC.md`. Existing companies stay in `legacy` mode. Opt in by starting a programme with a native CEO and a company-scoped root Vision. Do not import a new workforce to use this feature.

Paperclip owns management, native goals/issues, agent execution, budgets, approvals and audit. Nodepad is the only authority for hypotheses, qualification, evidence and interpretation. Firm data is never silently converted to Nodepad data. GitHub holds reproducible artifacts. A founder statement expresses strategy, never market evidence. No Argus runtime or source was imported.

## Development and verification

Use the existing checkout; cloud tasks are isolated and do not need another Git worktree. In this cloud machine:

```sh
source /workspace/.paperclip-tools/env.sh
cd /workspace/paperclip
pnpm dev
```

The environment initializes local agent JWT material through Paperclip’s `ensureAgentJwtSecret` helper and keeps it in the ignored instance `.env`; it never embeds that material in scripts. Leave `DATABASE_URL` unset for embedded PostgreSQL. Startup applies additive migrations. Use local health/UI requests for internal validation. No public deployment is required. Node 24 and pnpm 9.15.4 match CI. The source branch's stale Jules lockfile prevents frozen installation; the environment uses `pnpm install --no-frozen-lockfile --lockfile=false` to preserve it. Repairing the upstream lockfile remains separate from this feature.

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
pnpm check:tokens
pnpm exec vitest run --project @paperclipai/server server/src/__tests__/validation-policy.test.ts server/src/__tests__/validation-integration.test.ts
pnpm exec prettier --check packages/shared/src/validation.ts packages/db/src/schema/validation.ts server/src/services/validation/*.ts server/src/routes/validation.ts server/src/__tests__/validation*.test.ts server/src/__tests__/fixtures/validation.ts
git diff --check
```

There is no repository lint script or linter configuration. Typechecking, the existing token policy check and formatting are separate checks; none is presented as an executed lint suite.

## Programme and management

The default phases are EXPLORE, CONCENTRATE and REFINE at 28 active days each, then FOUNDER_HANDOFF. Active days measure elapsed time minus explicit pause intervals; ordinary interview waiting is not a pause. Calendar days, paused days, active week/day and current-phase active days remain separate.

Timing changes of at most two active days are CEO-owned by default, including the cumulative adjustment within a phase. Larger changes, early exit, pause and strategic decisions require founder action. Proposals retain reasons, work, success/stop conditions and references; changing a target never changes evidence gates. Founder phase transition approval is recorded as an audit event and does not qualify any hypothesis.

CEO identity is the native agent ID, not a provider thread. Founder Direction is a single persistent issue per programme; it cannot be completed/cancelled/hidden. Founder Statement uses existing document revisions and optimistic revision checks. Its reserved document key is protected even through generic document APIs. Founder constraints require a founder actor. Existing comment wakeups wake the CEO when the founder replies.

Management cycles record expected/actual progress, changes, prior-decision review, the key uncertainty, blockers, founder actions, stopped work and at most three must-win outcomes/questions. Reporter submissions wake the CEO. Decision requests require alternatives, a recommendation, evidence references, consequences and a deadline. Strategic/high-impact irreversible questions enter the founder queue; ordinary strategic requests wait for briefing, urgent ones wake the CEO. Decision journals retain concise rationale and later keep/revise/reverse reviews, not private reasoning transcripts.

CEO context packets include bounded, traceable current Vision, founder replies/statement, programme diagnostics, canonical Nodepad projection, Paperclip work/approvals/costs/capacity and decisions. They are rebuilt before CEO dispatch; historical chat is not copied wholesale. The dashboard response gains an optional programme summary without changing legacy dashboard output.

## Evidence and operational policies

Shared contracts live in `packages/shared/src/validation.ts`. Policy modules are separated under `server/src/services/validation/`.

Canonical interviews count only when human-led, relevant, analyzed/accepted by the upstream pipeline, source-linked and content-hashed. Duplicate content cannot multiply counts. Defaults are 3 interviews for problem support, 5 for ICP and 8 for commercial consideration; companies can make these stricter. Paperclip does not write canonical qualifications.

Diagnostics expose hypothesis counts, convergence, stale/blocked primaries, evidence/customer/experiment/proposition debt and transparent inputs. Priorities use configurable factor weights and explicit cost/time/effort penalties, not a validation score. Portfolio history retains Nodepad revisions. Primary WIP defaults to three high-priority hypotheses. Ageing uses business-day warning/review thresholds. Blocked hypotheses reject additional generic desk research unless the task addresses the blocker or explicitly names a different unresolved dependency. Saturation uses configurable secondary count, direct-evidence ratio and marginal value inputs.

Fake doors need a named hypothesis, three qualifying interviews, canonical evidence references for customer/problem/language/proposition/counter-hypothesis, an experiment question and a behavioral metric. The bridge maps those canonical evidence categories to `target_customer:`, `problem:`, `customer_language:`, `proposition:` and `counter_hypothesis:` reference prefixes. These are read-only source projections, not agent assertions.

Analysis/synthesis/evidence checks/reports/experiment evaluation select GitHub Actions. Ethnography/community collection select Hermes. Fake doors/frontend experiments/visuals/decks/demos/campaign assets select Jules. Work intent belongs to the issue; it is rechecked at assignment and dispatch. Generic untyped agent work in an idea-validation company is rejected. Product/backend engineering returns `FOUNDER_ENGINEERING_DEPENDENCY`; no backend worker or build task is spawned. Lead search/outreach remains blocked pending the later separate approval/provider layer. Runtime selection never grants external-action approval.

A final handoff is a `PROJECT_CONTINUATION_RECOMMENDATION` with the current Nodepad revision, evidence, contradictions, ICP/JTBD, customer language, offer, pricing, channels, fake-door/campaign findings, risks and an MVP boundary for the founder. Decisions are BUILD_RECOMMENDED, MORE_VALIDATION_REQUIRED, PIVOT_RECOMMENDED or STOP_RECOMMENDED. No implementation starts automatically.

## Nodepad boundary and configuration

Bind through the board-only company API with a base URL, workspace and company-scoped encrypted API-key secret UUID. `NODEPAD_BASE_URL` and `NODEPAD_WORKSPACE_ID` may supply defaults only during explicit binding; they never silently bind every company. A unique canonical base-URL/workspace binding and response scope checks prevent shared configuration from crossing companies. Credential values are resolved by company and are never returned.

`NodepadProvider` is injected. The provided HTTP provider implements an explicit bridge contract, **not a claim about an undocumented native Nodepad endpoint**:

- GET `<base>/workspaces/<workspace>/validation-snapshot` returns `nodepadSnapshotSchema`, including company/workspace identity and source revision.
- POST `<base>/workspaces/<workspace>/evidence-candidates` accepts actor/company/workspace, provenance and a candidate; it must honor the company-prefixed idempotency key and return a scoped candidate ID.
- No qualification, band or evidence-acceptance mutation is exposed. Only Nodepad decides those states. Candidate submission alone cannot satisfy gates; only a later canonical snapshot can acknowledge acceptance.

Live deployment must supply this bridge or implement `NodepadProvider` against the actual installation's documented API. Missing binding yields READY_CONFIG. Injected fixtures yield PASS_LOCAL; actual successful bridge requests yield PASS_LIVE. No live Nodepad request was used to validate this implementation.

## GitHub Actions runtime

Register `github-actions` as a server adapter. A founder configures the company's runtime binding with repository, workflow filename, ref, typed scalar inputs and `githubSecretRef`. The repository must match the company's active artifact binding, and the token secret must resolve in that company. Issue overrides cannot substitute a different workflow binding during heartbeat execution. Hermes in an opted-in validation programme does not receive the deployment-wide GitHub-token fallback; company-scoped configured secrets remain available.

A dispatched workflow must accept `paperclip_run_id` and use exact correlation:

```yaml
name: Validation analysis
run-name: "paperclip:${{ inputs.paperclip_run_id }}"
on:
  workflow_dispatch:
    inputs:
      paperclip_run_id:
        type: string
        required: true
permissions:
  contents: read
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Run the repository's reviewed analysis pipeline, then upload its result artifact.
```

Persistent runs link company, native heartbeat/issue, repository/workflow/ref and external run ID. A dispatch receipt is not task/evidence acceptance. Polling maps conclusions and registers candidate artifacts. Artifact download verifies company/run membership. Read-only reconciliation retries after errors and restarts. An ambiguous dispatch response is not blindly retried: the record stays `dispatch_unknown` until its exact run-name is observed. If no run can be found among the most recent 100 workflow runs, operator investigation is required; automatic redispatch would risk duplicate external actions. Provider billing is unreported rather than invented.

## Jules pools

Migration 0062 creates one conservative shared physical pool, backfills existing profiles into it and preserves company secret references/source mappings. The pool has 90 starts per rolling 24 hours, concurrency 3 and no engineering reserve. Pool `window_sec` and `concurrency` are distinct persisted configuration properties. Multiple credential records cannot multiply the global 90/24h Paperclip cap; unknown physical-account grouping deliberately shares the conservative pool. Administrators can configure physical pool properties in the database without treating daily starts as concurrency.

Admission is serialized and counts reservations across profiles, companies and repositories. Retry ledger events for the same session count once. Repository scope collisions are checked across companies, case-insensitive repository identities, and conservative wildcard roots. Disjoint paths can proceed up to pool concurrency; the arbitrary repository burst limit is removed. An unreleased bound session lease continues to protect scope even if its old timestamp expires.

## APIs

All paths below are relative to `/api/companies/:companyId/validation`. Native company/board authorization applies. Mutations use the existing audit log; agent-management operations require the programme CEO. Creation of durable records requires an `Idempotency-Key` header.

| Method/path | Purpose |
| --- | --- |
| POST `/programme` | Idempotent opt-in with `ceoAgentId`, `visionGoalId`, constraints and optional policy |
| GET base path | Programme, clocks, gates, history, diagnostics, next actions, decisions, founder queue |
| POST `/pause`, `/resume` | Explicit founder pause/resume |
| POST `/adaptations`; POST `/adaptations/:id/apply` | Propose and apply authority-checked programme changes |
| GET `/ceo-context` | Bounded current CEO context |
| PUT `/founder-statement` | Revisioned strategy contract |
| POST `/cycles`, `/reporter` | Persist management/reflection or reporting and wake CEO |
| POST `/decisions`; PATCH `/decisions/:id/review` | Decision journal and subsequent review |
| POST `/decision-requests`; POST `/decision-requests/:id/resolve` | CEO/founder queue and answers on Founder Direction |
| PUT `/nodepad`; POST `/nodepad/sync`; POST `/nodepad/candidates` | Bind, project canonical state, submit candidates |
| PUT `/runtime-bindings/actions` | Founder-owned company workflow binding |
| POST `/actions/:id/reconcile`; GET `/actions/:id/artifacts/:artifactId` | Scoped reconciliation and artifact retrieval |
| POST `/handoff` | Current-revision continuation recommendation; no automatic build |

## Database and compatibility

`0062_validation_control_plane.sql` is additive: five new tables (`validation_programmes`, `validation_records`, `nodepad_bindings`, `github_action_runs`, `jules_pools`), `companies.mode`, `issues.validation_task` and `jules_profiles.pool_id`. The pool is inserted before foreign-key enforcement and old profiles are backfilled before NOT NULL. Existing company, worker, Firm and session rows are retained. Repeated start reuses the programme/CEO/Direction issue. The default company mode is `legacy`; opt-in is deliberate.

## Deferred and live readiness

Local tests use fixture transports and real PostgreSQL. They do not spend provider quota or test a live integration. Configure company Nodepad binding/bridge, a reviewed Actions workflow and company credentials, a reachable Hermes executable and company Jules source/profile before live operation. The full Agency 45-person workforce, full Founder Intelligence dashboard, remote Hermes binding, external simulation provider (`INTEGRATION_PENDING`), Explee, Juno and the commercial lead-provider layer remain deferred. Lead discovery is never customer evidence, and contact/outreach needs a separate approval from search.

No public dashboard, production deployment, automatic merge or product engineering is part of this workflow.
