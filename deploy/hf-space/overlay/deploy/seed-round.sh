#!/usr/bin/env bash
# Seed the first validation round: define aux against usability-testing platforms.
#
# Why this exists: the FounderOS bootstrap makes `validate-problem` the active goal,
# but its contract cannot be met by a company with no customers
# ("Required real interaction count is unmet"), so the opening goal is structurally
# uncompletable and the workforce has nothing it can honestly finish. `analyze-market`
# needs only external sources, and its decision set (REFINE_ICP, REFINE_MARKET_SCOPE,
# PIVOT_SEGMENT, PROCEED_TO_OFFER_VALIDATION, KILL_MARKET_HYPOTHESIS) is exactly the
# define/redefine loop. So round one leads with the competitive field, and customer
# outreach waits until there is an ICP worth spending real people on.
#
# Issues are chained rather than assigned at once: every Jules task costs one session
# start from a 30/24h budget, and six workers firing together would research the same
# ground in parallel.
#
# Strictly opt-in and idempotent: nothing happens unless FOUNDEROS_ROUND_SEED is set,
# and nothing happens twice — the round goal's title is the guard.
set -uo pipefail

log() { echo "[seed-round $(date -uIseconds)] $*"; }

[ -n "${FOUNDEROS_ROUND_SEED:-}" ] || exit 0

: "${PORT:=7860}"
API="http://127.0.0.1:${PORT}"
ORIGIN="$API"
: "${GITHUB_API_URL:=https://api.github.com}"
ROUND_TITLE="${FOUNDEROS_ROUND_TITLE:-Round 1 — Define aux against usability-testing platforms}"

[ -n "${PAPERCLIP_ADMIN_PASSWORD:-}" ] || { log "PAPERCLIP_ADMIN_PASSWORD unset — skipping"; exit 0; }
[ -n "${GITHUB_TOKEN:-}" ] || { log "no GITHUB_TOKEN — cannot resolve the admin email; skipping"; exit 0; }

profile="$(curl -fsS -m 20 -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" -H "User-Agent: paperclip-space" \
  "${GITHUB_API_URL}/user" 2>/dev/null)" || { log "GitHub /user failed — skipping"; exit 0; }
admin_email="$(printf '%s' "$profile" | python3 -c '
import json,sys
d=json.load(sys.stdin)
login=(d.get("login") or "").strip()
print((d.get("email") or (login+"@users.noreply.github.com" if login else "")).strip())
' 2>/dev/null)"
[ -n "$admin_email" ] || { log "could not derive the admin email — skipping"; exit 0; }

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
    curl -sS -m 60 -b "$jar" -o "$tmp/out.json" -w '%{http_code}' -X "$method" \
      -H 'content-type: application/json' -H "Origin: $ORIGIN" -H "Referer: $ORIGIN/" \
      --data-binary @"$body" "$API$path" 2>/dev/null
  else
    curl -sS -m 60 -b "$jar" -o "$tmp/out.json" -w '%{http_code}' -X "$method" \
      -H "Origin: $ORIGIN" -H "Referer: $ORIGIN/" "$API$path" 2>/dev/null
  fi
}

want="${FOUNDEROS_ROUND_COMPANY:-${JULES_SEED_COMPANY:-${FOUNDEROS_IMPORT_NAME:-}}}"
[ "$(api GET /api/companies)" = "200" ] || { log "could not list companies — skipping"; exit 0; }
company_id="$(WANT="$want" python3 -c '
import json,os,sys
rows=json.load(open(sys.argv[1]))
want=os.environ.get("WANT","").strip()
m=[c for c in rows if c["id"]==want or (c.get("name") or "").strip()==want] if want else rows
print(m[0]["id"] if len(m)==1 else "")
' "$tmp/out.json" 2>/dev/null)"
[ -n "$company_id" ] || { log "no unambiguous company (FOUNDEROS_ROUND_COMPANY/JULES_SEED_COMPANY) — skipping"; exit 0; }

[ "$(api GET "/api/companies/$company_id/goals")" = "200" ] || { log "could not list goals — skipping"; exit 0; }
cp "$tmp/out.json" "$tmp/goals.json"
if TITLE="$ROUND_TITLE" python3 -c '
import json,os,sys
rows=json.load(open(sys.argv[1]))
raise SystemExit(0 if any((g.get("title") or "")==os.environ["TITLE"] for g in rows) else 1)
' "$tmp/goals.json" 2>/dev/null; then
  log "round goal already present — nothing to do"
  exit 0
