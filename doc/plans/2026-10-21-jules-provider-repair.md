# Live Jules provider repair and one Agency qualification

The existing native source-rebind path repaired provider readiness without
redeploying or restarting the Hugging Face Space. Exactly one new Problem
Explorer wake created a genuine remote Jules session. No Agency roster import,
provider profile creation, additional specialist, or second wake occurred.

## Qualification result

Provider allocation passed with a real completed session and preserved roster.
Artifact acceptance remains partial because its embedded native run ID is wrong.

```text
AGENCY_MATERIALIZATION = PASS
LIVE_SPACE_SOURCE_BEFORE = 0eba2bb8dce7093b77ccb952f71fea91edee6da8
NATIVE_REBIND_ATTEMPTED = YES
NATIVE_REBIND_RESULT = PASS
JULES_PROFILES_BEFORE = 6
JULES_PROFILES_AFTER = 6
ELIGIBLE_PROFILES_AFTER = 2
JULES_PROFILE_READINESS = PASS
JULES_SOURCE = sources/github/JsonLord/aux-company
JULES_SOURCE_ACCESS = PASS
0697069_DEPLOYMENT_REQUIRED = NO
LIVE_SPACE_SOURCE_AFTER = 0eba2bb8dce7093b77ccb952f71fea91edee6da8
AGENCY_NATIVE_AGENTS = 48
AGENCY_CANONICAL_IDS = 45
AGENCY_DUPLICATES = 0
NEW_AGENCY_AGENTS_PAUSED = 37
PREVIOUS_FAILED_RUN = 225b7f24-cab0-4d23-b22a-220f40940168
NEW_PAPERCLIP_RUN_ID = 78b24170-ba16-4c33-b640-5ea8f3032d0b
SELECTED_JULES_PROFILE_ID = 3764ab0c-4eeb-47d2-9a23-b1cbdef334e0
COMPANY_JULES_SOURCE_ID = 86620329-051d-4ef9-b1ea-e96e03454e22
JULES_REMOTE_SESSION_ID = 12665313018966666909
JULES_REMOTE_STATE = COMPLETED
JULES_PROVIDER_DISPATCH = PASS_LIVE
AGENCY_SPECIALIST_END_TO_END = PARTIAL
PROBLEM_EXPLORER_FINAL_STATUS = paused
FRESH_BACKUP = PASS
FINAL_VERDICT = AGENCY_JULES_LIVE_QUALIFICATION_PASS
```

Profile counts are instance-wide; the two verified eligible profiles are AUX
profiles. The final verdict qualifies the provider/session gate, not artifact
acceptance or a merge.

## Provenance and protected state

- Live source before and after: `0eba2bb8dce7093b77ccb952f71fea91edee6da8`.
- Space revision: `763bd8154b9e417ea171749936da6e968b3cb6ea`.
- Qualified patch `0697069221de9830e40d0a80f84fa8189daf9128` was **not deployed**:
  native repair succeeded, so the mission's deployment gate stayed closed.
- Agency materialization base: `01e0f7b656c44ab57af93c25fd95014ab82d9439`.
- Canonical Agency source: `cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09`.
- AUX, rediscovered through the native company API:
  `347647d4-e607-4310-b94e-10116f0a42a4`.

Before mutation, native API snapshots verified 48 agents, 45 unique Agency IDs,
zero duplicates, and all 37 new specialists paused. Profiles, sources, issues,
and live runs were inspected; no heartbeat was running. The historical run
`225b7f24-cab0-4d23-b22a-220f40940168` remained terminal failed with
`jules_auth_required`, no remote session, and no provider allocation. Its events
and log were read; its history was not rewritten or treated as resumable work.

All blocked issues already lacked assignees. Therefore no temporary legacy
unassignment or restoration was necessary. Other FounderOS work was not resumed.

## Exactly one native repair

One authenticated instance-admin request was sent to:

```http
POST /api/companies/347647d4-e607-4310-b94e-10116f0a42a4/founderos/rebind-jules-source
```

Its exact non-secret result was:

```json
{
  "rebound": true,
  "reason": null,
  "repository": "JsonLord/aux-company",
  "source": "sources/github/JsonLord/aux-company",
  "profileId": "cd1a3a97-6325-4437-9062-70333d34db71",
  "agentsResumed": 0,
  "issuesUnblocked": 0,
  "unblockedIssueIds": []
}
```

HTTP status was 200. The resolver successfully accessed the provider source using
the existing API-2-backed profile. The later broker dispatch independently proved
that the existing API-1-backed profile was usable. Profile count remained six
instance-wide, including two AUX profiles. No per-agent profile or credential
was created. The API-1-backed profile moved from `auth_required` to `active`
during successful broker admission; both AUX profiles are now enabled, active,
GitHub-capable, and backed by usable company credentials/source access.

This did not qualify API-90 or apply the undeployed patch's quota changes. Native
limits remain 15 rolling-day starts and three concurrent sessions per profile.
Only one provider start was used for this qualification. No quota load test ran.

Native rebind added `deploymentReady=true` to new specialists' metadata. All
pre-existing metadata values and all 48 agent names, adapter configurations,
runtime configurations, capabilities, and reporting relationships were preserved.
The read-only external reconciler's `--verify` mode passed after repair; no apply
or import mode ran.

## One new bounded probe

The existing synthetic issue was reused without broadening its description or
write scope. It was assigned and moved to `todo` while the agent was paused;
absence of an automatic run was verified before resume and the one explicit wake.
A fresh persisted idempotency key was used, with intent recorded before dispatch.

