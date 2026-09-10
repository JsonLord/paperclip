# FounderOS / Paperclip Jules Control-Plane Specification

Status: implementation specification for Codex

Target repository: `JsonLord/paperclip`

Primary objective: adapt Paperclip into the control plane for a validation-first Founder OS where companies are imported from GitHub, Jules is the remote execution plane, OpenCode + `alias-fast` is the managerial reasoning layer, Firm is the structured business-as-code layer inside each company repository, Linear is the execution-planning layer for Jules, and GitHub remains the canonical durable company workspace.

This document captures the architectural decisions, constraints, operating rules, implementation direction, and the rationale behind them. It is intentionally detailed enough that Codex can implement incrementally without needing the preceding design conversation.

---

## 1. Core operating model

The system is designed to turn an unproven product idea into an evidence-backed business opportunity using the cheapest useful experiments first. It must not equate AI-generated output, completed code, or a finished pull request with validated demand.

The validation sequence is:

```text
Research → Prospects → Conversations → Demand → Commitment → Delivery → Retention → Economics → Build
```

Possible high-level decisions are:

```text
BUILD / READY_TO_BUILD
ITERATE / CONTINUE_VALIDATION
PIVOT
KILL
```

A venture is only "validated enough to justify building" after sufficient independent evidence exists. Example signals include a narrow ICP, substantial cold outreach, real customer conversations, repeated strong intent, measurable fake-door demand, willingness to pay / deposits / LOIs / meaningful pilots, successful concierge delivery, repeat usage, plausible repeatable acquisition, plausible unit economics, and no unresolved existential legal/platform/technical blocker.

### Central evidence rule

No factual claim should enter a final business artifact unless its status is known. Allowed statuses include:

```text
evidence
external source
customer evidence
calculated estimate
founder assumption
hypothesis
```

Generated analysis is not automatically market evidence.

---

## 2. System-of-systems architecture

The intended architecture is:

```text
                    IMPORTED COMPANY REPOSITORIES
                              │
                              ▼
                           Paperclip
                   control plane / organization
                              │
                  ┌───────────┴───────────┐
                  │                       │
                  ▼                       ▼
           OpenCode manager          Jules fleet
             + alias-fast        profile 1..4..N
                  │                       │
                  │                       ▼
                  │                company GitHub repo
                  │                       │
                  │                 Firm / website /
                  │               evidence / artifacts
                  │                       │
                  └──────── judge/revise ─┘
```

Responsibilities:

```text
Paperclip = deterministic control plane
OpenCode + alias-fast = managerial cognition / judging / triage
Jules = remote execution plane
GitHub = canonical durable company workspace
Firm = structured business-as-code state in that repository
Linear = Jules' detailed planning / task decomposition layer
Tinybird = behavioral analytics, not canonical company state
Stitch = frontend/design capability
Render Static = static landing pages / fake doors only
Hugging Face Spaces = real applications, APIs, workers, services
GitHub Actions = CI
Playwright = local UI/browser verification inside Jules tasks
Context7 = current library/API documentation
```

Hard exclusions:

```text
NO Supabase
NO Neon
NO Postgres
NO external database layer as company canonical state
```

GitHub is the durable persistence layer for company state.

---

## 3. Companies are import-only

Paperclip should not be the birthplace of companies in this operating model.

A company always starts in GitHub and is imported into Paperclip.

The company repository initially contains, at minimum:

```text
landing page / product website
+
short company overview
```

Paperclip imports the repository and creates runtime organizational state from it.

Do not design the primary flow as:

```text
Paperclip creates company
→ Paperclip creates repo
```

The primary flow is:

```text
GitHub repository exists
→ Paperclip imports repository
→ Paperclip binds company ↔ repo
→ Jules expands the seed into structured company state
```

### Rationale

GitHub should remain the portable, inspectable source of durable company knowledge. A company should remain intelligible even if Paperclip is later removed.

---

## 4. Company repository contract

Every imported company repository should converge toward this shape:

```text
/
├── README.md
├── AGENTS.md
├── paperclip.manifest.json
│
├── .founderos/
│   ├── JULES_CONTEXT.md
│   ├── PAPERCLIP_API.md
│   ├── TOOL_POLICY.md
│   └── DEPLOYMENT_POLICY.md
│
├── company/
│   ├── OVERVIEW.md
│   ├── VENTURE_THESIS.md
│   └── DECISION_LOG.md
│
├── website/
│   └── ... product landing page / product website ...
│
├── firm/
│   ├── schemas/
│   ├── company.firm
│   ├── strategy.firm
│   ├── market.firm
│   ├── customers.firm
│   ├── leads.firm
│   ├── interactions.firm
│   ├── opportunities.firm
│   ├── experiments.firm
│   ├── evidence.firm
│   └── decisions.firm
│
├── evidence/
│   ├── research/
│   ├── interviews/
│   ├── outreach/
│   ├── experiments/
│   ├── sales/
│   └── sources/
│
├── experiments/
│   └── ...
│
├── business-case/
│   ├── MARKET_ANALYSIS.md
│   ├── CUSTOMER_PROBLEM_REPORT.md
│   ├── BUSINESS_MODEL_CANVAS.md
│   ├── GTM_PLAN.md
│   ├── BUSINESS_PLAN.md
│   └── ...
│
└── state/
    └── append-only structured records where useful
```

The short `company/OVERVIEW.md` is a seed, not a business plan and not evidence.

The landing page has special meaning: it is the current market-facing offer. Jules must inspect both the overview and the landing page because they may disagree. Such disagreement must be surfaced rather than silently reconciled.

---

## 5. Firm as structured business state

Use Firm from `42futures/firm` as the structured business-as-code layer.

Reference:

```text
https://github.com/42futures/firm
```

Firm stores plain-text `.firm` files, can build a graph, supports custom schemas, and is designed for AI-readable / AI-writable workspaces.

### Firm role

Use Firm for structured company state such as:

```text
organization
person
account
channel
lead
contact
interaction
opportunity
strategy
objective
key_result
project
task
review
file_asset
```

Extend Firm with FounderOS-specific schemas for:

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

### Important rule

Jules may expand structure but may not invent facts.

If the overview says:

```text
Target market: German Kickbase users
```

