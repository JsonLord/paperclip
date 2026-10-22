# Paperclip live continuation state — 2026-10-21

## Agency Supervisor development checkpoint — 2026-10-22

This checkpoint supersedes earlier development advice, not the deployed source.
Review branch `codex/agency-supervisor-v1` starts at exact
`559a18cd76e42b0242446c2f7464a57f5aa9c967`. Native current-run authority,
terminal-session retention and transactional late-product registration are prepared
alongside an external MANUAL API controller. They are **not deployed** to HF.
Do not import the divergent qualification branch or replay provider repair.

Local qualification: full typecheck/build/token checks PASS; 141 test files,
802 passed / 1 skipped; 21 Python supervisor tests PASS; real PostgreSQL completion
and revision-CAS integration PASS. Verdict is
`PAPERCLIP_AGENCY_SUPERVISOR_PARTIAL`, with **zero new live specialist or Hermes
runs**. Native password sign-in returned HTTP 401. The user is updating
`PAPERCLIP_ADMIN_PASSWORD` securely; a saved environment draft must be published
before assuming credentials changed. HF revision remains
`763bd8154b9e417ea171749936da6e968b3cb6ea`, but its API reported
`RUNNING_BUILDING` while public health was ok. Stop live dispatch until stable
RUNNING and legitimate native auth are both verified. No deployment/restart was
performed or authorized as a workaround.

Fresh baseline backup `96ac0e53a57eedafdd0e3e6b311eaebb16841cdc`
(2026-10-22T08:58:21Z) proves 48 AUX agents, 45 unique canonical IDs and all
37 new specialists paused. This is not a fresh authenticated live roster read or
post-workflow restore proof. PR #14 remains untouched at `c10730d8...`.

Read these before further work:

- [Qualification and exact blockers](2026-10-22-agency-supervisor-qualification.md)
- [Architecture and recovery limits](2026-10-22-agency-supervisor-architecture.md)
- [Exact bounded live workflow handoff](2026-10-22-agency-supervisor-live-handoff.md)
- [Selective workforce port assessment](2026-10-22-validation-workforce-port-assessment.md)

The planned two-specialist workflow is the pinned canonical `validate-problem`:
Hypothesis Formulator → Evidence Auditor → one explicit Founder Manager review.
Use the pinned catalog persona loader for reused roles. Max active 1; one new
session per specialist; no replacement on ambiguity, validation failure or expiry.
After credentials are available, run the read-only preflight first, inspect native
capacity, then follow the handoff. No canonical evidence acceptance or PR merging.
The authoritative live source below remains unchanged.

This document is the canonical startup note for future Codex/Jules sessions working on the live AUX Paperclip deployment.

It records the verified state after:

1. restoring the stable FounderOS deployment,
2. materializing the canonical 45-role Agency workforce through the live Paperclip API,
3. repairing Jules provider readiness through the existing native rebind path, and
4. proving one genuine Agency specialist → Paperclip → Jules remote dispatch.

Do not reconstruct this state from chat history when this document and the linked qualification reports are available.

## Live deployment source of truth

Live Space:

`https://leon4gr45-paperclip-founder.hf.space`

Live application source:

`0eba2bb8dce7093b77ccb952f71fea91edee6da8`

Live Hugging Face Space revision:

`763bd8154b9e417ea171749936da6e968b3cb6ea`

The focused Jules env-profile patch:

`0697069221de9830e40d0a80f84fa8189daf9128`

is qualified in GitHub but **is not deployed**. It was not needed for the successful live qualification because the deployed native rebind path repaired the existing profiles.

Do not redeploy merely to apply `0697069`.

## Canonical GitHub continuation lineage

Agency materialization report/tooling:

`01e0f7b656c44ab57af93c25fd95014ab82d9439`

Live Jules provider qualification report:

`003d1ebc693a73fa7200138964ff9ff79aaff13f`

Continuation branch:

`codex/jules-provider-repair-v1`

Canonical Agency source:

Repository: `JsonLord/agency-agents`

