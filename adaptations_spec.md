# FounderOS Remaining Adaptations Specification

Status: implementation specification for Codex / follow-up engineering

Date: 2026-09-14

Target repository: `JsonLord/paperclip`

Default branch: `master`

Companion documents:

- `/spec.md` — target architecture and operating model
- `/ADAPTATION_OVERVIEW.md` — current implementation audit and gap matrix

Related content repository:

- `JsonLord/FounderOS-DEMO`
- validation/content foundation currently in PR #4, branch `validation-skills-from-agent-questions`

This document is a **delta specification**. It does not replace `spec.md`. It defines what still must be built or corrected before the FounderOS architecture can be considered operational.

---

# 1. Final system invariant

The intended operating system remains:

```text
GitHub company repository
        ↓ import
Paperclip control plane
        ↓
Hermes founder manager
        ↓ recommends
Paperclip deterministic policy / capacity / approvals
        ↓ dispatches
Jules fleet (profile 1..N)
        ↓ works in
Company GitHub repository
        ├── website/
        ├── firm/
        ├── evidence/
        ├── experiments/
        ├── business-case/
        └── .founderos/support/
        ↓
Paperclip reconciliation + deterministic validation
        ↓
Hermes semantic judge
        ↓
ACCEPT | REVISE_SAME_SESSION | RETRY_NEW_SESSION | WAIT | ESCALATE
```

Supporting systems:

```text
Linear       = detailed Jules execution planning
Tinybird     = behavioral analytics source
Stitch       = design/frontend generation support
Context7     = current implementation documentation
Playwright   = UI verification
GitHub Actions = CI
Render Static = fake-door/static validation hosting only
Hugging Face Spaces = dynamic applications/services
Firm         = structured business-as-code stored in the company repository
```

Hard architecture rules:

```text
NO Supabase
NO Neon
NO Postgres as canonical company state
NO local Jules CLI execution
NO auto-merge of Jules PRs
NO LLM-only acceptance
NO secrets in prompts or Git
NO generated analysis treated as market evidence
```

Paperclip may continue using its own internal database for control-plane/runtime state.

---

# 2. P0 — Correct the native Jules adapter

The current Jules adapter is a useful prototype but must be corrected before production dispatch.

## 2.1 Match the documented REST schema

Update `packages/adapters/jules/src/server/api.ts`.

Create-session request must use the documented structure:

```json
{
  "prompt": "...",
  "sourceContext": {
    "source": "sources/...",
    "githubRepoContext": {
      "startingBranch": "main"
    }
  },
  "title": "...",
  "requirePlanApproval": true,
  "automationMode": "AUTO_CREATE_PR"
}
```

Do not place an undocumented `repository` field inside `githubRepoContext`.

Repository identity remains Paperclip metadata and is resolved to a Jules Source before session creation.

## 2.2 Implement source APIs

Add Jules API methods for at least:

```text
listSources
get/list Sessions as needed for recovery
get Session
create Session
list Activities
approvePlan
sendMessage
```

Paperclip must be able to resolve a GitHub repository to an actual Jules Source rather than requiring a manually copied source string forever.

## 2.3 Parse outputs correctly

Jules PR output must be parsed from:

```text
session.outputs[].pullRequest.url
```

Never use the Jules web-app session URL as a GitHub PR URL.

Persist:

```text
pullRequestUrl
pullRequestTitle
pullRequestDescription
lastActivityId
remote state
remote update time
```

where available.

## 2.4 Honor plan approval

`JulesSessionSpec.execution.requirePlanApproval` must flow into the actual create-session request.

Policy mapping:

```text
low-risk task + policy allows auto plan
→ requirePlanApproval=false

manager/human review required
→ requirePlanApproval=true
```

When state becomes `AWAITING_PLAN_APPROVAL`, Paperclip must request a manager/human decision and only call `approvePlan` after authorization.

## 2.5 Do not model unknown/nonterminal state as success

The current short polling behavior must not cause a live remote session to finalize as a completed Paperclip execution outcome.

Do not solve this by simply raising `maxWaitSec` to a huge value.

Remote work is asynchronous and must survive Paperclip/HF restarts.

Acceptance criterion:

> A Jules session can remain IN_PROGRESS for hours while Paperclip restarts, and Paperclip must retain and recover the correct remote execution state without creating a duplicate session or marking the business outcome accepted.

---

# 3. P0 — Introduce durable remote-execution lifecycle

Separate **dispatch completion** from **remote outcome completion**.

A local heartbeat that successfully creates a Jules session may finish as a successful dispatch operation, but the assigned Paperclip issue/outcome must remain remotely active until Jules reaches a terminal state and validation finishes.

## 3.1 Session lifecycle service

Create a first-class service such as:

```text
server/src/services/jules-sessions.ts
```

Responsibilities:

```text
create session transactionally
persist remote ID immediately
resume existing mapping
refresh session state
refresh activities
extract PR outputs
mark terminal remote state
release capacity/write leases
trigger deterministic validation
trigger manager judgment
schedule same-session revision
schedule bounded fresh retry
```

## 3.2 State model

Paperclip should distinguish at least:

```text
DISPATCHING
QUEUED
PLANNING
AWAITING_PLAN_APPROVAL
AWAITING_USER_FEEDBACK
IN_PROGRESS
PAUSED
FAILED
COMPLETED_UNVALIDATED
VALIDATING
AWAITING_MANAGER_JUDGMENT
REVISION_REQUESTED
ACCEPTED
ESCALATED
ORPHANED
```

Do not overload a heartbeat `succeeded` status to represent business completion.

## 3.3 Reconciliation worker

Create:

```text
server/src/services/jules-reconciler.ts
```

Run:

- at server startup;
- periodically as fallback;
- immediately when a known event releases capacity or needs follow-up.

On startup:

```text
load all nonterminal jules_sessions
→ query remote state
→ update status/activities/PR metadata
→ recover stale locks
→ run pending validation/judgment
→ dispatch newly available queued work
```

The reconciler must be idempotent.

---

# 4. P0 — Wire the Jules Capacity Broker to real dispatch

`selectJulesProfile()` currently exists as a pure helper. Build the actual DB-backed broker around it.

Suggested service:

```text
server/src/services/jules-capacity-broker.ts
```

## 4.1 Compute live profile state from DB

For every candidate profile calculate:

```text
startsInWindow
activeSessions
remainingRollingStarts
remainingConcurrency
reserveRemaining
sourceAccessible
requiredCapabilitiesPresent
profileHealth
recentFailures
```

`startsInWindow` must be based on timestamps in `jules_capacity_events` and the profile's configured rolling window.

## 4.2 Resolve profile secrets

`jules_profiles.secret_ref` must actually be used.

The broker/dispatcher must resolve the selected profile API credential through Paperclip's secret service.

Do not copy the API key into:

```text
agent adapter config
Jules prompt
GitHub repo
logs
callback payloads
```

## 4.3 Automatic source/profile matching

Dispatch must use:

```text
company_jules_sources
+
jules_profile_sources
+
profile capabilities
```

No ordinary Jules agent should require the operator to manually place `profileId`, `companySourceId`, `source`, `repository` and API key into every agent runtime config.

