# FounderOS / Paperclip Adaptation Completeness Audit

Date: 2026-09-14

Repository audited: `JsonLord/paperclip`

Default branch: `master` (this repository does not currently use a branch named `main` as its default branch)

Current audited head: `a36a3d3b9179b7dbe5bda01019e29b496f6ef4e6`

Merged implementation branch: `codex/update-spec.md-for-hermes-agent-implementation`

Merged implementation head: `0beec5cc98ee852059dc2a4da6eda324d7372985`

Related merged PR: #6, `Add native jules adapter, Hermes manager integration, goal-support resource packs, and DB migrations`

Related architecture spec: `/spec.md`

Related FounderOS content repository: `JsonLord/FounderOS-DEMO`

Important cross-repo status: `FounderOS-DEMO` PR #4 (`validation-skills-from-agent-questions`) is still open and unmerged at the time of this audit. That PR contains much of the validation, second-brain, sales, prospecting, content, search, BPW, governance, and optional-capability content that the Paperclip runtime is expected to consume.

---

## 1. Executive verdict

The merged Codex branch is a useful **control-plane foundation**, but it is **not yet a complete implementation of the FounderOS adaptation project**.

The strongest completed pieces are:

- a first native `jules` adapter package;
- Jules profile/source/session/capacity/callback database schemas;
- a basic profile selection function;
- versioned Jules prompt/outcome templates;
- goal-level support-pack metadata and resolution;
- a first Jules callback surface;
- Hermes installation and `hermes_local` / `jules` adapter exposure;
- explicit architecture documentation in `spec.md`.

The largest remaining gaps are not cosmetic. Several are execution-critical:

1. The current Jules adapter does not yet implement the Jules REST schema completely/correctly.
2. A non-terminal remote Jules session can currently cause the Paperclip heartbeat run to be marked `succeeded` after the short polling window.
3. The capacity broker exists only as a pure selector and is not wired into dispatch, quota accounting, profile secrets, write leases, or the adapter.
4. There is no persistent Jules reconciliation worker/startup recovery loop.
5. Hermes is available as an adapter, but the dedicated FounderOS manager/judge service described in `spec.md` is not implemented.
6. The callback API is not yet protected by the intended run-scoped/company-scoped remote capability token model.
7. Deterministic acceptance validation and the Hermes judge/revise/retry loop are not implemented end-to-end.
8. GitHub import does not yet automatically bind the company repo to Jules, validate/bootstrap `.founderos`, initialize the validation graph, or dispatch the bootstrap outcome.
9. The current Firm implementation conflicts with the intended architecture: it snapshots the upstream `42futures/firm` repository instead of treating each imported company's own `firm/*.firm` files as the canonical business graph.
10. Linear, Stitch, Tinybird, Context7, Render Static, and Hugging Face deployment are mostly represented as prompt/capability policy, not as complete operational integrations.
11. The actual reusable FounderOS resource packs (pitch layout, BPW business plan, finance, customer discovery, sales second brain, fake-door assets, red-team rubric, etc.) do not yet exist in the Paperclip/company resource-pack flow.
12. The broader FounderOS content foundation remains in an unmerged `FounderOS-DEMO` PR and still declares `claude_local` agents, which is incompatible with the new two-adapter Paperclip registry unless migrated.

In short:

> The project has moved from architecture-only to a meaningful runtime skeleton, but the autonomous multi-company FounderOS loop is not operational yet.

---

## 2. Status legend

- **COMPLETE** — implemented in current `paperclip/master` strongly enough to build on.
- **PARTIAL** — real implementation exists, but important behavior from the agreed architecture is missing.
- **MISSING** — no meaningful runtime implementation found in current `paperclip/master`.
- **MISALIGNED** — implementation exists but contradicts the intended architecture and should be replaced/refactored.
- **EXTERNAL / OTHER REPO** — intentionally belongs primarily in `FounderOS-DEMO`, a company repository, or an external platform rather than Paperclip itself.

---

## 3. Core architecture audit

