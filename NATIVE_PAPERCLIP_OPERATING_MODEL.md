# FounderOS Native Paperclip Operating Model

Status: normative companion to `spec.md` and `adaptations_spec.md`

Date: 2026-09-14

This document removes an important ambiguity from the FounderOS adaptation: **FounderOS must use Paperclip's native company, goal, project, agent, issue, approval, budget, activity, document/work-product and org-chart primitives as the visible organizational operating model.**

FounderOS must not create a second hidden organizational system in GitHub YAML, Firm, Linear, Hermes memory, Jules prompts, or plugin-local state.

GitHub/Firm remains the durable business knowledge/evidence layer. Paperclip remains the visible organizational/control-plane layer.

---

# 1. Core invariant

Use this hierarchy:

```text
Paperclip Company
    ↓
Company vision / venture direction
    ↓
Paperclip native company-level Goals
    ↓
Paperclip native team/agent/task Goals
    ↓
Paperclip native Projects
    ↓
Paperclip native Issues / outcomes
    ↓
Paperclip native Agents / roles / reporting lines
    ↓
Jules remote execution
    ↓
GitHub/Firm artifacts + evidence
```

The operator should be able to understand what FounderOS is doing from the normal Paperclip UI without opening raw FounderOS YAML files.

The governing rule is:

> FounderOS methodology may live in GitHub. FounderOS organizational state must live in native Paperclip objects and be visible in native Paperclip UI surfaces.

---

# 2. Native Paperclip primitives are authoritative for organizational state

FounderOS should use these native objects directly.

| FounderOS concept | Native Paperclip primitive | Visible UI |
|---|---|---|
| company | `Company` | company switcher/settings/dashboard |
| company direction / vision summary | `Company.description` plus top-level company goal(s) | company settings + Goals |
| strategic objective | `Goal` with `level=company` | Goals / Goal detail |
| team objective | `Goal` with `level=team` | Goals / Goal detail |
| role-owned objective | `Goal` with `level=agent` | Goals / Goal detail |
| concrete outcome | `Goal` with `level=task` and/or linked `Issue` | Goals + Issues |
| workstream | `Project` | Projects |
| executable work / validation outcome | `Issue` | Issues / Issue detail |
| accountable role | `Agent` | Agents / Agent detail |
| reporting structure | `Agent.reportsTo` | Org Chart |
| execution owner | `Issue.assigneeAgentId`, `Goal.ownerAgentId`, `Project.leadAgentId` | native details |
| output record | issue document / work product | Issue detail |
| approval | native `Approval` | Approvals |
| spend/budget | native budget/cost objects | Costs/Budgets |
| progress/audit event | Activity | Activity / Dashboard |
| operator attention | native Inbox/approval/blocker flows | Inbox / Approvals |

Do not create parallel replacements for these concepts merely because GitHub/Firm is also used.

---

# 3. Company vision and venture direction

The current `master` codebase does not expose a separate first-class `Vision` type or `/vision` page. Do not invent a hidden FounderOS-only vision model and call it native.

For the current implementation:

```text
Company.description
= concise operator-visible company vision / venture direction summary

Top-level Goal(level=company)
= measurable strategic expression of that direction

company/OVERVIEW.md + firm/company.firm
= durable, richer source material and business context
```

Example:

```text
Company.description:
"Make digital user testing accessible to teams that cannot run continuous human research."

Company Goal:
"Validate paid demand for automated accessibility-focused UX testing"
```

If upstream Paperclip later introduces an actual native Vision/Mission primitive, FounderOS should migrate to that native primitive rather than maintain a competing one.

---

# 4. FounderOS Goal Library is a template catalog, not a second goal database

The `company-package/goals/**` files described in `adaptations_spec.md` are **goal templates**.

They are not the operational goals themselves.

Required flow:

```text
FounderOS goal template
        ↓ selected by Hermes / bootstrap
Paperclip Goal creation API
        ↓
native Goal record
        ↓
visible immediately in Goals UI
        ↓
linked Project / Issue / Agent
        ↓
Jules execution
```

Every instantiated goal should retain provenance such as:

