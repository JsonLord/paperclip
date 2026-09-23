#!/usr/bin/env bash
# Seed Paperclip Jules profiles from the JULES_API_* Space secrets.
#
# Why this exists: a Jules profile's secretRef is a UUID in Paperclip's own
# encrypted secret store, resolved company-scoped by resolveSecretValue() with no
# environment fallback. Space secrets are env vars, so they cannot be referenced
# directly — and because the Space disk is ephemeral, a hand-made profile is lost
# on the next restore. This re-creates both on every boot, idempotently.
#
# Secrets go through the REST API rather than SQL on purpose: the local_encrypted
# provider owns the material format, and a direct INSERT would store an
# unencrypted value the resolver cannot read.
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
: "${JULES_SESSION_START_LIMIT:=15}"
: "${JULES_SESSION_WINDOW_SEC:=86400}"

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

api() { # api METHOD PATH [json-file]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -m 30 -b "$jar" -o "$tmp/out.json" -w '%{http_code}' -X "$method" \
      -H 'content-type: application/json' -H "Origin: $ORIGIN" -H "Referer: $ORIGIN/" \
      --data-binary @"$body" "$API$path" 2>/dev/null
  else
    curl -sS -m 30 -b "$jar" -o "$tmp/out.json" -w '%{http_code}' -X "$method" \
      -H "Origin: $ORIGIN" -H "Referer: $ORIGIN/" "$API$path" 2>/dev/null
  fi
}

# Target company: JULES_SEED_COMPANY (id or exact name), else the only company.
[ "$(api GET /api/companies)" = "200" ] || { log "could not list companies — skipping"; exit 0; }
company_id="$(JSC="${JULES_SEED_COMPANY:-}" python3 -c '
import json,os,sys
cs=json.load(open(sys.argv[1]))
want=os.environ.get("JSC","").strip()
if want:
    m=[c for c in cs if c["id"]==want or c.get("name")==want]
    print(m[0]["id"] if m else "")
else:
    print(cs[0]["id"] if len(cs)==1 else "")
' "$tmp/out.json" 2>/dev/null)"
if [ -z "$company_id" ]; then
  log "no unambiguous target company — set JULES_SEED_COMPANY to a company id or name; skipping"
  exit 0
fi

[ "$(api GET "/api/companies/$company_id/secrets")" = "200" ] && cp "$tmp/out.json" "$tmp/secrets.json" || echo '[]' > "$tmp/secrets.json"
[ "$(api GET /api/jules/profiles)" = "200" ] && cp "$tmp/out.json" "$tmp/profiles.json" || echo '[]' > "$tmp/profiles.json"

seeded=0
for n in 1 2; do
  var="JULES_API_$n"
  value="${!var:-}"
  [ -n "$value" ] || continue
  secret_name="jules-api-$n"
  # jules_profiles has no companyId, but secretRef is resolved company-scoped by
  # assertSecretInCompany. A bare "jules-profile-N" would look "already present"
  # while pointing at another company's secret, which fails only at dispatch time.
  # Scope the name to the company so the two can never be confused.
  profile_name="jules-${company_id:0:8}-$n"

  secret_id="$(python3 -c '
import json,sys
rows=json.load(open(sys.argv[1]))
name=sys.argv[2]
m=[r for r in rows if r.get("name")==name]
print(m[0]["id"] if m else "")
' "$tmp/secrets.json" "$secret_name" 2>/dev/null)"

  if [ -z "$secret_id" ]; then
    SECRET_VALUE="$value" NAME="$secret_name" python3 -c '
import json,os
print(json.dumps({"name":os.environ["NAME"],"value":os.environ["SECRET_VALUE"],
                  "description":"Jules API key from the "+os.environ["NAME"].upper().replace("-","_")+" Space secret"}))' \
      > "$tmp/secret.json"
    if [ "$(api POST "/api/companies/$company_id/secrets" "$tmp/secret.json")" = "201" ]; then
      secret_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("id",""))' "$tmp/out.json")"
      log "created secret $secret_name"
    else
      log "failed to create secret $secret_name: $(head -c 160 "$tmp/out.json" | tr -d '\n')"
    fi
    rm -f "$tmp/secret.json"
  elif [ -n "${JULES_SEED_ROTATE:-}" ]; then
    # Opt-in: push the current env value as a new version when the key was rotated
    # in Space settings. Off by default so boots do not pile up secret versions.
    SECRET_VALUE="$value" python3 -c '
import json,os
print(json.dumps({"value":os.environ["SECRET_VALUE"]}))' > "$tmp/rot.json"
    [ "$(api POST "/api/secrets/$secret_id/rotate" "$tmp/rot.json")" = "200" ] \
      && log "rotated secret $secret_name" || log "rotate failed for $secret_name"
    rm -f "$tmp/rot.json"
  fi
  [ -n "$secret_id" ] || continue

  exists="$(python3 -c '
import json,sys
rows=json.load(open(sys.argv[1]))
print("yes" if any(r.get("name")==sys.argv[2] for r in rows) else "")
' "$tmp/profiles.json" "$profile_name" 2>/dev/null)"
  if [ -n "$exists" ]; then
    log "profile $profile_name already present"
    seeded=$((seeded + 1))
    continue
  fi

  NAME="$profile_name" REF="$secret_id" LIMIT="$JULES_SESSION_START_LIMIT" WINDOW="$JULES_SESSION_WINDOW_SEC" python3 -c '
import json,os
print(json.dumps({"name":os.environ["NAME"],"secretRef":os.environ["REF"],
                  "sessionStartLimit":int(os.environ["LIMIT"]),
                  "sessionStartWindowSec":int(os.environ["WINDOW"])}))' > "$tmp/profile.json"
  if [ "$(api POST /api/jules/profiles "$tmp/profile.json")" = "201" ]; then
    log "created profile $profile_name (limit ${JULES_SESSION_START_LIMIT}/${JULES_SESSION_WINDOW_SEC}s)"
    seeded=$((seeded + 1))
  else
    log "failed to create profile $profile_name: $(head -c 160 "$tmp/out.json" | tr -d '\n')"
  fi
  rm -f "$tmp/profile.json"
done

if [ "$seeded" -gt 0 ]; then
  log "jules capacity: ${seeded} profile(s) x ${JULES_SESSION_START_LIMIT} session starts / ${JULES_SESSION_WINDOW_SEC}s"
  log "bind a repository next: POST /api/companies/$company_id/jules-sources {repository, source, profileIds}"
fi
exit 0
