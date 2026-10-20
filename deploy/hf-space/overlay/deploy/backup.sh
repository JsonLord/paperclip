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

# Set by build_companies to the dump it wrote; promoted to the restore provenance
# once the push succeeds.
PENDING_DUMP_SHA=""

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
    if git -C "$wd" push -q "$url" HEAD:main >/dev/null 2>&1; then
      log "$repo: pushed"
      # The repo now holds what this run published, so a later run in this container
      # compares against that rather than against the dump the boot restored. Recorded
      # only on success: a failed push leaves the repo as it was.
      [ -n "${PENDING_DUMP_SHA:-}" ] && printf '%s\n' "$PENDING_DUMP_SHA" > "$HOME/.paperclip-backup-baseline" 2>/dev/null
    else
      log "$repo: push failed"
    fi
  fi
  PENDING_DUMP_SHA=""
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

# Both overrides are accepted: PAPERCLIP_BACKUP_FORCE is the current name, and
# PAPERCLIP_BACKUP_ALLOW_SHRINK is kept so an existing deployment's variable still works.
backup_forced() { [ -n "${PAPERCLIP_BACKUP_FORCE:-}${PAPERCLIP_BACKUP_ALLOW_SHRINK:-}" ] && echo 1; }

# Identify a dump by content, so a run can tell "the repo still holds what I restored"
# from "something else landed". Empty for a missing or empty file.
dump_sha() {
  local file="$1"
  [ -s "$file" ] || return 0
  command -v sha256sum >/dev/null 2>&1 || return 0
  sha256sum < "$file" | awk '{print $1}'
}

# Count the rows in any of a dump's `COPY public.<table>` blocks.
dump_rows() {
  local file="$1" table="$2"
  [ -s "$file" ] || { echo 0; return 0; }
  awk -v tbl="COPY public.${table} " 'index($0,tbl)==1{f=1;next} f&&/^\\\.$/{exit} f{c++} END{print c+0}' "$file" 2>/dev/null || echo 0
}