```text
templateId
templateVersion
FounderOS source commit
system ID
resource-pack IDs
```

but the actual runtime identity is the native Paperclip `goal.id`.

Do not require Hermes or Jules to inspect a YAML file to discover whether an active organizational goal exists. They should read native Paperclip goal state.

---

# 5. Use the existing native Goal hierarchy

Paperclip already supports goal levels:

```text
company
team
agent
task
```

FounderOS should make deliberate use of them.

Example validation hierarchy:

```text
COMPANY GOAL
Validate the venture enough to justify initial product build

    TEAM GOAL
    Establish evidence-backed problem/ICP fit

        AGENT GOAL
        Customer Discovery: complete and synthesize real interviews

            TASK GOAL
            Complete interview evidence batch #1

    TEAM GOAL
    Demonstrate demand and commercial commitment

        AGENT GOAL
        Fake-Door Agent: run offer test

        AGENT GOAL
        Sales Agent: seek paid pilot / LOI / deposit evidence
```

The native parent/child goal tree should be the primary visible strategic map.

---

# 6. Existing FounderOS support metadata belongs on native Goal records

The current shared `Goal` type already contains FounderOS-relevant fields:

```text
requiredSkills
supportPacks
requiredCapabilities
inputPaths
outputPaths
acceptanceCriteria
cannotCompleteIf
```

These fields should remain attached to the native Goal object.

Codex must not move them into an unrelated FounderOS-only table unless Paperclip itself requires normalization internally.

The Goal Support Resolver should operate from the native Paperclip goal ID:

```text
Paperclip Goal
  ├─ ownerAgentId
  ├─ requiredSkills
  ├─ supportPacks
  ├─ requiredCapabilities
  ├─ inputPaths
  ├─ outputPaths
  ├─ acceptanceCriteria
  └─ cannotCompleteIf
        ↓
JulesSessionSpec
```

This is the bridge between the visible Paperclip strategy layer and the repo-local FounderOS methodology/resources.

---

# 7. Extend the native Goal UI instead of making a FounderOS goals page

The existing Goal detail page already exposes:

```text
title
description
status
level
owner
parent goal
sub-goals
linked projects
```

Extend this same native Goal detail experience to display FounderOS fields.

Recommended sections/tabs:

```text
Outcome Contract
- objective / description
- acceptance criteria
- cannot-complete-if

Support
- required skills
- support packs + versions
- required capabilities

Inputs / Outputs
- input paths
- output paths
- current work products

Execution
- owner agent
- project
- active/current Jules session
- Linear workstream when present
- validation state
- Hermes verdict

Evidence
- linked evidence IDs / relevant GitHub artifacts
- confidence / unmet evidence requirement
```

Do not add a separate `/founderos/goals` page that bypasses native Goals.

---

# 8. Projects must remain native Paperclip Projects

FounderOS business systems such as:

```text
Market Validation
Customer Discovery
Fake Door
Sales Validation
Kickstarter Prelaunch
Content Campaign
Business Plan
Pitch Preparation
```

should instantiate or use native Paperclip Projects where the work has a meaningful multi-task lifecycle.

Native Projects already link to goal IDs and can have a lead agent and workspaces.

Example:

```text
Goal:
Validate commercial demand

Project:
September Paid-Demand Validation

Issues:
- Build prospect universe
- Prepare offer variants
- Run fake-door experiment
- Prepare discovery calls
- Seek commercial commitment
```

Project state should be visible under the standard Projects UI.

---

# 9. Issues are the native execution/outcome objects

Do not create a separate FounderOS task store.

Use native Issues for execution-sized work because they already support:

```text
company
project
goal
parent issue
priority
status
assignee agent/user
execution run
execution workspace
plan documents
comments
attachments
work products
```

FounderOS should enrich Issues with references to outcome contracts and Jules session mappings rather than bypassing them.

Recommended mapping:

```text
Goal
= why / desired outcome

Project
= coordinated workstream

Issue
= concrete executable outcome or organizational task

Linear issues
= optional Jules-internal decomposition below the Paperclip Issue
```

