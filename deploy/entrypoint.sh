#!/usr/bin/env bash
# PID-1 supervisor for the paperclip + openviking + Hermes dashboard Space.
# Order: template ov.conf -> restore file-state -> start openviking -> start Hermes dashboard -> start paperclip
#        -> (once healthy) rewire agent URLs + bootstrap first admin -> nightly backup.
# Everything except paperclip is best-effort; a failure there must not crash the app.
set -uo pipefail

log() { echo "[entrypoint $(date -uIseconds)] $*"; }

export HOME="${HOME:-/paperclip}"
: "${PORT:=7860}"; export PORT
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-paperclip-default-secret-change-in-space-secrets}"
OV_DIR="$HOME/.openviking"
export OPENVIKING_CONFIG_FILE="${OPENVIKING_CONFIG_FILE:-$OV_DIR/ov.conf}"
mkdir -p "$OV_DIR/data" "$HOME/instances"

# OpenViking model selection (overridable via Space variables). alias-fast == blablador MiniMax.
: "${BLABLADOR_VLM_MODEL:=alias-fast}"       # primary vlm.model (multimodal extraction)
: "${BLABLADOR_MODEL:=alias-fast}"           # vlm.backup.model (text / assist fallback)
export BLABLADOR_VLM_MODEL BLABLADOR_MODEL

# 1) OpenViking config from env secrets (no secrets in the image) --------------
if [ -n "${OPENVIKING_ROOT_API_KEY:-}" ] && [ -n "${BLABLADOR_TOKEN:-}" ]; then
  envsubst < /app/deploy/ov.conf.tmpl > "$OPENVIKING_CONFIG_FILE" \
    && log "templated $OPENVIKING_CONFIG_FILE"
else
  log "OPENVIKING_ROOT_API_KEY / BLABLADOR_TOKEN not set — openviking will be disabled"
fi

# hermes_local adapter config (baked as a ${BLABLADOR_TOKEN} template, injected here)
if [ -n "${BLABLADOR_TOKEN:-}" ] && [ -f /opt/hermes-home/.hermes/config.yaml ]; then
  tmp="$(mktemp)"; envsubst < /opt/hermes-home/.hermes/config.yaml > "$tmp" \
    && cat "$tmp" > /opt/hermes-home/.hermes/config.yaml && rm -f "$tmp" \
    && log "templated hermes-home config.yaml"
fi

# 1b) Local PostgreSQL — replaces any external DB. Persisted via the GitHub companies
# backup (SQL dump) and restored here BEFORE paperclip starts. No external DB => no
# transfer quota / no outages. Falls back to paperclip's embedded PG if unavailable.
export PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -1)"
export PATH="${PGBIN}:$PATH"
export PGDATA="$HOME/pgdata"
PG_STARTED=""
if command -v initdb >/dev/null 2>&1; then
  mkdir -p "$PGDATA"; chmod 700 "$PGDATA" 2>/dev/null
  [ -s "$PGDATA/PG_VERSION" ] || { initdb -D "$PGDATA" -U paperclip --auth=trust --encoding=UTF8 >/dev/null 2>&1 && log "initdb ok"; }
  if pg_ctl -D "$PGDATA" -o "-p 5432 -c listen_addresses='127.0.0.1' -k /tmp" -w -t 60 start >/dev/null 2>&1; then
    PG_STARTED=1; log "local postgres started on 127.0.0.1:5432"
    createdb -h 127.0.0.1 -U paperclip paperclip 2>/dev/null || true
    export DATABASE_URL="postgres://paperclip@127.0.0.1:5432/paperclip"
    # Restore the latest SQL dump if this fresh (ephemeral) DB is empty.
    empty="$(psql "$DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null | tr -d '[:space:]')"
    if [ "${empty:-0}" = "0" ] && [ -n "${GITHUB_TOKEN:-}" ] && [ -n "${COMPANIES_BACKUP_REPO:-}" ]; then
      dbtmp="$(mktemp -d)"
      if git clone --depth 1 "https://x-access-token:${GITHUB_TOKEN}@github.com/${COMPANIES_BACKUP_REPO}.git" "$dbtmp" >/dev/null 2>&1 && [ -f "$dbtmp/db/paperclip.sql" ]; then
        psql "$DATABASE_URL" -v ON_ERROR_STOP=0 < "$dbtmp/db/paperclip.sql" >/dev/null 2>&1 \
          && log "restored DB from companies backup ($(wc -c <"$dbtmp/db/paperclip.sql") bytes)" \
          || log "DB restore completed with warnings"
      else
        log "no DB backup yet — starting empty (paperclip will migrate)"
      fi
      rm -rf "$dbtmp"
    fi
    # One-off admin op: delete a company (and all its company-scoped rows) by id.
    # Set the DELETE_COMPANY_ID variable, let it run once, then unset it. FK-safe.
    if [ -n "${DELETE_COMPANY_ID:-}" ]; then
      psql "$DATABASE_URL" -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<SQL
SET session_replication_role = replica;
DO \$do\$ DECLARE t text; BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns WHERE column_name='company_id' AND table_schema='public'
  LOOP EXECUTE format('DELETE FROM public.%I WHERE company_id = %L', t, '${DELETE_COMPANY_ID}'); END LOOP;
END \$do\$;
DELETE FROM companies WHERE id = '${DELETE_COMPANY_ID}';
SET session_replication_role = default;
SQL
      log "applied DELETE_COMPANY_ID=${DELETE_COMPANY_ID}"
    fi
  else
    log "local postgres failed to start — falling back to embedded PG"; unset DATABASE_URL
  fi
