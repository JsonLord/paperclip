# GATE05 API Runbook (verified commands for the QA Supervisor)

Status: candidate (engineering branch `fix/gate05-reliability-hardening`). Endpoints marked
**LIVE** were verified against the deployed Space (revision `0d8325fa…`, 2026-10-24). Endpoints
marked **CANDIDATE** exist only on this engineering branch until an approved R8 deployment.

All commands take credentials only from the environment. Never paste tokens into chat, logs, URLs, or commits.

```sh
export PAPERCLIP_BASE_URL='https://leon4gr45-paperclip-founder.hf.space'
set -a; . /a0/usr/workdir/.env; set +a   # provides PAPERCLIP_ADMIN_API_TOKEN
```

## 1. Connectivity and identity (all read-only, retry-safe)

| Endpoint | Method | Auth | Verified | Meaning |
|---|---|---|---|---|
| `/api/health` | GET | none | LIVE | deployment mode + auth readiness |
| `/api/auth/get-session` | GET | admin Bearer | LIVE | session id contains `:admin_token:` |
| `/api/companies` | GET | admin Bearer | LIVE | discover company ids (do not assume UI slugs) |
| `/api/admin/api-token/status` | GET | admin Bearer | LIVE | booleans only, never token values |

```sh
curl -fsS "$PAPERCLIP_BASE_URL/api/health"
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/auth/get-session"
COMPANY_ID=$(curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/companies" \
  | python3 -c "import json,sys;print([c['id'] for c in json.load(sys.stdin) if c.get('issuePrefix')=='AUX'][0])")
```

## 2. Roster, issues, documents (read-only + bounded mutations)

```sh
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/agents"      # LIVE
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/issues"        # LIVE
# issue document read (returns latestRevisionId):                                            # LIVE
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" \
  "$PAPERCLIP_BASE_URL/api/issues/$ISSUE_ID/documents/agency-task"
```

- **Document update is compare-and-swap**: read the document first, send its `latestRevisionId`
  as `baseRevisionId`. A `409` means someone else wrote first — re-read, never blind-retry.
- **Issue creation** (`POST /api/companies/$COMPANY_ID/issues`, LIVE-verified pattern): mutating,
  NOT idempotent. If the response is lost, recover by listing issues and matching the title
  before attempting anything again.
- `GET /api/issues/<id>/work-products` — LIVE via supervisor; registration state `accepted:false` until board acceptance.

## 3. Execution state (read-only, retry-safe — use these before ANY retry)

```sh
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/live-runs"       # LIVE
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/heartbeat-runs" # LIVE (7 runs on 2026-10-24)
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/heartbeat-runs/$RUN_ID/events"         # LIVE
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/heartbeat-runs/$RUN_ID/log"            # LIVE
```

Oct-24 lesson encoded here: a `2242cf7d`-style instant FAIL with `errorCode: jules_auth_required`
and `sessionIdBefore/After: null` means NO remote session was created — reconcile from the run
record; never re-POST a wake to "check".

## 4. Jules provider readiness (read-only) + the single audited repair

```sh
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/jules/profiles"                        # LIVE
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/jules-sources"   # LIVE
# Native credential rebind — MUTATING, use once per credential loss, then re-verify profiles: # LIVE (used 2026-10-24 12:45Z)
curl -fsS -X POST -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" -H 'Content-Type: application/json' --data '{}' \
  "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/founderos/rebind-jules-source"
```

After rebind, profiles may still show a stale `auth_required` latch (broker failure latch);
`rebound: true` plus a fresh `julesProfileSources.active` row is the authoritative success signal.

## 5. Supervisor lease + read-only session list (**CANDIDATE** — WP2, not deployed)

```sh
# acquire/renew (mutating; 409 LEASE_HELD_BY_OTHER while another controller holds a live lease):
curl -fsS -X POST -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" -H 'Content-Type: application/json' \
  --data '{"controllerId":"qa-supervisor-A","leaseTtlMs":900000}' \
  "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/supervisor/lease/acquire"
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/supervisor/lease"   # read-only
curl -fsS -X POST -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" -H 'Content-Type: application/json' \
  --data '{"controllerId":"qa-supervisor-A","fencingToken":1}' \
  "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/supervisor/lease/verify"                                                        # read-only check
curl -fsS -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" "$PAPERCLIP_BASE_URL/api/companies/$COMPANY_ID/jules/sessions?status=active&limit=25"  # closes Oct-24 gap
```

Semantics: exactly one live lease per company; takeover only of an EXPIRED lease increments the
fencing token; a stale token yields `403 {authorized:false, code:STALE_FENCING_TOKEN|NOT_LEASE_HOLDER|LEASE_EXPIRED}`.
An expired lease NEVER authorizes new remote work and NEVER abandons in-flight sessions.

## 6. Wake discipline

`POST /api/agents/<id>/wakeup` (LIVE) consumes quota and may create a remote session. It is NOT
replay-safe: on timeout/loss, run §3 reads first and correlate by run id. Do not wake to test
authentication. With WP2 deployed, guarded dispatch must first pass §5 verify with the caller's
fresh fencing token.

## 7. Error playbook

`401` credential wrong/stale (check origin + env sync) · `403` tenancy/policy (never widen) ·
`404` wrong id OR lost-by-restart history (consult verified backup, do not invent) · `409`
CAS/admission conflict (re-read state) · `400/422` payload schema · `5xx/timeout` read-only:
backoff-retry OK; mutating: reconcile first, never blind-retry.

## 8. Secret hygiene (enforced by GATE05-R WP4)

Auth-route bodies are never logged; headers/token-shaped fields are redacted server-side.
Still: never enable shell tracing, never echo `$PAPERCLIP_ADMIN_API_TOKEN`, and treat any
value seen in logs as compromised (rotate via the operator workflow, never in chat).