```text
AGENT = problem-explorer
NATIVE_AGENT_ID = fe587e90-c36c-4cb2-a178-4334acb64493
ISSUE_ID = 72f4e745-8ec9-4800-b4bf-8cfa374feaea
NEW_PAPERCLIP_RUN_ID = 78b24170-ba16-4c33-b640-5ea8f3032d0b
SELECTED_JULES_PROFILE_ID = 3764ab0c-4eeb-47d2-9a23-b1cbdef334e0
COMPANY_JULES_SOURCE_ID = 86620329-051d-4ef9-b1ea-e96e03454e22
JULES_REMOTE_SESSION_ID = 12665313018966666909
REPOSITORY = JsonLord/aux-company
SOURCE = sources/github/JsonLord/aux-company
STARTING_BRANCH = main
```

Native adapter events recorded the complete binding above. The adapter fetched
actual remote state `IN_PROGRESS`; the native heartbeat returned `succeeded`
with `remoteActive=true`, `completionCandidate=false`, and `accepted=false`.
This is **PASS_LIVE provider dispatch**, independently of eventual task acceptance.
All requested native observation endpoints were read: active-run, live-runs,
heartbeat run, events, and log. Problem Explorer was re-paused after the native
run ended; all 37 new specialists remained paused with scheduled heartbeats
disabled. Remote observation continued through the existing durable reconciler,
without waking the agent or creating another session.

The task permits only reading existing AUX repository material and one synthetic
Markdown artifact/review PR at
`live-qualification/agency/problem-explorer.md`. It prohibits invented customer
or market evidence, outreach, paid services, customer contact, deployment,
production backend/database/auth/API work, account changes, delegation, and
merging the PR. No native acceptance was granted merely because dispatch passed.

## Completion and fresh backup

The native durable reconciler observed remote `COMPLETED` and stored session
`42daea3e-06ca-4c4a-96e6-96fd9abb4ad8` as `COMPLETED_UNVALIDATED`, with
`completionCandidate=true`. Its native completion activity points to
[PR #14](https://github.com/JsonLord/aux-company/pull/14).

Git verification fetched the actual PR head
`c10730d8b610c048d792f8b604a6ac6baa570ccb`, based on
`39c1394c57d6779fa953ce944f1681e20c63ebb6`. Its complete diff adds exactly one
permitted file: `live-qualification/agency/problem-explorer.md`. The synthetic
qualification label is present; it summarizes repository material and lists three
research questions. No PR was merged and no acceptance was granted.

Artifact review found a real correlation defect: its Run ID is the **historical
failed run** `225b7f24-cab0-4d23-b22a-220f40940168`, instead of the actual new run
`78b24170-ba16-4c33-b640-5ea8f3032d0b`. The reused issue description included the
historical receipt, while the actual native persona envelope supplied the new ID.
Jules selected the historical ID, and its own code review incorrectly approved
that ID. Preserve this failure as evidence: **provider dispatch PASS_LIVE,
end-to-end artifact acceptance PARTIAL**. No second wake/session or silent
reviewer rewrite was used to disguise it. The issue is now `in_review`, unassigned,
with the discrepancy recorded. The specialist remains paused.

The initial short heartbeat did not yet contain the later PR. Consequently its
result still shows the initial `IN_PROGRESS` snapshot, and the issue work-product
list remains empty; the durable Jules session and native completion activity do
contain the completed PR. This existing late-PR registration limitation was
observed, not patched. Native heartbeat success and automated code-review praise
are not substitutes for artifact validation.

Fresh durable backup was verified at commit
`25b190bd13122335287b676dac42fe1a005b8ac2` in
`JsonLord/paperclip-companies-backup`. The SQL dump proves the exact new native
run → selected profile → company source → genuine remote session → completed PR
binding. It stores the selected profile enabled/active, source enabled, and
completion candidate. The AUX export contains all 48 agents, 45 unique canonical
IDs, and all 37 new specialists paused with native rebind metadata present.
The backup occurred after provider repair and completion; the subsequent issue
review annotation is a live API audit update. No restart was performed.

Validation performed for this API-only task: preflight snapshots and historical
run reconciliation, one exact native repair response, actual provider dispatch
and remote completion, canonical persona/assignment verification from native
adapter events, read-only roster verification and 48-agent configuration diff,
actual PR diff/content review, SQL/export backup checks, and final health/Space
revision checks. Token and whitespace checks passed. Runtime application source
and the reconciler were unchanged from the prior fully tested commit; their full
791-pass/1-skip suite, typecheck and build were not repeated for this report-only
repository change.

## Audit and future continuation

Non-secret local snapshots, mutation intent, exact native repair response, old-run
reconciliation, new-run provider binding, live observations, and backup proof are
under `/workspace/jules-provider-repair/`. Login used the existing board account;
passwords, API keys, and native session cookies were never printed or persisted.
Cookies remained in memory. No HF settings, entrypoint, Docker, sync scripts,
migrations, runtime application source, or startup seeding changed.

If revisiting the task, reconcile **run `78b24170-ba16-4c33-b640-5ea8f3032d0b` and
remote session `12665313018966666909`**. Do not rerun one-shot repair/probe scripts,
create another issue, send another wake, or re-import the 45-role roster. Read
intent and receipts first. Historical failure remains historical; new session
state must not be inferred from the heartbeat's stale dispatch result.