Those are control-plane bindings.

## 4.4 Capacity events

Record at least:

```text
session_started
session_completed
session_failed
session_orphaned
session_retry_started
profile_degraded
profile_restored
```

Avoid double-counting retry/reconciliation events.

## 4.5 Fairness and value priority

Add queue scoring inputs:

```text
company priority
dependency unlock value
evidence/revenue value
deadline urgency
waiting time/starvation boost
recent Jules usage
retry cost
write conflict risk
```

Hard limits remain deterministic.

Hermes may recommend priority but may not override quota/concurrency rules.

## 4.6 Reserve capacity

Reserve capacity should be configurable per profile/fleet.

Normal batch work should not consume reserved starts.

Urgent work may consume reserve when deterministic policy permits.

---

# 5. P0 — Repository write leases

Current broker accepts a precomputed `writeConflict` boolean. Replace this with actual lease management.

Add a persisted lease model, e.g.:

```text
jules_repository_leases
-----------------------
id
company_id
session_id
repository
write_scopes
acquired_at
expires_at
released_at
```

Implement deterministic overlap detection for paths such as:

```text
firm/market/**
website/**
business-case/MARKET_ANALYSIS.md
```

Defaults:

```text
company write concurrency = 1
burst = 2 only when declared scopes do not conflict
```

Release leases on terminal state and recover stale leases on startup.

---

# 6. P0 — Scoped Jules callback authentication

The existing callback routes must not depend on broad board/company auth for remote Jules execution.

Implement a scoped remote capability token.

## 6.1 Token claims

A signed short-lived token should bind:

```text
companyId
paperclipRunId
julesSessionId when known
agentId
outcomeId
allowed operations
expiry
```

Allowed operations:

```text
read_run_context
report_progress
report_blocker
report_artifact
propose_workstream
request_approval
submit_completion_candidate
```

Explicitly forbidden:

```text
cross-company access
accept own outcome
merge PR
change budget
configure fleet
create arbitrary agents
approve external action
admin operations
```

## 6.2 Environment delivery

The repository may state only:

```text
PAPERCLIP_BASE_URL
credential env var name
```

Never store the token itself in Git.

If current Jules API/profile environment configuration cannot safely expose the token to an API-created task, implement the GitHub outbox fallback described below.

## 6.3 GitHub outbox fallback

Add a company convention such as:

```text
.founderos/outbox/<runId>/<eventId>.json
```

Jules can commit a structured event when direct callbacks are unavailable.

Paperclip reconciler reads only validated records belonging to the bound company/run, applies the event idempotently, then records consumption state.

Do not require a bearer secret in a Jules prompt.

---

# 7. P0 — Enrich the run context API

`GET /api/jules/v1/runs/:runId/context` should return the full assignment contract, not only repository/source IDs.

Required response fields:

```text
runId
company
agent
project
goal
outcome/issue
objective
inputs
requiredOutputs
acceptanceCriteria
cannotCompleteIf
requiredSkills
resolvedSupportPacks
requiredCapabilities
writeScope
externalActionPolicy
Linear mode/project ID
current approvals
relevant work products
current blockers
manager notes
```

Live context is authoritative for execution metadata.

Repo business evidence remains canonical for business state.

---

# 8. P0 — Callback promotion semantics

Store callback events, but also apply deliberate promotion rules.

## Progress

Create activity/update only when meaningful.

## Blocker

Map to Paperclip issue/outcome blocker state and wake the manager.

## Artifact

Register/update work product metadata.

## Proposal

Create a proposed workstream/project/issue requiring manager or operator acceptance rather than automatically creating arbitrary organizational work.

## Approval request

Create/attach a Paperclip approval object.

## Completion candidate

Transition remote session to `COMPLETED_UNVALIDATED` and start deterministic validation.

Never mark the business outcome accepted from the callback alone.

---

# 9. P0 — Deterministic acceptance validator

Create a validator service before Hermes judgment.

Suggested structure:

```text
server/src/services/founderos-validation/
├── index.ts
├── required-files.ts
├── github-checks.ts
├── firm.ts
├── schema.ts
├── evidence.ts
├── write-scope.ts
├── secret-scan.ts
└── types.ts
```

Validators should inspect the actual Jules PR branch / commit where possible.

Required validator classes:

## 9.1 Structural

```text
required files exist
expected paths only
JSON/YAML parse
resource manifests valid
identifier/company ownership matches
```

## 9.2 Git/CI

```text
PR exists when required
GitHub Actions/checks pass
base/source repository matches expected company
no unexpected repository target
```

## 9.3 Firm

```text
Firm workspace exists
firm build succeeds
required entity updates exist
```

## 9.4 Evidence

```text
required evidence record exists
quantitative claims include evidence/source IDs
missing evidence is not represented as proven
customer evidence comes from supplied/real records
```

## 9.5 Security

```text
no known secret values in changed files
no bearer/API keys in prompt-derived artifacts
no unauthorized external-action result claimed
```

## 9.6 Write scope

Changed files must fit the session's declared write scope unless explicitly approved.

Output:

```json
{
  "passed": [],
  "failed": [],
  "warnings": [],
  "hardFailure": false
}
```

Hermes cannot waive `hardFailure=true`.

---

# 10. P0/P1 — Implement the Hermes founder-manager service

Installing Hermes and exposing `hermes_local` is not sufficient.

Create a dedicated manager service with structured operations:

```text
triage
bundle
session_worthiness
plan_judge
result_judge
failure_diagnosis
next_best_action
retry_decision
```

Suggested path:

```text
server/src/services/founder-manager/
```

Each operation must:

1. receive a deterministic structured input;
2. invoke Hermes with the configured provider/model;
3. request structured JSON;
4. validate the result locally;
5. reject unknown verdicts/invalid IDs;
6. enforce hard deterministic policy after model output.

## 10.1 Result verdict schema

```text
ACCEPT
REVISE_SAME_SESSION
RETRY_NEW_SESSION
WAIT
ESCALATE
FAIL_OUTCOME
```

Required fields:

```text
verdict
confidence
reason
passed criteria
failed criteria
revision instructions
requiresHuman
```

## 10.2 Model configuration

Do not hard-code Claude as the FounderOS manager model.

Allow environment/provider configuration.

If `alias-fast` remains the preferred model, support it through Hermes' OpenAI-compatible provider configuration without putting endpoint/key values in repository files.

## 10.3 Bounded reasoning loop

Configure limits:

```text
max same-session revisions
max fresh-session retries
max manager decisions per outcome
max time/cost
```

Escalate instead of looping forever.

---

# 11. P0/P1 — Same-session revision controller

Use the existing Jules `sendMessage()` capability.

Flow:

```text
Jules terminal result
→ deterministic validation
→ Hermes: REVISE_SAME_SESSION
→ send targeted message to existing Jules session
→ mark revision requested
→ reconcile same session again
```

A same-session correction must not record a new Jules session start.

Create a fresh session only when:

```text
terminal failed session cannot continue
context is corrupted/stalled
plan is fundamentally incompatible
same-session revision budget exhausted
remote session is unrecoverable
```

