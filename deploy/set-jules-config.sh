#!/usr/bin/env bash
# Apply deployment-level adapter settings to every jules agent, on every boot.
#
# Same reason as set-hermes-config.sh: adapter_config is written once when the agent is
# created, so changing a bootstrap default does nothing to agents that already exist,
# and the ephemeral disk restores the old values on every restart.
#
# PAPERCLIP_JULES_AUTO_APPROVE_PLAN exists because of an observed dead end. A Jules
# session generates a plan and then waits for it to be approved. Nothing in this
# deployment approves one — the plan is not a Paperclip approval and there is no UI for
# it — and the session terminates a few minutes later reporting COMPLETED with nothing
# written. Two sessions were lost that way: each read a competitor page, produced a
# correct six-step plan, and stopped. Setting this creates the session without the gate,
# so there is no window to miss rather than a window nobody was watching.
#
# It does not loosen the gates that matter: external actions still require approval, the
# worker still cannot merge its own pull request, and a COMPLETED session is still only a
# completion candidate awaiting deterministic validation and Hermes review.
set -uo pipefail

log() { echo "[jules-config $(date -uIseconds)] $*"; }

[ -n "${DATABASE_URL:-}" ] || exit 0

# apply_bool <adapter_config key> <1|true|yes|0|false|no> — written as a JSON boolean,
# because the adapter reads it with asBoolean and a quoted "true" is not the same thing.
apply_bool() {
  local key="$1" raw="$2" value
  [ -n "$raw" ] || return 0
  case "$raw" in
    1|true|TRUE|True|yes|YES|Yes) value=true;;
    0|false|FALSE|False|no|NO|No) value=false;;
    *) log "${key}='${raw}' is not a boolean — ignoring"; return 0;;
  esac
  local changed count
  changed="$(psql "$DATABASE_URL" -qtA -v ON_ERROR_STOP=1 -v key="$key" -v value="$value" <<'SQL' 2>/dev/null | tr -d '[:space:]'
UPDATE agents
SET adapter_config = jsonb_set(coalesce(adapter_config, '{}'::jsonb), ARRAY[:'key'], to_jsonb(:'value'::boolean), true),
    updated_at = now()
WHERE adapter_type = 'jules'
  AND coalesce(adapter_config->>:'key', '') <> :'value'
RETURNING 1;
SQL
)"
  count="$(printf '%s' "$changed" | tr -cd '1' | wc -c | tr -d '[:space:]')"
  if [ "${count:-0}" -gt 0 ]; then
    log "set ${key}=${value} on ${count} jules agent(s)"
  else
    log "${key} already ${value} on all jules agents"
  fi
}

apply_bool autoApprovePlan "${PAPERCLIP_JULES_AUTO_APPROVE_PLAN:-}"
exit 0
