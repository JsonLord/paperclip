#!/usr/bin/env bash
# Restore on boot from the GitHub backup repos:
#   OpenViking memory (vectordb/ + viking/) -> always restored (ephemeral disk).
#   Companies DB -> ONLY restored if the DB has zero companies (disaster recovery);
#   normally the fresh DB is the live source of truth and is left untouched.
set -uo pipefail
log() { echo "[restore $(date -uIseconds)] $*"; }
export HOME="${HOME:-/paperclip}"

if [ -z "${GITHUB_TOKEN:-}" ]; then log "no GITHUB_TOKEN — skipping restore"; exit 0; fi

# --- OpenViking memory ---------------------------------------------------------
if [ -n "${OPENVIKING_BACKUP_REPO:-}" ]; then
  url="https://x-access-token:${GITHUB_TOKEN}@github.com/${OPENVIKING_BACKUP_REPO}.git"
  tmp="$(mktemp -d)"
  if git clone --depth 1 "$url" "$tmp" >/dev/null 2>&1; then
    dst="$HOME/.openviking/data"; mkdir -p "$dst"
    if [ -d "$tmp/vectordb" ]; then rm -rf "$dst/vectordb"; cp -a "$tmp/vectordb" "$dst/vectordb"; log "restored openviking vectordb"; fi
    if [ -d "$tmp/viking" ];   then rm -rf "$dst/viking";   cp -a "$tmp/viking"   "$dst/viking";   log "restored openviking viking"; fi
    rm -f "$dst/.openviking.pid" 2>/dev/null
  else
    log "openviking backup empty/unreachable — starting fresh"
  fi
  rm -rf "$tmp"
fi

# NOTE: the companies DB is a LOCAL postgres now, restored in entrypoint.sh (step 1b)
# from the GitHub companies backup BEFORE paperclip starts — not here.
exit 0
