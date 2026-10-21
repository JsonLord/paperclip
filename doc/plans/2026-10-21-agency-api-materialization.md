# AUX Agency API materialization

The live API reconciliation materialized the pinned canonical Agency catalog into
AUX without changing or restarting the Hugging Face Space. The 11 existing agents
became 48: eight were reused, 37 were created, and Founder Manager, Product
Engineer, and Finance Lead were retained. All 45 Agency IDs resolve uniquely.
The 37 new specialists are paused with scheduled heartbeats disabled.

## Source provenance and deployment discrepancy

- Reconciler branch base: `0697069221de9830e40d0a80f84fa8189daf9128`.
- Agency: `JsonLord/agency-agents`, branch `validation-workforce`, exact commit
  `cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09`, `catalog/agents.json` and its persona files.
- Live AUX, discovered through `/api/companies`:
  `347647d4-e607-4310-b94e-10116f0a42a4`.
- Space revision before and after: `763bd8154b9e417ea171749936da6e968b3cb6ea`.
  This remains the earlier `0eba2bb8dce7093b77ccb952f71fea91edee6da8` rollback deployment.

The mission's assertion that `0697069` was deployed did not match live evidence.
That patch was pushed to GitHub only. The live profiles still have the previous
15-start / 3-concurrent settings, and there is no API-90 profile. No deployment,
HF variables, migrations, startup code, provider profiles, or source bindings
were changed by this task. The local patch remains available for a separately
authorized deployment; the deployment freeze was preserved.

## Reusable external reconciler

The standalone Python standard-library script
`scripts/agency-workforce-api-reconcile.py` uses native HTTPS APIs with a legitimate
board password login. Read credentials securely from `PAPERCLIP_ADMIN_EMAIL` and
`PAPERCLIP_ADMIN_PASSWORD`; cookies remain in memory. Never put values in command
arguments, tracked files, audit output, or logs.

Prepare a Git checkout containing the pinned Agency commit. Do not use `main`:

```sh
git clone --single-branch --branch validation-workforce \
  https://github.com/JsonLord/agency-agents.git /tmp/agency-api-source
git -C /tmp/agency-api-source rev-parse HEAD
```

Require the exact Agency SHA above. Each command below reads the pinned objects
with `git show`, rather than trusting mutable working files:

```sh
python scripts/agency-workforce-api-reconcile.py --dry-run \
  --agency-repo /tmp/agency-api-source --company AUX \
  --audit-dir /workspace/agency-api-materialization/reconcile
python scripts/agency-workforce-api-reconcile.py --apply \
  --agency-repo /tmp/agency-api-source --company AUX \
  --audit-dir /workspace/agency-api-materialization/reconcile
python scripts/agency-workforce-api-reconcile.py --verify \
  --agency-repo /tmp/agency-api-source --company AUX \
  --audit-dir /workspace/agency-api-materialization/reconcile
```

Optional `--base-url` or `PAPERCLIP_BASE_URL` selects the HTTPS origin. Company
selection accepts an exact name, prefix, or UUID and requires a unique active
match. Source SHA is pinned by default; another value is rejected.

Retain the original audit directory: it records baseline snapshots, created IDs,
and pending-create intent. Redaction protects secret fields. A directory lock
prevents concurrent local invocations. Do not run separate imports concurrently:
the native create endpoint has no cross-client uniqueness transaction for Agency
metadata. The script detects observed competing roster changes and stops.

Canonical `agencyId` is the identity. Only the eight explicit FounderOS template
mappings may establish identity without that field. Name similarity causes an
ambiguity stop rather than adoption. A partial roster requires its original
journal. Missing responses never cause blind retries: a pending create must
become visible with its canonical identity before recovery can pause/reuse it.
If it remains absent, investigate remote state before clearing any intent.

Each creation is followed immediately by pause and verification before the next
creation. On a pause failure, stop and pause that exact agent before continuing.
New agents use `jules`, a canonical persona prompt, and an allowlist of non-secret
repository/source configuration. No API keys, `outcomeTemplate`, per-agent
profiles, scheduled heartbeats, or unavailable runtime adapters are introduced.
The preferred canonical runtime is metadata only. Metadata reads/writes do not
constitute live Nodepad permissions or integrations.

Second live application returned `created=0, reused=45, duplicate=0`. Final
verification also confirmed preservation of original names, statuses, adapter
configuration, metadata, and capability declarations. The two FounderOS-only
specialists and Founder Manager were not modified.

## Durable backup

Existing periodic backup published commit
`a2e7ad7a80bb823a9ba135560be328f54d4b04ee` in
`JsonLord/paperclip-companies-backup`. Its AUX agents export contains 48 native
records, 45 unique canonical IDs with the pinned metadata, and all 37 new agents
paused. The SQL dump's agents section also contains all 48 native IDs and all 45
Agency IDs. The export metadata was compared against the live API snapshot.
No restart was needed or performed; post-import restore was not exercised.

## One bounded live probe

- Specialist: `problem-explorer`, native ID `fe587e90-c36c-4cb2-a178-4334acb64493`.
- Issue: `72f4e745-8ec9-4800-b4bf-8cfa374feaea`.
- Native run: `225b7f24-cab0-4d23-b22a-220f40940168`.
- Result: **FAIL**, `jules_auth_required`; admission found no eligible profile with
  an accessible credential. No remote Jules session ID, selected profile, or PR
  was created. No provider profiles were created by this probe.
- The specialist was paused again. The synthetic issue is blocked and unassigned.
  No second dispatch, second specialist, mass resume, or recurring wake was used.

The assigned task permitted only inspection of existing AUX repository material
and one explicitly synthetic research Markdown artifact/review PR under
`live-qualification/agency/problem-explorer.md`. It prohibited invented evidence,
outreach, paid services, customer contact, deployment, production engineering,
and changes to external accounts. All required native observation endpoints
(active-run, live-runs, run, events, log) were read. Native failure before provider
allocation is not `PASS_LIVE`.

The saved local probe intent and receipt are under
`/workspace/agency-api-materialization/probe.json`. Reconcile that run if revisiting
its status; do not blindly rerun the one-shot probe script. Restoring provider
readiness is a separate action constrained by the deployment freeze and the
absence of safely accessible provider credentials in this cloud environment.
The existing native source-rebind route can reseal environment credentials, but
also changes worker bindings and can unblock/wake bootstrap work. It was not
invoked during an import required to preserve the eight existing runtime
configurations and statuses; it must be assessed separately before use.

## Verification and future startup behavior

Run offline reconciler safety tests with:

```sh
python scripts/test-agency-workforce-api-reconcile.py
```

These exercise mutation ordering, stop on failed pause, uncertain-create recovery,
missing uncertain response refusal, duplicate/ambiguous identities, unchanged
FounderOS records, non-copying/redaction of credentials, idempotency, persona
drift, capability preservation, and source pinning. Full workspace checks and
results are recorded in the accompanying qualification report.

Future startup verification should be read-only: check AUX existence, 45 unique
Agency IDs, expected source SHA, and duplicates; log drift. No startup mutation or
`AGENCY_WORKFORCE_RECONCILE_ON_BOOT` behavior is implemented or enabled. No later
workforce/validation routes, tables, GitHub Actions adapter, or Nodepad binding
were ported.
