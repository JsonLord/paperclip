# Agency Supervisor v1 qualification

2026-10-22. Review branch `codex/agency-supervisor-v1`, based exactly on
`559a18cd76e42b0242446c2f7464a57f5aa9c967`. Implementation commits include
`f575d2c` (identity), `313596c` (late completion), `eb70cbb` (terminal bindings and
PostgreSQL recovery), and `751cdd4` (external supervisor). No merge or HF deployment.

## Verification

| Check | Result |
| --- | --- |
| Full `pnpm -r typecheck` | PASS_LOCAL |
| Full `pnpm test:run --maxWorkers=2 --minWorkers=1` | PASS_LOCAL: 141 files, 802 passed, 1 skipped |
| Full `pnpm build` | PASS_LOCAL; Vite retains its nonfatal large-chunk warning |
| `pnpm check:tokens`, staged diff whitespace | PASS_LOCAL |
| Python supervisor suite | PASS_LOCAL: 21 tests |
| Python Black formatting and CLI help | PASS_LOCAL |
| Real PostgreSQL late-completion registration + document CAS | PASS_INTEGRATION: 2 tests, included in full suite |
| Native plan approval | PASS_LOCAL: 5 tests, included in full suite |
| Current live workflow | NOT_RUN: preflight blockers below |

The PR #14 historical/current mismatch is reproduced explicitly. Tests cover
current identity precedence, wrong run/agent/issue/session rejection, preserved
history, terminal-session reuse without replacement starts, late PR registration
after heartbeat completion, ten concurrent polls producing one native product and
one review event, stale poll JSON merge, and one-winner native document revisions.

External tests cover read-only selection/status, ten canonical task types, skills,
capabilities, budget/policy pause, retained Finance Lead, engineering/external gates
before mutations, explicit activation, one wake, lost-wake recovery, concurrent
reservation/CAS, scope collision before resume, lease expiry holding capacity,
stop without claiming remote cancellation, current source/artifact provenance,
missing outputs/branch/quality gates, forbidden/secret/symlink paths, artifact-fetch
failure re-pause, uncertain product response recovery, native failure activity,
sequential validated upstream dependencies, and one uncertain Founder Manager wake
recovering to a genuine structured test decision. Fixtures are not live providers.

## Errors found and corrected

1. Historical run IDs could override the actual current run in generated artifacts.
   Explicit current identity now brackets the native and stable-compatible prompt.
2. A PR arriving after the short heartbeat had no native work product. Existing
   durable reconciliation now registers the candidate transactionally.
3. A stale remote poll could overwrite the registration marker. SQL JSON merge
   preserves it; real PostgreSQL regression coverage verifies this interleaving.
4. Terminal failed/cancelled/no-PR sessions could silently allocate a replacement.
   Existing bindings are now retained until an explicitly reviewed reset.
5. Reused FounderOS roles lack the newly imported roles' persona prompt. The
   external controller loads the pinned canonical persona before reservation.
6. Plan-approval tests initially failed because their DB double flattened OR into
   AND. It now preserves nested logical groups; native approval gates still pass.
7. The new PostgreSQL fixtures initially collided on default company prefix. They
   now use separate prefixes; no production constraint was weakened.
8. Founder review cleanup could be lost after a terminal checkpoint. Cleanup has a
   durable intent state and is safely resumed before marking the review terminal.

## Live follow-up after credential refresh

Updated native password login and the full read-only preflight passed. HF returned
stable RUNNING at its unchanged revision; all ten live roster routing cases passed.
One MANUAL `validate-problem` workflow was created:
`2275619a-6e55-48b4-902f-94da9b896c77`, control issue
`c3453977-d9f2-4509-9c3e-ea16d309cecb`. First issue
`c2e3ee5d-7fcb-480a-bc03-99d38340a6f0`; queued auditor issue
`e8fbebb8-fb86-426a-8119-b80171dc2cf6` remains unassigned backlog.

Exactly one Hypothesis Formulator wake produced native run
`0d6af1b0-ed5f-4b8e-8891-d3f89822dab8`, agent
`5fc4c503-6699-4f1d-8eb1-4355c6d3d6e1`. Admission was DENIED with
`jules_auth_required`: "No eligible profile has an accessible credential".
There is no remote session ID or artifact. Reconciliation recorded FAIL, blocked
and unassigned the issue, and re-paused the specialist. No replacement wake,
provider rebind, auditor activation or Hermes review was attempted.

Final authenticated status: 48 agents, 45 unique canonical IDs, zero duplicates,
38 mapped roles paused (all 37 new specialists plus the reused auditor), zero
active native runs and zero active supervisor reservations. The 6 existing global
profiles were not modified. Their stored 15-start limits are inherited deployed
behavior, not the user's requested 10-start configuration; no quota/deployment
housekeeping was performed. The earlier auth/Space blockers below are historical;
the current blocker is native provider credential eligibility. A fresh post-attempt
backup is still pending verification.

