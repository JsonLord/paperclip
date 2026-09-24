#!/usr/bin/env bash
# Bind this Space's Jules capacity to its company on every boot.
#
# Why this exists: a Jules profile's secretRef is a UUID in Paperclip's encrypted
# secret store, resolved company-scoped by resolveSecretValue() with no environment
# fallback. Space secrets are env vars, so they cannot be referenced directly — and
# because the Space disk is ephemeral, a hand-made profile is lost on the next
# restore. This re-establishes it on every boot, idempotently.
#
# The work itself is done by the server: POST .../founderos/rebind-jules-source
# imports the JULES_API_* keys as company secrets, creates one profile per key,
# resolves the company's GitHub repository to a Jules Source, and resumes the
# workers that bootstrap paused for the missing Source. Doing it server-side keeps
# one implementation of the naming and capacity rules instead of a shell copy that
# drifts from it.
#
# Capacity: each profile defaults to sessionStartLimit=15 per sessionStartWindowSec
# =86400, so JULES_API_1 + JULES_API_2 give 30 session starts per 24h.
set -uo pipefail

log() { echo "[seed-jules $(date -uIseconds)] $*"; }

: "${PORT:=7860}"
API="http://127.0.0.1:${PORT}"
# board-mutation-guard builds its allowlist from the request's own Host header, so
# Origin must match the address we actually call — not PAPERCLIP_PUBLIC_URL, which
# is a different host and gets rejected with "requires trusted browser origin".
ORIGIN="$API"
: "${GITHUB_API_URL:=https://api.github.com}"

[ -n "${JULES_API_1:-}${JULES_API_2:-}" ] || { log "no JULES_API_* secrets — skipping"; exit 0; }
[ -n "${PAPERCLIP_ADMIN_PASSWORD:-}" ] || { log "PAPERCLIP_ADMIN_PASSWORD unset — cannot authenticate; skipping"; exit 0; }
[ -n "${GITHUB_TOKEN:-}" ] || { log "no GITHUB_TOKEN — cannot resolve the admin email; skipping"; exit 0; }

# The admin account is seeded from the GitHub profile, so derive the same address.
profile="$(curl -fsS -m 20 -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" -H "User-Agent: paperclip-space" \
  "${GITHUB_API_URL}/user" 2>/dev/null)" || { log "GitHub /user failed — skipping"; exit 0; }
admin_email="$(printf '%s' "$profile" | python3 -c '
import json,sys
d=json.load(sys.stdin)
login=(d.get("login") or "").strip()
print((d.get("email") or (login+"@users.noreply.github.com" if login else "")).strip())
' 2>/dev/null)"
[ -n "$admin_email" ] || { log "could not derive the admin email — skipping"; exit 0; }

jar="$(mktemp)"; tmp="$(mktemp -d)"
trap 'rm -f "$jar"; rm -rf "$tmp"' EXIT

code="$(PW="$PAPERCLIP_ADMIN_PASSWORD" EMAIL="$admin_email" python3 -c '
import json,os
print(json.dumps({"email":os.environ["EMAIL"],"password":os.environ["PW"]}))' \
  | curl -sS -m 25 -c "$jar" -o "$tmp/signin.json" -w '%{http_code}' \
    -X POST -H 'content-type: application/json' --data-binary @- \
    "$API/api/auth/sign-in/email" 2>/dev/null)" || code="000"
[ "${code:0:1}" = "2" ] || { log "admin sign-in failed (HTTP $code) — skipping"; exit 0; }

api() { # api METHOD PATH
  curl -sS -m 60 -b "$jar" -o "$tmp/out.json" -w '%{http_code}' -X "$1" \
    -H 'content-type: application/json' -H "Origin: $ORIGIN" -H "Referer: $ORIGIN/" \
    "$API$2" 2>/dev/null
}

# Target companies: JULES_SEED_COMPANY (id or exact name), else every company that
# has a bound GitHub repository — a rebind is a no-op for one already bound.
[ "$(api GET /api/companies)" = "200" ] || { log "could not list companies — skipping"; exit 0; }
mapfile -t targets < <(JSC="${JULES_SEED_COMPANY:-}" python3 -c '
import json,os,sys
companies=json.load(open(sys.argv[1]))
want=os.environ.get("JSC","").strip()
if want:
    rows=[c for c in companies if c["id"]==want or c.get("name")==want]
else:
    rows=[c for c in companies if c.get("firmGithubRepo")]
for c in rows:
    print("%s\t%s" % (c["id"], c.get("name") or c["id"]))
' "$tmp/out.json" 2>/dev/null)

if [ "${#targets[@]}" -eq 0 ]; then
  log "no company with a bound GitHub repository — set JULES_SEED_COMPANY to a company id or name; skipping"
  exit 0
fi

for target in "${targets[@]}"; do
  IFS=$'\t' read -r company_id company_name <<< "$target"
  status="$(api POST "/api/companies/$company_id/founderos/rebind-jules-source")"
  summary="$(python3 -c '
import json,sys
try: d=json.load(open(sys.argv[1]))
except Exception: print(""); raise SystemExit
if d.get("rebound"):
    print("source=%s profile=%s resumed=%s unblocked=%s" % (d.get("source"), d.get("profileId"), d.get("agentsResumed"), d.get("issuesUnblocked")))
else:
    print(d.get("reason") or d.get("error") or "no detail")
' "$tmp/out.json" 2>/dev/null)"
  case "$status" in
    200) log "$company_name: jules bound — $summary" ;;
    409) log "$company_name: not bound — $summary" ;;
    *)   log "$company_name: rebind failed (HTTP $status) — $(head -c 160 "$tmp/out.json" | tr -d '\n')" ;;
  esac
done
exit 0
