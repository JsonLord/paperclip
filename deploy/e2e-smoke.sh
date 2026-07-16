#!/usr/bin/env bash
# End-to-end use-case smoke test for the Paperclip HF Space deployment.
# Walks the whole stack the way a real user's workload flows through it:
#   platform online -> DB live -> auth enforced -> agent executors reachable ->
#   openviking memory -> dashboard lifecycle -> GitHub backups intact.
#
# Read-only / self-cleaning: the only thing it writes is a throwaway dashboard
# (_e2e-test) that it deletes at the end. No paperclip data is modified.
#
# Config via env (nothing hardcoded / no secrets committed):
#   SPACE_URL           default https://leon4gr45-paperclip.hf.space
#   DASHBOARDS_URL      default https://leon4gr45-dashboards.hf.space
#   DASHBOARDS_AGENT_KEY  (required for the dashboard-lifecycle checks)
#   DESK_AGENT_HOST     default https://debian-devil.tail3f341b.ts.net:8443
#   OPENOPERATOR_URL    default https://leon4gr45-openoperator.hf.space
#   GITHUB_TOKEN, OPENVIKING_BACKUP_REPO, COMPANIES_BACKUP_REPO  (backup checks)
#   HF_TOKEN            (optional: Space stage + run-log checks)
set -uo pipefail

SPACE_URL="${SPACE_URL:-https://leon4gr45-paperclip.hf.space}"
DASHBOARDS_URL="${DASHBOARDS_URL:-https://leon4gr45-dashboards.hf.space}"
DESK_AGENT_HOST="${DESK_AGENT_HOST:-https://debian-devil.tail3f341b.ts.net:8443}"
OPENOPERATOR_URL="${OPENOPERATOR_URL:-https://leon4gr45-openoperator.hf.space}"
OPENVIKING_BACKUP_REPO="${OPENVIKING_BACKUP_REPO:-JsonLord/paperclip-openviking-backup}"
COMPANIES_BACKUP_REPO="${COMPANIES_BACKUP_REPO:-JsonLord/paperclip-companies-backup}"