Fresh retry must consume quota and record `retry_of` ancestry.

---

# 12. P0/P1 — Fix Firm architecture

The current Firm service must be refactored.

## 12.1 Remove the wrong default

Do not initialize company business state from:

```text
42futures/firm
```

That repository is the tool implementation, not every company's business graph.

## 12.2 Canonical workspace

For every imported company:

```text
<company repo>/firm/
```

is the Firm workspace.

Paperclip may cache:

```text
company repo
commit SHA
last verified Firm build
summary metadata
```

but GitHub remains the canonical state.

## 12.3 FounderOS Firm schemas

Company template/resource support must provide schemas/entities for at least:

```text
hypothesis
claim
evidence
experiment
customer_segment
problem
job_to_be_done
offer
value_proposition
competitor
market_estimate
assumption
decision
metric
validation_gate
```

And relationship/sales state:

```text
account
lead
contact
interaction
opportunity
channel
```

## 12.4 Jules environment

Ensure company repo setup makes Firm CLI available to Jules.

Every material business-state outcome must run:

```text
firm build before
firm build after
```

A failed build blocks completion.

---

# 13. P0/P1 — GitHub import becomes FounderOS bootstrap

Enhance company portability import.

For a GitHub import, persist the source repository/ref as canonical company workspace metadata.

After import:

```text
validate repo contract
→ bind company repo
→ resolve Jules Source(s)
→ verify profile access
→ inspect/ensure .founderos context
→ inspect Firm workspace
→ install/snapshot core support packs
→ create bootstrap goal/outcome
→ queue bootstrap for capacity broker
```

Do not silently create invented company content during bootstrap.

## 13.1 Expected company seed

At minimum:

```text
company/OVERVIEW.md or equivalent short overview
website/ or clearly identifiable landing page
```

The bootstrap worker compares the two and records disagreements as hypotheses/issues.

## 13.2 Company-create route

Paperclip may retain generic company creation for upstream compatibility, but FounderOS mode/UI should direct operators to GitHub import.

Remove the automatic upstream Firm initialization from ordinary company creation.

---

# 14. P1 — Company `.founderos` context bootstrap

Ensure every active company repo contains/version-controls:

```text
AGENTS.md
.founderos/JULES_CONTEXT.md
.founderos/PAPERCLIP_API.md
.founderos/TOOL_POLICY.md
.founderos/DEPLOYMENT_POLICY.md
.founderos/support/manifest.yaml
```

These files contain no secrets.

Paperclip should validate their version and report drift.

Repository context must clearly state:

```text
Paperclip controls organizational state/acceptance
Hermes reasons
Jules executes
Linear plans
Firm structures company state
GitHub is durable memory
market evidence rules
external action rules
```

---

# 15. P1 — Complete resource-pack system

Current DB/API resolution is useful. Add the actual content distribution system.

## 15.1 FounderOS source structure

In `JsonLord/FounderOS-DEMO` add/standardize:

```text
company-package/resources/
├── registry.yaml
├── validation/
├── customer-discovery/
├── market-analysis/
├── fake-door/
├── sales/
├── prospecting/
├── content/
├── search/
├── design/
├── finance/
├── business-plan/
├── pitch/
└── red-team/
```

Each pack should contain where applicable:

```text
RESOURCE.md
manifest.yaml
contract.yaml
layout/template
source guidance
examples
quality-gate.md
```

## 15.2 First required packs

### Core evidence discipline

- evidence classes;
- claim/source mapping;
- no fabricated traction;
- assumption handling.

### BPW pitch ten-step

Include:

```text
original source/reference where licensing permits
normalized slide layout
slide-contract.yaml
evidence-map rules
story coherence gate
quantitative claim gate
visual quality gate
```

### BPW business plan

Include required chapter structure, sustainability integration, evidence rules and rubric.

### BPW finance

Include three-year structure, year-one monthly requirements, P&L, investment/depreciation, liquidity, interest/repayment, scenarios and assumption provenance.

### Customer discovery

Include interview guide, past-behavior rules, coding/evidence extraction and interview-to-evidence example.

### Fake door

Include experiment contract, event taxonomy, Stitch guidance, Playwright QA, Render Static deployment policy, disclosure/ethics gate and Tinybird measurement map.

### Sales Second Brain

Include account/contact/interaction/opportunity model, objection taxonomy, commitment evidence, next-action rules and examples.

### Prospecting

Include waterfall sourcing/enrichment, provenance, ICP filtering and community/watering-hole policy.

### Content/creative

Include content-demand loop, trust flywheel, creative review, defect-specific revision and vanity-metric controls.

### Search demand

Include current-query/keyword research, intent, SERP checks, business-fit priority and evidence interpretation.

### Design judgment

Include aesthetic direction, preservation checks, distinctiveness audit and source/provenance separation.

### Red team

Include contradiction search, WTP, acquisition, retention, unit economics, platform/legal/technical blockers and BUILD/ITERATE/PIVOT/KILL decision contract.

## 15.3 Installation/versioning

Paperclip should be able to snapshot/install a pack into:

```text
.founderos/support/<pack path>/
```

Record exact:

```text
pack ID
version
FounderOS source repository
source commit
installed paths
file inventory
quality gates
```

Upgrades must be explicit and reproducible.

---

# 16. P1 — Goal Support Resolver becomes active orchestration input

The manager/session renderer must resolve goals before dispatch.

Required session inputs:

```text
requiredSkills
supportPacks
requiredCapabilities
inputPaths
outputPaths
acceptanceCriteria
cannotCompleteIf
```

Required packs missing:

```text
→ BLOCK dispatch
→ surface actionable missing-support status
```

Optional pack missing:

```text
→ warn, continue if goal permits
```

Add UI showing:

```text
resolved packs
versions
source commits
missing packs
required capabilities
```

---

# 17. P1 — Migrate FounderOS-DEMO to Jules/Hermes model

The current validation branch still defines `claude_local` agents.

Before importing it into the adapted Paperclip runtime:

- merge/rebase PR #4;
- migrate substantial execution roles to `jules`;
- keep only explicit supervisory/manager roles on `hermes_local` where needed;
- eliminate required local coding CLI assumptions;
- add versioned goal/resource-pack definitions;
- add `.founderos` company template files;
- add Firm schemas/template;
- preserve the transcript/BPW provenance already created.

Alternative compatibility path:

Paperclip import may migrate known FounderOS legacy adapter types to Jules during import, but this must be explicit and reported, not silent generic mutation.

---

# 18. P1 — Linear execution-planning integration

Linear remains a Jules-side planning tool, not Paperclip's canonical state.

## 18.1 Session contract

Hermes should choose:

```text
NONE
CREATE_PROJECT
CONTINUE_PROJECT
```

based on outcome complexity.

The current generated Jules spec must stop forcing `NONE` universally.

## 18.2 Mapping

Persist when relevant:

```text
Paperclip outcome ↔ Linear project
Jules session ↔ Linear project/workstream
```

## 18.3 Promotion rules

Only promote:

```text
meaningful blocker
approval requirement
major milestone
strategic workstream
completion candidate
```

