#!/usr/bin/env bash
# PID-1 supervisor for the paperclip + openviking + Hermes dashboard Space.
# Order: template ov.conf -> FounderOS/Jules env -> restore file-state -> start openviking
#        -> start Hermes dashboard -> start paperclip -> (once healthy) seed or invite
#        the first admin -> nightly backup.
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

# 1a-i) Hermes LLM routing ------------------------------------------------------
# hermes-paperclip-adapter spawns the CLI with `env = { ...process.env }` and never
# sets HOME, so Hermes reads $HOME/.hermes — not the baked /opt/hermes-home. Write
# the config where it is actually read, and export the OpenAI-compatible variables
# so the adapter's environment check (which inspects the *server's* process.env for
# ANTHROPIC_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY) stops reporting no keys.
: "${OPENAI_COMPATIBLE_ENDPOINT:=https://api.helmholtz-blablador.fz-juelich.de/v1}"
: "${OPENAI_MODEL:=alias-large}"
if [ -n "${BLABLADOR_TOKEN:-}" ]; then
  export OPENAI_API_KEY="${OPENAI_API_KEY:-$BLABLADOR_TOKEN}"
  export OPENAI_BASE_URL="${OPENAI_BASE_URL:-$OPENAI_COMPATIBLE_ENDPOINT}"
  export OPENAI_MODEL OPENAI_COMPATIBLE_ENDPOINT
  mkdir -p "$HOME/.hermes"
  cat > "$HOME/.hermes/config.yaml" <<YAML
model:
  provider: custom
  base_url: ${OPENAI_COMPATIBLE_ENDPOINT}
  default: ${OPENAI_MODEL}
  model: ${OPENAI_MODEL}
  api_key: ${BLABLADOR_TOKEN}
YAML
  chmod 600 "$HOME/.hermes/config.yaml"
  log "hermes routed to ${OPENAI_MODEL} @ ${OPENAI_COMPATIBLE_ENDPOINT} (config at \$HOME/.hermes/config.yaml)"
else
  log "BLABLADOR_TOKEN not set — Hermes will fall back to its default model and report no API keys"
fi

# 1a) FounderOS / Jules runtime env --------------------------------------------
# The FounderOS build adds a native `jules` adapter, a Hermes "Founder Manager",
# durable Jules sessions and a run-scoped callback capability token. None of these
# read Space secrets directly, so derive sane defaults here and keep every real
# credential in Space Settings -> Secrets.

# Run-scoped capability tokens signed for Jules callbacks. The server requires a
# secret of at least 32 characters (PAPERCLIP_JULES_CAPABILITY_SECRET, falling back
# to PAPERCLIP_AGENT_JWT_SECRET); reuse BETTER_AUTH_SECRET when neither is set.
if [ -z "${PAPERCLIP_JULES_CAPABILITY_SECRET:-}" ] && [ -z "${PAPERCLIP_AGENT_JWT_SECRET:-}" ]; then
  if [ "${#BETTER_AUTH_SECRET}" -ge 32 ]; then
    export PAPERCLIP_JULES_CAPABILITY_SECRET="$BETTER_AUTH_SECRET"
    log "PAPERCLIP_JULES_CAPABILITY_SECRET derived from BETTER_AUTH_SECRET"
  else
    log "WARNING: BETTER_AUTH_SECRET is shorter than 32 chars — set PAPERCLIP_JULES_CAPABILITY_SECRET in Space secrets or Jules callbacks will fail"
  fi
fi

# Hermes Founder Manager (triage / judge / next-best-action). Defaults to the same
# Blablador endpoint the hermes_local adapter and OpenViking already use.
if [ -n "${BLABLADOR_TOKEN:-}" ]; then
  : "${FOUNDER_MANAGER_BASE_URL:=https://api.helmholtz-blablador.fz-juelich.de/v1}"
  : "${FOUNDER_MANAGER_API_KEY:=$BLABLADOR_TOKEN}"
  : "${FOUNDER_MANAGER_MODEL:=alias-fast}"
  export FOUNDER_MANAGER_BASE_URL FOUNDER_MANAGER_API_KEY FOUNDER_MANAGER_MODEL
  log "founder manager configured (${FOUNDER_MANAGER_MODEL} @ ${FOUNDER_MANAGER_BASE_URL})"