| Area | Status | Current state | Required next step |
|---|---|---|---|
| Validation-first operating model | COMPLETE as spec | `spec.md` encodes Problem → ICP/Market → Offer → Demand → Commercial Commitment → Usage/Value → Retention → Economics, alongside a parallel MVP reliability loop and BUILD/ITERATE/PIVOT/KILL semantics. | Enforce through runtime state machine and validators rather than prompt text alone. |
| Evidence classification | PARTIAL | Jules prompt templates enforce evidence/source/assumption/hypothesis distinctions. | Add structured claim/evidence validators and canonical Firm/resource schemas. |
| GitHub as durable company workspace | PARTIAL | Spec and Jules prompts treat GitHub as canonical company state. | Preserve imported repository binding automatically and remove conflicting Firm snapshot model. |
| Paperclip as deterministic control plane | PARTIAL | DB schemas/routes exist for sessions, profiles, callbacks, goals, approvals. | Wire dispatch, reconciliation, validation, manager decisions, external-action approvals and event wakeups. |
| Hermes as manager | PARTIAL | `hermes-agent` is installed and `hermes_local` is exposed. | Build dedicated structured manager operations (`triage`, `bundle`, `plan_judge`, `result_judge`, `failure_diagnosis`, `next_best_action`). |
| Jules as execution plane | PARTIAL | Native REST adapter package exists. | Fix REST correctness, asynchronous lifecycle, outputs/activities, broker/profile selection, retries and reconciliation. |
| Linear as detailed work planner | PARTIAL / policy only | Prompt/session schema has Linear mode; capability name exists. Generated adapter specs currently default to `linear.mode = NONE`. | Implement goal/session Linear routing, project IDs, promotion semantics and optional webhook/event ingestion. |
| Firm as business-as-code | MISALIGNED | `server/src/services/firm.ts` snapshots `42futures/firm` itself, defaults companies to that upstream repo, and stores snapshots in Paperclip DB. | Replace with company-repo Firm workspace handling; treat `firm/*.firm` in the imported company repo as canonical. |
| Goal-specific resource packs | PARTIAL | DB schema, API, resolver, goal fields, prompt delivery exist. | Add real resource library, installation/sync from FounderOS source repo, company bootstrap snapshots and UI/workflow support. |

---

## 4. Jules adapter audit

### Implemented

- `packages/adapters/jules/` exists.
- Direct REST client uses `X-Goog-Api-Key`.
- Session create/get, `approvePlan`, and `sendMessage` methods exist.
- Session ID can be stored in adapter session params.
- `AUTO_CREATE_PR` is requested.
- Session prompt templates cover the agreed validation stages.
- Adapter does not invoke a local Jules CLI.
- Basic environment testing exists for API key, repository reachability, and source presence.

### Critical gaps

#### 4.1 Create-session payload needs correction

Current `api.ts` sends:

```text
githubRepoContext: {
  repository,
  startingBranch
}
```

The documented Jules REST `GitHubRepoContext` contains `startingBranch`; the source itself identifies the repository. The adapter should use the documented schema and integration-test it against Jules.

The current create call also does not pass `requirePlanApproval`, even though `JulesSessionSpec.execution.requirePlanApproval` exists.

#### 4.2 Pull request output parsing is incomplete

Current code expects top-level `pullRequestUrl` or falls back to the Jules session `url`.

Jules documents PRs under:

```text
session.outputs[].pullRequest.url
```

The Jules web-session URL must never be registered as if it were a GitHub PR URL.

#### 4.3 Async lifecycle is currently unsafe

`execute.ts` polls for a default of 30 seconds. If the Jules session is still `QUEUED`, `PLANNING`, `IN_PROGRESS`, `AWAITING_USER_FEEDBACK`, etc., the adapter returns exit code `0` with no error.

`heartbeat.ts` interprets exit code `0` + no error as a successful heartbeat run and marks the run `succeeded`.

This means a remote Jules task can still be running while Paperclip has already finalized the dispatch run as successful and may release execution state.

This must be redesigned around persisted remote execution + reconciliation, not a short synchronous polling window.

#### 4.4 Missing Jules API coverage

Still needed:

- list/resolve Sources through Jules API;
- list Activities and persist `lastActivityId`;
- parse outputs robustly;
- list/recover sessions for crash reconciliation;
- explicit handling for `AWAITING_USER_FEEDBACK`;
- controller use of `sendMessage` for same-session revision;
- plan approval driven by policy/judge/human rather than static adapter config.

#### 4.5 Idempotency is only partial

A session row can be inserted immediately from adapter metadata, which is useful. However, after a process crash there is no reconciler that uses the DB row to restore the adapter/runtime session mapping before another dispatch. Duplicate remote work remains possible across subsequent Paperclip runs.

**Jules adapter status: PARTIAL, P0 to finish.**

---

## 5. Jules fleet / capacity broker audit

### Implemented

- `jules_profiles`
- `company_jules_sources`
- `jules_profile_sources`
- `jules_sessions`
- `jules_capacity_events`
- `jules_callback_events`
- generic profile fields for rolling start limits, concurrency, reserve, capabilities and status;
- `selectJulesProfile()` with capability, source access, concurrency, reserve/quota and least-used-profile logic;
- tests for the pure selector.

### Missing

- DB-backed broker service calculating `startsInWindow` from timestamps;
- DB-backed active-session counts;
- actual invocation of the broker before Jules dispatch;
- resolution of `secretRef` into the selected profile's API credential;
- automatic matching of selected profile to company source;
- fleet dispatcher/queue;
- event-driven release of slots;
- finished/failure capacity events;
- fairness across companies;
- starvation/waiting-time boost;
- company priority and evidence/revenue unlock scoring;
- active-company set;
- `WAITING_FOR_MARKET` scheduling semantics;
- write-scope leases and overlap calculation;
- degraded-profile health/recovery logic;
- profile CRUD beyond simple create/list;
- profile capability/readiness verification.

The current selector is therefore a good unit, but not yet a working Jules Capacity Broker.

**Fleet broker status: PARTIAL, P0/P1.**

---

## 6. Hermes manager audit

### Implemented

- `hermes-agent` is installed in the production image.
- `hermes_local` remains available through the Paperclip adapter layer.
- UI configuration exists for Hermes model, command, timeout and persistent session.
- Paperclip defaults were shifted toward Hermes in several places.
- `spec.md` defines manager verdicts and responsibilities.

### Missing

There is no dedicated FounderOS manager module/service implementing the agreed operations:

```text
triage
bundle
plan_judge
result_judge
failure_diagnosis
next_best_action
```

There is no structured judge schema/result pipeline, no deterministic pre-check → Hermes judge → action controller, and no bounded retry/revision orchestration.

There is also no persistent loopback manager service started by the current Dockerfile; Hermes is installed, but the described manager service is not launched as a distinct supervisory process.

### Model configuration note

Earlier architecture discussions used `alias-fast` through an OpenAI-compatible endpoint. The current implementation/spec has intentionally moved to Hermes with a configurable model, but the UI creation helper currently defaults to `anthropic/claude-sonnet-4`. If `alias-fast` remains desired behind Hermes, the default should not silently force Claude; configuration should be environment/provider driven.

**Hermes manager status: PARTIAL, P0/P1.**

---

## 7. Paperclip ↔ Jules callback bridge audit

### Implemented

Routes exist for:

```text
GET  /api/jules/v1/runs/:runId/context
POST /api/jules/v1/runs/:runId/progress
POST /api/jules/v1/runs/:runId/blockers
POST /api/jules/v1/runs/:runId/artifacts
POST /api/jules/v1/runs/:runId/proposals
POST /api/jules/v1/runs/:runId/complete
```

Callback event IDs are deduplicated in the DB.

### Missing / insufficient

- Intended per-company/per-run remote capability token/JWT is not implemented.
- Current route authorization uses normal `assertCompanyAccess`, not the scoped Jules run credential contract.
- Context response is minimal; it does not yet supply full agent/project/goal/outcome/criteria/resource/Linear context.
- Callback events are stored, but they are not translated into the agreed Paperclip organizational actions:
  - blocker issue/state;
  - approval request;
  - major milestone;
  - proposed workstream;
  - work-product update;
  - next manager decision.