Jules may create a hypothesis or segment entity representing that statement.

It may not silently invent TAM, WTP, CAC, or traction numbers.

### CLI workflow

Firm should be available inside the company workspace and Jules should be instructed to use commands such as:

```bash
firm build
firm list ...
firm get ...
firm related ...
firm query '...'
firm add ...
```

The required invariant is:

```text
Before material Firm work → firm build
After Firm changes          → firm build
Completion forbidden if     → firm build fails
```

### Why CLI rather than Firm MCP inside Jules

Jules currently exposes a curated MCP set rather than arbitrary user MCP servers. Firm is local repo state anyway, so the CLI is the correct interface.

---

## 6. Bootstrap behavior for newly imported companies

When a GitHub company is imported, Paperclip should create a bootstrap outcome for Jules.

The first Jules outcome should be conceptually:

> Transform the imported venture seed into a coherent, queryable company model without inventing evidence; identify and structure all material unknowns as assumptions/hypotheses; establish the cheapest validation sequence; ensure the Firm workspace builds successfully; commit the resulting company model to the company repository.

Bootstrap sequence:

```text
IMPORT
  ↓
validate repo contract
  ↓
bind company ↔ GitHub repo
  ↓
resolve Jules Source availability
  ↓
Jules Bootstrap Company task
  ↓
read overview
read landing page
read existing Firm state
firm build
  ↓
expand structured model
  ↓
identify unknowns
  ↓
create assumptions / hypotheses
  ↓
create validation strategy
  ↓
PR
  ↓
Paperclip validation + judge
```

Do not run `firm init` blindly on every import if the company template already provides FounderOS Firm schemas. Prefer deterministic repo templates and `firm build`.

---

## 7. Jules is the execution plane, not a local coding CLI

Replace the local coding-CLI execution model for FounderOS agents with a native Google Jules REST API adapter.

Do not implement:

```text
Paperclip → shell → jules-cli → Jules API
```

Implement:

```text
Paperclip
   ↓
native `jules` adapter
   ↓
Google Jules REST API
   ↓
Jules Session
   ↓
company-specific GitHub repo / branch / PR / artifacts
```

The repository `dhruv13x/jules-cli` may be used as reference for API request shape, source mapping, polling, plan approval, messaging, and error handling, but must not become a production subprocess dependency.

Reference:

```text
https://github.com/dhruv13x/jules-cli
```

Official Jules API:

```text
https://developers.google.com/jules/api
```

### Jules execution semantics

A Jules Session is the execution instance.

The Paperclip agent remains the organizational role/outcome owner.

A Jules `COMPLETED` state is not equivalent to an accepted business outcome.

Correct acceptance semantics:

```text
Jules COMPLETED
+
required artifacts exist
+
schema / deterministic checks pass
+
required evidence exists
+
business acceptance criteria pass
+
manager/judge decision where judgment is required
=
OUTCOME ACCEPTED
```

Default PR policy:

```text
AUTO_CREATE_PR = yes
auto-merge     = no
```

Paperclip must never treat a PR as self-approving.

---

## 8. Jules session lifecycle mapping

Expected Jules states include:

```text
QUEUED
PLANNING
AWAITING_PLAN_APPROVAL
AWAITING_USER_FEEDBACK
IN_PROGRESS
PAUSED
FAILED
COMPLETED
```

Map them approximately as follows:

```text
AWAITING_PLAN_APPROVAL → Paperclip manager/judge/human gate
AWAITING_USER_FEEDBACK → blocked / pending feedback
FAILED                 → recovery classification
COMPLETED              → validation stage, not accepted automatically
```

### Cancellation caveat

Treat Jules cancellation as potentially non-atomic. If Paperclip stops polling or marks a local run cancelled, the remote Jules task may continue and may still create a PR.

Therefore implement orphan-session reconciliation and never auto-merge orphan output.

---

## 9. Persisted Jules session mapping

Persist at least:

```ts
{
  julesSessionId: "...",
  companyId: "...",
  repository: "owner/repo",
  source: "sources/...",
  startingBranch: "main",
  paperclipRunId: "...",
  lastActivityId: "...",
  pullRequestUrl: "...",
  outcomeId: "...",
  profileId: "..."
}
```

Required durable mappings:

```text
companyId ↔ GitHub repo ↔ Jules source(s)
Paperclip run ID ↔ Jules session ID ↔ Jules profile ↔ GitHub PR
```

Persist the Jules session ID immediately after creation.

### Idempotency

Do not create a second Jules session for a Paperclip run if a mapping already exists.

If the process crashes after remote creation but before full local bookkeeping, reconciliation should try to recover the mapping before creating another session.

---

## 10. Jules fleet and capacity broker

Current expected fleet: 4 Jules profiles.

Design for arbitrary future profiles.

Operating assumption supplied for free profiles:

```text
15 task/session starts per rolling 24h per profile
3 simultaneous sessions per profile
```

With four current profiles, theoretical fleet maximum:

```text
60 rolling starts / 24h
12 concurrent sessions
```

Do not hard-code 4, 60, 15, 12, or plan names into scheduling logic. Store them as profile capability/limit configuration.

### Profile registry

Conceptual model:

```yaml
jules_profiles:
  - id: jules-01
    enabled: true
    plan: free
    limits:
      session_starts:
        amount: 15
        window: rolling_24h
      concurrent_sessions:
        amount: 3
    secret_ref: ...
    status: ACTIVE
```

Profile lifecycle states should support:

```text
ACTIVE
DEGRADED
QUOTA_EXHAUSTED
AUTH_REQUIRED
SOURCE_ACCESS_MISSING
COOLDOWN
DISABLED
```

### No hard assignment of companies to profiles

Do not model:

```text
Company A permanently belongs to profile 1
```

Instead use a global broker:

```text
company outcomes
   ↓
global capacity broker
   ↓
eligible Jules profiles
   ↓
best available profile
```

Soft affinity is acceptable but must not become quota siloing.

### Source/access capability matrix

A profile can only execute a company if it has access to that company's Jules Source / GitHub repository and required Jules integrations.

Track a matrix like:

```text
                 P1    P2    P3    P4
Company A repo    ✓     ✓     ✓     ✓
Company B repo    ✓     ✓     -     ✓
Context7          ✓     ✓     ✓     ✓
Stitch            ✓     ✓     ✓     ✓
Tinybird          ✓     ✓     ✓     ✓
Linear            ✓     ✓     ✓     ✓
```

### Rolling-window ledger

Track every Jules task start with timestamps.

Availability must be computed from starts in the previous 24 hours, not from a naive midnight-reset counter.

Suggested tables/entities:

```text
jules_profiles
jules_profile_sources
jules_sessions
jules_capacity_events
```

### Fairness

Do not divide 60 sessions evenly across companies.

Prioritize by business value and dependency unlock while preventing starvation.

Suggested deterministic priority inputs:

```text
company priority
+ dependency unlock value
+ evidence / revenue value
+ waiting-time boost
+ deadline urgency
- recent Jules consumption
- write conflict risk
```

`alias-fast` may classify/advise, but hard quota accounting and fairness rules must remain deterministic.

### Reserve capacity

Keep some capacity uncommitted for later market events, live customer replies, failures, retries, urgent fixes, and high-value opportunities.

Do not consume the entire fleet early in the rolling window merely because work is available.

### Session-worthiness gate

Before spending a Jules start, ask:

```text
Can this be done without Jules?
Can it be merged into an active Jules session?
Can it wait for more evidence?
Can several tasks be bundled?
Will completion unlock externally meaningful progress?
```

A Jules start is a scarce execution unit.

---

## 11. Concurrency and repository write scopes

Even if the fleet permits 12 concurrent Jules sessions, do not allow uncontrolled concurrent edits to one company repository.

Defaults:

```text
global concurrency    = sum(profile concurrency limits)
default/company       = 1
burst/company         = 2 when write scopes do not conflict
```

Require optional declared write scopes in task contracts:

```yaml
execution:
  repository: owner/company
  read_scope:
    - "**"
  write_scope:
    - firm/market/**
    - evidence/research/**
    - business-case/MARKET_ANALYSIS.md
```

Serialize sessions when write scopes overlap materially.

Prefer append-only unique records for highly concurrent evidence/state:

```text
state/claims/CLAIM-0042.yaml
state/assumptions/ASM-0017.yaml
evidence/interviews/INT-0008.md
evidence/experiments/EXP-0004.yaml
```

Then use dedicated agents/processes to compile canonical views such as claim ledgers or the business plan.

---

## 12. OpenCode + alias-fast manager

Paperclip already has an `opencode_local` adapter. Keep that capability, but the FounderOS managerial role should be conceptually separate from the company execution plane.

OpenCode should run in the Hugging Face Space beside Paperclip and use the OpenAI-compatible `alias-fast` model.

Recommended architecture:

```text
Hugging Face Space
├── Paperclip server
└── OpenCode manager service
    └── alias-fast
```

OpenCode can be installed into the Space image and run as a persistent loopback-only headless service rather than cold-starting for every manager decision.

### Manager role

OpenCode + `alias-fast` may:

```text
triage pending outcomes
prioritize companies
bundle compatible tasks
judge Jules plans
judge Jules results
diagnose failures
formulate targeted revisions
recommend same-session correction vs new session
recommend next-best action
identify dependencies
```

It may not:

```text
override deterministic capacity limits
fabricate evidence
waive mandatory gates
change another company
approve high-impact external actions by itself
self-accept Jules output without deterministic validation
```

### OpenCode configuration

Use an environment-driven OpenAI-compatible provider configuration.

Conceptual variables:

```text
ALIAS_FAST_BASE_URL
ALIAS_FAST_API_KEY
ALIAS_FAST_MODEL=alias-fast
```

Do not commit secrets.

### Judge verdicts

Use a bounded verdict enum such as:

```text
ACCEPT
REVISE_SAME_SESSION
RETRY_NEW_SESSION
WAIT
ESCALATE
FAIL_OUTCOME
```

Default recovery policy:

```text
same-session correction first
fresh session only when justified
bounded fresh-session retries
bounded total correction attempts
escalate instead of looping forever
```

Infrastructure failures may retry automatically within policy.

Quality failures should become targeted revisions.

Missing evidence must remain missing.

### Judge invariant

```text
LLM judge may interpret evidence.
LLM judge may not invent evidence.
LLM judge may not waive mandatory gates.
```

---

## 13. Jules session specification generated by OpenCode

OpenCode should render every Jules assignment from a single structured session template.

Suggested envelope:

```yaml
version: founderos.jules-session/v1

company:
  id: "{{COMPANY_ID}}"
  name: "{{COMPANY_NAME}}"
  repository: "{{OWNER}}/{{REPO}}"

paperclip:
  runId: "{{RUN_ID}}"
  agentId: "{{AGENT_ID}}"
  projectId: "{{PROJECT_ID}}"
  goalId: "{{GOAL_ID}}"
  outcomeId: "{{OUTCOME_ID}}"

role:
  slug: "{{ROLE_SLUG}}"
  title: "{{ROLE_TITLE}}"

execution:
  source: "{{JULES_SOURCE}}"
  startingBranch: "{{STARTING_BRANCH}}"
  autoCreatePr: true
  requirePlanApproval: "{{BOOLEAN}}"

capabilities:
  required:
    - firm
    - "{{OPTIONAL_CONTEXT7}}"
    - "{{OPTIONAL_STITCH}}"
    - "{{OPTIONAL_TINYBIRD}}"
    - "{{OPTIONAL_LINEAR}}"

writeScope:
  - "{{PATH}}"

linear:
  mode: "{{NONE | CREATE_PROJECT | CONTINUE_PROJECT}}"
  projectId: "{{OPTIONAL_ID}}"

objective: |
  {{OUTCOME_OBJECTIVE}}

inputs:
  - "{{INPUT}}"

requiredOutputs:
  - "{{OUTPUT}}"

acceptanceCriteria:
  - "{{CRITERION}}"

cannotCompleteIf:
  - "{{BLOCKING_CONDITION}}"

externalActions:
  policy: "{{DENIED | APPROVAL_REQUIRED | PREAUTHORIZED}}"

budget:
  newJulesSessionsAfterThis: 0

managerNotes: |
  {{OPTIONAL_ALIAS_FAST_CONTEXT}}
```

### Rendered Jules prompt template