else
  log "BLABLADOR_TOKEN not set — Founder Manager will be unconfigured until FOUNDER_MANAGER_* secrets are provided"
fi

# Jules REST plane. Per-company API credentials live in secret-backed Jules profiles
# inside Paperclip, never here; only the endpoint and worker cadence are env-level.
: "${JULES_API_BASE_URL:=https://jules.googleapis.com/v1alpha}"
: "${JULES_RECONCILE_INTERVAL_MS:=30000}"
: "${JULES_OUTBOX_INTERVAL_MS:=15000}"
export JULES_API_BASE_URL JULES_RECONCILE_INTERVAL_MS JULES_OUTBOX_INTERVAL_MS

# Firm CLI (business-as-code validation). Upstream does not vendor 42futures/firm,
# so this stays opt-in: set FIRM_CLI_PATH once a firm binary is present in the image
# or mounted under /paperclip. Firm-gated Goals stay blocked until then.
[ -n "${FIRM_CLI_PATH:-}" ] && export FIRM_CLI_PATH && log "firm CLI at ${FIRM_CLI_PATH}"

# Backup repo names are interpolated straight into
#   https://x-access-token:$GITHUB_TOKEN@github.com/$REPO.git
# so they must be bare `owner/repo`. A pasted clone URL would build a nonsense
# address and, because every backup/restore step is best-effort with its output
# suppressed, fail silently and leave the Space with no backups at all. Normalise
# the common paste formats here, once, so backup.sh and restore.sh both inherit a
# clean value; anything still not owner/repo gets a loud warning rather than a
# quiet non-backup.
normalize_repo() {
  local v="${1:-}"
  case "$v" in
    https://github.com/*)   v="${v#https://github.com/}" ;;
    http://github.com/*)    v="${v#http://github.com/}" ;;
    ssh://git@github.com/*) v="${v#ssh://git@github.com/}" ;;
    git@github.com:*)       v="${v#git@github.com:}" ;;
  esac
  v="${v%/}"; v="${v%.git}"; v="${v%/}"
  printf '%s' "$v"
}
for _var in COMPANIES_BACKUP_REPO OPENVIKING_BACKUP_REPO; do
  _raw="${!_var:-}"
  [ -n "$_raw" ] || continue
  _norm="$(normalize_repo "$_raw")"
  [ "$_norm" != "$_raw" ] && log "normalized $_var '$_raw' -> '$_norm'"
  if printf '%s' "$_norm" | grep -qE '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'; then
    export "$_var=$_norm"
  else
    log "WARNING: $_var='$_raw' is not owner/repo — that backup will not work"
    export "$_var=$_norm"
  fi
done
unset _var _raw _norm

