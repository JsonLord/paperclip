"""Read-only verification of archived admission denials after ephemeral DB restore.

A caller must fetch the immutable backup commit and read its actual Git blobs.
This receipt never changes an activation or authorizes a redispatch. New work
still requires explicit board review and the normal controller admission gates.
"""

import re
from .controller import require


def archived_admission_denial(
    activation, runs, sessions, capacity, backup_sha, archive_company_id
):
    require(
        bool(re.fullmatch(r"[0-9a-f]{40}", backup_sha)), "Immutable backup SHA required"
    )
    require(
        activation.get("status") == "FAIL"
        and activation.get("nativeRunStatus") == "failed"
        and not activation.get("remoteSessionId")
        and activation.get("validation", {}).get("verdict") == "FAIL"
        and activation.get("validation", {}).get("findings") == ["jules_auth_required"],
        "Only a terminal pre-allocation authentication denial is recoverable",
    )
    require(
        archive_company_id == activation.get("companyId") and archive_company_id,
        "Archive company mismatch",
    )
    matches = [run for run in runs if run.get("id") == activation.get("runId")]
    require(
        len(matches) == 1 and activation.get("runId"),
        "Exactly one archived run required",
    )
    run = matches[0]
    context = run.get("context_snapshot") or {}
    require(
        run.get("status") == "failed"
        and run.get("error_code") == "jules_auth_required"
        and context.get("issueId") == activation.get("issueId")
        and context.get("wakeReason") == "agency_supervisor:" + activation["id"],
        "Archived admission identity or failure mismatch",
    )
    require(
        not any(s.get("issue_id") == activation["issueId"] for s in sessions),
        "Existing issue provider session requires reconciliation",
    )
    require(
        not any(c.get("session_id") for c in capacity),
        "Archived capacity allocation requires reconciliation",
    )
    return {
        "status": "VERIFIED_ARCHIVED_PRE_ALLOCATION_DENIAL",
        "backupSha": backup_sha,
        "activationId": activation["id"],
        "runId": run["id"],
        "historicalVerdict": "FAIL",
        "remoteAllocated": False,
        "redispatchAuthorized": False,
    }
