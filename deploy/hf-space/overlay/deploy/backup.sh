#!/usr/bin/env bash
# Daily backup of IMPORTANT files to two private GitHub repos (limitless, off Neon):
#   OPENVIKING_BACKUP_REPO  <- openviking memory only: vectordb/ + viking/
#   COMPANIES_BACKUP_REPO   <- filtered pg_dump + per-company JSON folders
# Scheduled once/day by entrypoint (BACKUP_HOUR) and on shutdown. All best-effort;
# a failure must never crash the app.
set -uo pipefail
log() { echo "[backup $(date -uIseconds)] $*"; }
export HOME="${HOME:-/paperclip}"

if [ -z "${GITHUB_TOKEN:-}" ]; then log "no GITHUB_TOKEN — skipping backup"; exit 0; fi

# Clone repo (or init if empty), let $build populate the workdir, commit + push.
backup_repo() {
  local repo="$1" build="$2"
  [ -z "$repo" ] && return 0
  local url="https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git"
  local wd; wd="$(mktemp -d)"
  git clone --depth 1 "$url" "$wd" >/dev/null 2>&1 || git -C "$wd" init -q
  "$build" "$wd" || log "$repo: build step failed"
  git -C "$wd" config user.email "paperclip-space@users.noreply.github.com"
  git -C "$wd" config user.name "paperclip-space-backup"
  git -C "$wd" add -A
  if git -C "$wd" diff --cached --quiet 2>/dev/null; then
    log "$repo: no changes"
  else
    git -C "$wd" commit -q -m "backup $(date -uIminutes)"
    if git -C "$wd" push -q "$url" HEAD:main >/dev/null 2>&1; then log "$repo: pushed"; else log "$repo: push failed"; fi
  fi
  rm -rf "$wd"
}

# --- OpenViking: only the durable memory (vectordb embeddings + viking AGFS) ---
build_openviking() {
  local wd="$1" src="$HOME/.openviking/data"
  rm -rf "$wd/vectordb" "$wd/viking"
  [ -d "$src/vectordb" ] && cp -a "$src/vectordb" "$wd/vectordb"
  [ -d "$src/viking" ]   && cp -a "$src/viking"   "$wd/viking"
  printf '{"component":"openviking","backed_up":"%s"}\n' "$(date -uIseconds)" > "$wd/BACKUP_INFO.json"
}

# Dump one query into a file, tolerating a table that does not exist yet (a company
# restored from an older schema, or a migration that has not run).
company_json() {
  local dest="$1" sql="$2"
  psql "$DATABASE_URL" -tAc "$sql" > "$dest" 2>/dev/null || printf '[]\n' > "$dest"
  [ -s "$dest" ] || printf '[]\n' > "$dest"
}

# --- Paperclip companies: filtered dump + one clearly-named folder per company --
build_companies() {
  local wd="$1"
  if [ -z "${DATABASE_URL:-}" ] || ! command -v pg_dump >/dev/null 2>&1; then
    log "companies: no DATABASE_URL/pg_dump — skipping"; return 0
  fi
  mkdir -p "$wd/db" "$wd/companies"
  # Full schema + data, EXCLUDING high-volume operational tables' data (keep it small
  # and under the GitHub repo size budget). Schema is still dumped for a clean restore.
  # The FounderOS/Jules tables that matter for a rebuild (jules_profiles,
  # jules_profile_sources, company_jules_sources, jules_sessions, goals,
  # goal_template_instances, resource_pack_snapshots) are deliberately NOT excluded;
  # only their append-only event/activity logs are.
  if pg_dump --no-owner --no-privileges \
       --exclude-table-data='heartbeat_runs' \
       --exclude-table-data='workspace_operations' \
       --exclude-table-data='activity' \
       --exclude-table-data='activity_log' \
       --exclude-table-data='session' \
       --exclude-table-data='jules_session_activities' \
       --exclude-table-data='jules_callback_events' \
       --exclude-table-data='jules_capacity_events' \
       "$DATABASE_URL" > "$wd/db/paperclip.sql" 2>/dev/null; then
    log "companies: pg_dump ok ($(wc -c < "$wd/db/paperclip.sql") bytes)"
  else
    log "companies: pg_dump failed"
  fi
  # Per-company folders (human-identifiable): companies/<name-slug>-<id8>/
  rm -rf "$wd"/companies/* 2>/dev/null
  while IFS='|' read -r cid cname; do
    [ -z "$cid" ] && continue
    local slug; slug="$(printf '%s' "$cname" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-_')"
    [ -z "$slug" ] && slug="co"
    local d="$wd/companies/${slug}-${cid:0:8}"; mkdir -p "$d"
    company_json "$d/company.json"  "select row_to_json(c) from companies c where c.id='$cid'"
    company_json "$d/agents.json"   "select coalesce(json_agg(a),'[]') from agents a where a.company_id='$cid'"
    company_json "$d/issues.json"   "select coalesce(json_agg(i),'[]') from issues i where i.company_id='$cid'"
    company_json "$d/projects.json" "select coalesce(json_agg(p),'[]') from projects p where p.company_id='$cid'"
    company_json "$d/kpis.json"     "select coalesce(json_agg(k),'[]') from agent_kpis k where k.company_id='$cid'"
    # FounderOS company setup: the Goal contracts, their template provenance and the
    # installed resource packs are what makes a company reproducible after a restore.
    company_json "$d/goals.json"          "select coalesce(json_agg(g),'[]') from goals g where g.company_id='$cid'"
    company_json "$d/goal-templates.json" "select coalesce(json_agg(t),'[]') from goal_template_instances t where t.company_id='$cid'"
    company_json "$d/support-packs.json"  "select coalesce(json_agg(r),'[]') from resource_pack_snapshots r where r.company_id='$cid'"
  done < <(psql "$DATABASE_URL" -tAF'|' -c "select id, name from companies" 2>/dev/null)
  log "companies: per-company export done"
}

backup_repo "${OPENVIKING_BACKUP_REPO:-}" build_openviking
backup_repo "${COMPANIES_BACKUP_REPO:-}"  build_companies
exit 0