Branch: `validation-workforce`

Pinned commit:

`cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09`

## AUX company

Company:

`AUX`

Company ID:

`347647d4-e607-4310-b94e-10116f0a42a4`

Repository:

`JsonLord/aux-company`

Jules source:

`sources/github/JsonLord/aux-company`

Company Jules source ID:

`86620329-051d-4ef9-b1ea-e96e03454e22`

Starting branch:

`main`

## Current native organization

Verified live native agents:

`48`

Canonical Agency identities:

`45`

Canonical Agency divisions:

`9`

Agency duplicates:

`0`

Agency roles reused from FounderOS:

`8`

New Agency native agents created:

`37`

All 37 newly created Agency specialists are paused.

Founder Manager is retained.

FounderOS-only specialists retained:

- Product Engineer
- Finance Lead

Do not re-import the Agency roster.

Do not run the Agency reconciler in apply mode unless a later audit proves actual roster drift.

Normal startup verification should be read-only.

## Jules provider state

Instance-wide Jules profiles after repair:

`6`

Verified AUX-eligible profiles:

`2`

Both AUX profiles were verified enabled, active, GitHub-capable, and backed by usable company credentials/source access after native rebind.

The native repair endpoint used exactly once was:

`POST /api/companies/347647d4-e607-4310-b94e-10116f0a42a4/founderos/rebind-jules-source`

Verified result:

- rebound: true
- agentsResumed: 0
- issuesUnblocked: 0
- source access: PASS

No per-agent Jules profile was created.

No deployment was required.

## Historical failed provider run

Historical failed Paperclip run:

`225b7f24-cab0-4d23-b22a-220f40940168`

Failure:

`jules_auth_required`

This run had:

- no selected Jules profile,
- no remote Jules session,
- no provider allocation.

It is historical evidence only.

Do not retry or reinterpret it as resumable provider work.

## Successful live Agency provider qualification

Agency specialist:

`problem-explorer`

Native agent ID:

`fe587e90-c36c-4cb2-a178-4334acb64493`

Qualification issue:

`72f4e745-8ec9-4800-b4bf-8cfa374feaea`

Successful new Paperclip run:

`78b24170-ba16-4c33-b640-5ea8f3032d0b`

Selected Jules profile:

`3764ab0c-4eeb-47d2-9a23-b1cbdef334e0`

Remote Jules session:

`12665313018966666909`

Remote state:

`COMPLETED`

Provider dispatch verdict:

`PASS_LIVE`

Overall Agency Jules qualification:

`AGENCY_JULES_LIVE_QUALIFICATION_PASS`

Problem Explorer was re-paused after the qualification.

Do not create another qualification issue, second wake, or second remote session merely to repeat this proof.

## PR #14 — preserve as partial acceptance evidence

AUX pull request:

`JsonLord/aux-company#14`

PR head:

`c10730d8b610c048d792f8b604a6ac6baa570ccb`

Base:

`main`

The PR changes exactly one permitted file:

`live-qualification/agency/problem-explorer.md`

Provider execution is qualified, but artifact acceptance remains partial because the artifact embeds the wrong Paperclip Run ID.

Wrong embedded ID:

`225b7f24-cab0-4d23-b22a-220f40940168`

Correct run ID:

`78b24170-ba16-4c33-b640-5ea8f3032d0b`

PR #14 remains unmerged.

The associated Paperclip issue is in review and unassigned.

Do not silently rewrite this evidence merely to manufacture an end-to-end PASS.

The mismatch is useful evidence of a correlation/prompt-context defect.

## Known late-PR registration limitation

The initial Paperclip heartbeat ended while the remote Jules session was still in progress.

Therefore the heartbeat result retained the initial remote state and did not contain the later PR.

The durable Jules reconciliation path later observed the remote session as completed and recorded the PR/completion candidate.

This means:

- provider/session proof is valid,
- remote completion is valid,
- the first heartbeat result is stale by design/current limitation,
- issue work-product registration remains incomplete for this late-arriving PR.