The manager should render a prompt equivalent in meaning to:

```markdown
# FounderOS Execution Assignment

You are Jules acting as **{{ROLE_TITLE}}** for **{{COMPANY_NAME}}**.

This is Paperclip run `{{RUN_ID}}`.

Organizational identifiers:
- Company: `{{COMPANY_ID}}`
- Agent: `{{AGENT_ID}}`
- Project: `{{PROJECT_ID}}`
- Goal: `{{GOAL_ID}}`
- Outcome: `{{OUTCOME_ID}}`

## Mandatory startup

Before planning or modifying anything:
1. Read `/AGENTS.md`.
2. Read `/.founderos/JULES_CONTEXT.md`.
3. Read `/.founderos/PAPERCLIP_API.md`.
4. Read `/.founderos/TOOL_POLICY.md`.
5. Read task-specific inputs.
6. Run `firm build`.
7. Fetch authoritative live run context from Paperclip using this run ID and the credentials described in `.founderos/PAPERCLIP_API.md`.

If repository context conflicts with live Paperclip run context, live Paperclip run context is authoritative for the current assignment and the discrepancy must be reported.

Never expose environment secrets.

## Role
{{ROLE_DESCRIPTION}}

The role determines perspective/responsibilities but does not expand authority beyond this outcome contract.

## Objective
{{OUTCOME_OBJECTIVE}}

## Inputs
{{INPUTS}}

## Required outputs
{{REQUIRED_OUTPUTS}}

## Acceptance criteria
{{ACCEPTANCE_CRITERIA}}

## Cannot complete if
{{CANNOT_COMPLETE_IF}}

Do not convert a blocking condition into an assumption merely to finish.

## Planning
{{LINEAR_INSTRUCTIONS}}

Use Linear for meaningful detailed decomposition when enabled.
Do not create artificial microtasks merely to show activity.

Keep ordinary execution-level state in Linear.
Promote to Paperclip only meaningful blockers, approval requirements, major milestones, newly discovered strategic workstreams, and completion candidates.

## Company state
GitHub is the durable company workspace.
Use Firm for structured company state.
Use evidence/ for evidence.
Use experiments/ for experiments.
Use business-case/ for synthesized artifacts.
Use website/ for customer-facing product/offer work.

Generated analysis is not market evidence.

Every material claim must remain distinguishable as evidence, external source, customer evidence, calculated estimate, founder assumption, or hypothesis.

## Tool use
Use Context7 when current library/API behavior matters.
Use Stitch for frontend/design work when specified.
Use Tinybird only for behavioral measurement/analytics when specified.
Use Linear for execution planning when specified.
Do not introduce Supabase, Neon, Postgres, or another database.
Static fake-door / landing-page deployments target Render Static.
Services/applications target Hugging Face Spaces.
GitHub remains durable company state.

## External actions
Policy: {{EXTERNAL_ACTION_POLICY}}

Publishing, outreach, payments, account changes, spend, destructive operations, sensitive/private-data operations, and irreversible actions require the authorization specified by Paperclip.

When approval is required:
1. stop before the side effect,
2. report the approval request to Paperclip,
3. continue safe work if possible.

## Progress
Send meaningful progress updates to Paperclip.
Do not report tool usage as progress.

## Git/PR discipline
Work only inside declared write scope.
Prefer append-only evidence/state records where possible.
Do not merge your own PR.
Do not mark your own business outcome accepted.

## Completion protocol
Before reporting completion:
1. inspect actual resulting artifacts,
2. run relevant tests,
3. run `firm build`,
4. verify required outputs exist,
5. compare the result against every acceptance criterion,
6. identify unresolved requirements explicitly,
7. ensure no secrets entered Git history,
8. submit a completion candidate to Paperclip,
9. provide PR URL and relevant artifact paths.

A successful Jules session is only a completion candidate.
Paperclip performs deterministic validation and supervisory review.

## Session economy
Jules sessions are scarce.
Complete all compatible work in this session.
If the manager later sends corrective feedback through this same session, revise existing work rather than starting over unless a new execution context is truly required.
```

Codex should implement this as a versioned template/spec object rather than scattered string concatenation.

---

## 14. Paperclip ↔ Jules callback/API bridge

Jules must be able to report organizational state back into Paperclip.

Do not require Paperclip to infer everything from Git commits or Jules completion status.

Create a narrow Jules-facing API surface rather than granting broad access to all Paperclip APIs.

Suggested endpoints:

```text
GET  /api/jules/v1/runs/:runId/context
POST /api/jules/v1/runs/:runId/progress
POST /api/jules/v1/runs/:runId/blockers
POST /api/jules/v1/runs/:runId/artifacts
POST /api/jules/v1/runs/:runId/proposals
POST /api/jules/v1/runs/:runId/complete
```

Optional later endpoints:

```text
GET /api/jules/v1/runs/:runId/goal
GET /api/jules/v1/runs/:runId/decisions
```

### Callback semantics

`context` returns authoritative live organizational state for the assigned run.

Conceptual response:

```json
{
  "runId": "RUN-881",
  "companyId": "CMP-17",
  "agent": {
    "id": "AGT-44",
    "role": "experiment-fake-door"
  },
  "project": {
    "id": "PRJ-8",
    "title": "Validate initial paid demand"
  },
  "goal": {
    "id": "GOAL-12",
    "title": "Obtain behavioral evidence of demand"
  },
  "outcome": {
    "id": "VAL-023",
    "objective": "Determine whether qualified prospects convert on the offer."
  },
  "permissions": {
    "paperclipWrite": [
      "progress",
      "blockers",
      "artifacts",
      "proposals",
      "completion_candidate"
    ],
    "externalActions": "approval_required"
  },
  "requiredOutputs": [],
  "acceptanceCriteria": [],
  "relevantArtifacts": [],
  "linear": {
    "enabled": true,
    "projectId": null
  }
}
```

Completion payload should be idempotent and use a caller-provided event ID.

Example:

```json
{
  "eventId": "RUN-881:completion:v1",
  "status": "completion_candidate",
  "summary": "Fake-door implementation is ready.",
  "pullRequestUrl": "https://github.com/example/company/pull/19",
  "outputs": [
    "website/",
    "experiments/EXP-004.yaml"
  ],
  "acceptanceCriteria": {
    "passed": [
      "static site builds",
      "Firm graph validates"
    ],
    "unresolved": [
      "market response has not yet been collected"
    ]
  },
  "linear": {
    "projectId": "..."
  }
}
```

