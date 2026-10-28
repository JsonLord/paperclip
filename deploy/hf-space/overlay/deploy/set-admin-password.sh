#!/usr/bin/env bash
# Keep the operator's password credential verifiable by the better-auth that is actually
# installed, on every boot.
#
# Why this exists: a restored companies dump carries the password credential from
# whenever the backup was taken, and seed-admin.sh is skipped whenever an admin already
# exists ("instance admin already present — skipping bootstrap"). The configured
# PAPERCLIP_ADMIN_PASSWORD therefore never reaches the row and sign-in fails with 401
# "Invalid password" while sign-up fails with 422 "user already exists", because the
# account and its instance_admin grant are both perfectly intact. Writing the configured
# password here — on every boot, before anything tries to sign in — makes the deployment
# own the credential instead of the dump.
#
# The hash is produced by the installed better-auth itself (better-auth/crypto), never
# by hand: verifyPassword() recomputes with the library's own parameters, so the digest
# must come from the same library that will check it.
#
# Without PAPERCLIP_ADMIN_PASSWORD this is a no-op — it never invents a password.
set -uo pipefail
log() { echo "[set-admin-password $(date -uIseconds)] $*"; }

[ -n "${DATABASE_URL:-}" ]             || { log "DATABASE_URL unset — skipping"; exit 0; }
[ -n "${PAPERCLIP_ADMIN_PASSWORD:-}" ] || { log "PAPERCLIP_ADMIN_PASSWORD unset — skipping"; exit 0; }

APP_DIR="${PAPERCLIP_APP_DIR:-/app}"

# PAPERCLIP_ADMIN_EMAILS is comma/space separated; prefer an explicit singular override.
email="${PAPERCLIP_ADMIN_EMAIL:-}"
if [ -z "$email" ]; then
  email="$(printf '%s' "${PAPERCLIP_ADMIN_EMAILS:-}" | tr ',;' '  ' | awk 'NF{print; exit}')"
fi
[ -n "$email" ] || { log "no admin email configured — skipping"; exit 0; }

# The hash MUST come from the library that will verify it.
hash_one() { # $1 = cwd to resolve better-auth from
  ( cd "$1" 2>/dev/null || return 1
    PAPERCLIP_ADMIN_PASSWORD="$PAPERCLIP_ADMIN_PASSWORD" node --input-type=module -e '
      import { hashPassword } from "better-auth/crypto";
      process.stdout.write(await hashPassword(process.env.PAPERCLIP_ADMIN_PASSWORD));
    ' 2>/dev/null )
}

hash=""
for cand in "$APP_DIR/server" "$APP_DIR"; do
  [ -d "$cand/node_modules/better-auth" ] || continue
  hash="$(hash_one "$cand")"
  [ -n "$hash" ] && break
done
# Fallback: better-auth resolved from anywhere on the module path.
[ -n "$hash" ] || hash="$(hash_one "$APP_DIR")"

if [ -z "$hash" ]; then
  log "could not hash with better-auth — credential left untouched (sign-in will keep failing)"
  exit 0
fi
case "$hash" in
  *:*) ;;
  *) log "unexpected hash shape from better-auth — aborting"; exit 0 ;;
esac
saltlen=${#hash}; keylen=$(printf '%s' "${hash#*:}" | wc -c)
log "hashed credential with installed better-auth (key hex chars $((keylen-1)))"

# Pass the hash to psql through a 0600 file, never argv: argv is world-readable in `ps`.
sqlf="$(umask 077; mktemp)"
trap 'rm -f "$sqlf"' EXIT
{
  printf '\\set ON_ERROR_STOP on\n'
  printf "UPDATE public.account a SET password = '%s', updated_at = now()\n" "$hash"
  printf '  FROM public."user" u\n'
  printf " WHERE u.id = a.user_id AND a.provider_id = 'credential'\n"
  printf "   AND lower(u.email) = lower('%s');\n" "$email"
  printf 'INSERT INTO public.account (id, account_id, provider_id, user_id, password, created_at, updated_at)\n'
  printf "SELECT md5(random()::text || clock_timestamp()::text), u.id, 'credential', u.id, '%s', now(), now()\n" "$hash"
  printf '  FROM public."user" u\n'
  printf " WHERE lower(u.email) = lower('%s')\n" "$email"
  printf '   AND NOT EXISTS (SELECT 1 FROM public.account a\n'
  printf '                    WHERE a.user_id = u.id AND a.provider_id = %s);\n' "'credential'"
} > "$sqlf"

if ! out="$(psql "$DATABASE_URL" -q -f "$sqlf" 2>&1)"; then
  log "credential update failed: $(printf '%s' "$out" | tail -2 | tr '\n' ' ')"
  exit 0
fi

stored="$(psql "$DATABASE_URL" -tAc "select length(password) from public.account a join public.\"user\" u on u.id=a.user_id where a.provider_id='credential' and lower(u.email)=lower('${email}')" 2>/dev/null | tr -d '[:space:]' | head -1)"
if [ -z "$stored" ]; then
  log "no account for <${email}> yet — sign up once, this applies on the next boot"
  exit 0
fi
log "credential for <${email}> aligned with installed better-auth (stored length ${stored})"
exit 0
