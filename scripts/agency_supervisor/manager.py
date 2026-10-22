"""Explicit Founder Manager handoff; no automatic manager or specialist fanout."""

import json, uuid
from .controller import require
from .core import template_id


def packet(controller, key):
    state, _ = controller.read()
    flow = state["workflows"][key]
    return {
        "workflowId": key,
        "sourceSha": flow["definition"]["sourceSha"],
        "workflow": flow["definition"]["id"],
        "specialists": [
            {
                "activationId": a["id"],
                "agencyId": a["agencyId"],
                "issueId": a["issueId"],
                "runId": a.get("runId"),
                "remoteSessionId": a.get("remoteSessionId"),
                "validation": a.get("validation"),
                "product": a.get("product"),
            }
            for aid in flow["activations"].values()
            for a in [state["activations"][aid]]
        ],
        "canonicalEvidenceAccepted": False,
        "requestedDecision": ["SUPPORTED", "UNSUPPORTED", "NEEDS_EXTERNAL_EVIDENCE"],
    }


def start_review(controller, key):
    state, doc = controller.read()
    flow = state["workflows"][key]
    if flow.get("managerReview"):
        return flow["managerReview"]
    require(
        flow["status"] == "AWAITING_FOUNDER_REVIEW",
        "Upstream workflow must pass before manager review",
    )
    data = packet(controller, key)
    require(
        all(x["validation"]["verdict"] == "PASS" for x in data["specialists"]),
        "Unvalidated upstream artifact",
    )
    managers = [a for a in controller.roster() if template_id(a) == "founder-manager"]
    require(
        len(managers) == 1 and managers[0]["status"] == "idle",
        "Founder Manager unavailable",
    )
    manager = managers[0]
    review = {
        "id": str(uuid.uuid4()),
        "status": "ISSUE_INTENT",
        "issueId": None,
        "runId": None,
        "agentId": manager["id"],
    }
    flow["managerReview"] = review
    controller.save(state, doc)
    prompt = (
        "This is a bounded synthetic Agency supervisor qualification review. Do not call tools, read files, access the network, change issues, delegate or start agents. Use only the supplied structured report. Synthetic repository analysis is not new market/customer evidence. Return exactly one JSON object with decision (one of SUPPORTED, UNSUPPORTED, NEEDS_EXTERNAL_EVIDENCE) and reason (a concise explanation). Do not accept canonical evidence or merge anything.\nREPORT:\n"
        + json.dumps(data, sort_keys=True)
    )
    issue = controller.call(
        "POST",
        f"/api/companies/{controller.company}/issues",
        {
            "title": "Agency supervisor Founder Manager review " + key,
            "description": "Explicit bounded managerial review of validated synthetic outputs; no external actions.",
            "status": "backlog",
            "assigneeAgentId": manager["id"],
            "assigneeAdapterOverrides": {
                "adapterConfig": {"promptTemplate": prompt, "timeoutSec": 120}
            },
        },
    )
    state, doc = controller.read()
    review = state["workflows"][key]["managerReview"]
    review.update(issueId=issue["id"], status="DISPATCH_INTENT")
    controller.save(state, doc)
    run = controller.call(
        "POST",
        f"/api/agents/{manager['id']}/wakeup",
        {
            "source": "on_demand",
            "triggerDetail": "manual",
            "reason": "agency_founder_review:" + key,
            "payload": {"issueId": issue["id"]},
            "idempotencyKey": review["id"],
        },
    )
    require(
        run and run.get("id"), "Manager wake uncertain; reconcile without redispatch"
    )
    state, doc = controller.read()
    review = state["workflows"][key]["managerReview"]
    review.update(runId=run["id"], status="DISPATCHED")
    controller.save(state, doc)
    return review


def parse_decision(text):
    decoder = json.JSONDecoder()
    found = {}
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(text[index:])
        except (ValueError, TypeError):
            continue
        if (
            isinstance(obj, dict)
            and obj.get("decision")
            in ["SUPPORTED", "UNSUPPORTED", "NEEDS_EXTERNAL_EVIDENCE"]
            and isinstance(obj.get("reason"), str)
            and obj["reason"].strip()
        ):
            found[json.dumps(obj, sort_keys=True)] = obj
    return next(iter(found.values())) if len(found) == 1 else None


def reconcile_review(controller, key):
    state, doc = controller.read()
    review = state["workflows"][key]["managerReview"]
    if review["status"] in ("PASS", "FAIL", "REVIEW_REQUIRED"):
        return review
    if review["status"] == "REVIEW_CLEANUP":
        controller.call(
            "PATCH",
            f"/api/issues/{review['issueId']}",
            {"status": "in_review", "assigneeAgentId": None},
        )
        review["status"] = review.pop("finalStatus")
        state["workflows"][key]["status"] = (
            "REVIEWED" if review["status"] == "PASS" else "REVIEW_REQUIRED"
        )
        controller.save(state, doc)
        return review
    if not review.get("runId"):
        runs = controller.call(
            "GET",
            f"/api/companies/{controller.company}/heartbeat-runs?agentId={review['agentId']}&limit=1000",
        )
        matches = [
            r
            for r in runs
            if (r.get("contextSnapshot") or {}).get("wakeReason")
            == "agency_founder_review:" + key
            and (r.get("contextSnapshot") or {}).get("triggeredBy") == "user"
        ]
        if len(matches) != 1:
            return review  # Ambiguous intent stays reserved; never create another issue/wake.
        review["runId"] = matches[0]["id"]
        controller.save(state, doc)
        state, doc = controller.read()
        review = state["workflows"][key]["managerReview"]
    run = controller.call("GET", f"/api/heartbeat-runs/{review['runId']}")
    if run["status"] in ("running", "queued"):
        return review
    require(
        run["companyId"] == controller.company
        and run["agentId"] == review["agentId"]
        and (run.get("contextSnapshot") or {}).get("issueId") == review["issueId"],
        "Manager run binding mismatch",
    )
    log = controller.call("GET", f"/api/heartbeat-runs/{review['runId']}/log")
    text = (run.get("summary") or "") + "\n" + json.dumps(run.get("resultJson") or {})
    content = log.get("content", "") if isinstance(log, dict) else str(log)
    chunks = []
    for line in content.splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            chunks.append(line)
            continue
        if isinstance(row, dict) and row.get("stream") == "stdout":
            chunks.append(
                str(row.get("chunk") or row.get("message") or row.get("text") or "")
            )
    text += "\n" + "\n".join(chunks)
    decision = parse_decision(text) if run["status"] == "succeeded" else None
    review.update(
        status="REVIEW_CLEANUP",
        finalStatus="PASS" if decision else "REVIEW_REQUIRED",
        decision=decision,
        nativeRunStatus=run["status"],
    )
    controller.save(state, doc)
    return reconcile_review(controller, key)