- `complete` marks the Jules session completion candidate, but no deterministic acceptance pipeline is triggered.
- No safe GitHub outbox fallback exists for environments where Jules cannot receive the Paperclip callback credential.

**Callback bridge status: PARTIAL, P0.**

---

## 8. Deterministic validation / acceptance audit

### Present in prompt/spec

- required outputs;
- acceptance criteria;
- cannot-complete-if rules;
- `firm build` expectation;
- evidence rules;
- no self-acceptance;
- completion candidate semantics.

### Missing in runtime

No central validator pipeline currently proves, independently of Jules, that:

- required files exist on the Jules PR branch;
- schemas are valid;
- Firm builds;
- tests/builds pass;
- required evidence IDs exist;
- write scope was respected;
- no secrets leaked;
- GitHub Actions passed;
- business deterministic gates passed.

There is also no Hermes judge call after deterministic validation.

**Acceptance pipeline status: MISSING, P0.**

---

## 9. Retry / same-session correction audit

### Implemented primitives

- REST client has `sendMessage()`.
- Session prompt emphasizes scarce sessions.

### Missing controller

No runtime currently implements:

```text
weak result
→ REVISE_SAME_SESSION
→ send targeted correction via sendMessage
→ re-reconcile result
→ bounded fresh retry if justified
→ escalate
```

Retry ancestry, correction counts, fresh-session retry counts and retry budgets are not yet implemented as an operational controller.

**Retry controller status: MISSING, P0/P1.**

---

## 10. Company import / bootstrap audit

### Existing Paperclip capability

Paperclip can import company portability bundles, including from GitHub sources.

### FounderOS gaps

The import route currently imports the portability package but does not automatically:

- persist the imported GitHub repository as the canonical company workspace binding;
- resolve the Jules Source;
- bind eligible Jules profiles;
- validate root `AGENTS.md`;
- validate/create `.founderos/JULES_CONTEXT.md`;
- validate/create `.founderos/PAPERCLIP_API.md`;
- validate/create `.founderos/TOOL_POLICY.md`;
- validate/create `.founderos/DEPLOYMENT_POLICY.md`;
- validate the company `firm/` workspace;
- install/snapshot FounderOS support packs;
- create the bootstrap goal/outcome;
- dispatch the bootstrap Jules session.

The generic `POST /companies` create path is still active and also triggers the old Firm initializer. Paperclip may keep generic company creation for upstream compatibility, but FounderOS mode should make GitHub import the primary/required workflow.

**Import/bootstrap status: PARTIAL, P0/P1.**

---

## 11. Firm audit — architecture conflict

This is the clearest current architectural mismatch.

`server/src/services/firm.ts` currently:

- defaults to `42futures/firm`;
- fetches that repository's JSON and Markdown;
- stores a snapshot/context in Paperclip DB;
- periodically refreshes the upstream repository;
- initializes this behavior for newly created companies.

The agreed FounderOS architecture is different:

```text
Imported company GitHub repo
└── firm/*.firm
    = canonical structured business state
```

`42futures/firm` is the tool/DSL implementation, not the business state repository for every company.

Required correction:

- company repo is the Firm workspace;
- Jules uses Firm CLI against the company's `firm/*.firm` files;
- Paperclip may cache/build status, but must not substitute an upstream Firm source-code snapshot for company knowledge;
- remove the default `42futures/firm` company assignment behavior;
- deprecate/refactor `firmGithubRepo` semantics so it points to the company workspace only if retained.

**Firm integration status: MISALIGNED, P0.**

---

## 12. Goal support / resource packs audit

### Implemented

Goals now support:

```text
requiredSkills
supportPacks
requiredCapabilities
inputPaths
outputPaths
acceptanceCriteria
cannotCompleteIf
```

Resource-pack snapshots retain:

```text
pack ID
version
tier
installed path
source repo
source commit
manifest
```

The Goal Support Resolver injects resolved pack read paths and quality gates into Jules prompt context.

This is the correct architectural direction.

### Missing

