"""Retrieve genuine provider artifacts through Paperclip's authenticated native API.

The supervisor CLI holds NO provider credential and NEVER executes repository code.
Retrieval goes to the deployment-side artifact reader (authorized GITHUB_TOKEN server
side) and is kept separate from validation/acceptance: a miss is a typed, recoverable
failure that never authorizes a new remote session.
"""

from .controller import require, ArtifactUnavailable


def read_product(activation, api):
    company = activation["companyId"]
    run_id = activation.get("runId")
    require(bool(run_id), "provider artifact lookup requires a native run id")
    result = api.request(
        "POST",
        f"/api/companies/{company}/supervisor/artifact/read",
        {"paperclipRunId": run_id},
    )
    require(
        isinstance(result, dict) and "artifactRetrieved" in result,
        "provider artifact response malformed",
    )
    if not result.get("artifactRetrieved"):
        raise ArtifactUnavailable(
            result.get("code") or "ARTIFACT_UNAVAILABLE", status=result.get("status")
        )
    product = result.get("product")
    require(isinstance(product, dict), "provider artifact product malformed")
    require(product.get("headSha"), "retrieved artifact missing immutable head sha")
    return {
        **product,
        "artifactRetrieved": True,
        "contentHash": result.get("contentHash"),
    }