Do not treat heartbeat success alone as artifact acceptance.

## Durable backup

Fresh verified backup commit:

`25b190bd13122335287b676dac42fe1a005b8ac2`

Repository:

`JsonLord/paperclip-companies-backup`

The backup proves:

- 48 AUX native agents,
- 45 unique Agency identities,
- 37 new specialists paused,
- selected Jules profile active,
- company source enabled,
- successful new run → profile → source → remote Jules session binding,
- completion candidate and PR binding.

Backup/restore had already been proven for the restored FounderOS baseline.

No restart was performed after the latest provider-repair qualification.

## What future sessions MUST NOT do

Do not:

- re-import the 45-role Agency roster;
- rerun the one-shot Agency apply script without proven drift;
- create a duplicate AUX company;
- redeploy the Space merely to apply `0697069`;
- rerun the native source repair merely because a future session starts;
- create another Jules profile per specialist;
- mass-resume the 37 paused Agency specialists;
- enable scheduled heartbeats for all Agency specialists;
- repeat the Problem Explorer qualification probe;
- merge PR #14 as if artifact acceptance passed;
- overwrite or erase the historical failed provider run;
- infer current remote state from the old heartbeat snapshot.

## Normal startup procedure

A future session should begin with read-only verification:

1. `GET /api/health`
2. authenticate as the existing board/instance-admin account;
3. resolve AUX through `GET /api/companies`;
4. verify AUX company ID;
5. verify native agent count = 48;
6. verify 45 unique `metadata.agencyId` values;
7. verify Agency duplicates = 0;
8. verify the 37 newly created Agency specialists remain paused;
9. inspect Jules profiles and AUX source binding;
10. inspect active/live runs before issuing any wake;
11. reconcile known run/session IDs before creating new provider work;
12. read the latest durable backup marker.

If these invariants hold, continue from the existing live state.

Do not perform repair mutations during startup merely to make the checks green.

## Current qualification matrix

```text
STABLE_SPACE_RUNTIME                 PASS_LIVE
FOUNDEROS_BASELINE                   PASS
AUX_COMPANY                          PASS
AGENCY_MATERIALIZATION               PASS
AGENCY_CANONICAL_IDS                 45
AGENCY_DUPLICATES                    0
NEW_AGENCY_SPECIALISTS_PAUSED        37
JULES_NATIVE_REBIND                  PASS
JULES_SOURCE_ACCESS                  PASS
JULES_PROVIDER_DISPATCH              PASS_LIVE
JULES_REMOTE_COMPLETION              PASS_LIVE
AGENCY_SPECIALIST_ARTIFACT_ACCEPT    PARTIAL
PR14_MERGED                          NO
FRESH_BACKUP                         PASS
0697069_DEPLOYED                     NO
SPACE_DEPLOYMENT_CHANGED             NO
```

## Recommended next engineering work

The next work should not be deployment recovery or roster materialization.

Preferred next sequence:

1. fix the run-correlation / stale-context defect exposed by PR #14;
2. fix or formalize late-PR/work-product registration after remote Jules completion;
3. build the supervisor/orchestration layer that:
   - reads goals/issues,
   - selects an appropriate paused Agency specialist,
   - assigns one bounded issue,
   - resumes/wakes exactly that specialist,
   - observes the same run/session,
   - validates outputs,
   - re-pauses the specialist,
   - escalates approvals to Founder Manager/human control;
4. only after that is reliable, selectively port the later `/validation/*` and `/workforce/*` governance layer;
5. keep Nodepad canonical evidence integration as a separate controlled phase.

The stable Space should remain frozen while these higher-level control-plane capabilities are developed externally or on isolated Git branches.

## Evidence documents

Read these before modifying the system:

- `doc/plans/2026-10-21-agency-api-qualification-report.md`
- `doc/plans/2026-10-21-agency-api-materialization.md`
- `doc/plans/2026-10-21-jules-provider-repair.md`

When these notes conflict with older chat summaries or stale local workspace state, prefer the verified live API, current durable backup, and the evidence documents above.