Do not mirror every Linear issue into Paperclip.

## 18.4 Webhook/event follow-up

If Linear webhook access is implemented later, events should wake Paperclip only when they change promoted organizational state.

---

# 19. P1 — Jules capability/readiness registry

Paperclip already stores arbitrary profile capabilities. Make readiness operational.

Baseline capability names:

```text
firm
context7
stitch
tinybird
linear
playwright
github_actions
render_static
huggingface_spaces
```

For each Jules profile/company source track:

```text
configured
verified
last_verified_at
status
notes/error
```

Because Jules MCP configuration is profile-specific and not necessarily manageable through its REST API, allow manual verification state where API verification is impossible.

Dispatch must fail before consuming a session start when a required capability is known unavailable.

---

# 20. P1 — Tinybird experiment integration

Tinybird is measurement infrastructure only.

Define a standard validation event contract, e.g.:

```text
page_view
pricing_view
cta_click
signup_start
signup_complete
booking_click
payment_intent
experiment_exposure
```

Company fake-door packs may extend it.

Required flow:

```text
website event
→ Tinybird
→ query/experiment result
→ evidence/experiments/EXP-*.yaml
→ Firm evidence entity
→ Git commit/PR
```

Important business conclusions must be materialized into GitHub/Firm.

Add threshold/event wakeups where useful:

```text
minimum exposures reached
conversion threshold reached
experiment deadline reached
```

These events wake the manager instead of continuously spending Jules sessions.

---

# 21. P1 — Stitch + frontend verification

For design/frontend outcomes:

```text
validated offer/requirements
→ Stitch design context
→ Jules implementation
→ Playwright rendered verification
→ GitHub Actions
→ deployment
```

The goal/resource pack must define visual acceptance rules.

Design quality never counts as market validation.

The design resource pack should include the previously adopted transferable judgment rules:

```text
aesthetic direction before implementation
mechanical review
preservation checks
conflict preservation
distinctiveness audit
source/provenance
```

---

# 22. P1 — Deployment action layer

Implement deployment as controlled actions, not prompt suggestions only.

## 22.1 Render Static

Allowed only for:

```text
landing_page
fake_door
campaign_page
static_waitlist
```

Reject dynamic services.

## 22.2 Hugging Face Spaces

Use for:

```text
api
web_application
worker
agent_service
dashboard
prototype_backend
```

Jules prepares code/config.

Paperclip holds deployment credential, approval state, action audit and result.

## 22.3 Paperclip itself on HF

Production runtime must support:

```text
Space-compatible port/config
persistent Paperclip control-plane storage
HF secrets
restart reconciliation
health endpoint
private/authorized manager services
```

Do not rely on ephemeral Hermes/Jules local conversational memory.

---

# 23. P1/P2 — External action gateway

Create a normalized action request model:

```text
action type
company
run/outcome
payload
risk class
required approval
idempotency key
executor
result
external reference
audit trail
```

Candidate controlled executors over time:

```text
outreach/draft
outreach/send
calendar/create
crm/update
payment/deposit
static deploy
HF deploy
browser action
account registration
publishing
```

High-impact actions cannot be approved only by Hermes.

Check current platform/community rules before commercial side effects.

---

# 24. P2 — Business Second Brain

Implement the broader business memory on top of Firm + GitHub.

Required durable concepts:

```text
company
strategy
objectives
decisions
hypotheses
claims
evidence
experiments
channels
offers
customers
projects
artifacts
```

Rules:

- GitHub/Firm is durable memory.
- Hermes/Jules conversation is a cache.
- Every important conclusion has provenance.
- Canonical summaries compile from lower-level evidence/state.

Suggested generated views:

```text
CLAIM_EVIDENCE_LEDGER.md
ASSUMPTION_REGISTER.md
DECISION_LOG.md
VALIDATION_PIPELINE.md
```

---

# 25. P2 — Sales Second Brain

Add reusable Firm/resource contracts for:

```text
account
lead
contact
interaction
objection
opportunity
commitment
next_action
```

Customer/sales interactions should preserve:

```text
source
when
who
what happened
customer language
objections
commitment strength
next action
evidence IDs
```

Use past interactions to inform later outreach and offers.

Do not treat AI-written sales notes as customer evidence unless they are grounded in an actual interaction source.

---

# 26. P2 — Prospecting intelligence loop

Implement/support through goals/resource packs:

```text
ICP criteria
→ waterfall company sourcing
→ waterfall contact enrichment
→ provenance/dedupe
→ qualification
→ prioritized prospect universe
→ diagnostic outreach request
```

No single provider is canonical.

Preserve source provenance.

Private/sensitive data collection remains constrained by policy.

---

# 27. P2 — Customer discovery loop

Standard outcome:

```text
prepare interview
→ authorized real conversation
→ raw transcript/notes
→ evidence extraction
→ contradictions
→ Firm interactions/problem/JTBD updates
→ updated offer/experiment recommendation
```

Rules:

```text
past behavior > hypothetical future intent
real interview > synthetic interview
synthetic persona = hypothesis generator only
quotes retain provenance
```

---

# 28. P2 — Offer / sample-first / fake-door chain

Support the explicit dependency chain:

```text
ICP/avatar evidence
→ problem/JTBD
→ offer
→ sample/prototype
→ landing/fake door
→ distribution
→ behavior
→ conversation
→ commitment
```

Do not skip from idea directly to full product.

Use sample-first delivery where it can validate usefulness more cheaply than software development.

---

# 29. P2 — Content demand and creative loops

Resource/system packs should support:

```text
customer insight/evidence
→ content hypothesis
→ channel-specific content
→ quality/creative review
→ distribution
→ meaningful response
→ conversation/demand evidence
→ updated offer/content
```

Do not optimize likes/impressions in isolation.

Creative review must inspect actual output and produce defect-specific revisions.

---

# 30. P2 — Search demand intelligence

Implement as optional validation support:

```text
first-party query data when available
keyword/query research
intent
SERP inspection when ambiguous
business fit
trend/CPC/difficulty where sourced
landing/offer implication
experiment
```

Never invent search metrics.

Search demand is evidence of interest, not automatically willingness to pay.

---

# 31. P2 — Browser capability routing

Keep browser automation optional and controlled.

Routing rule:

```text
plain HTTP/API/search sufficient
→ do not open browser

interaction/login/JS rendering required
→ browser capability
```

Rules:

```text
no captcha/bypass objective
safe login handling
serialize shared browser state unless isolated
verify consequential page actions
external side effects require policy/approval
```

---

# 32. P2 — BPW business-plan compiler

Create goal/resource workflow producing an evidence-backed business plan with:

```text
Executive Summary
Product / Service
Founding Team
Market Analysis
Marketing
Company / Organisation
Financing / Financial Planning
```

Integrate sustainability throughout.

Every major factual/quantitative claim must trace to source/evidence or labelled scenario/assumption.

Business plan is downstream synthesis, not a source of new facts.

---

# 33. P2 — Financial case

Support:

```text
3 years
Year 1 monthly
P&L
investment/depreciation
liquidity
interest/repayment
scenario analysis
unit economics
```

