"""Fail-closed artifact validation; provider completion is never acceptance."""

import fnmatch, re


def validate(product, activation, task):
    findings = []
    review = []
    expected = {
        "companyId": activation["companyId"],
        "issueId": activation["issueId"],
        "agentId": activation["agentId"],
        "runId": activation.get("runId"),
        "remoteSessionId": activation.get("remoteSessionId"),
    }
    for k, v in expected.items():
        if not v or product.get(k) != v:
            findings.append("BINDING_MISMATCH:" + k)
    for k in ["repository", "branch"]:
        if k == "branch" and product.get(k) is None:
            review.append("PR_TARGET_BRANCH_UNVERIFIED")
        elif product.get(k) != task.get(k):
            findings.append("SOURCE_MISMATCH:" + k)
    if task.get("requirePR", True) and not product.get("pullRequestUrl"):
        findings.append("PR_MISSING")
    if not re.fullmatch("[0-9a-f]{40}", product.get("headSha", "")):
        review.append("IMMUTABLE_HEAD_MISSING")
    if product.get("binaryOrSymlink"):
        findings.append("BINARY_OR_SYMLINK_OUTPUT")
    paths = product.get("paths", [])
    scopes = task.get("writeScopes", [])
    if not paths:
        findings.append("OUTPUTS_MISSING")
    for path in paths:
        if (
            path.startswith("/")
            or ".." in path.split("/")
            or not any(fnmatch.fnmatchcase(path, s) for s in scopes)
        ):
            findings.append("WRITE_SCOPE:" + path)
        if re.search(
            r"(^|/)(\.env(?:\.|$)|\.ssh/|credentials|id_rsa)|\.(pem|key)$", path, re.I
        ):
            findings.append("FORBIDDEN_FILE:" + path)
    for required in task.get("requiredOutputs", []):
        if required not in paths:
            findings.append("REQUIRED_OUTPUT:" + required)
    bodies = product.get("bodies", {})
    for path in paths:
        body = bodies.get(path)
        if not isinstance(body, str):
            review.append("CONTENT_UNAVAILABLE:" + path)
            continue
        if re.search(
            r"-----BEGIN .*PRIVATE KEY-----|\b(?:ghp_[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{25,})",
            body,
        ):
            findings.append("SECRET_LEAKAGE:" + path)
        declarations = {}
        for key, value in re.findall(
            r"^\s*(paperclip_run_id|paperclip_issue_id|paperclip_agent_id|jules_session_id|Run ID)\s*:\s*([^\s\n]+)",
            body,
            re.M | re.I,
        ):
            declarations.setdefault(key.lower(), []).append(value)
        keys = {
            "paperclip_run_id": "runId",
            "run id": "runId",
            "paperclip_issue_id": "issueId",
            "paperclip_agent_id": "agentId",
            "jules_session_id": "remoteSessionId",
        }
        for key, values in declarations.items():
            if any(v != expected[keys[key]] for v in values):
                findings.append("ARTIFACT_CORRELATION:" + key)
        if task.get("provenanceRequired", False):
            for key in ["paperclip_run_id", "paperclip_issue_id", "paperclip_agent_id"]:
                if key not in declarations:
                    findings.append("PROVENANCE_MISSING:" + key)
            if task.get("qualification") == "synthetic" and not re.search(
                r"^qualification:\s*synthetic\s*$", body, re.M | re.I
            ):
                findings.append("SYNTHETIC_LABEL_MISSING")
    for gate in task.get("qualityGates", []):
        if product.get("qualityGates", {}).get(gate) is not True:
            review.append("QUALITY_GATE_UNVERIFIED:" + gate)
    if task.get("externalActions"):
        review.append("EXTERNAL_ACTION_APPROVAL_REQUIRED")
    if product.get("externalActionsObserved"):
        findings.append("UNAUTHORIZED_EXTERNAL_ACTION")
    return {
        "verdict": "FAIL" if findings else "REVIEW_REQUIRED" if review else "PASS",
        "findings": findings + review,
        "accepted": False,
        "headSha": product.get("headSha"),
    }