Paperclip must still validate and judge the completion candidate.

---

## 15. Paperclip authentication for Jules

The API base URL and non-secret API documentation may live in the company repository.

Secret values must never be committed to GitHub or interpolated into prompts.

### Repository context

Each company should contain:

```text
/.founderos/JULES_CONTEXT.md
/.founderos/PAPERCLIP_API.md
/.founderos/TOOL_POLICY.md
/.founderos/DEPLOYMENT_POLICY.md
```

The repo may state:

```text
Paperclip base URL: https://...
Auth header: Authorization: Bearer $PAPERCLIP_COMPANY_TOKEN
```

The actual token must be supplied through a secure environment mechanism outside Git history and outside prompt text.

### Scoped token policy

Prefer a per-company Paperclip capability token, constrained by the run identity supplied in the prompt.

Security invariant:

```text
company token A + run ID from company B = reject
```

The token should not grant:

```text
cross-company access
budget changes
agent creation
self-approval
PR merge
administrative settings
```

It should only grant the narrow Jules callback surface for allowed runs.

### Important environment constraint

Do not assume the Jules REST create-session API can inject arbitrary per-session environment secrets unless verified at implementation time.

The adapter must preflight whether the selected Jules profile/source has the required Paperclip credential available.

If secure direct callback credentials cannot be made available to API-created Jules sessions, implement a safe fallback:

```text
Jules writes signed/structured outbox record to GitHub
→ Paperclip observes/reads outbox
→ Paperclip applies event after validation
```

Never solve this by placing a bearer token in the prompt or repository.

---

## 16. Root AGENTS.md expectations for company repositories

Company repositories should include a short root `AGENTS.md` that routes Jules to the durable FounderOS context.

Conceptual content:

```markdown
# FounderOS Jules Instructions

This repository is an operating company managed by FounderOS/Paperclip.

Before substantive work, read:
1. `.founderos/JULES_CONTEXT.md`
2. `.founderos/PAPERCLIP_API.md`
3. `.founderos/TOOL_POLICY.md`
4. `.founderos/DEPLOYMENT_POLICY.md`
5. task-specific files named by the session prompt

Firm is the structured business-state layer.
Before modifying business state: `firm build`
After modifying Firm state: `firm build`

Never invent evidence.
Never print, commit, log, or copy environment secrets into files, Linear, pull requests, comments, or Paperclip payloads.

Paperclip owns organizational state and outcome acceptance.
Linear owns detailed execution planning.
GitHub owns durable artifacts.
Jules performs the work.

A Jules session is not complete merely because a PR exists.
Report completion back to Paperclip as a completion candidate.
```

Paperclip should validate the presence/version of this context and either bootstrap it safely or mark the import as requiring bootstrap.

---

## 17. Linear's role

Keep Linear as a standard useful Jules integration.

Linear is not the canonical company database and is not Paperclip's replacement.

Use Linear for Jules' detailed project decomposition and execution plan.

Separation:

```text
Paperclip = organizational outcome state
Linear    = fine-grained working state
```

Example:

```text
Paperclip outcome:
VAL-23 Validate ICP

Linear project:
- research category
- find substitutes
- prospect sampling
- inspect willingness-to-pay signals
- analyze contradictions
- update Firm
- compile report
```

Do not mirror every Linear microtask into Paperclip.

Promote to Paperclip only:

```text
meaningful blocker
approval requirement
major milestone
new strategic workstream
completion candidate
```

### Rationale

A Jules session may act in a specialized business role and need a persistent execution plan with many internal steps. Linear is useful for this without forcing every subtask into Paperclip's organization graph or consuming a new Jules session for each step.

---

## 18. Tool capability registry

FounderOS needs a capability registry so Paperclip can route work only to profiles with the required tools.

### Jules-native / task-local baseline

Preferred baseline:

```text
Context7       → current technical documentation
Stitch         → frontend/design generation
Tinybird       → validation/product analytics
Linear         → project/task decomposition
Firm CLI       → local structured business state
Playwright     → local browser/UI verification
GitHub         → source/PRs
GitHub Actions → CI
```

### Hard exclusions

```text
Supabase = disabled / unsupported by policy
Neon     = disabled / unsupported by policy
Postgres = not part of the architecture
```

### Capability matrix per Jules profile

Track capabilities and source access per profile.

Dispatch must fail before task creation if required capabilities are missing.

---

## 19. Stitch for frontend work

Use Google Stitch as the preferred design/frontend generation capability when suitable.

Flow:

```text
business evidence / offer
  ↓
Stitch design
  ↓
Jules implementation
  ↓
Playwright verification
  ↓
GitHub Actions
  ↓
deployment
```

Stitch work should still obey design/evidence separation:

```text
design quality = design evidence
not customer-demand evidence
```

Jules should inspect actual rendered output rather than assuming generated frontend code is correct.

---

## 20. Deployment policy

Encode deployment routing as policy rather than leaving it to agent improvisation.

### Static

Use Render Static for:

```text
landing pages
fake doors
campaign pages
static waitlists
other static validation pages
```

### Services / applications

Use Hugging Face Spaces for:

```text
APIs
web applications
workers
agent services
dashboards
prototype backends
other dynamic services
```

Do not deploy dynamic services to Render.

Conceptual policy:

```yaml
deployment:
  static:
    provider: render
    allowed_for:
      - landing_page
      - fake_door
      - campaign_page
      - static_waitlist

  service:
    provider: huggingface_spaces
    allowed_for:
      - api
      - web_application
      - worker
      - agent_service
      - dashboard
      - prototype_backend

  prohibited:
    - render_dynamic_service
```

Jules may prepare deployment configuration/code, but authenticated deployment actions should remain governed by Paperclip approval/policy when credentials or external side effects are involved.

---

## 21. Tinybird role

Tinybird is analytics/measurement infrastructure, not canonical company state.

Example fake-door flow:

```text
Render fake door
  ↓
Tinybird events
  ↓
Jules queries experiment results
  ↓
evidence/experiments/EXP-xxx.yaml
  ↓
Firm evidence entities
  ↓
Git commit / PR
```