PASS=0; FAIL=0; SKIP=0
ok()   { echo "  ✅ PASS  $*"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ FAIL  $*"; FAIL=$((FAIL+1)); }
skip() { echo "  ⚠️  SKIP  $*"; SKIP=$((SKIP+1)); }
hdr()  { echo; echo "── $* ──"; }
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$@" 2>/dev/null; }

# 1. Platform is online ────────────────────────────────────────────────────────
hdr "1. Platform online"
c=$(code "$SPACE_URL/api/health")
[ "$c" = "200" ] && ok "GET /api/health -> 200" || bad "GET /api/health -> $c (expected 200)"
health="$(curl -s --max-time 25 "$SPACE_URL/api/health" 2>/dev/null)"
echo "$health" | grep -q '"authReady":true' && ok "health reports authReady:true (DB + auth up)" || bad "authReady not true (DB/auth issue): $(echo "$health" | head -c 120)"
c=$(code "$SPACE_URL/"); [ "$c" = "200" ] && ok "UI root serves (200)" || bad "UI root -> $c"

# 2. Database is live (the app can only answer these if the local PG restored) ──
hdr "2. Database live (local postgres, restored from GitHub)"
# health returning authReady:true already proves the DB connected + migrations ok.
# Confirm the auth store is queryable via the session endpoint (no error 500).
c=$(code "$SPACE_URL/api/auth/get-session")
[ "$c" = "200" ] || [ "$c" = "401" ] && ok "auth/get-session reachable ($c) — DB responding" || bad "auth/get-session -> $c (DB error?)"

# 3. Auth is enforced (control-plane is not wide open) ──────────────────────────
hdr "3. Auth enforced"
c=$(code "$SPACE_URL/api/companies")
[ "$c" = "401" ] || [ "$c" = "403" ] && ok "GET /api/companies without auth -> $c (gated)" || bad "GET /api/companies -> $c (expected 401/403 — SHOULD be gated!)"
c=$(code "$SPACE_URL/api/instance-settings")
[ "$c" = "401" ] || [ "$c" = "403" ] || [ "$c" = "404" ] && ok "instance-settings gated ($c)" || skip "instance-settings -> $c"

# 4. Agent executors are reachable ─────────────────────────────────────────────
hdr "4. Agent executors reachable"
c=$(code "$DESK_AGENT_HOST/api/sessions")
[ "$c" = "200" ] && ok "CTO executor desk_agent funnel /api/sessions -> 200" || bad "desk_agent funnel -> $c (laptop/funnel down?)"
c=$(code "$OPENOPERATOR_URL/health")
[ "$c" = "200" ] && ok "CEO/Programmer executor openoperator /health -> 200" || bad "openoperator /health -> $c"

# 5. OpenViking memory is capturing (needs HF_TOKEN for run logs) ───────────────
hdr "5. OpenViking memory pipeline"
if [ -n "${HF_TOKEN:-}" ]; then
  logs="$(curl -s --max-time 25 -H "Authorization: Bearer $HF_TOKEN" "https://huggingface.co/api/spaces/Leon4gr45/paperclip/logs/run" 2>/dev/null | grep -oE '"data":"[^"]*"')"
  echo "$logs" | grep -q "openviking-server started" && ok "openviking sidecar started (:1933)" || bad "no openviking-server start in logs"
  echo "$logs" | grep -qiE "injecting agent memories|V2:" && ok "agent-memory injection observed" || skip "no memory-injection log yet (needs an agent run)"
else
  skip "HF_TOKEN not set — cannot read run logs for openviking"
fi

# 6. Dashboard lifecycle (create -> render -> update data -> verify -> delete) ──
hdr "6. Dashboard lifecycle (create/render/update/delete)"
if [ -n "${DASHBOARDS_AGENT_KEY:-}" ]; then
  AUTH=(-H "Authorization: Bearer $DASHBOARDS_AGENT_KEY")
  c=$(code "$DASHBOARDS_URL/health"); [ "$c" = "200" ] && ok "dashboards /health -> 200" || bad "dashboards /health -> $c"
  # aux company's real dashboard renders publicly
  c=$(code "$DASHBOARDS_URL/d/company-aux"); [ "$c" = "200" ] && ok "aux dashboard /d/company-aux renders (200)" || bad "aux dashboard -> $c"
  # create throwaway
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -X POST "$DASHBOARDS_URL/api/dashboards" "${AUTH[@]}" -H "Content-Type: application/json" \
        -d '{"id":"_e2e-test","title":"E2E","widgets":[{"type":"metric","title":"N","dataKey":"n"}]}')
  [ "$c" = "200" ] && ok "create dashboard _e2e-test -> 200" || bad "create dashboard -> $c"
  # update data
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -X PUT "$DASHBOARDS_URL/api/dashboards/_e2e-test/data" "${AUTH[@]}" -H "Content-Type: application/json" -d '{"n":{"value":42}}')
  [ "$c" = "200" ] && ok "PUT /data merge -> 200" || bad "PUT /data -> $c"
  # verify data landed
  got="$(curl -s --max-time 25 "$DASHBOARDS_URL/api/dashboards/_e2e-test" "${AUTH[@]}" 2>/dev/null)"
  echo "$got" | grep -q '"value":\s*42' && ok "data value merged + read back (42)" || bad "data not merged: $(echo "$got" | head -c 100)"
  c=$(code "$DASHBOARDS_URL/d/_e2e-test"); [ "$c" = "200" ] && ok "throwaway renders at /d/_e2e-test" || bad "render -> $c"
  # cleanup
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -X DELETE "$DASHBOARDS_URL/api/dashboards/_e2e-test" "${AUTH[@]}")
  [ "$c" = "200" ] && ok "cleanup: deleted _e2e-test" || bad "cleanup delete -> $c"
else
  skip "DASHBOARDS_AGENT_KEY not set — skipping dashboard lifecycle"
fi

# 7. Backups intact (GitHub two-repo, important files) ─────────────────────────
hdr "7. GitHub backups intact"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  for repo in "$OPENVIKING_BACKUP_REPO" "$COMPANIES_BACKUP_REPO"; do
    t="$(mktemp -d)"
    if git clone --depth 1 "https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git" "$t" >/dev/null 2>&1; then
      last="$(git -C "$t" log -1 --format=%cI 2>/dev/null)"
      ok "$repo cloned (last commit $last)"
      if [ "$repo" = "$OPENVIKING_BACKUP_REPO" ]; then
        { [ -d "$t/vectordb" ] || [ -d "$t/viking" ]; } && ok "  openviking repo has vectordb/ or viking/" || skip "  openviking repo empty (no memory yet)"
        { [ -e "$t/.openviking.pid" ] || [ -d "$t/_system" ]; } && bad "  openviking repo contains NON-important files (should be excluded)" || ok "  openviking repo excludes transient files"
      else
        [ -f "$t/db/paperclip.sql" ] && ok "  companies repo has db/paperclip.sql ($(wc -c <"$t/db/paperclip.sql") bytes)" || bad "  companies repo missing db/paperclip.sql"
        n=$(ls -1 "$t/companies" 2>/dev/null | wc -l); [ "$n" -ge 1 ] && ok "  per-company folders present ($n): $(ls "$t/companies" 2>/dev/null | tr '\n' ' ')" || bad "  no per-company folders"
      fi
    else
      bad "$repo not clonable (token/repo issue)"
    fi
    rm -rf "$t"
  done
else
  skip "GITHUB_TOKEN not set — skipping backup checks"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo; echo "════════════════════════════════════════"
echo "  RESULT: $PASS passed, $FAIL failed, $SKIP skipped"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