Every model input is one of:

```text
validated evidence
external source
calculated estimate
explicit assumption/scenario
```

Do not hide assumptions behind model formulas.

---

# 34. P2 — Pitch compiler

Add the goal-specific BPW ten-step pitch resource pack.

Required sequence:

```text
1 Mission
2 Problem
3 Solution
3B Defensibility
4 Competition
5 Market
6 Metrics / validation
7 Business model
8 Go-to-market
9 Team
10 Status / future / ask
```

Required artifacts:

```text
pitch deck
pitch evidence map
source/resource provenance
```

Completion gates:

```text
coherent story
matches current business case
all quantitative/traction claims mapped to evidence
no invented social proof
visual layout follows selected pitch resource
```

The pitch layout/resource belongs in FounderOS content, not hard-coded Paperclip source.

---

# 35. P2 — Red-team final gate

Before READY_TO_BUILD, evaluate:

```text
problem evidence
ICP narrowness/reachability
WTP/commitment
acquisition repeatability
concierge delivery
retention/repeat
unit economics
contradictory evidence
legal/platform blockers
technical blockers
customer concentration
assumption fragility
```

Output:

```text
BUILD / READY_TO_BUILD
ITERATE / CONTINUE_VALIDATION
PIVOT
KILL
```

Hermes interprets the compiled evidence; hard missing gates cannot be waived.

---

# 36. P1/P2 — WAITING_FOR_MARKET and event-driven execution

Add explicit state:

```text
WAITING_FOR_MARKET
```

A company waiting for:

```text
customer reply
interview
fake-door traffic
payment decision
pilot usage
retention interval
```

should consume zero Jules sessions by default.

Wake from:

```text
callback
Linear promoted event
GitHub event
Tinybird threshold
external action result
scheduled review
manual operator event
```

This is essential for supporting many companies under the Jules task quota.

---

# 37. P1 — Profile health and source readiness

Add active verification workflows for:

```text
Jules API auth
Jules Source availability
company repo access
required MCP/profile capabilities
Paperclip callback credential availability
profile quota rejection
recent remote failures
```

Profile statuses:

```text
ACTIVE
DEGRADED
QUOTA_EXHAUSTED
AUTH_REQUIRED
SOURCE_ACCESS_MISSING
COOLDOWN
DISABLED
```

A degraded profile should stop receiving new sessions while existing sessions continue reconciliation.

---

# 38. P1 — UI/operator surfaces

Add operator views for:

## Jules Fleet

```text
profile
health
rolling starts used/remaining
active sessions
capabilities
source access
reserve
recent failures
```

## Company Execution

```text
current outcome
Jules session
profile
remote state
PR
write scope
Linear project
validation status
Hermes verdict
retry ancestry
```

## Resource Packs

```text
installed packs
versions
source commits
missing required packs
drift/update available
```

## Waiting / approvals

```text
WAITING_FOR_MARKET reason
pending plan approval
pending external-action approval
pending human escalation
```

---

# 39. P0/P1 — Security tests

Automated coverage must prove:

```text
profile API keys are never logged
remote callback token cannot cross company
remote callback token cannot accept own outcome
Jules prompt never contains secret values
resource pack manifests cannot escape installed path
write-scope leases prevent overlapping unsafe edits
Jules PR URL parser accepts only expected GitHub repo/PR
external side-effect action cannot execute without required approval
```

Add secret-redaction fixtures for all selected providers.

---

# 40. P0/P1 — End-to-end Jules tests

Unit tests are insufficient.

Build mock-server/integration scenarios for:

```text
create session
QUEUED → PLANNING → IN_PROGRESS → COMPLETED
AWAITING_PLAN_APPROVAL
AWAITING_USER_FEEDBACK
FAILED
process restart mid-session
same-session correction
fresh retry
PR output parsing
no duplicate remote session after restart
rolling quota release/aging
profile degraded and rerouted
callback duplicate event
```

Also test that a nonterminal remote session does not cause business outcome acceptance or issue release.

---

# 41. Cross-repo delivery sequence

Recommended order:

## Phase A — Make remote execution correct

1. Jules REST correctness.
2. Async session service/reconciler.
3. DB-backed capacity broker.
4. profile secret/source resolution.
5. write leases.
6. scoped callback auth.

## Phase B — Make outcomes trustworthy

1. deterministic validators.
2. Hermes manager service.
3. plan/result judgment.
4. same-session revision.
5. bounded retries.

## Phase C — Make company import autonomous

1. GitHub binding from import.
2. company `.founderos` bootstrap.
3. Firm redesign.
4. bootstrap goal.
5. support-pack installation.

## Phase D — Bring FounderOS content online

1. merge/migrate FounderOS-DEMO PR #4.
2. migrate `claude_local` roles.
3. build resources registry.
4. BPW/pitch/finance packs.
5. discovery/sales/prospecting/fake-door/content/search/design/red-team packs.

## Phase E — External capabilities

1. Linear.
2. Context7/Stitch readiness.
3. Tinybird.
4. Render Static.
5. Hugging Face deployment.
6. controlled external action gateway.

## Phase F — Scale operating loops

1. Business Second Brain.
2. Sales Second Brain.
3. prospecting intelligence.
4. customer discovery.
5. content/creative/search loops.
6. WAITING_FOR_MARKET/event wakeups.
7. BPW business case + final red-team gate.

---

# 42. Definition of done for the whole adaptation project

The adaptation is not complete merely when Jules can create a PR.

It is complete when this scenario works without manual glue:

```text
1. Operator imports a GitHub company repo containing a landing page + short overview.

2. Paperclip automatically:
   - binds the repo,
   - resolves eligible Jules profiles/sources,
   - verifies core capabilities,
   - validates/bootstrap .founderos context,
   - validates Firm workspace,
   - installs versioned core support packs,
   - creates the first evidence-first outcome.

3. Hermes decides the next valuable outcome and whether work should be bundled or wait for market evidence.

4. Capacity Broker selects an eligible Jules profile while respecting:
   - rolling starts,
   - concurrency,
   - reserve,
   - source access,
   - capabilities,
   - company fairness,
   - write scopes.

5. Jules executes remotely in the company repo and may use Linear, Stitch, Context7, Tinybird and local Firm/Playwright according to the outcome.

6. Jules reports progress/blockers/approvals/completion through a scoped channel.

7. Paperclip survives a restart and reconciles the same remote session without duplication.

8. Completion triggers deterministic validation.

9. Hermes judges only after deterministic checks.

10. Weak quality causes targeted same-session correction first.

11. External actions pass through approval/action governance.

12. Real market events update GitHub/Firm evidence and wake the company.

13. The company can remain WAITING_FOR_MARKET without burning Jules quota.

14. The validation sequence advances through research, prospects, conversations, demand, commitment, delivery, retention and economics.

15. Business Second Brain and Sales Second Brain remain reconstructible from GitHub/Firm rather than model memory.

16. Business plan, finance model and pitch compile from evidence-backed company state using versioned resource packs.

17. Red Team produces BUILD / ITERATE / PIVOT / KILL based on the evidence ledger.
```