# Count the rows in a plain pg_dump's `COPY public.companies` block. Reported in the
# log so a refusal says what was at stake.
dump_company_count() {
  local file="$1"
  [ -s "$file" ] || { echo 0; return 0; }
  awk '/^COPY public\.companies /{f=1;next} f&&/^\\\.$/{exit} f{c++} END{print c+0}' "$file" 2>/dev/null || echo 0
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
  # If the boot restore refused a dump from the pre-FounderOS migration lineage, keep
  # that dump as a distinct file before this run overwrites db/paperclip.sql. Git
  # history would hold it either way, but an explicit path is what someone recovering
  # those rows will look for.
  if [ -n "${PAPERCLIP_BACKUP_LINEAGE_CHANGED:-}" ] && [ -f "$wd/db/paperclip.sql" ] \
     && ! grep -q 'jules_sessions' "$wd/db/paperclip.sql" \
     && [ ! -f "$wd/db/paperclip.pre-founderos.sql" ]; then
    cp "$wd/db/paperclip.sql" "$wd/db/paperclip.pre-founderos.sql"
    log "companies: archived the pre-FounderOS dump as db/paperclip.pre-founderos.sql"
  fi
  # Full schema + data, EXCLUDING high-volume operational tables' data (keep it small
  # and under the GitHub repo size budget). Schema is still dumped for a clean restore.
  # The FounderOS/Jules tables that matter for a rebuild (jules_profiles,
  # jules_profile_sources, company_jules_sources, jules_sessions, goals,
  # goal_template_instances, resource_pack_snapshots) are deliberately NOT excluded;
  # only their append-only event/activity logs are.
  # A shutdown backup races the next boot's restore: it pushes about ten seconds after
  # the next container has already restored. Publishing then overwrites work this
  # container never saw. Compare the repo's dump against the one this boot restored:
  # equal means nothing has landed since and publishing is safe, different means
  # another container published in the meantime.
  local prior_count prior_saved prior_sha restored_sha
  prior_count="$(dump_company_count "$wd/db/paperclip.sql")"
  prior_saved=""
  if [ -s "$wd/db/paperclip.sql" ]; then prior_saved="$(mktemp)"; cp "$wd/db/paperclip.sql" "$prior_saved"; fi
  prior_sha="$(dump_sha "$wd/db/paperclip.sql")"
  restored_sha="$(cat "$HOME/.paperclip-backup-baseline" 2>/dev/null | tr -d '[:space:]')"

  # A differing dump does NOT by itself mean the repo holds newer work. The shutdown
  # backup races the next boot, so the repo routinely moves just after a container
  # restores — with an OLDER dump. Refusing on any difference wedged a container for
  # its whole life: one did 45 minutes of agent work and published none of it.
  #
  # Refuse only when this database is strictly poorer than the repo's dump on EVERY
  # axis, which is what a genuinely stale restore looks like. A container that has
  # more of anything has work the repo does not, and must be allowed to publish.
  if [ -n "$prior_sha" ] && [ "$prior_sha" != "$restored_sha" ] && [ -z "$(backup_forced)" ]; then
    if [ -z "$restored_sha" ] && [ -n "${PAPERCLIP_BACKUP_STALE:-}" ]; then
      # This boot deliberately did not restore (no dump yet, or the wrong migration
      # lineage). Publishing is how the repo gets a usable dump at all.
      log "companies: publishing over an unrestored dump (this boot could not use it)"
    else
      local live_co live_goals live_issues repo_goals repo_issues
      live_co="$(psql "$DATABASE_URL" -qtAc 'select count(*) from companies' 2>/dev/null | tr -d '[:space:]')"
      live_goals="$(psql "$DATABASE_URL" -qtAc 'select count(*) from goals' 2>/dev/null | tr -d '[:space:]')"
      live_issues="$(psql "$DATABASE_URL" -qtAc 'select count(*) from issues' 2>/dev/null | tr -d '[:space:]')"
      repo_goals="$(dump_rows "$prior_saved" goals)"
      repo_issues="$(dump_rows "$prior_saved" issues)"
      if [ "${live_co:-0}" -lt "$prior_count" ] \
         && [ "${live_goals:-0}" -lt "${repo_goals:-0}" ] \
         && [ "${live_issues:-0}" -lt "${repo_issues:-0}" ]; then
        log "companies: REFUSING to publish — this database is poorer than the backup on every axis"
        log "companies: live ${live_co}/${live_goals}/${live_issues} vs repo ${prior_count}/${repo_goals}/${repo_issues} (companies/goals/issues)"
        log "companies: this looks like a stale restore; set PAPERCLIP_BACKUP_FORCE=1 to overwrite it anyway"
        rm -f "$prior_saved"
        return 1
      fi
      log "companies: repo moved since this boot restored, but this database is not strictly poorer — publishing"
      log "companies: live ${live_co}/${live_goals}/${live_issues} vs repo ${prior_count}/${repo_goals}/${repo_issues} (companies/goals/issues)"
    fi
  fi

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
    # The redirect already truncated the file; put the repo's dump back and publish
    # nothing this run, rather than an empty dump or JSON from a DB we just failed to
    # read.
    [ -n "$prior_saved" ] && cp "$prior_saved" "$wd/db/paperclip.sql"
    rm -f "$prior_saved"
    return 1
  fi

  local new_count; new_count="$(dump_company_count "$wd/db/paperclip.sql")"
  log "companies: publishing ${new_count} company/companies (repo held ${prior_count})"
  # What this run publishes becomes the dump a later run in this container must match,
  # so a daily backup does not make the shutdown backup refuse itself. Recorded only
  # after the push succeeds, in backup_repo.
  PENDING_DUMP_SHA="$(dump_sha "$wd/db/paperclip.sql")"
  rm -f "$prior_saved"
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

    # What the agents actually did.
    #
    # The restore dump deliberately drops run history, the activity log and the Jules
    # event tables: a restore does not need them and they grow without bound. The cost
    # was that every trace of agent behaviour died with the container, so a worker that
    # had been failing for a day looked identical to one that had never been asked to
    # do anything. These are the same tables, bounded to a recent tail and kept as
    # diagnostics rather than as restore payload.
    mkdir -p "$d/diagnostics"
    company_json "$d/diagnostics/runs.json" \
      "select coalesce(json_agg(r order by r.started_at desc),'[]') from (select h.id, a.name as agent, h.status, h.error_code, h.error, h.started_at, h.finished_at, h.context_snapshot from heartbeat_runs h left join agents a on a.id=h.agent_id where h.company_id='$cid' order by h.started_at desc limit 200) r"
    company_json "$d/diagnostics/run-events.json" \
      "select coalesce(json_agg(e order by e.created_at desc),'[]') from (select id, run_id, seq, event_type, level, message, payload, created_at from heartbeat_run_events where company_id='$cid' order by created_at desc limit 500) e"
    company_json "$d/diagnostics/activity.json" \
      "select coalesce(json_agg(l order by l.created_at desc),'[]') from (select id, actor_type, actor_id, action, entity_type, entity_id, details, created_at from activity_log where company_id='$cid' order by created_at desc limit 300) l"
    # The only record of what a remote worker said and did. Without it a Jules session
    # that completed having produced nothing is indistinguishable from one that worked.
    company_json "$d/diagnostics/jules-activity.json" \
      "select coalesce(json_agg(x order by x.created_at desc),'[]') from (select sa.id, sa.session_id, sa.activity_id, sa.remote_created_at, sa.payload, sa.created_at from jules_session_activities sa where sa.company_id='$cid' order by sa.created_at desc limit 200) x"
    company_json "$d/diagnostics/jules-sessions.json" \
      "select coalesce(json_agg(s order by s.started_at desc),'[]') from (select js.id, a.name as agent, js.jules_session_id, js.status, js.issue_id, js.pull_request_url, js.wait_reason, js.reconciliation_error, js.result_json, js.started_at, js.finished_at from jules_sessions js left join agents a on a.id=js.agent_id where js.company_id='$cid' order by js.started_at desc limit 100) s"
    company_json "$d/diagnostics/jules-capacity.json" \
      "select coalesce(json_agg(c order by c.occurred_at desc),'[]') from (select id, profile_id, session_id, event_type, details, occurred_at from jules_capacity_events where company_id='$cid' order by occurred_at desc limit 200) c"
  done < <(psql "$DATABASE_URL" -tAF'|' -c "select id, name from companies" 2>/dev/null)
  log "companies: per-company export done"
}

backup_repo "${OPENVIKING_BACKUP_REPO:-}" build_openviking
backup_repo "${COMPANIES_BACKUP_REPO:-}"  build_companies
exit 0