fi

[ "$(api GET "/api/companies/$company_id/agents")" = "200" ] || { log "could not list agents — skipping"; exit 0; }
cp "$tmp/out.json" "$tmp/agents.json"

# Resolve the vision goal (the company-level parent) and one agent id per template role.
read -r vision_id market_id product_id evidence_id customer_id manager_id <<EOF
$(python3 -c '
import json,sys
goals=json.load(open(sys.argv[1])); agents=json.load(open(sys.argv[2]))
vision=next((g["id"] for g in goals if g.get("level")=="company"), "")
def by_role(key):
    for a in agents:
        meta=a.get("metadata") or {}
        if key in str(meta.get("founderosTemplateId","")): return a["id"]
    return ""
manager=next((a["id"] for a in agents if a.get("adapterType")=="hermes_local"), "")
print(vision or "-", by_role("market") or "-", by_role("product") or "-",
      by_role("evidence") or "-", by_role("customer") or "-", manager or "-")
' "$tmp/goals.json" "$tmp/agents.json" 2>/dev/null)
EOF
for pair in "vision:$vision_id" "market:$market_id" "product:$product_id" "evidence:$evidence_id" "customer:$customer_id" "manager:$manager_id"; do
  [ "${pair#*:}" != "-" ] || { log "could not resolve ${pair%%:*} — skipping"; exit 0; }
done

python3 - "$tmp/goal.json" <<PY
import json,sys
json.dump({
  "title": """$ROUND_TITLE""",
  "description": "Define what aux is by what the field already does. Establish a sourced competitor landscape across usability-testing platforms and the synthetic-user entrants moving into the same decision, locate the gaps nobody credibly serves, and restate the idea and ICP hypothesis against them. Ends in one of the market decisions: PROCEED_TO_OFFER_VALIDATION, REFINE_ICP, REFINE_MARKET_SCOPE, GATHER_MORE_MARKET_EVIDENCE, PIVOT_SEGMENT or KILL_MARKET_HYPOTHESIS. No customer contact in this round.",
  "level": "team", "status": "active", "parentId": "$vision_id", "ownerAgentId": "$manager_id",
  "requiredCapabilities": ["firm", "github"],
  "outputPaths": ["business-case/COMPETITOR_LANDSCAPE.md","business-case/OPPORTUNITY_GAPS.md","business-case/MARKET_ANALYSIS.md","business-case/ICP.md","evidence/market/**","firm/**"],
  "acceptanceCriteria": [
    "Every competitor entry carries a source ID and, where priced, a pricing source",
    "Direct, indirect, manual, internal, service, do-nothing and adjacent alternatives are each considered and either evidenced or explicitly recorded as not found",
    "Opportunity gaps cite the landscape rather than intuition",
    "The restated idea and ICP remain labelled as hypotheses",
    "Contradictions with company/OVERVIEW.md stay visible rather than being silently resolved",
  ],
  "cannotCompleteIf": [
    "A competitor claim lacks a source",
    "A price appears without a pricing source",
    "The ICP is presented as validated",
    "Any customer was contacted during this round",
  ],
}, open(sys.argv[1], "w"))
PY
[ "$(api POST "/api/companies/$company_id/goals" "$tmp/goal.json")" = "201" ] \
  || { log "failed to create the round goal: $(head -c 200 "$tmp/out.json" | tr -d '\n')"; exit 0; }
goal_id="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("id",""))' "$tmp/out.json")"
log "created round goal $goal_id"

# Chained: only the first is actionable. The rest are "backlog" ON PURPOSE — the issue
# create route wakes the assignee for every status EXCEPT backlog
# (`issue.assigneeAgentId && issue.status !== "backlog"`), so creating them as "blocked"
# would wake all six agents at once and burn six Jules starts from a 30/24h budget on
# work whose inputs do not exist yet. Each issue names its successor and the finishing
# agent promotes it to todo, which is what actually dispatches the next worker.
mk_issue() { # mk_issue <assignee> <status> <priority> <title> <description>
  python3 - "$tmp/issue.json" "$1" "$2" "$3" "$4" "$5" "$goal_id" <<'PY'
import json,sys
dest,assignee,status,priority,title,desc,goal=sys.argv[1:8]
json.dump({"goalId":goal,"title":title,"description":desc,"status":status,
           "priority":priority,"assigneeAgentId":assignee}, open(dest,"w"))
PY
  local code; code="$(api POST "/api/companies/$company_id/issues" "$tmp/issue.json")"
  if [ "$code" = "201" ]; then
    log "queued: $4"
  else
    log "failed to queue '$4' (HTTP $code): $(head -c 160 "$tmp/out.json" | tr -d '\n')"
  fi
}

mk_issue "$market_id" todo high \
  "Map the competitor landscape for journey/flow decisions" \
  "Identify who product teams already pay, or could plausibly use, to decide user-journey questions: usability-testing platforms, synthetic-user and AI-research entrants, survey/panel providers, analytics-after-the-fact, research agencies, in-house/manual moderated testing, and doing nothing. For each: what decision it supports, evidence of what it actually claims, and pricing WITH a pricing source. Record anything you looked for and could not find as a gap in coverage rather than omitting it. Write business-case/COMPETITOR_LANDSCAPE.md. Every external fact needs a source ID. Do not contact anyone. When done, hand off: set 'Position the laya capability against the landscape' to todo so the next worker is dispatched."

mk_issue "$product_id" backlog high \
  "Position the laya capability against the landscape" \
  "Do not start until 'Map the competitor landscape for journey/flow decisions' is done. Using receptron/laya as the evidence base, state what aux can actually do today versus what each competitor class claims. Separate what is built from what is intended. Where a capability is aspirational, label it [hypothesis]. Output feeds business-case/MARKET_ANALYSIS.md. When done, hand off: set 'Locate the opportunity gaps nobody credibly serves' to todo so the next worker is dispatched."

mk_issue "$market_id" backlog high \
  "Locate the opportunity gaps nobody credibly serves" \
  "Do not start until the capability positioning is done. Identify journey/flow decisions that are poorly served: too slow, too costly, too small a sample, or not addressed. Each gap must cite landscape entries. Do not invent demand — a gap is an absence of supply, not evidence that anyone wants it filled. Write business-case/OPPORTUNITY_GAPS.md. When done, hand off: set 'Audit every claim in the overview against the evidence' to todo so the next worker is dispatched."

mk_issue "$evidence_id" backlog high \
  "Audit every claim in the overview against the evidence" \
  "Do not start until the opportunity gaps are recorded. Take company/OVERVIEW.md claim by claim and mark each [evidence] with a source ID, [assumption], or [hypothesis]. The four 'current alternatives' are currently unsourced assumptions — either source them from the landscape or leave them marked. Report any claim that quietly hardened into fact. When done, hand off: set 'Narrow the ICP hypothesis using the gaps' to todo so the next worker is dispatched."

mk_issue "$customer_id" backlog high \
  "Narrow the ICP hypothesis using the gaps" \
  "Do not start until the evidence audit is done. Narrow the primary segment from 'product teams shipping digital products' to the slice the gaps actually point at, and say what makes that slice reachable and nameable. This stays a HYPOTHESIS: there is still no customer evidence, and presenting it as validated fails the goal contract. Update business-case/ICP.md. When done, hand off: set 'Restate the idea, and say what would falsify it' to todo so the next worker is dispatched."

mk_issue "$product_id" backlog high \
  "Restate the idea, and say what would falsify it" \
  "Do not start until the ICP hypothesis is narrowed. One paragraph: what aux is, for whom, against which alternative, and why the gap is worth filling. Then the falsifier — the single finding that would kill it. Name which journey decision (flow choice) is cheapest to test first and why, per open question 3 in the overview. When done, hand off: set 'Decide the round: proceed, refine, pivot, or kill' to todo so the next worker is dispatched."

mk_issue "$manager_id" backlog critical \
  "Decide the round: proceed, refine, pivot, or kill" \
  "Do not start until the restatement is written. Read the landscape, gaps, evidence audit, ICP hypothesis and restatement. Emit exactly one decision with reasoning: PROCEED_TO_OFFER_VALIDATION, REFINE_ICP, REFINE_MARKET_SCOPE, GATHER_MORE_MARKET_EVIDENCE, PIVOT_SEGMENT or KILL_MARKET_HYPOTHESIS. If refining or pivoting, state the narrowed scope for round 2. If proceeding, note that validate-problem needs real interactions and therefore founder approval for outreach — propose who to contact and what to ask, but contact no one."

log "round seeded: 7 issues on goal $goal_id (1 actionable, 6 chained)"
exit 0
