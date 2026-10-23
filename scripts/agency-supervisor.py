#!/usr/bin/env python3
"""MANUAL external Agency Supervisor through authenticated native Paperclip APIs."""
import argparse, importlib.util, json, os, pathlib, sys
from agency_supervisor.controller import Supervisor, SafetyError
from agency_supervisor.api import AdminTokenApi
from agency_supervisor.artifacts import read_product
from agency_supervisor.core import SOURCE_SHA
from agency_supervisor.manager import start_review, reconcile_review, packet

spec = importlib.util.spec_from_file_location(
    "native", pathlib.Path(__file__).with_name("agency-workforce-api-reconcile.py")
)
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "command",
        choices=[
            "init",
            "status",
            "recommend",
            "activate",
            "reconcile",
            "stop",
            "activations",
            "workflow-create",
            "workflow-advance",
            "founder-packet",
            "founder-review",
            "founder-reconcile",
        ],
    )
    p.add_argument(
        "--base-url",
        default=os.getenv(
            "PAPERCLIP_BASE_URL", "https://leon4gr45-paperclip-founder.hf.space"
        ),
    )
    p.add_argument("--auth", choices=["password", "admin-token"], default="password")
    p.add_argument("--company", default="AUX")
    p.add_argument("--control-issue", required=True)
    p.add_argument("--issue")
    p.add_argument("--key")
    p.add_argument("--apply", action="store_true")
    p.add_argument("--max-active", type=int, default=2)
    p.add_argument("--catalog")
    p.add_argument("--workflow")
    p.add_argument("--issues")
    p.add_argument("--cache", default="/workspace/.cache/agency-supervisor")
    args = p.parse_args()
    api = (
        AdminTokenApi(args.base_url)
        if args.auth == "admin-token"
        else native.Api(args.base_url)
    )
    companies = api.request("GET", "/api/companies")
    matches = [
        c
        for c in companies
        if c.get("status") != "archived"
        and args.company.lower()
        in {str(c.get(k, "")).lower() for k in ["id", "name", "issuePrefix"]}
    ]
    native.require(len(matches) == 1, "Unique company required")
    cid = matches[0]["id"]
    catalog_definitions = (
        {d["id"]: d for d in native.load_catalog(args.catalog, SOURCE_SHA)}
        if args.catalog
        else {}
    )

    def persona_loader(agent):
        agency_id = (agent.get("metadata") or {}).get("agencyId")
        native.require(
            agency_id in catalog_definitions,
            "Pinned canonical persona required for reused role",
        )
        return native.prompt(catalog_definitions[agency_id])

    controller = Supervisor(
        api,
        cid,
        args.control_issue,
        lambda a: read_product(a, args.cache),
        persona_loader=persona_loader if args.catalog else None,
    )
    if args.command in [
        "init",
        "activate",
        "reconcile",
        "stop",
        "workflow-create",
        "workflow-advance",
        "founder-review",
        "founder-reconcile",
    ]:
        native.require(args.apply, "Mutating command requires explicit --apply")
    if args.command == "init":
        result = controller.initialize(args.max_active)
    elif args.command == "status":
        result = controller.status()
    elif args.command == "recommend":
        native.require(args.issue, "--issue required")
        result = controller.recommend(args.issue)
    elif args.command == "activate":
        native.require(args.issue and args.key, "--issue and stable --key required")
        result = controller.activate(args.issue, args.key)
    elif args.command == "reconcile":
        native.require(args.key, "--key required")
        result = controller.reconcile(args.key)
    elif args.command == "stop":
        native.require(args.key, "--key required")
        result = controller.stop(args.key)
    elif args.command == "activations":
        result = list(controller.read()[0]["activations"].values())
    elif args.command == "workflow-create":
        import subprocess

        native.require(
            args.catalog and args.workflow and args.issues and args.key,
            "Pinned catalog repo, workflow, issues and stable key required",
        )
        definitions = json.loads(
            subprocess.check_output(
                [
                    "git",
                    "-C",
                    args.catalog,
                    "show",
                    SOURCE_SHA + ":catalog/workflows.json",
                ]
            )
        )
        definition = next(d for d in definitions if d["id"] == args.workflow)
        definition["sourceSha"] = SOURCE_SHA
        result = controller.workflow_create(
            args.key, definition, args.issues.split(",")
        )
    elif args.command in ("founder-packet", "founder-review", "founder-reconcile"):
        native.require(args.key, "--key required")
        result = {
            "founder-packet": packet,
            "founder-review": start_review,
            "founder-reconcile": reconcile_review,
        }[args.command](controller, args.key)
    else:
        native.require(args.key, "--key required")
        result = controller.workflow_advance(args.key)
    # Outputs contain IDs, reasons and redacted/validated artifacts only. Never sessions/passwords/provider secrets.
    print(json.dumps(native.redact(result), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (SafetyError, native.Stop) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