Only important Linear state should promote into native Paperclip Issues, blockers, approvals or milestones.

---

# 10. FounderOS roles must use native Agents and Org Chart

The roles visible in FounderOS must be native Paperclip `Agent` records.

Paperclip's Agent model already provides:

```text
name
role
title
status
reportsTo
capabilities
adapterType
budget
permissions
metadata
```

and the Org Chart renders `reportsTo` relationships.

Do not create a separate FounderOS role registry as runtime organizational truth.

`company-package/agents/**/AGENTS.md` should be treated as **role templates/instructions** that instantiate or configure native Paperclip Agents.

Example mapping:

```text
FounderOS template: market-analysis
→ native Agent
   role: researcher
   title: Market Analysis
   adapterType: jules
   reportsTo: Founder Manager / designated lead

FounderOS template: financial-case
→ native Agent
   role: cfo
   title: Financial Case
   adapterType: jules

FounderOS template: go-to-market
→ native Agent
   role: cmo
   title: Go-to-Market
   adapterType: jules

FounderOS template: pitch-agent
→ native Agent
   role: cmo or general
   title: Pitch & Investor Narrative
   adapterType: jules
```

The current native role enum is intentionally broad. Preserve the native role for UI/filtering and use `title`, `capabilities`, instructions and metadata for FounderOS specialization rather than creating dozens of incompatible role enum values.

The exact mapping for every FounderOS agent template should be defined centrally and tested.

---

# 11. Hermes must reason over native Paperclip objects

Hermes should receive native organizational state such as:

```text
company
top-level goals
goal tree
active projects
open/blocked issues
agents + reporting structure
approvals
budgets/costs
recent activity
current Jules sessions
```

Hermes recommendations should reference existing Paperclip IDs.

Examples:

```json
{
  "decision": "CREATE_ISSUE",
  "goalId": "goal_native_id",
  "projectId": "project_native_id",
  "assigneeAgentId": "agent_native_id"
}
```

or:

```json
{
  "decision": "ACTIVATE_GOAL_TEMPLATE",
  "goalTemplateId": "compile-business-model-canvas",
  "parentGoalId": "goal_native_id",
  "ownerAgentId": "agent_native_id"
}
```

Paperclip validates and performs the mutation.

Hermes must not maintain its own private list of active goals or projects in conversation memory.

---

# 12. Jules receives native organizational context

Every Jules session contract should include native Paperclip identity:

```text
companyId
goalId
projectId
issueId / outcomeId
agentId
paperclipRunId
```

Jules can fetch live context through the scoped Paperclip API.

Its prompt should explicitly say:

> Your assignment belongs to native Paperclip Goal `<goalId>`, Project `<projectId>`, Issue `<issueId>`, and Agent role `<agentId>`. Report meaningful organizational changes back to Paperclip; do not create parallel organizational state in repository files.

GitHub artifacts and Firm updates remain durable business outputs, but they are attached back to native Paperclip Issues/Goals as work products/evidence references.

---

# 13. Business systems must surface through native Goals/Projects/Issues

Examples:

## Business Model Canvas

```text
Paperclip Goal:
Compile evidence-backed business model

Owner:
Business Model Architect native Agent

Project:
Business Case

Issue:
Compile current BMC

Output work products:
BUSINESS_MODEL_CANVAS.md
BUSINESS_MODEL_CANVAS.yaml
```

## Pitch

```text
Paperclip Goal:
Prepare evidence-backed investor pitch

Owner:
Pitch native Agent

Project:
Investor Readiness

Issue:
Compile current pitch

Outputs:
pitch/PITCH_DECK.*
pitch/PITCH_EVIDENCE_MAP.md
```

## Kickstarter

```text
Paperclip Company Goal:
Validate crowdfunding as an acquisition/funding channel

Project:
Kickstarter Prelaunch

Issues:
- assess crowdfunding fit
- prepare campaign case
- build campaign assets
- measure prelaunch demand

Approvals:
- create/change account
- publish campaign
- spend paid promotion
```

## Social content

