"""Deterministic Agency selection and policy. No I/O or LLM decisions."""

import re

SOURCE_SHA = "cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09"
ACTIVE = {
    "RESERVED",
    "PREPARING",
    "DISPATCH_INTENT",
    "DISPATCHED",
    "REMOTE_ACTIVE",
    "VALIDATING",
    "STOPPING",
    "AMBIGUOUS",
    "EXPIRED",
}
TERMINAL = {"PASS", "FAIL", "REVIEW_REQUIRED", "STOPPED"}
ROUTES = {
    "market sizing": ("market-intelligence-analyst", ["market-sizing"]),
    "problem discovery": ("problem-explorer", ["pain-mining"]),
    "pricing objection": ("wtp-skeptic", ["pricing-wtp"]),
    "fake-door experiment": ("fake-door-designer", ["experiment-design"]),
    "landing page design": ("landing-page-builder", ["value-proposition"]),
    "customer language analysis": ("customer-language-analyst", ["customer-language"]),
    "evidence contradiction": ("evidence-auditor", ["evidence-audit"]),
    "channel experiment": ("channel-researcher", ["cac-modeling"]),
    "pivot analysis": ("pivot-strategist", ["hypothesis-framing"]),
    "venture kill review": ("kill-agent", ["evidence-audit"]),
}


def template_id(agent):
    return str((agent.get("metadata") or {}).get("founderosTemplateId", "")).split(",")[
        0
    ]


def describe_task(text):
    key = next((k for k in ROUTES if k in text.lower()), None)
    return {
        "description": text,
        **(
            {"agencyId": ROUTES[key][0], "requiredSkills": ROUTES[key][1]}
            if key
            else {}
        ),
    }


def policy(task):
    reasons = []
    text = task.get("description", "").lower()
    if task.get("productionEngineering") or re.search(
        r"\b(backend|database|authentication|production api|api implementation|production code)\b",
        text,
    ):
        reasons.append("FOUNDER_ENGINEERING_DEPENDENCY")
    if task.get("externalActions") or re.search(
        r"\b(send outreach|contact customers|buy ads|charge card|publish live|deploy to production)\b",
        text,
    ):
        reasons.append("EXTERNAL_ACTION_APPROVAL_REQUIRED")
    if not task.get("runtimeAvailable", True):
        reasons.append("RUNTIME_UNAVAILABLE")
    if not task.get("budgetAvailable", True):
        reasons.append("BUDGET_UNAVAILABLE")
    return reasons


def recommend(agents, task, active=()):
    gates = policy(task)
    ranked = []
    financial = task.get("taskType") == "finance" or bool(
        re.search(
            r"financial plan|unit economics|bpw financial|cash planning",
            task.get("description", ""),
            re.I,
        )
    )
    busy = {x["agentId"] for x in active if x["status"] in ACTIVE}
    canonical = {}
    for a in agents:
        meta = a.get("metadata") or {}
        aid = meta.get("agencyId")
        if aid:
            canonical.setdefault(aid, []).append(a["id"])
    if any(len(v) > 1 for v in canonical.values()):
        gates.append("DUPLICATE_AGENCY_ID")
    for a in agents:
        meta = a.get("metadata") or {}
        aid = meta.get("agencyId")
        finance = financial and template_id(a) == "finance"
        if not aid and not finance:
            continue
        score = 0
        reasons = []
        blocked = []
        if aid and meta.get("agencySourceCommit") != SOURCE_SHA:
            blocked.append("UNPINNED_AGENCY_SOURCE")
        skills = set(meta.get("agencySkills", []))
        caps = {x.strip() for x in (a.get("capabilities") or "").split(",")}
        writes = set(meta.get("agencyWrites", []))
        for required, available, label, weight in [
            (task.get("requiredSkills", []), skills, "skill", 20),
            (task.get("requiredCapabilities", []), caps, "capability", 15),
            (task.get("operations", []), writes, "operation", 25),
        ]:
            for item in required:
                if item in available:
                    score += weight
                    reasons.append(label + ":" + item)
                else:
                    blocked.append("MISSING_" + label.upper() + ":" + item)
        if task.get("division") == meta.get("agencyDivision"):
            score += 10
            reasons.append("division:" + str(task.get("division")))
        if task.get("agencyId"):
            if task["agencyId"] == aid:
                score += 100
                reasons.append("canonical workflow role:" + aid)
            else:
                blocked.append("WRONG_CANONICAL_ROLE")
        if finance:
            score += 120
            reasons.append("retained FounderOS financial capability")
        if a["id"] in busy or a["status"] in ("running", "error", "terminated"):
            blocked.append("AGENT_UNAVAILABLE")
        if a.get("pauseReason") not in (
            None,
            "manual",
            "supervisor",
            "agency-supervisor",
        ):
            blocked.append("PAUSED_BY_POLICY")
        if (
            a.get("budgetMonthlyCents", 0) > 0
            and a.get("spentMonthlyCents", 0) >= a["budgetMonthlyCents"]
        ):
            blocked.append("BUDGET_EXHAUSTED")
        if a.get("adapterType") not in ("jules", "hermes_local"):
            blocked.append("RUNTIME_UNAVAILABLE")
        if not reasons:
            blocked.append("NO_TASK_MATCH")
        ranked.append(
            {
                "agentId": a["id"],
                "agencyId": aid or "founderos:finance",
                "score": score,
                "reasons": reasons,
                "blockedBy": blocked,
            }
        )
    ranked.sort(
        key=lambda x: (bool(x["blockedBy"]), -x["score"], x["agencyId"], x["agentId"])
    )
    selected = (
        next((x for x in ranked if not x["blockedBy"]), None) if not gates else None
    )
    return {
        "recommendedAgentId": selected["agentId"] if selected else None,
        "selected": selected,
        "candidates": ranked,
        "blockedBy": gates,
        "requiresApproval": bool(gates),
        "mode": "MANUAL",
        "estimatedRuntime": "jules" if selected else None,
    }


def identity_prompt(persona, issue, task):
    # Literal placeholders are rendered by the stable native Jules adapter after run allocation.
    known = {issue.get("id", "")}
    historical = sorted(
        set(
            re.findall(
                r"\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b",
                issue.get("description") or "",
                re.I,
            )
        )
        - known
    )
    authority = """# Authoritative current execution identity
CURRENT_PAPERCLIP_RUN_ID = {{runId}}
CURRENT_PAPERCLIP_AGENT_ID = {{agentId}}
CURRENT_PAPERCLIP_ISSUE_ID = {{context.issueId}}
CURRENT_COMPANY_ID = {{companyId}}
Any other run ID in issue text, history, comments, previous receipts or repository material is HISTORICAL CONTEXT.
When writing provenance ALWAYS use CURRENT_PAPERCLIP_RUN_ID; never copy a historical run ID.
Required artifact header:
paperclip_run_id: {{runId}}
paperclip_issue_id: {{context.issueId}}
paperclip_agent_id: {{agentId}}
qualification: synthetic
"""
    authority += "HISTORICAL_RUN_IDS = " + (", ".join(historical) or "none") + "\n"
    envelope = (
        "\n# Bounded execution contract\n"
        + __import__("json").dumps(task, sort_keys=True)
        + "\nWork only the assigned issue. No outreach, publication, payments, deployment, customer contact, secret disclosure or production engineering. Do not merge PRs or claim canonical evidence. Report blockers instead of widening scope.\n"
    )
    return (
        authority
        + "\n# Persona and assignment history\n"
        + persona
        + envelope
        + "\n"
        + authority
    )