# GITHUB_TOKEN is already required by backup/restore; the FounderOS import path
# reuses it to install the pinned FounderOS content pack into a company repo.
[ -z "${GITHUB_TOKEN:-}" ] && log "no GITHUB_TOKEN — backups and FounderOS content install are disabled"

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
        # Migration-lineage guard. This Space previously ran a build whose drizzle
        # journal forks from the FounderOS one after 0037: it applied
        # 0038_careless_iron_monger..0050_curious_night_nurse, where FounderOS applies
        # 0038_firm_integration..0061. Restoring such a dump leaves __drizzle_migrations
        # describing the other lineage, so the shipped migrations either re-create
        # existing objects or are skipped entirely and the server starts against a
        # schema without jules_*/founderos_* tables. jules_sessions only exists in the
        # FounderOS lineage, so its presence identifies a compatible dump.
        if grep -q 'jules_sessions' "$dbtmp/db/paperclip.sql"; then
          psql "$DATABASE_URL" -v ON_ERROR_STOP=0 < "$dbtmp/db/paperclip.sql" >/dev/null 2>&1 \
            && log "restored DB from companies backup ($(wc -c <"$dbtmp/db/paperclip.sql") bytes)" \
            || log "DB restore completed with warnings"
        else
          rows="$(awk '/^COPY public\.companies /{f=1;next} f&&/^\\\.$/{exit} f{n++} END{print n+0}' "$dbtmp/db/paperclip.sql")"
          log "WARNING: backup dump predates the FounderOS migration lineage (no jules_sessions) — NOT restoring it"
          log "WARNING: the dump holds ${rows} company row(s) and is left untouched in ${COMPANIES_BACKUP_REPO}"
          log "WARNING: starting on a fresh schema; migrate those rows by hand if they matter"
          export PAPERCLIP_BACKUP_LINEAGE_CHANGED=1 PAPERCLIP_BACKUP_STALE=1
        fi
      else
        log "no DB backup yet — starting empty (paperclip will migrate)"
        export PAPERCLIP_BACKUP_STALE=1
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
      if [ -n "${DATABASE_URL:-}" ]; then
        admins="$(psql "$DATABASE_URL" -tAc "select count(*) from instance_user_roles where role='instance_admin'" 2>/dev/null | tr -d '[:space:]')"
        if [ "${admins:-0}" = "0" ]; then
          # Preferred path: re-create the operator's own admin account from the
          # GitHub profile behind GITHUB_TOKEN, so an ephemeral-disk wipe does not
          # mean reading a fresh invite URL out of the logs every time.
          seeded=""
          seed_log="$(mktemp)"
          if bash /app/deploy/seed-admin.sh >"$seed_log" 2>&1; then seeded=1; fi
          sed 's/^/[seed-admin] /' "$seed_log"; rm -f "$seed_log"
        fi
        if [ "${admins:-0}" = "0" ] && [ -z "${seeded:-}" ]; then
          log "no instance admin — bootstrapping CEO invite"
          # `auth bootstrap-ceo` reads server.deploymentMode from a config file and
          # returns early with "Run paperclip onboard first" when there is none. This
          # Space configures everything through env, so write a config used ONLY for
          # this command: the DB URL and invite base URL still come from the
          # environment, and the server keeps running without a config of its own.
          # paperclipConfigSchema refuses exposure=public unless auth.baseUrlMode is
          # explicit and auth.publicBaseUrl is a valid URL, hence both below.
          bootstrap_cfg="$HOME/.paperclip-bootstrap-config.json"
          if [ -n "${PAPERCLIP_PUBLIC_URL:-}" ]; then
            cat > "$bootstrap_cfg" <<JSON
{
  "\$meta": { "version": 1, "updatedAt": "$(date -uIseconds)", "source": "configure" },
  "database": { "mode": "postgres", "connectionString": "${DATABASE_URL}" },
  "logging": { "mode": "file", "logDir": "${HOME}/instances/default/logs" },
  "server": {
    "deploymentMode": "authenticated",
    "exposure": "${PAPERCLIP_DEPLOYMENT_EXPOSURE:-public}",
    "host": "0.0.0.0",
    "port": ${PORT},
    "allowedHostnames": [],
    "serveUi": true
  },
  "auth": {
    "baseUrlMode": "explicit",
    "publicBaseUrl": "${PAPERCLIP_PUBLIC_URL}",
    "disableSignUp": false
  }
}
JSON
            # Run the CLI from source via tsx (the esbuild dist bundle doesn't resolve 'zod').
            node --import ./server/node_modules/tsx/dist/loader.mjs cli/src/index.ts \
              auth bootstrap-ceo --config "$bootstrap_cfg" 2>&1 \
              | sed 's/^/[bootstrap-ceo] /' || log "bootstrap-ceo failed"
          else
            log "PAPERCLIP_PUBLIC_URL is unset — cannot mint a bootstrap invite; set it in Space secrets"
          fi
        elif [ -n "${seeded:-}" ]; then
          log "instance admin seeded — no bootstrap invite needed"
        else
          log "instance admin already present ($admins) — skipping bootstrap"
        fi
        # FounderOS readiness, for the Space logs only (never fails the boot).
        goals="$(psql "$DATABASE_URL" -tAc "select count(*) from goal_template_instances" 2>/dev/null | tr -d '[:space:]')"
        [ -n "$goals" ] && log "founderos: ${goals} instantiated goal templates"

        # When this boot could not restore (no dump yet, or one from the old
        # migration lineage), the repo holds nothing this build can read back. Waiting
        # for the nightly run would leave a window where a restart loses everything
        # created in between, so publish a current dump now. backup.sh commits only
        # when something changed, and archives the superseded dump first.
        if [ -n "${PAPERCLIP_BACKUP_STALE:-}" ] && [ -n "${GITHUB_TOKEN:-}" ]; then
          log "no usable dump in the backup repo — running an initial backup"
          bash /app/deploy/backup.sh 2>&1 | sed 's/^/[initial-backup] /' || log "initial backup failed"
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