Only then is FounderOS operating as the system designed in the adaptation project.

---

# 43. Codex implementation rule

For every remaining feature, Codex should distinguish four layers:

```text
1. deterministic control-plane mechanism
2. model/agent reasoning contract
3. repo-local support/resource content
4. acceptance test proving the outcome
```

Do not implement a feature only as prompt prose if it requires control-plane enforcement.

Do not implement business methodology directly in Paperclip if it belongs in FounderOS resource packs.

Do not treat an existing DB table or type as proof that the workflow using it is complete.

The governing principle remains:

> Paperclip controls. Hermes reasons. Jules works. Linear plans. Firm structures. GitHub remembers. Evidence decides.

---

# 44. P1/P2 — FounderOS business application layer

The adaptation must not stop at Jules orchestration. Jules is only the execution substrate. FounderOS needs an explicit business application layer that turns validated company state into repeatable operating systems, goals, resource-backed artifacts and real market actions.

Use this conceptual stack:

```text
1. BUSINESS MEMORY
   Business Second Brain
   Sales Second Brain
   Firm
   Evidence / claims / assumptions / decisions

2. OPERATING SYSTEMS
   Market validation
   Customer discovery
   Prospecting
   Sales
   Offer creation
   Content and distribution
   Campaign management
   Crowdfunding launch
   Finance
   Business planning
   Pitching
   Red team

3. SKILLS + RESOURCE PACKS
   Methods, layouts, templates, examples, rubrics,
   source guidance, channel rules, quality gates

4. GOALS
   Evidence-oriented outcomes with explicit inputs,
   outputs, required support and completion gates

5. EXECUTION
   Hermes → Paperclip → Jules → tools
```

Canonical distinction:

```text
SYSTEM        = long-running business loop
SKILL         = how to reason or perform a method
RESOURCE PACK = concrete template/layout/example/reference
GOAL          = desired business outcome
ARTIFACT      = tangible result
EVIDENCE      = what reality told the company
WORKER        = Jules or another approved executor used to achieve the goal
```

Codex must preserve this distinction in data structures and file organization. A skill is not a goal, a template is not evidence, and a produced artifact is not validation simply because it exists.

---

# 45. P1/P2 — Standard business systems catalog

FounderOS should expose a first-class catalog of business systems. Each system defines its durable loop, allowed goal types, required state, output families and evidence feedback path.

Minimum systems:

| System | Main inputs | Typical outputs |
|---|---|---|
| Venture Intelligence | overview, landing page, research | venture thesis, assumption register, validation map |
| Market Intelligence | external research, search data | market analysis, competitor map, TAM/SAM/SOM |
| Customer Discovery | interviews, calls, observation | problem report, JTBD, ICP, customer language |
| Offer Engine | ICP + problem evidence | value proposition, offer variants, pricing hypotheses |
| Business Model Engine | validated offer, channels, economics | Business Model Canvas |
| Sales Second Brain | prospects, interactions, calls | accounts, objections, opportunities, next actions |
| Prospecting Engine | ICP | prospect universe, contact strategy, watering holes |
| Fake-Door Engine | offer hypothesis | landing page, experiment, analytics plan |
| Content Engine | evidence + positioning | social posts, articles, email, video scripts |
| Campaign Engine | content + offer + audience | campaign plan, variants, publishing schedule |
| Crowdfunding Engine | validated product + audience | Kickstarter/crowdfunding campaign package |
| GTM Engine | channel and experiment evidence | GTM plan, acquisition experiments |
| Financial Case | validated assumptions | financial plan, scenarios, unit economics |
| Business Plan Compiler | canonical company state | complete business plan |
| Pitch Compiler | canonical business case | pitch deck + evidence map |
| Red Team | whole evidence graph | BUILD / ITERATE / PIVOT / KILL |

System definitions belong in FounderOS content, for example:

```text
company-package/systems/
```

Paperclip only needs enough metadata to understand dependencies, wake conditions, eligible goals and completion state.

---

# 46. P1 — FounderOS Goal Library

Create a reusable goal library in `JsonLord/FounderOS-DEMO` rather than encoding business outcomes only as hard-coded Jules templates.

Recommended structure:

```text
company-package/goals/
├── validation/
│   ├── validate-market.yaml
│   ├── validate-problem.yaml
│   ├── validate-icp.yaml
│   ├── validate-offer.yaml
│   └── validate-demand.yaml
├── sales/
│   ├── build-prospect-universe.yaml
│   ├── run-discovery.yaml
│   ├── synthesize-sales-calls.yaml
│   └── validate-wtp.yaml
├── content/
│   ├── define-content-strategy.yaml
│   ├── derive-content-pillars.yaml
│   ├── create-content-campaign.yaml
│   ├── produce-content-package.yaml
│   └── measure-content-demand.yaml
├── crowdfunding/
│   ├── assess-crowdfunding-fit.yaml
│   ├── prepare-kickstarter.yaml
│   ├── build-kickstarter-campaign.yaml
│   ├── prepare-kickstarter-prelaunch.yaml
│   └── optimize-kickstarter-campaign.yaml
├── business-case/
│   ├── compile-bmc.yaml
│   ├── compile-business-plan.yaml
│   ├── compile-financial-case.yaml
│   └── compile-pitch.yaml
└── governance/
    └── red-team-build-decision.yaml
```

Every goal definition should support at least:

```text
id
system
objective
ownerRole
requiredSkills
supportPacks
requiredCapabilities
inputPaths
outputPaths
acceptanceCriteria
cannotCompleteIf
externalActionPolicy
writeScope
wakeConditions
nextGoalHints
```

Hermes should choose from this goal catalog based on current company state rather than inventing arbitrary goal types whenever possible.

---

# 47. P1/P2 — Business Model Canvas compiler

The Business Model Canvas should be a compiled evidence-backed view, not a one-off generated document.

Create a goal equivalent to:

```yaml
id: compile-business-model-canvas
system: business-model
objective: >
  Compile the current evidence-backed business model from canonical company state.
requiredSkills:
  - business-model-canvas-design
  - jobs-to-be-done
  - value-proposition-design
  - bpw-business-model-canvas
  - bpw-evidence-and-source-discipline
supportPacks:
  - bmc.standard
  - bpw.bmc
inputs:
  - firm/**
  - evidence/**
  - business-case/CUSTOMER_PROBLEM_REPORT.md
  - business-case/MARKET_ANALYSIS.md
  - business-case/ECONOMICS.md
outputs:
  - business-case/BUSINESS_MODEL_CANVAS.md
  - business-case/BUSINESS_MODEL_CANVAS.yaml
acceptanceCriteria:
  - all nine blocks are present
  - each block carries confidence/evidence status
  - material claims map to evidence
  - unresolved assumptions remain explicit
  - customer segments express JTBD where supported
  - revenues and costs agree with the financial case
```

Create BMC resources such as:

```text
resources/business-model/bmc/
├── RESOURCE.md
├── manifest.yaml
├── canvas-contract.yaml
├── block-guidance.md
├── evidence-map.md
├── layout.md
├── examples/
└── quality-gate.md
```

