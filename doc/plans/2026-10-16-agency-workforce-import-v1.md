# Agency Workforce Import v1 — implementation and qualification

## Git and source

- Authoritative starting branch: `jules/live-qualification-validation-control-plane-17107534803350008827`.
- Starting SHA: `858aa9984968b21b1c926d0bb9c34681787af3c1`.
- Feature branch: `codex/agency-workforce-import-v1`. Final commit SHA is reported in the delivery message; `git log 858aa998..HEAD` lists this change's commits.
- Agency source: `JsonLord/agency-agents`, `validation-workforce`, `cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09`.
- No merge, publishing, deployment or outreach. The previously requested `1d1c602ab75d376ce8166f9f97add31f7f95fbc4` was already pushed to `codex/validation-control-plane-v1`; this feature is separate.

[The preimplementation source analysis](2026-10-16-agency-workforce-import-analysis.md) inventories every active ID and records the source inconsistencies before design.

## Imported workforce

The reviewed bundle contains exactly **45 active personas, 9 divisions, 28 skills, 13 workflows, 8 upstream provider capabilities and 45 semantic capabilities**. It retains all 327 upstream alias/path references as provenance: 45 active and 282 legacy. Legacy paths do not become workers. The canonical `value-position-designer` ID is preserved; `value-proposition-designer` resolves to it without creating a second identity.

Each member retains a native Paperclip agent UUID, Agency ID, upstream commit/path/content hash, division, methodology, skills, capability grants, approval restrictions, scopes and lifecycle. The MIT license is bundled. No provider credential is imported.

Starting a new Validation Programme imports 44 dormant specialists and one available independent Founder Intelligence Reporter beneath the existing CEO. Specialists have zero timer interval. The Reporter has a daily scheduling exception; the scheduler creates a typed, individually gated report activation rather than sending an empty heartbeat. Missing Nodepad/runtime configuration produces no periodic specialist execution. Existing programmes use the explicit founder import endpoint.

The importer serializes by company, reuses equivalent legacy logical identities, and pauses superseded seats including Product Engineer. History is retained. Reimport preserves native IDs, adapter credentials and company overrides. Definition changes are detected using canonical JSON hashing, including across PostgreSQL JSONB key reordering. Changed definitions cannot replace active/waiting work. Upstream removal disables the member without deleting history. Removed members require explicit operator reconciliation before reuse; reimport does not silently reenable them.

The generator consumes Agency's native Python catalog validator, accepts a source checkout argument, verifies its pinned HEAD and clean status, and writes reviewed JSON. Runtime dispatch never scans persona Markdown:

```sh
python scripts/import-agency-workforce.py /path/to/agency-agents
```

## Capability and runtime routing

A need names a current canonical hypothesis and gap/material-result reference, stage, desired uncertainty reduction, dataset references, typed validation intent, explicit economics and stop/success conditions. The router checks phase, pause, active-focus WIP, direct-evidence blockers, specialist state/overrides, capability, dataset, runtime configuration and applicable approval. It returns one minimum-sufficient specialist and a transparent reason. Handoffs remain hints. No full workflow or specialist chain launches automatically.

| Route | Specialist | Runtime / boundary |
| --- | --- | --- |
| A: collect customer language | Community Scout | Hermes; raw collection, no accepted-evidence submission |
| B: interpret existing dataset | Customer Investigator | Actions; dataset required, no browsing grant |
| C: challenge strong support | Counter-Hypothesis Generator | Actions; independent finding |
| D: pricing uncertainty | Pricing-Test Designer, then WTP Skeptic on completed results | Actions design/evaluation; Jules only for bounded frontend work |
| E: fake door | Same Fake-Door Designer identity | Actions design, Jules frontend after evidence/readiness gates |
| F: human interview blocker | Explicit interview preparation only | Filler analysis/collection rejected |
| G: product/backend request | Founder engineering dependency | No engineer dispatch |
| H: strategic conclusion | Venture Judge | Actions; explicit BUILD/MORE_VALIDATION/PIVOT/STOP recommendation |

Aliases include `pricing_wtp → pricing_test`, `willingness_to_pay → wtp_challenge`, and `strong_support → counter_hypothesis`. Experiment-result routing targets the relevant skeptic, rather than awakening all evaluators. Specialist findings are immutable; the CEO integrates them through context and decisions instead of rewriting them.