- no actual FounderOS resource library in this repo/company bootstrap flow;
- no automatic sync/install from `FounderOS-DEMO`;
- no `resources/registry.yaml` equivalent;
- no pitch resource pack with layout/source/slide contract/evidence map/quality gate;
- no BPW business-plan pack;
- no BPW financial-model pack;
- no customer-discovery pack;
- no sales-second-brain pack;
- no prospecting pack;
- no fake-door pack;
- no content/search/design/red-team packs;
- no company import process that creates `.founderos/support/manifest.yaml`;
- no upgrade workflow from old pack version to a new source commit;
- no UI for inspecting resource provenance and missing required packs.

**Resource-pack runtime status: PARTIAL. Resource content status: MISSING / OTHER REPO.**

---

## 13. Validation task graph audit

`JULES_OUTCOME_TEMPLATES` is one of the better completed pieces. It contains templates for:

```text
bootstrap
venture_thesis
market_research
icp
prospects
interviews
offer
content
channel_test
fake_door
commitment
concierge
retention
economics
red_team
```

The templates include objectives, outputs, acceptance criteria, blockers, write scopes and required capabilities.

However, there is no runtime state machine that automatically progresses/bundles those outcomes based on evidence and manager decisions.

**Task-contract definitions: COMPLETE-ish. Orchestration: MISSING.**

---

## 14. Linear / Context7 / Stitch / Tinybird audit

### Linear

- capability name exists;
- Jules prompt explains its role;
- session spec has `CREATE_PROJECT` / `CONTINUE_PROJECT` modes;
- generated adapter sessions currently hard-code `linear.mode = NONE` unless a full session spec is supplied externally;
- no manager currently generates that richer session spec;
- no Paperclip-side mapping/promotion/webhook logic.

**Status: PARTIAL / mostly declarative.**

### Context7

- capability appears in templates/prompt.
- no profile provisioning/readiness workflow.

**Status: POLICY ONLY.**

### Stitch

- capability appears in fake-door/design flow.
- no operational project/reference provisioning or output handling in Paperclip.

**Status: POLICY ONLY.**

### Tinybird

- capability appears in channel/fake-door/retention templates.
- no event schema bootstrap, credentials/readiness, experiment result ingestion, threshold wakeups or evidence materialization service.

**Status: POLICY ONLY.**

---

## 15. Deployment audit

### Policy exists

`spec.md` and Jules prompts correctly state:

```text
Render Static → static landing pages / fake doors / campaign pages / static waitlists
Hugging Face Spaces → APIs / applications / workers / agent services / dashboards / dynamic prototypes
```

### Runtime enforcement missing

- no deployment policy service rejecting invalid targets;
- no Paperclip-controlled Render Static deploy action;
- no Paperclip-controlled Hugging Face deploy action;
- no deployment approval workflow;
- no deployment evidence/result event handling.

### Paperclip on Hugging Face

The current root Dockerfile installs Hermes but defaults to port `3100` and does not itself contain the complete HF-specific deployment flow described by the architecture. There is a separate older open PR for HF deployment work, but it is not part of current `master`.

**Deployment status: PARTIAL/policy-only.**

---

## 16. External action governance audit

### Spec/prompt level

External action policy enum exists:

```text
DENIED
APPROVAL_REQUIRED
PREAUTHORIZED
```

The prompt correctly calls out publishing, outreach, payments, account changes, spend, destructive operations, sensitive data and irreversible actions.

### Runtime gap

There is no dedicated controlled tool/action gateway yet for:

- outreach send;
- calendar booking;
- payment/deposit actions;
- CRM mutation;
- account creation;
- static/dynamic deployment;
- browser actions;
- external publishing.

No unified action request → approval → execution → audit → evidence pipeline exists.

**Status: MISSING beyond policy text.**

---

## 17. Business Second Brain / Sales Second Brain audit

These are core parts of the wider FounderOS project but are not implemented in current Paperclip runtime.

Desired model:

```text
Business Second Brain
- company knowledge
- decisions
- hypotheses
- evidence
- strategy
- projects
- offers
- artifacts

Sales Second Brain
- accounts
- prospects
- contacts
- interactions
- objections
- opportunities
- commitments
- next actions
```