Important results influencing business decisions must be materialized back into GitHub evidence records.

If Tinybird disappears, important historical evidence should still exist in the company repo.

---

## 22. GitHub as the only canonical company persistence layer

For company state, prefer plain files committed to GitHub.

That includes:

```text
hypotheses
claims
experiments
evidence
leads
contacts
interactions
opportunities
strategy
decisions
business artifacts
product/landing-page code
```

Firm provides structure over these files.

Git provides:

```text
history
branching
provenance
rollback
collaboration
backup
```

Paperclip still has its own control-plane database for orchestration, sessions, quotas, runtime tasks, approvals, and internal state. That DB is not the canonical durable company knowledge base.

---

## 23. External action governance

External side effects require explicit authorization policy.

High-impact actions must not be auto-approved solely by the LLM manager:

```text
publishing
sending outreach
payments / spend
account registration / changes
destructive changes
sensitive/private data operations
irreversible operations
```

Rules:

```text
prefer reversible staged changes
check platform/community rules before side effects
no fabricated identity/customer proof/traction/testimonials/eligibility/permission
operator judgment remains final gate for strategic/external commitments
```

A Jules prompt must explicitly carry the external action policy for the run:

```text
DENIED
APPROVAL_REQUIRED
PREAUTHORIZED
```

---

## 24. Paperclip / OpenCode / Jules boundaries

### Paperclip owns

```text
company import
company ↔ repo mapping
agents
projects
goals
outcomes
assignments
approvals
budgets
Jules fleet profiles
Jules quota accounting
capacity broker
session mapping
policy enforcement
runtime auth
acceptance state
reconciliation
```

### OpenCode + alias-fast owns reasoning about

```text
prioritization
bundling
judgment
recovery classification
revision instructions
next-best action
```

It does not directly bypass Paperclip constraints.

### Jules owns

```text
substantial execution
repo edits
research artifacts
Firm updates
landing-page implementation
analysis
Linear execution plan
PR creation
running tests/builds
```

### GitHub owns

```text
durable company workspace + provenance
```

### Linear owns

```text
detailed working plan / Jules subtask decomposition
```

### Firm owns

```text
structured business graph stored in repo files
```

---

## 25. Deterministic validation before LLM judgment

Always run deterministic checks before asking `alias-fast` to judge quality.

Examples:

```text
required file exists
JSON/YAML schema valid
Firm build passes
unit tests pass
build passes
required evidence record exists
PR exists when required
write scope respected
no obvious secret leakage
expected identifiers match
```

Only then call the manager/judge for semantic acceptance.

Suggested judge result:

```json
{
  "verdict": "REVISE_SAME_SESSION",
  "confidence": 0.91,
  "acceptance": {
    "passed": [
      "market segmentation present",
      "competitor evidence cited"
    ],
    "failed": [
      "willingness-to-pay evidence missing"
    ]
  },
  "reason": "The artifact is structurally complete but does not satisfy the evidence threshold for pricing validation.",
  "instructions": [
    "Do not rewrite the existing market section.",
    "Add missing pricing evidence or explicitly mark the claim as an unvalidated assumption.",
    "Update claim/evidence records accordingly."
  ],
  "requires_human": false
}
```

Structured output should be locally schema-validated.

---

## 26. Retries and session economy

Jules sessions are quota-constrained.

Default order:

```text
Jules result weak
  ↓
send corrective feedback to SAME session
  ↓
still unacceptable
  ↓
one bounded fresh-session retry when justified
  ↓
still unacceptable
  ↓
escalate
```

Do not burn new sessions on small corrections.

Do not allow broken tasks to consume unlimited fleet capacity.

Track retry ancestry:

```text
retry_of
attempt_index
same_session_revision_count
fresh_session_retry_count
```

---

## 27. Waiting-for-market state

A validation-first company should not manufacture AI work merely because Jules capacity exists.

Support company/project/outcome states such as:

```text
WAITING_FOR_MARKET
```

When a venture is waiting for:

```text
customer replies
interview completion
fake-door traffic
payment decision
pilot usage
retention interval
```

it may rationally consume zero Jules sessions.

Wake on evidence-producing events or scheduled reviews.

---

## 28. Active company set

With multiple imported companies, not every company should receive equal daily execution.

Support a dynamic active set such as:

```text
ACTIVE
WAITING_FOR_MARKET
DORMANT / LOW_PRIORITY
PAUSED
```

Capacity should flow toward companies where work can unlock real evidence, commitments, revenue, or major dependencies.

Fairness prevents starvation but does not imply equal quotas.

---

## 29. Hugging Face Space deployment of Paperclip manager stack

Expected runtime environment:

```text
Hugging Face Space
├── Paperclip
└── OpenCode manager
    └── alias-fast
```

OpenCode secrets and Jules profile credentials must be stored as environment secrets, never committed.

Startup/restart reconciliation is mandatory because the control plane may restart while remote Jules tasks continue.

On startup:

```text
load Paperclip state
  ↓
load Jules profile registry
  ↓
recompute rolling quota windows
  ↓
query/reconcile all nonterminal Jules sessions
  ↓
discover completed/failed/orphaned work
  ↓
run pending deterministic validations
  ↓
invoke alias-fast judge where needed
  ↓
resume queue
```

Do not assume local OpenCode conversational state is durable. Treat OpenCode memory as a cache; Paperclip DB + GitHub + Jules remote state are authoritative.

---

## 30. Paperclip existing code to reuse

Codex should reuse current Paperclip primitives instead of creating parallel systems where possible.

Current code already includes:

```text
agent adapters
opencode_local adapter
process/http adapters
companies
projects
goals
issues
task assignment
approvals
budgets
activity logs
execution workspaces
agent-run identity
company portability/import
```

The current server adapter registry is modular and suitable for a new native `jules` adapter.

The existing `opencode_local` adapter can remain available, but the new FounderOS execution adapter is `jules`, not `opencode_local`.

The OpenCode manager is a supervisory component, not the company execution runtime.

---

## 31. Native Jules adapter implementation shape

Implement a package consistent with Paperclip adapter conventions, approximately:

```text
packages/adapters/jules/
├── package.json
├── src/
│   ├── index.ts
│   ├── server/
│   │   ├── api.ts
│   │   ├── execute.ts
│   │   ├── session.ts
│   │   ├── parse.ts
│   │   ├── test.ts
│   │   └── index.ts
│   ├── ui/
│   └── cli/
└── tests
```

Register it in server/UI/CLI registries.

The adapter must not depend on a local `jules` executable or local company cwd.

Core adapter responsibilities:

```text
resolve company from run
resolve bound GitHub repo
select eligible Jules profile through broker
resolve/verify Jules Source
create/resume/reconcile Jules session
persist remote ID immediately
poll activities/status safely
approve plan when policy permits
send follow-up messages
capture PR/output metadata
return completion candidate metadata to Paperclip
```

Do not use short fixed polling loops that assume completion in ~120 seconds. Jules is asynchronous and may take substantial time.

---

## 32. OpenCode manager implementation shape

Create a manager service/module with explicit structured operations:

```text
triage
bundle
plan_judge
result_judge
failure_diagnosis
next_best_action
```

Each operation should:

```text
receive a deterministic structured context object
call alias-fast through OpenCode or an OpenAI-compatible route
request structured JSON
validate returned JSON locally
reject malformed or policy-violating output
```

The manager may recommend dispatch; Paperclip performs the actual dispatch after checking hard rules.

---

## 33. Capacity broker implementation shape

Create a first-class resource/capacity service rather than overloading monetary budget logic.

Conceptual entities:

```text
JulesProfile
JulesProfileSource
JulesSession
JulesCapacityEvent
JulesDispatchCandidate
JulesLease
```

Broker inputs:

```text
company/outcome priority
required capabilities
source access
rolling quota remaining
profile concurrency remaining
company write-scope locks
reserve capacity policy
recent usage
failure/degraded profile state
waiting time
```

Broker outputs:

```text
dispatch(profile)
queue
wait
blocked_missing_capability
blocked_no_source_access
blocked_quota
blocked_conflict
```

---

## 34. Repo/source ownership and no backup overwrite

Once a company repo is an active Jules workspace, treat it as the canonical working repository, not a passive backup target.

Do not implement periodic Paperclip export logic that blindly overwrites Jules-managed files.

If Paperclip materializes its own portable state into the repo, namespace ownership clearly, for example:

```text
.paperclip/
  paperclip.manifest.json
  COMPANY.md
  agents/
  sync-state.json
```

Avoid overwriting root `AGENTS.md`, `firm/`, `website/`, `evidence/`, `business-case/`, or Jules work products.

---

## 35. Canonical company state vs control-plane state

Use this distinction consistently:

```text
GitHub/Firm:
  durable company/business knowledge

Paperclip DB:
  control plane and runtime state

Linear:
  detailed execution plan

Tinybird:
  event analytics source
```

Never require company truth to exist only in a transient OpenCode session, Jules activity stream, or Linear issue.

---

## 36. Recommended Paperclip API bridge permissions

A Jules run token/capability should allow only operations equivalent to:

```text
read own run context
report progress
report blocker
report artifact metadata
propose new workstream
request approval
submit completion candidate
```

It should not allow:

```text
accepting own completion
merging PR
raising budget
changing fleet profile config
editing another company's state
creating arbitrary agents
approving high-impact external action
administrative access
```

Every event should include or derive:

```text
companyId
runId
agentId
projectId
goalId
outcomeId
```

Validate all cross-object ownership relationships server-side.

---

## 37. Outcome contracts

Every substantial autonomous job should have:

```text
objective
inputs
required_outputs
acceptance_criteria
updates
cannot_complete_if
budget / execution limits
external_action_authorization
stop/escalation conditions
```

This contract should be what OpenCode uses to render the Jules session prompt.

Activity is not completion.

---

## 38. Example validation task graph

A company may progress through tasks such as:

```text
00 venture thesis
01 market research
02 ICP
03 prospect universe
04 customer interviews
05 offer variants
06 content packages
07 channel/community test
08 fake door
09 calls/LOIs/deposits
10 concierge delivery
11 retention/repeat
12 economics
13 red-team gate
```

These are business outcomes, not mandatory one-session-per-task mappings.

The manager should bundle compatible outcomes when sensible.

---

## 39. Example final artifacts

A mature validation process may generate:

```text
VENTURE_THESIS.md
MARKET_ANALYSIS.md
CUSTOMER_PROBLEM_REPORT.md
VALIDATION_PIPELINE.md
DEMAND_EXPERIMENT_REPORT.md
POSITIONING_CASE.md
GTM_PLAN.md
BUSINESS_MODEL_CANVAS.md
BUSINESS_PLAN.md
REQUIREMENTS_MATRIX.md
CLAIM_EVIDENCE_LEDGER.md
ASSUMPTION_REGISTER.md
DECISION_LOG.md
INVESTMENT_COMMITTEE_DECISION.md
```

Canonical summary artifacts should be compiled from underlying append-only/evidence state where possible.

---

## 40. CI and frontend verification

Use GitHub Actions for CI.

Use Playwright locally inside Jules tasks for UI/browser verification.

Do not treat Linear as CI/CD; Linear is planning/project tracking.

Jules-created PRs should be validated through existing repository checks and any provider-native CI repair behavior available at implementation time.

---

## 41. Non-goals

Do not implement these as part of the architecture:

```text
Paperclip-created company repos as primary flow
local Jules CLI execution
Jules as a shell subprocess dependency
Supabase
Neon
Postgres
external DB as canonical company memory
auto-merging Jules PRs
LLM-only acceptance without deterministic checks
LLM-based quota accounting
equal quota allocation to every company
blind two-way mirroring between Linear and Paperclip
secrets committed to GitHub
secrets embedded in Jules prompts
unbounded Jules retries
assumption that remote Jules cancels instantly when Paperclip stops
```

---

## 42. Implementation sequence for Codex

Implement in stages so each layer is independently testable.

### Phase 1 — foundation

- Add versioned FounderOS/Jules types and config.
- Add Jules profile registry with configurable quota/capabilities.
- Add company ↔ GitHub repo ↔ Jules source bindings.
- Add DB migrations for Jules profile/session/capacity state.
- Add tests for rolling-window accounting and concurrency.