```ini
LIVE_MULTI_AGENT_QUALIFICATION = PARTIAL
LIVE_SPECIALIST_1 = hypothesis-formulator
LIVE_SPECIALIST_1_PAPERCLIP_RUN = 0d6af1b0-ed5f-4b8e-8891-d3f89822dab8
LIVE_SPECIALIST_1_JULES_SESSION = none (admission denied)
LIVE_SPECIALIST_1_VALIDATION = FAIL
LIVE_SPECIALIST_2 = none
FOUNDER_MANAGER_REVIEW = NOT_RUN
NEW_AGENCY_SPECIALISTS_PAUSED_FINAL = 37 (authenticated live check)
FRESH_BACKUP = NOT_REQUIRED (baseline verified; post-attempt proof pending)
```

The user next requested a separate admin API secret. That is a new focused change;
`BETTER_AUTH_SECRET` is not accepted as an API credential and is not used to forge
sessions. Prepare the separate token change from the deployed source lineage.

## Live observations and stop gate

No new control/step issues, agent resumes, wakes, provider sessions, PRs or deployment
were created during this qualification. Native password sign-in returned HTTP 401
with the configured credentials. The user was asked to update the secret securely;
the environment draft retains `PAPERCLIP_ADMIN_PASSWORD` scoped only to the app host.
Draft saving is not publication or proof of refreshed credentials.

HF API returned revision `763bd8154b9e417ea171749936da6e968b3cb6ea`, stage
`RUNNING_BUILDING`; the public health endpoint returned status ok, authReady true,
bootstrap ready. This is **not** stable live readiness. PR #14 remains at head
`c10730d8b610c048d792f8b604a6ac6baa570ccb`, base main. Its artifact stays unaccepted.
GitHub PR metadata access works. Do not repair deployment or bypass auth to start
this workflow. Re-run the read-only preflight after credentials/publication and
stable RUNNING state are confirmed.

Fresh fetched backup `96ac0e53a57eedafdd0e3e6b311eaebb16841cdc` at
2026-10-22T08:58:21Z contains 48 AUX agents, 45 unique Agency IDs, no duplicates,
and all 37 newly imported specialists paused. This is fresh baseline backup proof,
not a post-workflow restore test. Current authenticated live roster re-verification
is blocked by HTTP 401; the counts below refer to that backup, not a fresh live GET.

## Required gate report

PASS entries below are local/integration scope. No new live external ID exists.
The complete final remote SHA is supplied in the remote verification receipt and
final handoff; a report cannot embed its own Git commit hash.

```ini
START_SHA = 559a18cd76e42b0242446c2f7464a57f5aa9c967
BRANCH = codex/agency-supervisor-v1
FINAL_SHA = see final remote HEAD verification receipt
LIVE_SPACE_SOURCE = 0eba2bb8dce7093b77ccb952f71fea91edee6da8
SPACE_DEPLOYED = NO
AGENCY_NATIVE_AGENTS = 48 (fresh backup; live auth blocked)
AGENCY_CANONICAL_IDS = 45 (fresh backup)
AGENCY_DUPLICATES = 0 (fresh backup)
CURRENT_RUN_AUTHORITY = PASS
PR14_CORRELATION_REGRESSION = PASS
ARTIFACT_CORRELATION_VALIDATOR = PASS
LATE_JULES_COMPLETION_RECONCILIATION = PASS
WORK_PRODUCT_REGISTRATION = PASS
WORK_PRODUCT_IDEMPOTENCY = PASS
AGENCY_SPECIALIST_SELECTOR = PASS
SELECTOR_EXPLAINABILITY = PASS
ENGINEERING_BOUNDARY = PASS
FINANCE_CONTINUITY = PASS
SUPERVISOR_RECOMMEND = PASS
SUPERVISOR_ACTIVATE = PASS
SUPERVISOR_STOP = PASS
SUPERVISOR_RECONCILE = PASS
SESSION_REUSE = PASS
DUPLICATE_WAKE_PROTECTION = PASS
AUTO_REPAUSE = PASS
RESTART_RECOVERY_TEST = PASS
LIVE_MULTI_AGENT_QUALIFICATION = NOT_RUN
LIVE_SPECIALIST_1 = hypothesis-formulator (planned only)
LIVE_SPECIALIST_1_PAPERCLIP_RUN = none
LIVE_SPECIALIST_1_JULES_SESSION = none
LIVE_SPECIALIST_1_VALIDATION = REVIEW_REQUIRED (not run)
LIVE_SPECIALIST_2 = none
LIVE_SPECIALIST_2_PAPERCLIP_RUN = none
LIVE_SPECIALIST_2_JULES_SESSION = none
LIVE_SPECIALIST_2_VALIDATION = REVIEW_REQUIRED (not run)
FOUNDER_MANAGER_REVIEW = NOT_RUN
NEW_AGENCY_SPECIALISTS_PAUSED_FINAL = 37 (fresh backup; live auth blocked)
FRESH_BACKUP = PASS (baseline only; no mission live mutations)
VALIDATION_WORKFORCE_PORT_RECOMMENDATION = selective read-only metrics/decision features later; no wholesale merge, seeding or new workforce tables
```

**PAPERCLIP_AGENCY_SUPERVISOR_PARTIAL**

Local and integration control-plane qualification passes. The live two-specialist
chain and Hermes review remain pending; there is no claim of PASS_LIVE. Exact
next commands and task contracts are in
[the live handoff](2026-10-22-agency-supervisor-live-handoff.md). The deployment
still runs its existing source; native fixes here are reviewable code only.