Task stage selects runtime independently of identity. There is no interactive-to-Jules fallback. Actions bindings must name a workflow input accepting the bounded typed workforce packet; the qualification mock workflow is not silently repurposed. Hermes needs an actual executable. Jules retains the existing physical capacity broker, credential/source isolation, start accounting, concurrency and repository lease checks. Frontend activation requires explicit bounded artifact scopes and canonical customer/problem/language/proposition/counter-hypothesis evidence plus an experiment question and behavioral metric. Backend, path traversal, absolute paths and broad non-artifact scopes are rejected.

## Programme, lifecycle and evidence

Phase allowlists constrain all 45 roles. New hypothesis formulation after EXPLORE requires material canonical evidence, rather than routine portfolio expansion. Active-focus WIP uses distinct hypotheses; pending findings and unconfirmed remote stops retain their focus. Daily reporting observes blockers without counting as another validation bet.

Assignment alone cannot awaken a dormant worker. Checkout and actual heartbeat dispatch verify the authorized activation, native issue, unchanged intent, phase, pause, identity and runtime. API retries reuse the activation; a durable wake acknowledgement and native wake request lookup prevent a retry from becoming another runtime job, including after interrupted acknowledgement.

Completion validates artifacts against the same company/task and references against current company Nodepad. A missing finding is never inferred from a green task or remote execution status. Native terminal tasks await a traceable finding without more compute. Explicit completion returns the specialist dormant/available, or blocked with a reason. A stop endpoint withdraws dispatch authority and stops native execution; stale-phase/paused activations are stopped by the host timer. Unconfirmed remote jobs retain a WAITING member and return `REMOTE_STOP_PENDING` until their real status is reconciled. No remote cancellation is fabricated.

The Reporter receives host-computed state counts, native task/run/failure/cost counts, artifact references, canonical interview/evidence/hypothesis/experiment counts and a busy-work numerator/denominator. Missing denominators remain null. Worker claims are labeled separately from canonical evidence. Reporter completion creates an independent native reporter record consumed by the CEO packet. The operating maxim is preserved: activity is not progress; output is not evidence; evidence is not validation; validation is not traction.

Commercial cohort specifications remain REFINE-only and require commercial readiness. Lead discovery and contact are distinct founder-governed actions; neither activates background scraping or outreach. Product-facing backend engineering is always a founder dependency. Validation-production roles produce validation artifacts only.

## Nodepad boundary and errors found

Read grants project only the granted `nodepad.context`, `nodepad.hypotheses` or `nodepad.evidence` surfaces. Dormant/blocked/disabled members receive no grant. Workers never receive binding credentials. Candidate writes require the activated member, granted operation, same hypothesis and company. Strict payloads reject qualification/confidence/band fields. Community Scout can propose a research gap but cannot submit analyzed evidence. Other structured proposals remain explicitly `pending_nodepad` native records for integration; they are not canonical Nodepad changes.

**An inherited live-adapter defect remains a deployment blocker.** The starting branch posts evidence candidates to `/hypotheses`, dropping source reference, content hash, pipeline reference and requested hypothesis linkage. It also assembles an incomplete snapshot: required hypothesis fields and `experiments` are absent, archived status becomes an invalid `withdrawn`, and interview/evidence data is discarded. Strict projection validation rejects it; these responses cannot prove a real qualification cycle. This change rejects Agency live evidence submission unless the provider explicitly implements `candidateContract: "evidence-v1"`. Fixture providers remain clearly marked as fixtures. Implementing and verifying the real Nodepad projection/evidence API requires its actual contract and company-scoped access; no endpoint semantics were invented here.

The source qualification document calls simulated/mock actions `PASS_LIVE`. Those claims were not reused as evidence. This environment has no configured Nodepad workspace/secret or Hermes provider. Git fetch/push works; the GitHub REST API was denied by the network proxy during the preceding live-cycle attempt. No genuine customer evidence, live qualification or live provider run is claimed.

Other errors discovered and fixed during this implementation: capability identifiers containing underscores were rejected by an initially too-narrow validator; JSONB key order caused false drift; a direct specialist assignment could bypass dormancy; activation retry could cause another wake; late/cancelled findings could overwrite lifecycle ownership; generic terminal-task status could be mistaken for material progress. Regression coverage now covers these paths.

## API and operational use