The intended persistent representation is GitHub + Firm, not hidden model memory.

Much of the methodology exists in `FounderOS-DEMO` PR #4, but that PR is still open/unmerged and has not been converted into versioned resource packs/company Firm schemas.

**Paperclip runtime status: MISSING. FounderOS content status: PARTIAL in unmerged PR.**

---

## 18. Prospecting / customer discovery / sales validation audit

The wider project requires:

- waterfall prospect sourcing;
- waterfall contact enrichment;
- ICP filtering;
- watering-hole discovery;
- diagnostic community outreach;
- customer discovery/interview evidence;
- offer testing;
- calls, LOIs, deposits and paid pilots;
- concierge delivery;
- retention/repeat validation;
- economics.

Current Paperclip now has outcome templates for several of these, but it does not yet have the domain resource packs, external action tooling, evidence ingestion, sales-brain Firm schemas, or event-driven follow-up needed to operate them autonomously.

**Status: PARTIAL as contracts, MISSING as end-to-end workflows.**

---

## 19. Content / creative / search-demand audit

The wider project includes:

- avatar → offer → landing-page chain;
- content trust flywheel;
- content-to-demand loop;
- creative generation/review loop;
- campaign auto-research;
- search-demand intelligence;
- OpenSEO-inspired keyword workflow;
- Gogh-inspired design judgment;
- browser capability routing.

These are not integrated into current Paperclip runtime. They remain methodology/content work, primarily in `FounderOS-DEMO` PR #4.

Required next step is not to hard-code them into Paperclip. Convert them into versioned FounderOS skills/resource packs/goals and let Goal Support Resolution deliver only the relevant ones to Jules.

**Status: EXTERNAL / OTHER REPO, currently unmerged and not resource-packed.**

---

## 20. BPW business case / finance / pitch audit

The wider FounderOS requires source-grounded support for:

- Executive Summary;
- Product/Service;
- Founding Team;
- Market Analysis;
- Marketing;
- Organisation;
- Financing/Financial Planning;
- sustainability integration;
- nine-block BMC;
- three-year finance / year-one monthly model;
- ten-step pitch;
- evaluation rubric;
- evidence discipline.

The methodology exists in `FounderOS-DEMO` PR #4. Current Paperclip only has the generic resource-pack mechanism.

Still needed:

- actual BPW resource packs;
- pitch layout pack with source/layout/slide contract/evidence map/quality gate;
- financial model resource pack;
- goal definitions attaching those packs;
- output validators;
- pitch/finance/business-plan generation outcomes in the Jules task graph or goal library.

**Status: resource mechanism PARTIAL; actual goal support content MISSING from active runtime.**

---

## 21. FounderOS-DEMO compatibility audit

Current `FounderOS-DEMO` validation branch still declares all agents as `claude_local` in `company-package/.paperclip.yaml`.

Current Paperclip server adapter registry exposes only:

```text
hermes_local
jules
```

Therefore importing that company package into current Paperclip without migration will create an adapter mismatch.

Required fix before production use:

- migrate execution agents to `jules`;
- keep only intentional manager/supervisory roles on `hermes_local`;
- or add an import migration that maps old FounderOS agent adapter types safely.

Also merge/rebase `FounderOS-DEMO` PR #4 and then add the resource-pack architecture described above.

**Status: BLOCKING cross-repo incompatibility.**

---

## 22. Resilience / restart audit

Required behavior after an HF/Paperclip restart:

```text
load profile registry
recompute rolling quotas
reconcile all nonterminal Jules sessions
recover PR/output state
release/fix stale leases
run pending deterministic validation
run pending Hermes judge decisions
resume queue
```

No Jules-specific startup reconciler was found in current `master`.

**Status: MISSING, P0.**

---

## 23. CI/test confidence

PR #6 added unit tests around prompt rendering, environment checks, goal support, capacity selection and related helper behavior.

However, the GitHub commit associated with the merged implementation did not expose a successful GitHub Actions run/status in this audit. The PR description reports local tests/typechecks, which is useful, but remote integration evidence is still needed.