else
  log "postgres server not installed — using paperclip embedded PG"; unset DATABASE_URL
fi

# 2) Restore file-state (openviking memory) from the GitHub backup (best-effort) --
bash /app/deploy/restore.sh || log "restore skipped (first boot or unavailable)"

# 3) OpenViking sidecar on 127.0.0.1:1933 (best-effort, non-critical) ----------
OV_PID=""
if command -v openviking-server >/dev/null 2>&1 && [ -f "$OPENVIKING_CONFIG_FILE" ]; then
  openviking-server --host 127.0.0.1 --port 1933 >"$OV_DIR/openviking.log" 2>&1 &
  OV_PID=$!
  log "openviking-server started (pid=$OV_PID) on 127.0.0.1:1933"
else
  log "openviking sidecar not started"
fi


# 3b) Hermes dashboard sidecar, proxied by Paperclip at /dashboard and /hammers.
HERMES_DASHBOARD_PID=""
: "${HERMES_DASHBOARD_HOST:=127.0.0.1}"
: "${HERMES_DASHBOARD_PORT:=7861}"
export HERMES_DASHBOARD_URL="${HERMES_DASHBOARD_URL:-http://${HERMES_DASHBOARD_HOST}:${HERMES_DASHBOARD_PORT}}"
if command -v hermes >/dev/null 2>&1; then
  mkdir -p "$HOME/.hermes"
  # Keep the dashboard bound to loopback; the Node app is the public reverse proxy.
  hermes dashboard --host "$HERMES_DASHBOARD_HOST" --port "$HERMES_DASHBOARD_PORT" >"$HOME/.hermes/dashboard.log" 2>&1 &
  HERMES_DASHBOARD_PID=$!
  log "hermes dashboard started (pid=$HERMES_DASHBOARD_PID) on ${HERMES_DASHBOARD_URL}; proxied at /dashboard and /hammers"
else
  log "hermes CLI not found — Hermes dashboard not started"
fi

# 4) Paperclip control-plane (background so we can supervise + trap shutdown) ---
node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js &
APP_PID=$!
log "paperclip started (pid=$APP_PID) on 0.0.0.0:$PORT"

# Graceful shutdown: back up file-state before the container dies, then stop kids.
shutdown() {
  log "signal received — running shutdown backup"
  bash /app/deploy/backup.sh || log "shutdown backup failed"
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null
  [ -n "$OV_PID" ]  && kill "$OV_PID"  2>/dev/null
  [ -n "$HERMES_DASHBOARD_PID" ] && kill "$HERMES_DASHBOARD_PID" 2>/dev/null
  [ -n "$PG_STARTED" ] && pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1
  wait "$APP_PID" 2>/dev/null
  exit 0
}
trap shutdown TERM INT

# 5) Post-boot one-time DB steps, once paperclip is healthy (migrations applied)
(
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      log "paperclip healthy — running post-boot DB steps"
      if [ -n "${DATABASE_URL:-}" ] && [ -n "${DESK_AGENT_HOST:-}" ]; then
        envsubst < /app/deploy/rewire-agents.sql.tmpl \
          | psql "$DATABASE_URL" -v ON_ERROR_STOP=0 2>&1 | tail -1 | sed 's/^/[rewire] /'
      fi
      if [ -n "${DATABASE_URL:-}" ]; then
        admins="$(psql "$DATABASE_URL" -tAc "select count(*) from instance_user_roles where role='instance_admin'" 2>/dev/null | tr -d '[:space:]')"
        if [ "${admins:-0}" = "0" ]; then
          log "no instance admin — bootstrapping CEO invite"
          # Run the CLI from source via tsx (the esbuild dist bundle doesn't resolve 'zod').
          node --import ./server/node_modules/tsx/dist/loader.mjs cli/src/index.ts auth bootstrap-ceo 2>&1 \
            | sed 's/^/[bootstrap-ceo] /' || log "bootstrap-ceo failed"
        else
          log "instance admin already present ($admins) — skipping bootstrap"
        fi
      fi
      break
    fi
    sleep 3
  done
) &

# 6) Nightly backup loop (best-effort) -----------------------------------------
(
  export TZ="${BACKUP_TZ:-Europe/Berlin}"
  hour="${BACKUP_HOUR:-20}"
  while true; do
    now=$(date +%s)
    next=$(date -d "today ${hour}:00" +%s 2>/dev/null || echo 0)
    [ "$next" -le "$now" ] && next=$(date -d "tomorrow ${hour}:00" +%s 2>/dev/null || echo $((now + 86400)))
    wait_s=$(( next - now )); [ "$wait_s" -lt 60 ] && wait_s=86400
    log "next daily backup in ${wait_s}s (${hour}:00 ${TZ})"
    sleep "$wait_s"
    log "daily backup starting"
    bash /app/deploy/backup.sh || log "daily backup failed"
    sleep 90
  done
) &

# Keep PID 1 tied to paperclip; if it exits, the container exits.
wait "$APP_PID"
log "paperclip exited — stopping sidecars + postgres"
[ -n "$OV_PID" ] && kill "$OV_PID" 2>/dev/null
[ -n "$HERMES_DASHBOARD_PID" ] && kill "$HERMES_DASHBOARD_PID" 2>/dev/null
[ -n "$PG_STARTED" ] && pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1
exit 0