The BMC may synthesize existing company state but may not silently create missing market facts.

---

# 48. P1/P2 — Business Plan compiler as a derived company view

The business plan must behave as a compiler over canonical company state.

Required dependency graph:

```text
Firm
+
evidence
+
BMC
+
market analysis
+
financial case
+
GTM
+
team information
        ↓
BUSINESS PLAN COMPILER
        ↓
Executive Summary
Product / Service
Founding Team
Market Analysis
Marketing
Company / Organisation
Financing / Financial Planning
Sustainability integration
```

Recommended resource structure:

```text
resources/business-plan/bpw/
├── RESOURCE.md
├── manifest.yaml
├── chapter-contract.yaml
├── required-evidence.yaml
├── sustainability-guide.md
├── evaluation-rubric.md
├── layout.md
└── examples/
```

Each chapter should define:

```text
required inputs
permitted assumptions
required source/evidence mapping
minimum completeness
cross-chapter consistency checks
quality gates
```

The business plan is downstream synthesis. It is never a source of new evidence merely because a model wrote it.

---

# 49. P1/P2 — Pitch compiler and presentation support

Extend the existing pitch compiler into a resource-backed presentation system.

Keep the evidence-first ten-step sequence, but add actual layout and presentation support:

```text
resources/pitch/bpw-10-step/
├── RESOURCE.md
├── manifest.yaml
├── source/
├── slide-contract.yaml
├── layout.md
├── visual-patterns.md
├── chart-guidance.md
├── evidence-map.md
├── examples/
└── quality-gate.md
```

Responsibility split:

```text
Firm/evidence/business case
→ decide what is true and supportable

Pitch compiler
→ decide story sequence and claim selection

Pitch resource pack
→ define required slide structure/layout guidance

Stitch/design tooling
→ assist visual implementation

Design judgment pack
→ review actual presentation quality
```

Stitch must not decide which traction or market claims are true.

Required goal outputs should include at least:

```text
pitch/PITCH_DECK.*
pitch/PITCH_EVIDENCE_MAP.md
pitch/SOURCE_PROVENANCE.md
```

---

# 50. P1/P2 — Crowdfunding / Kickstarter operating system

Add a first-class crowdfunding operating system. Do not model crowdfunding as merely "write Kickstarter copy."

End-to-end loop:

```text
validated problem
→ validated audience
→ product/offer
→ campaign economics
→ campaign story
→ reward structure
→ campaign page
→ launch assets
→ pre-launch audience
→ approved publication
→ launch
→ campaign updates/community
→ conversion and pledge evidence
→ revised campaign/company state
```

## 50.1 Kickstarter/crowdfunding resource pack

Create:

```text
resources/crowdfunding/kickstarter/
├── RESOURCE.md
├── manifest.yaml
├── campaign-page-contract.yaml
├── campaign-story-framework.md
├── reward-tier-framework.md
├── faq-template.md
├── risk-disclosure-guide.md
├── visual-shot-list.md
├── campaign-video-structure.md
├── prelaunch-checklist.md
├── launch-calendar.yaml
├── update-template.md
├── social-launch-sequence.md
├── email-launch-sequence.md
├── evidence-map.md
└── quality-gate.md
```

Do not hard-code current Kickstarter platform rules into permanent resource prose where they can become stale. Separate durable campaign methodology from a current-platform-readiness check that must verify live rules before account creation, publishing, promotion, reward claims or other side effects.

## 50.2 Crowdfunding goals

Minimum goals:

```text
assess-crowdfunding-fit
prepare-kickstarter-case
build-kickstarter-campaign
prepare-kickstarter-prelaunch
produce-kickstarter-assets
prepare-kickstarter-launch-content
launch-kickstarter-campaign
measure-kickstarter-campaign
optimize-kickstarter-campaign
```

`assess-crowdfunding-fit` must be able to conclude that Kickstarter/crowdfunding is not currently justified.

## 50.3 Campaign outputs

Recommended company-repo outputs:

```text
campaign/
├── KICKSTARTER_PAGE.md
├── CAMPAIGN_STORY.md
├── REWARD_TIERS.yaml
├── FAQ.md
├── RISKS_AND_CHALLENGES.md
├── VIDEO_SCRIPT.md
├── SHOT_LIST.md
├── PRELAUNCH_PLAN.md
├── LAUNCH_CALENDAR.md
├── EMAIL_SEQUENCE.md
├── SOCIAL_CONTENT/
└── EVIDENCE_MAP.md
```

All product capabilities, delivery dates, manufacturing claims, backer counts, traction claims, testimonials and social proof must map to evidence or remain explicitly hypothetical.

Account creation, publishing, paid promotion, payment configuration and other consequential side effects remain governed by Paperclip approval/action policy.

---

# 51. P1/P2 — Content & Distribution OS for social media

Turn the existing content-demand and creative loops into a complete content operating system.

Core loop:

```text
COMPANY EVIDENCE
      ↓
CONTENT STRATEGY
      ↓
CONTENT PILLARS
      ↓
CAMPAIGNS
      ↓
CONTENT ATOMS
      ↓
CHANNEL ADAPTATION
      ↓
CREATIVE REVIEW
      ↓
APPROVAL
      ↓
PUBLISH
      ↓
MEASURE
      ↓
LEARN
      ↓
updated evidence / offer / content strategy
```

Minimum goals:

```text
define-content-strategy
derive-content-pillars
create-content-campaign
produce-content-package
adapt-content-to-channel
review-creative
schedule-content
publish-content
measure-content-demand
update-content-strategy
```

Publishing is a governed external action. Drafting, adaptation and review may run autonomously when policy allows.

---

# 52. P1/P2 — Channel-specific social resource packs

Create platform/channel support packs rather than one generic social prompt.

Recommended structure:

```text
resources/content/
├── core/
│   ├── RESOURCE.md
│   ├── trust-flywheel.md
│   ├── evidence-to-content.md
│   ├── hook-framework.md
│   ├── cta-framework.md
│   ├── campaign-contract.yaml
│   └── creative-quality-gate.md
├── linkedin/
├── instagram/
├── tiktok/
├── youtube/
├── x/
├── reddit/
├── email/
└── kickstarter/
```

Each channel pack should distinguish durable communication principles from current platform constraints and define where applicable:

```text
format
length/range guidance
hook style
visual conventions
CTA patterns
cadence guidance
platform restrictions
examples
quality gates
analytics interpretation
current-rule verification requirements before publishing
```

One validated insight may be atomized into several assets, for example:

```text
customer insight
→ LinkedIn post
→ X thread + short posts
→ Instagram carousel + captions
→ TikTok/Reel script
→ YouTube Short script
→ newsletter section
→ Kickstarter campaign update
```

However, channel versions must be adapted to the medium rather than copied mechanically.

---

# 53. P1/P2 — Campaign goals must optimize business learning, not output volume

A campaign is an outcome contract, not a request for a number of posts.

Recommended campaign contract:

```yaml
objective: >
  Determine whether segment X responds to problem Y and offer Z.
hypothesis: "..."
audience: "..."
offer: "..."
content:
  - posts
  - creatives
  - landing variants
  - email sequence
channels:
  - instagram
  - linkedin
  - reddit
metrics:
  - qualified_clicks
  - replies
  - signups
  - bookings
  - commercial_commitments
decisionRules:
  - continue
  - revise
  - stop
```

Do not treat "20 posts produced" as campaign success.

Campaign completion should answer a business question and write the measured result back into evidence/Firm.

---

# 54. P1/P2 — Sales output system on top of Sales Second Brain

The Sales Second Brain must actively drive sales goals and artifacts rather than only retaining notes.

Minimum sales goals:

```text
build-prospect-universe
qualify-prospects
prepare-outreach-sequence
run-diagnostic-outreach
prepare-discovery-calls
synthesize-sales-calls
identify-objection-patterns
prepare-offer-followup
seek-commercial-commitment
update-opportunity-state
```

Recommended outputs:

```text
sales/
├── ICP.md
├── PROSPECT_UNIVERSE.*
├── OUTREACH_SEQUENCE.md
├── DISCOVERY_CALL_GUIDE.md
├── OBJECTION_LIBRARY.md
├── FOLLOWUP_LIBRARY.md
├── OPPORTUNITY_SUMMARY.md
└── SALES_EVIDENCE_REPORT.md
```

Actual outreach sends, calls, payment/deposit actions or account mutations remain controlled external actions. Preparation and synthesis may be autonomous when allowed.

Sales conclusions must preserve their source interaction. AI-written notes derived from no actual customer interaction are not customer evidence.

---

# 55. P1/P2 — Offer Engine and evidence-to-output chain

Make the previously defined avatar/ICP → problem → offer → landing-page dependency chain a formal system dependency graph.

```text
customer/ICP evidence
      ↓
problem + JTBD
      ↓
value proposition
      ↓
offer variants
      ↓
sample/prototype where useful
      ↓
landing/fake door
      ↓
channel/campaign distribution
      ↓
behavior
      ↓
conversation
      ↓
commercial commitment
      ↓
delivery / repeat / economics
```

Derived outputs such as BMC, business plan, pitch and crowdfunding campaign should reference this same canonical offer/evidence state instead of maintaining independent versions of the company's proposition.

When upstream evidence changes materially, Paperclip/Hermes should identify downstream artifacts that are stale and propose recompilation rather than silently leaving contradictory documents in the repo.

---

# 56. P1/P2 — Resource-pack taxonomy for the business application layer

Extend the resource registry to cover the complete business application layer.

Target FounderOS source tree:

```text
company-package/resources/
├── registry.yaml
├── core/
│   ├── evidence-discipline/
│   ├── goal-contracts/
│   └── governance/
├── validation/
├── market-analysis/
├── customer-discovery/
├── business-model/
├── offers/
├── fake-door/
├── sales/
├── prospecting/
├── content/
├── campaigns/
├── crowdfunding/
├── search/
├── design/
├── finance/
├── business-plan/
├── pitch/
└── red-team/
```

Every pack should contain only what is needed for its domain and may include:

```text
RESOURCE.md
manifest.yaml
contract.yaml
layout.md or template
source/
examples/
evidence-map.md
quality-gate.md
```

Resource packs should support versioning and explicit upgrades. A company artifact must be traceable to the resource-pack version/source commit used to produce it.

---

# 57. P1/P2 — Goal Support Resolver must compose the business stack

The Goal Support Resolver should return the smallest complete support bundle for the current outcome.

Example pitch resolution:

```text
goal: compile-pitch
      ↓
role: pitch-agent
      ↓
skills:
  bpw-pitch-deck-10-step
  pitch-storytelling
  bpw-evidence-and-source-discipline
      ↓
support:
  pitch.bpw-10-step
  design.judgment
      ↓
capabilities:
  firm
  stitch when presentation implementation needs it
      ↓
inputs:
  business-case/**
  evidence/**
  firm/**
      ↓
acceptance gates
```

Example content resolution:

```text
goal: produce-content-package
      ↓
content strategy + target channel
      ↓
core content pack
+ selected channel pack
+ campaign contract
+ creative review pack
```

Do not inject the entire FounderOS library into every Jules session.

---

# 58. P1/P2 — External-action mapping for content and crowdfunding

The business application layer must clearly distinguish preparation from side effects.

Examples:

```text
Draft Kickstarter page                 → autonomous/reviewable artifact
Create reward-tier proposal            → autonomous/reviewable artifact
Create Instagram post                  → autonomous/reviewable artifact
Create outreach sequence               → autonomous/reviewable artifact

Publish Kickstarter campaign           → external action / approval
Create or change Kickstarter account   → external action / approval
Publish social post                    → external action / approval or preauthorization
Spend ad budget                        → external action / approval
Send outreach                          → external action / approval or scoped preauthorization
Configure payment/deposit collection   → external action / approval
```

Before platform-specific publication/account automation, verify current platform terms, promotion rules and automation constraints.

Audience presence never implies commercial permission, and commercial permission never proves channel conversion.

---

# 59. P2 — Cross-system feedback and stale-artifact management

FounderOS should treat major outputs as derived views with dependency metadata.

Examples:

```text
new customer interviews
→ Customer Problem Report may become stale
→ Offer may become stale
→ BMC may become stale
→ business plan sections may become stale
→ pitch may become stale
→ Kickstarter positioning/content may become stale

new price/WTP evidence
→ economics may become stale
→ BMC revenue block may become stale
→ financial case may become stale
→ pitch business-model slide may become stale
→ crowdfunding reward tiers may become stale
```

Record for important compiled artifacts:

```text
source commit
input artifact/evidence IDs
resource-pack versions
compiler goal ID
produced commit/PR
last validated at
staleness reason when invalidated
```

Hermes may recommend recompilation; Paperclip tracks the deterministic dependency/staleness relationship.

---

# 60. P1/P2 — Business application definition of done

The business application layer is complete only when the following works without ad-hoc prompting:

```text
1. A company has canonical GitHub/Firm business state and evidence.

2. Hermes can select a registered FounderOS goal rather than inventing an unstructured task.

3. Goal Support Resolver supplies the exact skills, resource packs, capabilities, input paths and gates for that goal.

4. Jules can produce, through standard goals:
   - an evidence-backed BMC,
   - an evidence-backed business plan,
   - a financial case,
   - a pitch deck with evidence map,
   - a prospecting/sales package,
   - a content strategy and channel-specific social assets,
   - campaign packages tied to measurable business hypotheses,
   - a crowdfunding/Kickstarter campaign package when justified.

5. Every output can be traced to canonical input state and versioned support resources.

6. Outputs do not silently become evidence.

7. Publishing, outreach, account changes, payments and spend route through external-action governance.

8. Real market results feed back into evidence/Firm and may invalidate downstream outputs.

9. Stale derived artifacts are detected and proposed for recompilation.

10. The system can conclude that a planned artifact or campaign should not be produced because prerequisite evidence is insufficient.
```

The governing product principle is:

> FounderOS does not exist to generate business documents. It exists to turn evidence into business decisions, business decisions into goal-oriented execution, and execution back into stronger evidence.
