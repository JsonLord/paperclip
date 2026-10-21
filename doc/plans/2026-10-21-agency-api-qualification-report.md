# Agency API qualification report

Verdict: **AGENCY_API_MATERIALIZATION_PASS**. The complete roster is persistent
native company state, uniquely mapped, backed up, and safely paused. Live Jules
execution failed before remote allocation and is **not qualified**.

```text
PAPERCLIP_SOURCE_SHA = 0697069221de9830e40d0a80f84fa8189daf9128
AGENCY_SOURCE_SHA = cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09
AUX_COMPANY_ID = 347647d4-e607-4310-b94e-10116f0a42a4
BASELINE_NATIVE_AGENTS = 11
AGENCY_CANONICAL_AGENTS = 45
AGENCY_DIVISIONS = 9
AGENCY_REUSED_EXISTING = 8
AGENCY_CREATED = 37
AGENCY_DUPLICATES = 0
FINAL_NATIVE_AGENT_COUNT = 48
FOUNDER_MANAGER = PASS
PRODUCT_ENGINEER_RETAINED = PASS
FINANCE_LEAD_RETAINED = PASS
NEW_AGENTS_PAUSED = 37
RECONCILER_DRY_RUN = PASS
RECONCILER_APPLY = PASS
RECONCILER_SECOND_RUN_IDEMPOTENT = PASS
AGENCY_BACKUP = PASS
LIVE_SPECIALIST_PROBE = FAIL
PAPERCLIP_RUN_ID = 225b7f24-cab0-4d23-b22a-220f40940168
JULES_PROFILE_ID = none
JULES_REMOTE_SESSION_ID = none
SPACE_DEPLOYMENT_CHANGED = NO
```

`PAPERCLIP_SOURCE_SHA` above identifies the mission's qualified patch and the
reconciler's branch base. It is **not** the deployed source. The live Space
remains at revision `763bd8154b9e417ea171749936da6e968b3cb6ea`, built from rollback
source `0eba2bb8dce7093b77ccb952f71fea91edee6da8`. No redeploy/restart or HF
configuration mutation occurred.

The one `problem-explorer` probe failed `jules_auth_required`: no eligible profile
had an accessible credential. No genuine remote session or selected profile
exists. Native agent `fe587e90-c36c-4cb2-a178-4334acb64493` was re-paused, and issue
`72f4e745-8ec9-4800-b4bf-8cfa374feaea` was blocked and unassigned. Configured binding
was `JsonLord/aux-company`, source `sources/github/JsonLord/aux-company`, branch
`main`; these configuration strings are not proof of provider access. There was
exactly one explicit wake and no second dispatch.

Durable backup: `JsonLord/paperclip-companies-backup` at
`a2e7ad7a80bb823a9ba135560be328f54d4b04ee`. Both AUX agent export and SQL dump
contain the expected roster/identities. All 37 new agents were paused in the
backup; all mapped metadata matched the live API snapshot. Post-import restart
and restore were not performed.

The second live reconciliation returned `created=0, reused=45, duplicate=0`;
final verification passed after the probe. The existing eight reused roles kept
their original native IDs, names, status, adapter configuration, FounderOS
metadata, and capability declarations. The unchanged two legacy specialists and
Founder Manager are included in the final count of 48.

Verification:

- External reconciler safety suite: **13 passed**.
- Python syntax and whitespace checks: **PASS**.
- Workspace typecheck: **PASS**.
- Full tests: **791 passed, 1 skipped**, all 138 files passed on the rerun with
  `--maxWorkers=2 --minWorkers=1`. The first run had three timeouts in unchanged
  DB/runtime tests (788 passed, 3 failed, 1 skipped); the rerun retained the
  assertions and timeouts and passed with reduced worker concurrency.
- Workspace build and token checks: **PASS**. Existing Vite large-chunk warnings remain.
- Actual adapter template renderer: **PASS_INTEGRATION** for all 37 stored native
  persona prompts, including the dotted assignment fields and native IDs.

Reusable script and operations guide:
[Agency API materialization](2026-10-21-agency-api-materialization.md).
Non-secret detailed receipts are retained under
`/workspace/agency-api-materialization/`, including baseline snapshots, original
journal, dry-run, second application, final verification, durable backup proof,
and the one-shot probe receipt. No credentials or native session cookies were
committed. No later workforce/validation/Nodepad architecture was ported.