All paths are under `/api/companies/:companyId/workforce` and enforce company access. Founder/CEO access is required except explicitly scoped specialist operations.

| Endpoint | Authority / behavior |
| --- | --- |
| `GET /` | Roster, state, source definitions, recent activations, reason/task/hypothesis/runtime |
| `POST /import` | Founder; pinned import or reimport |
| `PUT /members/:id/override` | Founder; disable/pause, restrict phases/capabilities/runtime, strengthen approval |
| `POST /recommendations` | Founder/CEO; resolve one current typed need |
| `POST /activate` | Founder/CEO; durable event-keyed activation and native wake |
| `POST /activations/:id/complete` | Assigned specialist or founder; immutable, traceable finding |
| `POST /activations/:id/stop` | Founder/CEO; reprioritize/stop with reason; retain remote uncertainty |
| `GET /metrics` | Founder/CEO; host facts and explicit denominators |
| `GET /playbooks` | Founder/CEO; all 13 versioned workflow definitions |
| `POST /playbooks/:workflowId/steps/:stepId` | Founder/CEO; one step, subject to the same current gates |
| `GET /nodepad?scope=...` | Activated specialist; granted read projection only |
| `POST /proposals` | Activated specialist; scoped candidate, explicitly pending Nodepad |

Company Actions, Hermes and Jules configuration uses `/api/companies/:companyId/validation/runtime-bindings/{actions,hermes_local,jules}`. Only the founder can configure it. Actions references a company secret ID; Jules credentials remain in the existing broker. Hermes settings contain model/timeout rather than plaintext secrets. No new dashboard redesign was needed; the required control-plane surfaces are API/types.

One additive generated migration creates the import/member/activation records and durable wake acknowledgement. Existing companies remain legacy unless explicitly opted into a Validation Programme. Company deletion removes workforce child rows in dependency order. Repeated migration application is tested against PostgreSQL.

## Validation and golden slice

Baseline on the authoritative branch: **826 passed, 1 skipped**. Implementation checks and the final delivery commit are reported below and in the delivery message.

- `pnpm -r typecheck`
- `pnpm test:run` — **850 passed, 1 skipped; 141 files**.
- `pnpm build` — includes server, CLI, shared packages and UI production build.
- `pnpm check:tokens`
- `pnpm db:generate` — regeneration must report no schema changes.
- Prettier on new contracts/services/routes/tests; `git diff --check`. This repository has no root lint script; token policy and formatting are the applicable checks.
- Dependency installation retains the repository lockfile. Its inherited importer mismatch prevents frozen installation; this environment used the documented no-lockfile-update install path.
- Native upstream catalog validation and deterministic generator comparison.

The golden fixture uses real PostgreSQL migrations, native agents, tasks, registered work products and records: canonical hypothesis/gap → Community Scout/Hermes selection → Investigator/Actions selection → scoped candidate submission → canonical fixture refresh → same Fake-Door Designer on Actions then Jules → WTP Skeptic → Venture Judge → independent Reporter → deterministic CEO context → founder-authority decision request. Qualifying fields remain unchanged by worker outputs. Runtime providers/wake calls are explicitly injected fixtures; this is **PASS_LOCAL**, not a live remote execution trace.

Additional coverage includes all routes A–H, phase gating, WIP, missing runtime without fallback, interview hard wait, fake-door readiness, frontend scope boundaries, exact roster and aliases, reimport/drift/removal/overrides, existing worker reuse and engineer retirement, Nodepad read/write grants and company isolation, immutable findings, cancelled work, remote-stop uncertainty, daily Reporter deduplication and legacy tests.

## Deferred and verdict

Deferred: real Nodepad projection/evidence-candidate adapter qualification; automatic forwarding of non-evidence proposals to that verified API; live Actions/Hermes/Jules credential/provider qualification; provider-specific remote cancellation where unsupported; external lead discovery/contact integrations; optional compact Workforce UI and deeper Reporter views. No external outreach or simulated evidence was performed.

**AGENCY_WORKFORCE_IMPORT_NOT_READY** for live rollout. The canonical importer and local golden control-plane slice pass, but the inherited live Nodepad projection/evidence contract is incomplete and Agency evidence submission is deliberately blocked until verified. Genuine remote runtime execution is also unqualified in this environment. These are explicit blockers, not evidence of a successful live validation cycle.
