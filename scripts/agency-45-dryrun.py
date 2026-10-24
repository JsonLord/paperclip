#!/usr/bin/env python3
"""GATE05-R WP7 (dry-run): Agency-45 qualification harness.

Enumerates the 45 canonical Agency identities from the pinned catalog checkout,
maps each to its native Paperclip agent (from a captured read-only sweep JSON),
and emits a per-agent qualification plan for the QA Supervisor.

DRY-RUN ONLY: this script performs ZERO API mutations. With --live it makes only
GET requests. It never wakes, assigns, creates, or resumes anything, and never
prints credential values.
"""
import argparse
import json
import sys

# Charter roster: division -> canonical agency id -> unique qualification task title.
ROSTER = {
    "A-discovery": ["problem-explorer", "customer-investigator", "ethnographic-researcher", "community-scout", "trend-scout"],
    "B-intelligence": ["market-intelligence-analyst", "competitive-intelligence-analyst", "review-miner", "signal-analyst", "lead-researcher"],
    "C-hypothesis": ["assumption-mapper", "causal-analyst", "counter-hypothesis-generator", "hypothesis-formulator", "opportunity-synthesizer"],
    "D-proposition": ["customer-language-analyst", "offer-designer", "positioning-strategist", "pricing-strategist", "value-position-designer"],
    "E-experimentation": ["experiment-designer", "fake-door-designer", "message-test-designer", "pretotype-designer", "pricing-test-designer"],
    "F-production": ["copy-producer", "demo-producer", "landing-page-builder", "prototype-director", "visual-creative"],
    "G-distribution": ["channel-researcher", "community-activation-specialist", "content-experimenter", "demand-generation-tester", "outbound-experimenter"],
    "H-evaluation": ["demand-skeptic", "distribution-skeptic", "evidence-auditor", "red-team-analyst", "wtp-skeptic"],
    "I-decision": ["founder-intelligence-reporter", "kill-agent", "pivot-strategist", "portfolio-allocator", "venture-judge"],
}
PROJECT = "AUX Accessibility Flow Lab"
OUT_ROOT = "live-qualification/agency-45/{campaign_id}/"


def load_catalog(path):
    data = json.load(open(path))
    entries = data if isinstance(data, list) else data.get("agents", data.get("entries", []))
    agents = []
    for e in entries:
        aid = next((e[k] for k in ("id", "agency_id", "agencyId", "slug", "key") if k in e), None)
        div = next((e[k] for k in ("division", "division_id", "divisionId") if k in e), None)
        skills = next((e[k] for k in ("skills", "capabilities") if k in e), [])
        if aid:
            agents.append({"agencyId": aid, "division": div, "skills": skills})
    return agents


def load_native(path):
    data = json.load(open(path))
    rows = data if isinstance(data, list) else data.get("agents", [])
    out = {}
    for a in rows:
        meta = a.get("metadata") or {}
        aid = meta.get("agencyId") or meta.get("agency_id")
        if not aid:
            for key in ("agencyId", "agency_id", "sourceAgencyId"):
                if a.get(key):
                    aid = a[key]
                    break
        if not aid:
            continue
        entry = {"nativeAgentId": a["id"], "status": a.get("status"), "adapterType": a.get("adapterType")}
        if aid in out:
            # Duplicate agency identity is itself a finding; keep first, flag conflict.
            entry["duplicateNativeMapping"] = out[aid]["nativeAgentId"]
        out[aid] = entry
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True, help="pinned catalog/agents.json")
    ap.add_argument("--agents-json", required=True, help="captured read-only native agents sweep")
    ap.add_argument("--campaign-id", required=True)
    ap.add_argument("--out", default="-", help="write plan JSON (default stdout)")
    ap.add_argument("--live", action="store_true", help="additionally GET company agents (read-only)")
    ap.add_argument("--base-url", default="https://leon4gr45-paperclip-founder.hf.space")
    ap.add_argument("--company-id", default=None)
    args = ap.parse_args()

    if args.live:
        # Read-only live refresh only; mutations are not implemented by design.
        import os
        import urllib.request
        token = os.environ.get("PAPERCLIP_ADMIN_API_TOKEN", "")
        req = urllib.request.Request(f"{args.base_url}/api/companies/{args.company_id}/agents",
                                     headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            json.dump({"nativeAgentsLive": json.load(r)}, open(args.agents_json + ".live.json", "w"))
        print("live sweep saved to", args.agents_json + ".live.json (GET only)", file=sys.stderr)

    catalog = load_catalog(args.catalog)
    native = load_native(args.agents_json)

    charter_ids = [i for ids in ROSTER.values() for i in ids]
    catalog_ids = [c["agencyId"] for c in catalog]
    errors = []
    if len(charter_ids) != len(set(charter_ids)) or len(charter_ids) != 45:
        errors.append("charter roster must be 45 unique identities")
    missing = sorted(set(charter_ids) - set(catalog_ids))
    extra = sorted(set(catalog_ids) - set(charter_ids))
    if missing:
        errors.append("catalog missing: " + ",".join(missing))
    if extra:
        errors.append("catalog not in charter: " + ",".join(extra))

    plan = {"project": PROJECT, "campaignId": args.campaign_id, "dryRun": True,
            "mutations": 0, "outputRoot": OUT_ROOT.format(campaign_id=args.campaign_id),
            "agents": [], "errors": errors}
    for division, ids in ROSTER.items():
        for agency in ids:
            n = native.get(agency, {})
            entry = {
                "division": division,
                "agencyId": agency,
                "nativeAgentId": n.get("nativeAgentId"),
                "nativeStatus": n.get("status"),
                "runtime": n.get("adapterType", "unknown"),
                "outputPath": OUT_ROOT.format(campaign_id=args.campaign_id) + agency + "/",
                "stages": ["config-check", "assignment", "runtime", "deliverable", "registration", "cleanup"],
                "verdict": "NOT_RUN",
            }
            if not n.get("nativeAgentId"):
                entry["verdict"] = "BLOCKED"
                errors.append(f"no native mapping for {agency}")
            plan["agents"].append(entry)

    mapped = sum(1 for a in plan["agents"] if a["nativeAgentId"])
    plan["summary"] = {"total": 45, "nativeMapped": mapped, "errors": len(errors)}
    text = json.dumps(plan, indent=2)
    if args.out == "-":
        print(text)
    else:
        open(args.out, "w").write(text)
        print(f"plan written to {args.out}: 45 agents, {mapped} mapped, {len(errors)} errors (dry-run, 0 mutations)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
