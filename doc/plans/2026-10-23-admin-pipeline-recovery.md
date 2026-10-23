# Admin API and bounded pipeline recovery — 2026-10-23

## Root causes and recovery

The live HF revision `26bfabb1fd3fe4245f07169f7f564f8199ca12bf` accepts the
updated independent `PAPERCLIP_ADMIN_API_TOKEN`. The server confirms its minimum
length, existing admin identity and separation from other secrets. Live Bearer
checks pass for session identity, invalid-token denial, company/admin routes,
roster preservation, native journal access and document write/read without cookies
or Origin. No credential values are included in this report.

The historical run `0d6af1b0-ed5f-4b8e-8891-d3f89822dab8` returns 404 because
`deploy/hf-space/overlay/deploy/backup.sh` excludes `heartbeat_runs` from its SQL
restore payload. The ephemeral Space recreated its database on restart. Native
issue documents, including the supervisor journal, are restored independently.
The harness incorrectly assumed that every historical run referenced by the
journal remained queryable after a restart. This was a qualification dependency,
not an admin-token authorization failure.

Verified immutable backup commit
`4d6aeec99c602a6d507eadc8e20de6318a0a71ad` contains exactly one matching failed
run in `companies/aux-347647d4/diagnostics/runs.json`. Its error is
`jules_auth_required`; issue and activation wake reason match. The same backup
contains no Jules session for that issue and no allocated session in its capacity
events. The journal remains FAIL with no remote session. The original full native
run receipt independently records `AUTH_REQUIRED` / `DENIED`.

`agency_supervisor.history.archived_admission_denial` provides read-only checking
for this narrow case. Callers must fetch the immutable Git commit and read the
company directory's actual blobs; obtain the archive company ID from its
`company.json`. A missing run alone is never proof of denial. The function rejects
nonterminal/ambiguous work, foreign company/issue/activation, missing/duplicate
runs, other failures, and any previous allocation. It returns a FAIL receipt and
explicitly does not authorize redispatch or change the journal. Active work still
requires reconciliation. New work requires explicit board authorization and all
normal controller gates. The deployed backup policy is unchanged; do not restart
the Space during this qualification.

The native Jules rebind endpoint repaired the restored provider credentials and
confirmed `sources/github/JsonLord/aux-company`. Six profiles remain six; all 48
agent configurations/statuses were unchanged; zero agents resumed and zero issues
unblocked. No provider session was allocated by repair.

The first `agency-task` document also contained three invalid `\[` JSON escapes.
A board-only revision-CAS update reconstructed exactly the previously approved
contract: one synthetic markdown output, repository `JsonLord/aux-company`, base
`main`, no external action or production engineering. The second task was valid.
No general parser relaxation or automatic rewriting was introduced.

## Bounded new attempt

A single reviewed workflow `4f0ecd82-2a08-4cba-a087-076cbefdee99` reuses the two
existing task issues, preserving the failed historical workflow and activation.
Its pending create intent was resumed only after verifying no new workflow or
live run existed. Concurrency remains one. No blind wake retry is allowed.

Hypothesis Formulator:

- activation: `f81feb29-4824-57e3-b6e2-ca4203a8c059`
- native run: `60865331-ece5-4a6d-a7e0-9d08654dfc67`
- genuine Jules session: `1150190659489654568`
- final status: PASS_LIVE; paused; artifact validation has no findings

Runtime completion and remaining verification are recorded below as obtained.

## Final live result

`PASS_LIVE`: the reviewed workflow reached `REVIEWED` using the independent admin
token throughout. Both synthetic artifacts passed immutable-commit checks and
were registered once as native completion candidates with `accepted: false`.

