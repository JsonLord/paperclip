#!/usr/bin/env bash
# Re-establish this Space's FounderOS company from its GitHub repository.
#
# Why this exists: the Space disk is ephemeral and a restore can lose a boot's work
# to the shutdown-backup race, so a company can simply be absent after a restart. In
# the FounderOS model GitHub is the durable memory, so a boot should be able to
# import the company back from its repository rather than wait for someone to do it
# by hand in the UI.
#
# Strictly opt-in and idempotent: it does nothing unless FOUNDEROS_IMPORT_REPO is
# set, and nothing when a company is already bound to that repository. It never
# touches a company that exists.
set -uo pipefail

log() { echo "[seed-company $(date -uIseconds)] $*"; }

: "${PORT:=7860}"
API="http://127.0.0.1:${PORT}"
# board-mutation-guard builds its allowlist from the request's own Host header, so
# Origin must match the address we actually call.
ORIGIN="$API"
: "${GITHUB_API_URL:=https://api.github.com}"
: "${FOUNDEROS_CONTENT_REPO:=JsonLord/FounderOS-DEMO}"

repo="${FOUNDEROS_IMPORT_REPO:-}"
[ -n "$repo" ] || { log "FOUNDEROS_IMPORT_REPO unset — skipping"; exit 0; }
case "$repo" in */*) ;; *) log "FOUNDEROS_IMPORT_REPO='$repo' is not owner/name — skipping"; exit 0;; esac
[ -n "${PAPERCLIP_ADMIN_PASSWORD:-}" ] || { log "PAPERCLIP_ADMIN_PASSWORD unset — cannot authenticate; skipping"; exit 0; }
[ -n "${GITHUB_TOKEN:-}" ] || { log "no GITHUB_TOKEN — cannot import; skipping"; exit 0; }

gh() { curl -fsS -m 25 -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" -H "User-Agent: paperclip-space" "$@" 2>/dev/null; }

profile="$(gh "${GITHUB_API_URL}/user")" || { log "GitHub /user failed — skipping"; exit 0; }
admin_email="$(printf '%s' "$profile" | python3 -c '
import json,sys
d=json.load(sys.stdin)
login=(d.get("login") or "").strip()
print((d.get("email") or (login+"@users.noreply.github.com" if login else "")).strip())
' 2>/dev/null)"
[ -n "$admin_email" ] || { log "could not derive the admin email — skipping"; exit 0; }

# The import pins the FounderOS context it installs. Default to the content repo's
# current head so a fresh Space does not need the sha configured by hand.
content_commit="${FOUNDEROS_IMPORT_COMMIT:-}"
if [ -z "$content_commit" ]; then
  content_commit="$(gh "${GITHUB_API_URL}/repos/${FOUNDEROS_CONTENT_REPO}/commits/HEAD" \
    | python3 -c 'import json,sys;print(json.load(sys.stdin).get("sha",""))' 2>/dev/null)"
fi
[ -n "$content_commit" ] || { log "could not resolve a FounderOS content commit — skipping"; exit 0; }

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
    curl -sS -m 180 -b "$jar" -o "$tmp/out.json" -w '%{http_code}' -X "$method" \
      -H 'content-type: application/json' -H "Origin: $ORIGIN" -H "Referer: $ORIGIN/" \
      --data-binary @"$body" "$API$path" 2>/dev/null
  else
    curl -sS -m 60 -b "$jar" -o "$tmp/out.json" -w '%{http_code}' -X "$method" \
      -H "Origin: $ORIGIN" -H "Referer: $ORIGIN/" "$API$path" 2>/dev/null
  fi
}

[ "$(api GET /api/companies)" = "200" ] || { log "could not list companies — skipping"; exit 0; }
existing="$(REPO="$repo" python3 -c '
import json,os,sys
want=os.environ["REPO"].strip().lower()
for c in json.load(open(sys.argv[1])):
    if (c.get("firmGithubRepo") or "").strip().lower()==want:
        print("%s\t%s" % (c["id"], c.get("name") or c["id"])); break
' "$tmp/out.json" 2>/dev/null)"
if [ -n "$existing" ]; then
  IFS=$'\t' read -r found_id found_name <<< "$existing"
  log "$found_name ($found_id) is already bound to $repo — nothing to import"
  exit 0
fi

name="${FOUNDEROS_IMPORT_NAME:-${repo##*/}}"
REPO="$repo" NAME="$name" COMMIT="$content_commit" python3 -c '
import json,os
print(json.dumps({"repository":os.environ["REPO"],"name":os.environ["NAME"],
                  "contentCommit":os.environ["COMMIT"]}))' > "$tmp/import.json"

log "importing $repo as '$name' (FounderOS content ${content_commit:0:8})"
status="$(api POST /api/companies/import/github "$tmp/import.json")"
if [ "$status" = "201" ]; then
  python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
c=d.get("company") or {}
print("imported %s (%s): readiness=%s pr=%s" % (
    c.get("name"), c.get("id"), d.get("readiness") or "ready",
    (d.get("pullRequest") or {}).get("url") or "-"))
' "$tmp/out.json" 2>/dev/null | sed 's/^/[seed-company] /' || log "imported (could not parse the response)"
else
  log "import failed (HTTP $status): $(head -c 300 "$tmp/out.json" | tr -d '\n')"
fi
exit 0
