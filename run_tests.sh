#!/usr/bin/env bash
# One-command runner for the end-to-end use-case smoke test.
# Usage:  ./run_tests.sh
#
# Secrets are read from the environment, or from a local (gitignored)
# deploy/.test-secrets file — NEVER committed. Create it once:
#
#   cat > deploy/.test-secrets <<'EOF'
#   DASHBOARDS_AGENT_KEY=dsh_xxxxxxxx
#   HF_TOKEN=hf_xxxxxxxx            # optional (enables openviking run-log checks)
#   EOF
#
# GITHUB_TOKEN is auto-filled from `gh auth token` when available.
set -uo pipefail
cd "$(dirname "$0")"

# Load local secrets if present (export everything defined there).
if [ -f deploy/.test-secrets ]; then
  set -a; . deploy/.test-secrets; set +a
fi

# Fall back to the gh CLI token for the backup-repo checks.
: "${GITHUB_TOKEN:=$(gh auth token 2>/dev/null || true)}"
export GITHUB_TOKEN

[ -z "${DASHBOARDS_AGENT_KEY:-}" ] && echo "note: DASHBOARDS_AGENT_KEY unset — dashboard-lifecycle checks will be skipped."
[ -z "${GITHUB_TOKEN:-}" ]        && echo "note: GITHUB_TOKEN unset — backup checks will be skipped."

exec bash deploy/e2e-smoke.sh