```text
Paperclip Goal:
Determine whether positioning X produces qualified demand from segment Y

Project:
Q4 Content Demand Experiment

Issues:
- create campaign contract
- produce channel package
- review creative
- request publish approval
- measure demand
```

The visible UI should therefore reflect business execution naturally instead of exposing only infrastructure-level Jules runs.

---

# 14. Approvals must use native Paperclip approval surfaces

FounderOS external-action decisions should flow into native Approvals wherever possible.

Examples:

```text
Jules plan approval
social publishing
Kickstarter publishing
paid campaign spend
account registration/change
payment/deposit setup
sensitive outreach action
budget override
```

Do not make operators inspect raw callback JSON or GitHub files to approve consequential actions.

If additional approval types are required, extend Paperclip's native approval model and UI rather than creating a separate FounderOS approval queue.

---

# 15. Budgets/costs use native Paperclip finance surfaces

Paperclip's native Costs/Budget views remain the visible monetary governance layer.

The Jules Capacity Broker adds a separate scarce-resource quota model because session starts/concurrency are not monetary budgets, but those quota objects should still be surfaced in Paperclip UI and linked to native companies/projects/issues.

Do not replace existing monetary budget handling with FounderOS quota files.

---

# 16. Activity and Inbox should expose FounderOS execution

Meaningful FounderOS events should create native activity/operator-attention records where appropriate:

```text
goal activated
goal blocked
goal achieved
project started
Jules session dispatched
Jules waiting for feedback
completion candidate submitted
validation failed
Hermes requested same-session revision
approval required
market evidence threshold reached
WAITING_FOR_MARKET entered/exited
artifact became stale
```

Avoid flooding Activity with low-value tool calls.

The operator should not need to query a hidden event store to understand company progress.

---

# 17. GitHub/Firm and Paperclip have different authoritative responsibilities

This distinction is intentional:

```text
PAPERCLIP NATIVE STATE
= organization and execution control

company identity
visible direction
agents / roles / reporting
strategic goals
projects
issues/outcomes
assignments
approvals
budgets
execution status
operator attention

GITHUB + FIRM
= business knowledge and durable evidence

venture thesis
claims
assumptions
evidence
experiments
customers / interactions
market research
offers
business models
business-plan inputs
content/campaign artifacts
decisions and provenance
```

Do not force GitHub/Firm to become Paperclip's UI state store, and do not force Paperclip tables to duplicate every evidence record stored in GitHub/Firm.

Paperclip may cache/index selected GitHub/Firm data for UI and orchestration.

---

# 18. Import/bootstrap must create visible native organization state

A GitHub company import should not end with only a repository binding.

FounderOS bootstrap should create/configure native Paperclip objects such as:

```text
Company
Company.description / venture direction
CEO/founder-manager native Agent if missing
selected FounderOS specialist Agents
company-level validation Goal
child Goals
initial validation Project
first executable Issue/outcome
```

All objects should point back to their FounderOS template/source provenance.

The operator should immediately see the imported company represented in:

```text
Dashboard
Goals
Projects
Issues
Agents
Org Chart
```

---

# 19. Native UI integration requirements

Do not build a replacement FounderOS shell around Paperclip.

Enhance existing native surfaces.

## Goals

Show:

```text
required skills
support packs
required capabilities
inputs/outputs
acceptance criteria
cannot-complete-if
execution state
validation state
Hermes verdict
```

## Projects

Show:

```text
linked goals
lead agent
FounderOS system/workstream
current Jules executions
major work products
WAITING_FOR_MARKET status where relevant
```

## Issues

Show:

```text
outcome contract
Jules session / PR
Linear workstream reference
validation result
Hermes verdict
work products/evidence links
```

## Agents / Agent Detail

Show:

```text
native role + specialized title
reportsTo
FounderOS role-template provenance
skills/capabilities
current goals/projects/issues
Jules profile/session activity when applicable
```

## Org Chart

Continue using native `reportsTo` relationships.

## Dashboard

Prefer native widgets/cards summarizing:

```text
active strategic goal
validation stage
WAITING_FOR_MARKET
active projects
blocked outcomes
pending approvals
recent evidence events
Jules fleet utilization
```

