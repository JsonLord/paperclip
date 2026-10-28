#!/usr/bin/env bash
# Grant instance_admin to the accounts listed in PAPERCLIP_ADMIN_EMAILS, every boot.
#
# Why this exists: seed-admin.sh runs only when the instance has no admin at all, so
# a second operator account granted by hand is lost the moment the ephemeral disk is
# restored from a dump that predates the grant. Re-applying it on every boot makes
# the grant part of the deployment rather than a one-off state.
#
# It only ever grants to an account that already exists — it never creates a user and
# never touches passwords. An address with no account is reported, not provisioned,
# so a typo cannot silently mint an admin.
#
# Note: whoever can set this variable can make themselves an instance admin. On a
# Space that is the owner, who already controls GITHUB_TOKEN and the admin password.
set -uo pipefail

log() { echo "[grant-admins $(date -uIseconds)] $*"; }

emails="${PAPERCLIP_ADMIN_EMAILS:-}"
[ -n "$emails" ] || exit 0
[ -n "${DATABASE_URL:-}" ] || { log "DATABASE_URL unset — skipping"; exit 0; }

granted=0; already=0; missing=0
# Commas or whitespace, so the variable can be written either way.
for email in $(printf '%s' "$emails" | tr ',;' '  '); do
  [ -n "$email" ] || continue
  # psql's :'email' quotes the value itself; never interpolate it into the SQL text.
  exists="$(psql "$DATABASE_URL" -qtA -v email="$email" <<'SQL' 2>/dev/null | tr -d '[:space:]'
SELECT 1 FROM "user" WHERE lower(email) = lower(:'email') LIMIT 1;
SQL
)"
  if [ "$exists" != "1" ]; then
    log "no account for <$email> — sign up first, then this grant applies on the next boot"
    missing=$((missing + 1))
    continue
  fi
  # "user" is a reserved word, hence the quoting. NOT EXISTS keeps re-runs clean.
  rows="$(psql "$DATABASE_URL" -qtA -v ON_ERROR_STOP=1 -v email="$email" <<'SQL' 2>/dev/null | tr -d '[:space:]'
INSERT INTO instance_user_roles (user_id, role)
SELECT u.id, 'instance_admin'
FROM "user" u
WHERE lower(u.email) = lower(:'email')
  AND NOT EXISTS (
    SELECT 1 FROM instance_user_roles r
    WHERE r.user_id = u.id AND r.role = 'instance_admin'
  )
RETURNING 1;
SQL
)"
  if [ "$rows" = "1" ]; then
    log "granted instance_admin to <$email>"
    granted=$((granted + 1))
  else
    already=$((already + 1))
  fi
done

log "instance admins: ${granted} granted, ${already} already held, ${missing} without an account"
exit 0
