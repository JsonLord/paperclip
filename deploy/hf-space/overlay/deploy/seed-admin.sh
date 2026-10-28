#!/usr/bin/env bash
# Seed the first instance admin from the GitHub profile behind GITHUB_TOKEN.
#
# Why this exists: the Space's disk is ephemeral, so every restart runs initdb and
# drops whatever account was registered. The stock path mints a bootstrap invite
# whose URL only appears in the container logs, so reclaiming the instance means
# reading logs after every wake. Seeding instead re-creates the same admin on each
# boot, from a profile the operator already controls.
#
# Security: possession of GITHUB_TOKEN is the authorization. The account is only
# seeded when the token's own login matches PAPERCLIP_ADMIN_GITHUB_LOGIN (when set),
# so a token swapped in by someone else cannot claim the instance. The password is
# never passed on a command line — `ps` on a shared box would show it — and never
# hashed here: better-auth's own sign-up endpoint owns the credential format.
#
# Exit 0 when an admin exists afterwards; non-zero means the caller should fall
# back to the bootstrap invite.
set -uo pipefail

log() { echo "[seed-admin $(date -uIseconds)] $*"; }

: "${PORT:=7860}"
API="http://127.0.0.1:${PORT}"
# Overridable so the script can be exercised against a stub, and so a GitHub
# Enterprise host works without editing it.
: "${GITHUB_API_URL:=https://api.github.com}"

[ -n "${GITHUB_TOKEN:-}" ]            || { log "no GITHUB_TOKEN — skipping"; exit 1; }
[ -n "${PAPERCLIP_ADMIN_PASSWORD:-}" ] || { log "PAPERCLIP_ADMIN_PASSWORD unset — skipping"; exit 1; }
[ -n "${DATABASE_URL:-}" ]            || { log "no DATABASE_URL — skipping"; exit 1; }

profile="$(curl -fsS -m 20 \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: paperclip-space" \
  "${GITHUB_API_URL}/user" 2>/dev/null)" \
  || { log "GitHub /user request failed (token invalid, lacks read:user, or no network) — skipping"; exit 1; }

# shlex.quote keeps a hostile display name from breaking out of the eval.
eval "$(printf '%s' "$profile" | python3 -c '
import json, sys, shlex
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
login = (d.get("login") or "").strip()
name = (d.get("name") or login).strip()
email = (d.get("email") or "").strip()
if not email and login:
    # GitHub hides the address when "keep my email private" is on.
    email = f"{login}@users.noreply.github.com"
print("gh_login=" + shlex.quote(login))
print("gh_name=" + shlex.quote(name))
print("gh_email=" + shlex.quote(email))
')" || { log "could not parse the GitHub profile response — skipping"; exit 1; }

[ -n "${gh_login:-}" ] || { log "GitHub profile carried no login — skipping"; exit 1; }

expected="${PAPERCLIP_ADMIN_GITHUB_LOGIN:-$gh_login}"
if [ "$gh_login" != "$expected" ]; then
  log "token belongs to '$gh_login' but PAPERCLIP_ADMIN_GITHUB_LOGIN is '$expected' — refusing to seed"
  exit 1
fi
[ -n "${PAPERCLIP_ADMIN_GITHUB_LOGIN:-}" ] \
  || log "PAPERCLIP_ADMIN_GITHUB_LOGIN unset — trusting the token's own login '$gh_login'"

log "seeding admin for GitHub login '$gh_login' as <${gh_email}>"

# Register through better-auth so it owns the password hashing. Payload goes over a
# pipe rather than argv so the password never lands in the process table.
signup_body="$(PAPERCLIP_ADMIN_PASSWORD="$PAPERCLIP_ADMIN_PASSWORD" python3 -c '
import json, os, sys
print(json.dumps({
    "name": sys.argv[1],
    "email": sys.argv[2],
    "password": os.environ["PAPERCLIP_ADMIN_PASSWORD"],
}))' "$gh_name" "$gh_email")" || { log "could not build the sign-up payload"; exit 1; }

signup_out="$(mktemp)"; trap 'rm -f "$signup_out"' EXIT
code="$(printf '%s' "$signup_body" | curl -sS -m 25 -o "$signup_out" -w '%{http_code}' \
  -X POST -H 'content-type: application/json' --data-binary @- \
  "$API/api/auth/sign-up/email" 2>/dev/null)" || code="000"

case "$code" in
  2*) log "account created" ;;
  *)
    # An existing address is fine: the role grant below is what actually matters,
    # and it is idempotent.
    if grep -qiE "exist|already|unique" "$signup_out" 2>/dev/null; then
      log "account already present — continuing to the role grant"
    else
      log "sign-up failed (HTTP $code): $(head -c 200 "$signup_out" | tr -d '\n')"
      exit 1
    fi
    ;;
esac

# "user" is a reserved word, hence the quoting. The NOT EXISTS keeps re-runs clean.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v email="$gh_email" >/dev/null 2>&1 <<'SQL'
INSERT INTO instance_user_roles (user_id, role)
SELECT u.id, 'instance_admin'
FROM "user" u
WHERE u.email = :'email'
  AND NOT EXISTS (
    SELECT 1 FROM instance_user_roles r
    WHERE r.user_id = u.id AND r.role = 'instance_admin'
  );
SQL

admins="$(psql "$DATABASE_URL" -tAc "select count(*) from instance_user_roles where role='instance_admin'" 2>/dev/null | tr -d '[:space:]')"
if [ "${admins:-0}" -gt 0 ] 2>/dev/null; then
  log "instance admin ready — sign in at ${PAPERCLIP_PUBLIC_URL:-$API} as <${gh_email}>"
  exit 0
fi
log "role grant did not take effect — falling back to the bootstrap invite"
exit 1
