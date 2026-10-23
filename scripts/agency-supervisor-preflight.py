#!/usr/bin/env python3
"""Read-only live readiness gate. Authentication is the only POST; no agent wake."""
import argparse
import importlib.util
import json
import pathlib
import os
import re
from agency_supervisor.api import AdminTokenApi
from agency_supervisor.controller import SafetyError, Supervisor
from agency_supervisor.core import ACTIVE
import urllib.request

from agency_supervisor.core import SOURCE_SHA, ROUTES, describe_task, recommend

spec = importlib.util.spec_from_file_location(
    "native", pathlib.Path(__file__).with_name("agency-workforce-api-reconcile.py")
)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def public_json(url):
    headers = {"User-Agent": "Paperclip-Agency-Supervisor"}
    if (
        url == "https://huggingface.co/api/spaces/Leon4gr45/Paperclip-Founder"
        and os.getenv("HF_TOKEN")
    ):
        headers["Authorization"] = "Bearer " + os.environ["HF_TOKEN"]
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url", default="https://leon4gr45-paperclip-founder.hf.space"
    )
    parser.add_argument(
        "--catalog", required=True, help="Local pinned agency-agents Git repository"
    )
    parser.add_argument(
        "--auth", choices=["password", "admin-token"], default="password"
    )
    parser.add_argument(
        "--expect-hf-sha", required=True, help="Reviewed deployed full SHA"
    )
    parser.add_argument(
        "--control-issue",
        required=True,
        help="Board-controlled durable supervisor journal",
    )
    args = parser.parse_args()
    native.require(
        bool(re.fullmatch(r"[0-9a-f]{40}", args.expect_hf_sha)),
        "Reviewed full HF SHA required",
    )
    # Verify public, immutable prerequisites before attempting authenticated access.
    space = public_json("https://huggingface.co/api/spaces/Leon4gr45/Paperclip-Founder")
    native.require(
        space["sha"] == args.expect_hf_sha
        and space.get("runtime", {}).get("sha") == args.expect_hf_sha,
        "STOP: live HF revision drift",
    )
    native.require(
        space.get("runtime", {}).get("stage") == "RUNNING",
        "STOP: Space is not stably RUNNING",
    )
    pr = public_json("https://api.github.com/repos/JsonLord/aux-company/pulls/14")
    native.require(
        pr["head"]["sha"] == "c10730d8b610c048d792f8b604a6ac6baa570ccb",
        "STOP: PR14 regression fixture changed",
    )
    native.load_catalog(args.catalog, SOURCE_SHA)
    api = (
        AdminTokenApi(args.base_url)
        if args.auth == "admin-token"
        else native.Api(args.base_url)
    )
    companies = api.request("GET", "/api/companies")
    matches = [
        c
        for c in companies
        if c.get("issuePrefix") == "AUX" and c.get("status") != "archived"
    ]
    native.require(len(matches) == 1, "STOP: unique AUX company required")
    company = matches[0]["id"]
    agents = api.request("GET", f"/api/companies/{company}/agents")
    mapped = [a for a in agents if (a.get("metadata") or {}).get("agencyId")]
    native.require(
        len(agents) == 48
        and len(mapped) == 45
        and len({a["metadata"]["agencyId"] for a in mapped}) == 45,
        "STOP: roster drift",
    )
    native.require(
        all(a["metadata"].get("agencySourceCommit") == SOURCE_SHA for a in mapped),
        "STOP: canonical source drift",
    )
    new = [
        a for a in mapped if not (a.get("metadata") or {}).get("founderosTemplateId")
    ]
    native.require(
        len(new) == 37 and all(a["status"] == "paused" for a in new),
        "STOP: 37 new specialists must remain paused",
    )
    live = api.request("GET", f"/api/companies/{company}/live-runs")
    native.require(
        not any(r["status"] in ("running", "queued") for r in live),
        "STOP: active native work",
    )
    controller = Supervisor(api, company, args.control_issue)
    state, _ = controller.read()
    native.require(
        not any(a["status"] in ACTIVE for a in state["activations"].values())
        and not controller.unknown_remote_work(state),
        "STOP: active, ambiguous or untracked remote work requires reconciliation",
    )
    sources = api.request("GET", f"/api/companies/{company}/jules-sources")
    native.require(
        any(
            s.get("enabled")
            and s["repository"] == "JsonLord/aux-company"
            and s["startingBranch"] == "main"
            for s in sources
        ),
        "STOP: AUX Jules source unavailable",
    )
    selections = []
    for text, (expected, _) in ROUTES.items():
        result = recommend(agents, describe_task(text))
        native.require(
            result["selected"] and result["selected"]["agencyId"] == expected,
            "STOP: canonical routing regression: " + text,
        )
        selections.append(
            {
                "task": text,
                "selected": expected,
                "reasons": result["selected"]["reasons"],
            }
        )
    print(
        json.dumps(
            {
                "status": "PASS_INTEGRATION",
                "companyId": company,
                "sourceSha": SOURCE_SHA,
                "nativeAgents": 48,
                "canonicalIds": 45,
                "newPaused": 37,
                "selections": selections,
                "liveQualification": "NOT_RUN",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except (native.Stop, SafetyError, OSError, ValueError, KeyError) as exc:
        print(str(exc))
        raise SystemExit(1)