These are extensions of the native UI, not a competing dashboard model.

---

# 20. No hidden parallel-state rule

The following are forbidden architecture patterns:

```text
FounderOS YAML file says goal is active
while Paperclip Goals UI says no goal exists

Firm says an agent owns a workstream
while Paperclip has no corresponding Agent/Project assignment

Linear becomes the only place where a strategic project exists

Jules prompt contains a private task tree invisible to Paperclip

Hermes memory contains the current plan but no native Goal/Project/Issue exists

FounderOS creates a custom approval queue separate from native Approvals
```

When an organizational state transition matters to the company, promote it into the appropriate native Paperclip object.

---

# 21. Goal-template activation contract

When Hermes decides that a reusable FounderOS goal should start, the deterministic control plane should do roughly:

```text
1. resolve goal template
2. resolve owner native Agent
3. resolve parent native Goal
4. create native Goal
5. persist template provenance
6. resolve support packs/capabilities
7. create/link native Project when needed
8. create first native Issue/outcome
9. assign native Agent
10. dispatch Jules only after native state exists
```

The Jules session should never be the first durable record of the work.

---

# 22. Goal completion contract

The reverse flow is equally important:

```text
Jules completion candidate
→ native Issue enters validation/review state
→ deterministic validation
→ Hermes judgment
→ native Issue done or revision requested
→ native Goal progress evaluated
→ native Goal achieved only when its business acceptance criteria are satisfied
→ parent goal/project status recalculated where appropriate
→ visible Activity event
```

A merged PR alone must never silently mark a strategic Goal achieved.

---

# 23. Role-template installation contract

FounderOS role definitions under `company-package/agents/**` should instantiate native agents.

Every role template should specify:

```text
template id
native role enum
native display title
reports-to template
adapter type
capabilities
instructions path
skills
recommended goal types
budget defaults if any
metadata/provenance
```

Example:

```yaml
id: customer-discovery
nativeRole: researcher
title: Customer Discovery
reportsTo: conductor
adapterType: jules
skills:
  - customer-discovery-methods
  - jobs-to-be-done
eligibleGoals:
  - run-discovery
  - synthesize-customer-interviews
```

Bootstrap resolves `reportsTo` to actual native agent IDs.

---

# 24. Acceptance tests for native integration

Codex should add end-to-end tests proving at least:

```text
1. Activating a FounderOS goal template creates a native Goal returned by goals API.

2. The goal appears in the same native Goals tree used by manual goals.

3. Parent/child hierarchy renders correctly.

4. Goal owner links to a native Agent.

5. FounderOS support fields persist on the native Goal.

6. A linked Project appears on Goal detail.

7. A linked Issue carries goal/project/agent IDs.

8. FounderOS role templates create native Agents visible in Agents and Org Chart.

9. `reportsTo` produces the expected org hierarchy.

10. Jules dispatch receives the native company/goal/project/issue/agent IDs.

11. Completion updates the native Issue lifecycle before native Goal achievement.

12. External-action requests appear in native Approvals.

13. Meaningful progress appears in native Activity.

14. GitHub/Firm artifacts link back to native issues/goals as work products/evidence references.

15. No parallel FounderOS goal/task database is required to render organizational state.
```

---

# 25. Required correction to `adaptations_spec.md`

Interpret all sections of `adaptations_spec.md` according to this rule:

> A FounderOS "goal library" is a library of templates that instantiate native Paperclip Goals. A FounderOS "role" is a template/configuration for a native Paperclip Agent. A FounderOS "project/workstream" should use native Paperclip Projects. Executable outcomes should use native Paperclip Issues. Approvals, budgets, activity and operator attention should use native Paperclip surfaces wherever the corresponding primitive exists.

This requirement overrides any earlier wording that could be interpreted as creating FounderOS-specific parallel runtime objects.

---

# 26. Updated governing principle

The full operating principle is now:

> **Paperclip shows and controls the organization. Hermes reasons over it. Jules executes its native goals/issues. Linear decomposes work. Firm structures business knowledge. GitHub remembers evidence and artifacts. Resource packs support each goal. Evidence decides what the company should do next.**
