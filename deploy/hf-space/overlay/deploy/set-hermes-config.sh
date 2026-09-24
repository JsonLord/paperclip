#!/usr/bin/env bash
# Apply deployment-level adapter settings to every hermes_local agent, on every boot.
#
# Why this exists: an agent's adapter_config is written once when the agent is created,
# so changing a deployment default does nothing to agents that already exist, and the
# ephemeral disk keeps restoring the old values. The UI also exposes no model field for
# hermes_local ("Hermes default" only), so there is no way to change it by hand.
#
# The contract is deliberate: while a variable is set it is authoritative and
# re-applied every boot, overwriting a value changed elsewhere. Unset it to manage that
# setting per agent instead. Other adapter_config keys are left untouched.
set -uo pipefail

log() { echo "[hermes-config $(date -uIseconds)] $*"; }

[ -n "${DATABASE_URL:-}" ] || exit 0

# apply <adapter_config key> <value> — psql's :'value' quotes it; never interpolated.
apply() {
  local key="$1" value="$2"
  [ -n "$value" ] || return 0
  local changed count
  changed="$(psql "$DATABASE_URL" -qtA -v ON_ERROR_STOP=1 -v key="$key" -v value="$value" <<'SQL' 2>/dev/null | tr -d '[:space:]'
UPDATE agents
SET adapter_config = jsonb_set(coalesce(adapter_config, '{}'::jsonb), ARRAY[:'key'], to_jsonb(:'value'::text), true),
    updated_at = now()
WHERE adapter_type = 'hermes_local'
  AND coalesce(adapter_config->>:'key', '') <> :'value'
RETURNING 1;
SQL
)"
  count="$(printf '%s' "$changed" | tr -cd '1' | wc -c | tr -d '[:space:]')"
  if [ "${count:-0}" -gt 0 ]; then
    log "set ${key}='${value}' on ${count} hermes_local agent(s)"
  else
    log "${key} already '${value}' on all hermes_local agents"
  fi
}

# Numeric settings need a JSON number, not a string: the adapter reads them with
# `typeof v === "number" ? v : undefined`, so a quoted "2700" is silently ignored and
# the default applies instead.
apply_number() {
  local key="$1" value="$2"
  [ -n "$value" ] || return 0
  case "$value" in (*[!0-9]*|"") log "${key}='${value}' is not a whole number — ignoring"; return 0;; esac
  local changed count
  changed="$(psql "$DATABASE_URL" -qtA -v ON_ERROR_STOP=1 -v key="$key" -v value="$value" <<'SQL' 2>/dev/null | tr -d '[:space:]'
UPDATE agents
SET adapter_config = jsonb_set(coalesce(adapter_config, '{}'::jsonb), ARRAY[:'key'], to_jsonb(:'value'::bigint), true),
    updated_at = now()
WHERE adapter_type = 'hermes_local'
  AND coalesce(adapter_config->>:'key', '') <> :'value'
RETURNING 1;
SQL
)"
  count="$(printf '%s' "$changed" | tr -cd '1' | wc -c | tr -d '[:space:]')"
  if [ "${count:-0}" -gt 0 ]; then log "set ${key}=${value} on ${count} hermes_local agent(s)"; else log "${key} already ${value} on all hermes_local agents"; fi
}

apply model "${PAPERCLIP_HERMES_MODEL:-}"
# The adapter kills the run at timeoutSec. A research pass over a whole document does
# not fit the 900s the bootstrap writes, and the run is lost rather than resumed.
apply_number timeoutSec "${PAPERCLIP_HERMES_TIMEOUT_SEC:-}"
# The adapter takes its cwd from adapter_config.workspaceDir and falls back to ".",
# i.e. whatever directory the server happens to run in. Paperclip resolves a workspace
# of its own and logs about it, but never passes it to the adapter, so the effective
# directory is implicit. Setting it here makes it explicit.
apply workspaceDir "${PAPERCLIP_HERMES_WORKDIR:-}"
exit 0