| Stage | Native run | Real remote artifact/session | Result |
| --- | --- | --- | --- |
| Hypothesis Formulator | `60865331-ece5-4a6d-a7e0-9d08654dfc67` | Jules `1150190659489654568`; [PR15](https://github.com/JsonLord/aux-company/pull/15), `f03b5c3aba7762c337192210b71757ef98c53a9e` | PASS_LIVE |
| Evidence Auditor | `a89b7e00-8599-4c19-9f5c-23cd4edc2314` | Jules `7202039458626173123`; [PR16](https://github.com/JsonLord/aux-company/pull/16), `633d687290914a2ec61dc574fdd271348f929e01` | PASS_LIVE |
| Independent parallel Hermes smoke | `552f4b0d-a9a7-403f-9cd2-da71e7e2aee1` | Unique marker returned by model, 18:23:52–18:24:27 UTC, while auditor remote reservation was active | PASS_LIVE |
| Final Founder Manager review | `939ca753-3034-4a90-a35a-89cae888dd05` | Structured model decision `NEEDS_EXTERNAL_EVIDENCE` | PASS_LIVE |

The parallel smoke was explicitly requested during the live work; it was separate
from the final review. The final review waited for both validated upstream outputs.
The manager correctly identified an unverified technical assumption and the need
for empirical architectural testing/market validation. PASS here means the
orchestration and validation cycle worked, not that the business hypothesis passed.
A startup activities-list 404 was transient; native reconciliation recovered and
both real sessions reached `COMPLETED_UNVALIDATED` without redispatch.

Final authenticated cleanup at 18:27 UTC: 48 agents, 45 unique canonical identities,
all 37 newly imported specialists paused; both leased specialists paused; Founder
Manager idle; specialist/review issues unassigned; zero active native runs or
supervisor reservations. Repeating both terminal reconciliations and the manager
reconciliation left the native run IDs unchanged. PR14 remained at
`c10730d8b610c048d792f8b604a6ac6baa570ccb`. PR15/16 remain unmerged. No canonical
evidence was accepted, and no Nodepad provider contract was changed.

Backup `4e934da4800665a8af5152ed612d12beacef071e` independently records the first
session completed and the auditor in progress, both without reconciliation errors.
The final journal is present in native issue documents. A subsequent periodic
backup containing the final review and a restore of that backup have not been
qualified; this report does not claim active-run restart safety on the HF
backup policy that omits heartbeat history.

## Reusable operator commands

The supervisor CLI now has explicit `--auth admin-token`; password auth stays an
explicit alternative. The Bearer client has no cookies, Origin, redirect following,
password fallback or signing-secret authentication. Its identity is checked through
the native session endpoint. No credentials are accepted on the command line.

The preflight takes a required reviewed `--expect-hf-sha` rather than a stale
hardcoded revision and verifies both Space and runtime SHA. It also requires the
control issue and rejects active/ambiguous/expired reservations or untracked
remote work, including when the native adapter invocation already finished.

```sh
python scripts/agency-supervisor-preflight.py \
  --auth admin-token \
  --expect-hf-sha 26bfabb1fd3fe4245f07169f7f564f8199ca12bf \
  --control-issue c3453977-d9f2-4509-9c3e-ea16d309cecb \
  --catalog /workspace/agency-agents

python scripts/agency-supervisor.py status \
  --auth admin-token \
  --control-issue c3453977-d9f2-4509-9c3e-ea16d309cecb
```

Both commands were exercised against the real deployment after cleanup. The
preflight returned PASS_INTEGRATION. Mutating supervisor commands still require
`--apply`; status/preflight do not allocate runtime. The old failed activation
remains FAIL, and old preparation/wake commands must not be replayed.

## Verification

- Full typecheck and build: PASS_LOCAL.
- Full Vitest suite: 141 files, 802 passed, 1 skipped.
- Python controller/API/history/import suites: 46 tests passed.
- Independent pinned-backup recovery checks: 5 tests passed.
- Black, byte compilation, forbidden-token scan and whitespace check: PASS_LOCAL.
- Admin Bearer identity, invalid-token denial, admin access, roster and native
  document mutation/readback: PASS_LIVE.
- Full specialist → validation → auditor → validation → Founder review: PASS_LIVE.

These are external operator tooling changes on the supervisor review branch. No
server deployment, merge or workflow change was needed for this recovery.