Most importantly, current tests do not cover the real end-to-end remote lifecycle:

```text
import company
→ select profile
→ create real/mock Jules session
→ stay nonterminal across process boundary
→ restart Paperclip
→ reconcile
→ receive plan/user-feedback state
→ send correction
→ parse PR output
→ deterministic validation
→ Hermes verdict
→ accept/revise/retry
```

**Status: unit foundation present; end-to-end coverage missing.**

---

## 24. Priority implementation summary

### P0 — required before claiming the Jules control plane works

1. Correct Jules REST request/response handling.
2. Replace short synchronous completion assumption with durable remote-session reconciliation.
3. Wire DB-backed capacity broker into actual dispatch.
4. Resolve Jules profile `secretRef` securely during dispatch.
5. Add rolling-window accounting and session-finished events.
6. Add write-scope leases.
7. Implement scoped Jules run authentication/capability tokens.
8. Enrich callback context and promote blockers/approvals/milestones/completions.
9. Implement deterministic validation pipeline.
10. Implement Hermes judge/revise/retry controller.
11. Implement startup/orphan reconciliation.
12. Refactor Firm integration to the company repository.
13. Make GitHub import bind source + trigger FounderOS bootstrap.

### P1 — required for a usable validation-first FounderOS

1. Implement Manager operations and structured schemas.
2. Implement Linear planning/project linkage.
3. Add WAITING_FOR_MARKET / active-company scheduling.
4. Add profile health/capability readiness.
5. Add resource-pack installation/versioning from FounderOS content repo.
6. Build company `.founderos` bootstrap and support manifest.
7. Merge/migrate `FounderOS-DEMO` validation foundation.
8. Build actual BPW/pitch/finance/customer-discovery/sales/fake-door resource packs.
9. Build Tinybird experiment/event integration.
10. Build Stitch/frontend flow and visual verification contract.
11. Implement Render Static and HF deployment actions/policies.

### P2 — whole-business operating loops

1. Business Second Brain.
2. Sales Second Brain.
3. Prospect sourcing/enrichment loop.
4. Customer-discovery ingestion/synthesis loop.
5. Content-demand and creative-review loops.
6. Search-demand/OpenSEO loop.
7. Browser capability routing.
8. Controlled Gmail/Calendar/Stripe/CRM/external-action connectors as needed.
9. BPW business-plan compiler, finance compiler and pitch compiler.
10. Red-team investment-committee gate and final BUILD/ITERATE/PIVOT/KILL workflow.

---

## 25. What should not be reimplemented inside Paperclip

Paperclip should not become a giant repository of business-methodology prose.

Keep the separation:

```text
paperclip
= control plane, scheduler, auth, quotas, callbacks, validation, manager orchestration, deployment/action governance

FounderOS-DEMO / FounderOS content source
= goals, skills, systems, resource packs, BPW layouts, pitch layouts, sales methods, discovery methods, design/search methodology

imported company repo
= company-specific durable state, Firm graph, evidence, website, experiments, business case, installed support-pack snapshot

Jules
= execution

Hermes
= supervisory reasoning
```

This separation is essential for maintainability and reproducibility.

---

## 26. Overall judgment

The merged Codex implementation is **a strong first skeleton but substantially incomplete** relative to the whole FounderOS adaptation discussed.

A fair characterization is:

```text
Architecture/specification             strong
DB/control-plane primitives            meaningful foundation
Native Jules execution                 prototype / not production-complete
Fleet brokering                         selector only
Hermes manager                          adapter availability only
Remote lifecycle/reconciliation         missing
Deterministic validation/judging        missing
GitHub import/bootstrap                missing integration
Firm architecture                       currently misaligned
Resource-pack mechanism                partial
Actual FounderOS resource packs         missing
Linear/Stitch/Tinybird integration      declarative/partial
Deployment execution                    mostly policy only
Business/Sales second brain             not operational
Prospecting/content/search loops         not operational
BPW/finance/pitch support packs         not operational
Cross-repo FounderOS content             still unmerged
```

The next implementation work should follow `/adaptations_spec.md`.