### Phase 2 — native Jules adapter

- Implement REST client.
- Implement source resolution.
- Implement session create/get/list activities/send message/plan approval.
- Persist session IDs immediately.
- Implement asynchronous reconciliation.
- Register adapter in server/UI/CLI.
- Add environment diagnostics without logging secrets.

### Phase 3 — capacity broker

- Implement profile eligibility.
- Implement rolling quota ledger.
- Implement concurrency accounting.
- Implement reserve policy.
- Implement company fairness/starvation handling.
- Implement write-scope leases/conflict prevention.

### Phase 4 — Paperclip Jules bridge

- Add narrow `/api/jules/v1/...` endpoints.
- Add scoped auth/capability checks.
- Add idempotent callback event handling.
- Translate promoted Jules events into existing goals/issues/approvals/activity structures.
- Never allow Jules to self-accept.

### Phase 5 — OpenCode manager

- Configure alias-fast using environment secrets.
- Add structured manager operations and schemas.
- Add versioned JulesSessionSpec and renderer.
- Add deterministic manager policy guardrails.
- Add bounded judge/retry loop.

### Phase 6 — company import/bootstrap integration

- Make GitHub import the intended FounderOS path.
- Validate company repo contract.
- Trigger Jules bootstrap outcome after import when required.
- Validate `.founderos` context presence/version.
- Add capability/source readiness checks before dispatch.

### Phase 7 — Linear/tool routing

- Add Linear capability flag and planning metadata.
- Support create/continue Linear project mode in Jules session spec.
- Promote only blockers/approvals/milestones/workstreams/completion into Paperclip.
- Add Context7/Stitch/Tinybird capability requirements to profile routing.

### Phase 8 — deployment policy

- Encode Render Static only.
- Encode Hugging Face Spaces for dynamic services/apps.
- Reject unsupported deployment targets in policy validation.

### Phase 9 — resilience

- Startup reconciliation of remote Jules sessions.
- Orphan PR/session handling.
- Degraded profile handling.
- Auth/source-access health checks.
- Crash/restart recovery tests.
- Secret-redaction tests.

---

## 43. Minimum acceptance tests

Codex should add automated coverage for at least:

```text
company import binds correct repo
Jules adapter never relies on local cwd
profile source eligibility enforced
15/rolling-window style quota can be represented generically
concurrency is profile-scoped
fleet capacity is aggregate but not flattened incorrectly
same Paperclip run does not create duplicate Jules session
session ID persists before long polling
write-scope conflict prevents unsafe parallel dispatch
missing capability prevents dispatch
Jules completion remains completion_candidate until validation
malformed manager JSON is rejected
manager cannot waive hard deterministic failure
same-session revision does not consume new start
fresh retry does consume new start
fresh retries are bounded
Jules token cannot cross company boundary
Jules callback event is idempotent
secret values never appear in logs/prompts/repo payloads
dynamic service deployment to Render is rejected
Supabase/Neon/Postgres are not selected as providers
waiting-for-market companies do not consume sessions unnecessarily
startup reconciliation recovers remote terminal sessions
```

---

## 44. Security and secret-handling requirements

Never log:

```text
Jules API keys
alias-fast API key
Paperclip company/Jules bridge tokens
Linear credentials
Tinybird credentials
Stitch credentials
Hugging Face tokens
Render tokens
```

Redact bearer tokens and known secret fields from structured logs.

Never place secret values in:

```text
Jules prompt text
AGENTS.md
.founderos/*.md
Linear issues
Git commits
PR bodies/comments
Firm entities
evidence files
```

Use secret references / environment variable names in durable configuration.

---

## 45. Design rationale summary

These decisions are intentional:

### GitHub import-only companies
Because the company should exist independently of Paperclip and remain portable/auditable.

### Firm inside the repo
Because business state benefits from structured, queryable, AI-readable plain text with Git history.

### Jules as native API execution plane
Because remote GitHub-based execution is the desired runtime and local coding CLIs should not be the company worker.

### Paperclip as control plane
Because organizational identity, quotas, approvals, assignments, acceptance, policy, and runtime state need deterministic ownership.

### OpenCode + alias-fast as manager
Because prioritization, bundling, judging, and recovery need inexpensive reasoning, but those decisions should not bypass deterministic rules.

### Linear retained
Because Jules needs a detailed project/work-plan surface distinct from Paperclip's higher-level goals/outcomes.

### GitHub-only canonical company persistence
Because the architecture explicitly rejects an external operational database for company memory.

### Tinybird retained
Because analytics is measurement infrastructure; material evidence is written back to GitHub.

### Stitch retained
Because frontend/design generation is useful for offer/landing-page/product work.

### Render Static only
Because it is useful for static fake doors and campaign pages, not the selected runtime for services.

### Hugging Face Spaces for services
Because dynamic applications, APIs, workers, dashboards, and prototype services should deploy there.

### Session batching and same-session correction
Because Jules sessions are quota-constrained and should represent substantial outcomes rather than tiny actions.

### Four-profile fleet abstraction
Because current capacity comes from four profiles, but the implementation must support future extensions without code changes.

### Deterministic validation before LLM judgment
Because AI-generated reasoning cannot replace structural checks or invent missing evidence.

---

## 46. Final implementation invariant

The finished system should behave like this:

```text
GitHub company seed
   ↓
Paperclip import
   ↓
company/repo/source binding
   ↓
OpenCode + alias-fast chooses/bundles valuable outcome
   ↓
capacity broker selects eligible Jules profile
   ↓
Paperclip renders JulesSessionSpec
   ↓
Jules reads repo context + live Paperclip run context
   ↓
Jules plans detailed work in Linear
   ↓
Jules executes in the company GitHub repo
   ↓
Firm + evidence + product artifacts updated
   ↓
Jules reports progress/blockers/completion candidate to Paperclip
   ↓
deterministic validators
   ↓
alias-fast judge
   ↓
ACCEPT | REVISE_SAME_SESSION | RETRY_NEW_SESSION | WAIT | ESCALATE
   ↓
Paperclip updates organizational state
```

The governing principle is:

> Paperclip controls. OpenCode reasons. Jules works. Linear plans. Firm structures. GitHub remembers. Evidence decides.
