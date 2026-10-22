#!/usr/bin/env python3
import copy, importlib.util, json, pathlib, sys, unittest, uuid
from agency_supervisor.core import recommend, identity_prompt, SOURCE_SHA, describe_task
from agency_supervisor.controller import Supervisor, SafetyError
from agency_supervisor.validation import validate

FIXTURE = (
    pathlib.Path(__file__).parent / "agency_supervisor" / "selection-fixtures.json"
)


class Native:
    def __init__(self):
        self.agents = json.loads(FIXTURE.read_text())["agents"]
        self.issues = {
            "control": {
                "id": "control",
                "companyId": "c",
                "status": "backlog",
                "assigneeAgentId": None,
            }
        }
        self.docs = {}
        self.runs = {}
        self.activity = []
        self.products = {}
        self.wakes = 0
        self.calls = []
        self.uncertain_wake = False
        self.uncertain_product = False
        self.rev = 0

    def add_task(self, iid="issue", role="problem-explorer"):
        self.issues[iid] = {
            "id": iid,
            "companyId": "c",
            "title": "Synthetic qualification",
            "description": "Historical failed run 225b7f24-cab0-4d23-b22a-220f40940168",
            "status": "backlog",
            "assigneeAgentId": None,
        }
        task = {
            "agencyId": role,
            "repository": "owner/repo",
            "branch": "main",
            "writeScopes": ["qualification/**"],
            "requiredOutputs": ["qualification/result.md"],
            "qualification": "synthetic",
            "provenanceRequired": True,
        }
        self.docs[iid, "agency-task"] = {
            "body": json.dumps(task),
            "latestRevisionId": "initial",
        }

    def request(self, method, path, body=None):
        self.calls.append((method, path))
        route, _, query = path.partition("?")
        parts = route.split("/")
        if (
            route.endswith("/documents/agency-supervisor")
            or "/documents/agency-task" in route
        ):
            key = (parts[3], parts[5])
            current = self.docs.get(key)
            if method == "GET":
                return copy.deepcopy(current)
            if current and body.get("baseRevisionId") != current["latestRevisionId"]:
                raise SafetyError("CAS conflict")
            if not current and body.get("baseRevisionId"):
                raise SafetyError("CAS conflict")
            self.rev += 1
            current = {**copy.deepcopy(body), "latestRevisionId": str(uuid.uuid4())}
            self.docs[key] = current
            return copy.deepcopy(current)
        if parts[2] == "issues":
            iid = parts[3]
            if len(parts) == 4:
                if method == "PATCH":
                    self.issues[iid].update(copy.deepcopy(body))
                return copy.deepcopy(self.issues[iid])
            if parts[4] == "active-run":
                return next(
                    (
                        r
                        for r in self.runs.values()
                        if r["contextSnapshot"]["issueId"] == iid
                        and r["status"] == "running"
                    ),
                    None,
                )
            if parts[4] == "runs":
                return copy.deepcopy(
                    [
                        r
                        for r in self.runs.values()
                        if r["contextSnapshot"]["issueId"] == iid
                    ]
                )
            if parts[4] == "work-products":
                if method == "GET":
                    return copy.deepcopy(self.products.get(iid, []))
                row = {"id": str(uuid.uuid4()), **copy.deepcopy(body)}
                self.products.setdefault(iid, []).append(row)
                if self.uncertain_product:
                    raise SafetyError("uncertain product")
                return row
        if parts[2] == "companies":
            if parts[4] == "issues" and method == "POST":
                iid = str(uuid.uuid4())
                row = {"id": iid, "companyId": "c", **copy.deepcopy(body)}
                self.issues[iid] = row
                return copy.deepcopy(row)
            if parts[4] == "agents":
                return copy.deepcopy(self.agents)
            if parts[4] == "live-runs":
                return copy.deepcopy(
                    [r for r in self.runs.values() if r["status"] == "running"]
                )
            if parts[4] == "heartbeat-runs":
                return copy.deepcopy(list(self.runs.values()))
            if parts[4] == "approvals":
                return []
            if parts[4] == "jules-sources":
                return [
                    {
                        "id": "source",
                        "repository": "owner/repo",
                        "startingBranch": "main",
                        "enabled": True,
                    }
                ]
            if parts[4] == "activity":
                if method == "POST":
                    self.activity.append(copy.deepcopy(body))
                    return body
                rows = self.activity
                import urllib.parse

                qs = urllib.parse.parse_qs(query)
                for key in ["entityType", "entityId"]:
                    if key in qs:
                        rows = [r for r in rows if r.get(key) == qs[key][0]]
                return copy.deepcopy(rows)
        if parts[2] == "jules":
            return []
        if parts[2] == "agents":
            agent = next(a for a in self.agents if a["id"] == parts[3])
            op = parts[4]
            if op in ("pause", "resume"):
                agent["status"] = "paused" if op == "pause" else "idle"
                return copy.deepcopy(agent)
            if op == "wakeup":
                self.wakes += 1
                rid = str(uuid.uuid4())
                self.runs[rid] = {
                    "id": rid,
                    "companyId": "c",
                    "agentId": agent["id"],
                    "status": "succeeded",
                    "contextSnapshot": {
                        **body["payload"],
                        "triggeredBy": "user",
                        "wakeReason": body["reason"],
                        "idempotencyKey": body["idempotencyKey"],
                    },
                    "resultJson": {
                        "julesSessionId": "remote-" + str(self.wakes),
                        "state": "IN_PROGRESS",
                    },
                }
                if self.uncertain_wake:
                    raise SafetyError("uncertain wake")
                return copy.deepcopy(self.runs[rid])
        if parts[2] == "heartbeat-runs":
            run = self.runs[parts[3]]
            if len(parts) == 4:
                return copy.deepcopy(run)
            if parts[4] == "log":
                return {
                    "content": json.dumps(
                        {"stream": "stdout", "chunk": run.get("summary", "")}
                    )
                }
            if parts[4] == "events":
                return [
                    {
                        "payload": {
                            "context": {
                                "julesSession": {
                                    "id": run["resultJson"]["julesSessionId"],
                                    "profileId": "profile",
                                    "companySourceId": "source",
                                    "source": "sources/owner/repo",
                                    "startingBranch": "main",
                                }
                            }
                        }
                    }
                ]
        raise AssertionError((method, path))

    def complete(self, act):
        self.activity.append(
            {
                "id": "complete-" + act["id"],
                "action": "jules.session.completed_unvalidated",
                "entityType": "jules_session",
                "details": {
                    "issueId": act["issueId"],
                    "pullRequestUrl": "https://github.com/owner/repo/pull/1",
                },
            }
        )


def artifact(act):
    return {
        "companyId": "c",
        "issueId": act["issueId"],
        "agentId": act["agentId"],
        "runId": act["runId"],
        "remoteSessionId": act["remoteSessionId"],
        "repository": "owner/repo",
        "branch": "main",
        "pullRequestUrl": act["pullRequestUrl"],
        "headSha": "a" * 40,
        "paths": ["qualification/result.md"],
        "bodies": {
            "qualification/result.md": f"paperclip_run_id: {act['runId']}\npaperclip_issue_id: {act['issueId']}\npaperclip_agent_id: {act['agentId']}\nqualification: synthetic\nDocumented assumption; not market evidence."
        },
    }


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.native = Native()
        self.native.add_task()
        self.ctl = Supervisor(self.native, "c", "control", artifact)
        self.ctl.initialize(1)

    def test_reused_role_uses_pinned_persona_before_reservation(self):
        selected = next(
            a
            for a in self.native.agents
            if a["metadata"]["agencyId"] == "problem-explorer"
        )
        selected["adapterConfig"].pop("promptTemplate", None)
        with self.assertRaises(SafetyError):
            self.ctl.activate("issue", "missing-persona")
        self.assertEqual(self.ctl.read()[0]["activations"], {})
        ctl = Supervisor(
            self.native,
            "c",
            "control",
            artifact,
            persona_loader=lambda a: "PINNED CANONICAL PERSONA",
        )
        act = ctl.activate("issue", "with-persona")
        prompt = self.native.issues["issue"]["assigneeAdapterOverrides"][
            "adapterConfig"
        ]["promptTemplate"]
        self.assertIn("PINNED CANONICAL PERSONA", prompt)
        self.assertEqual(self.native.wakes, 1)

    def test_initialize_cannot_reset_journal(self):
        with self.assertRaises(SafetyError):
            self.ctl.initialize(2)
        self.assertEqual(self.ctl.read()[0]["config"]["maxActive"], 1)

    def test_write_collision_blocks_before_resume_or_second_wake(self):
        state, doc = self.ctl.read()
        state["config"]["maxActive"] = 2
        self.ctl.save(state, doc)
        self.ctl.activate("issue", "first")
        self.ctl.reconcile("first")
        self.native.add_task("second", "evidence-auditor")
        before = len(self.native.calls)
        with self.assertRaisesRegex(SafetyError, "WRITE_SCOPE_COLLISION"):
            self.ctl.activate("second", "second")
        self.assertTrue(
            all(method == "GET" for method, _ in self.native.calls[before:])
        )
        self.assertEqual(self.native.wakes, 1)

    def test_read_only_recommendation_and_status(self):
        start = len(self.native.calls)
        result = self.ctl.recommend("issue")
        status = self.ctl.status()
        self.assertEqual(result["selected"]["agencyId"], "problem-explorer")
        self.assertEqual(status["agencyIdentities"], 45)
        self.assertEqual(status["nativeAgents"], 48)
        self.assertTrue(
            all(method == "GET" for method, path in self.native.calls[start:])
        )

    def test_async_completion_restart_idempotency_and_repause(self):
        first = self.ctl.activate("issue", "key")
        self.assertEqual(self.native.wakes, 1)
        active = self.ctl.reconcile("key")
        self.assertEqual(active["status"], "REMOTE_ACTIVE")
        self.assertEqual(self.ctl.activate("issue", "key")["runId"], first["runId"])
        self.native.complete(active)
        restarted = Supervisor(self.native, "c", "control", artifact)
        done = restarted.reconcile("key")
        self.assertEqual(done["status"], "PASS")
        self.assertTrue(done["paused"])
        restarted.reconcile("key")
        self.assertEqual(len(self.native.products["issue"]), 1)
        self.assertEqual(self.native.wakes, 1)
        self.assertFalse(done["validation"]["accepted"])
        self.assertEqual(self.native.issues["issue"]["status"], "in_review")

    def test_ambiguous_wake_reads_native_run_without_second_dispatch(self):
        self.native.uncertain_wake = True
        with self.assertRaises(SafetyError):
            self.ctl.activate("issue", "key")
        self.native.uncertain_wake = False
        recovered = self.ctl.reconcile("key")
        self.assertTrue(recovered["runId"])
        self.assertEqual(self.native.wakes, 1)

    def test_concurrency_no_fanout_and_expiry_holds_capacity(self):
        self.ctl.activate("issue", "key")
        self.ctl.reconcile("key")
        self.native.add_task("second", "evidence-auditor")
        with self.assertRaisesRegex(SafetyError, "CONCURRENCY"):
            self.ctl.activate("second", "second")
        future = Supervisor(self.native, "c", "control", artifact, clock=lambda: 10**12)
        self.assertEqual(future.reconcile("key")["status"], "EXPIRED")
        with self.assertRaisesRegex(SafetyError, "CONCURRENCY"):
            future.activate("second", "second")

    def test_engineering_and_external_approval_before_any_resume_or_wake(self):
        self.native.issues["issue"][
            "description"
        ] = "Implement production backend database authentication API"
        count = len(self.native.calls)
        with self.assertRaisesRegex(SafetyError, "FOUNDER_ENGINEERING_DEPENDENCY"):
            self.ctl.activate("issue", "key")
        self.assertTrue(
            all(method == "GET" for method, path in self.native.calls[count:])
        )
        self.assertEqual(
            recommend(
                self.native.agents,
                {"description": "send outreach to contact customers"},
            )["blockedBy"],
            ["EXTERNAL_ACTION_APPROVAL_REQUIRED"],
        )

    def test_stop_never_releases_unknown_remote_or_rewakes(self):
        self.ctl.activate("issue", "key")
        self.ctl.reconcile("key")
        stopped = self.ctl.stop("key")
        self.assertEqual(stopped["status"], "STOPPING")
        self.assertEqual(self.native.wakes, 1)
        self.ctl.reconcile("key")
        self.assertEqual(self.ctl.read()[0]["activations"]["key"]["status"], "STOPPING")

    def test_wrong_company_and_agent_modified_document_are_rejected(self):
        with self.assertRaises(SafetyError):
            Supervisor(self.native, "foreign", "control")
        self.native.docs["control", "agency-supervisor"][
            "updatedByAgentId"
        ] = "malicious-agent"
        with self.assertRaises(SafetyError):
            self.ctl.status()

    def test_selection_capabilities_skills_budget_status_and_finance(self):
        a = next(
            a
            for a in self.native.agents
            if a["metadata"].get("agencyId") == "problem-explorer"
        )
        a["status"] = "running"
        self.assertIsNone(
            recommend(self.native.agents, {"agencyId": "problem-explorer"})["selected"]
        )
        self.assertIsNone(
            recommend(
                self.native.agents,
                {
                    "agencyId": "evidence-auditor",
                    "requiredCapabilities": ["not-configured"],
                },
            )["selected"]
        )
        finance = recommend(
            self.native.agents,
            {"description": "BPW financial model and unit economics"},
        )
        self.assertEqual(finance["selected"]["agencyId"], "founderos:finance")
        self.assertFalse(
            recommend(
                self.native.agents,
                {
                    "description": "frontend-only fake-door landing page",
                    "agencyId": "landing-page-builder",
                },
            )["blockedBy"]
        )

    def test_ten_canonical_recommendations(self):
        data = json.loads(FIXTURE.read_text())
        for row in data["cases"]:
            result = recommend(self.native.agents, describe_task(row["task"]))
            self.assertIsNotNone(result["selected"], row["task"])
            self.assertEqual(result["selected"]["agencyId"], row["agencyId"])

    def test_pr14_correlation_rejected_and_current_provenance_passes(self):
        act = self.ctl.activate("issue", "key")
        act = self.ctl.reconcile("key")
        act["pullRequestUrl"] = "https://github.com/owner/repo/pull/1"
        good = artifact(act)
        self.assertEqual(validate(good, act, act["task"])["verdict"], "PASS")
        bad = copy.deepcopy(good)
        bad["bodies"]["qualification/result.md"] = bad["bodies"][
            "qualification/result.md"
        ].replace(act["runId"], "225b7f24-cab0-4d23-b22a-220f40940168")
        self.assertEqual(validate(bad, act, act["task"])["verdict"], "FAIL")
        prompt = identity_prompt("persona", self.native.issues["issue"], act["task"])
        self.assertIn("CURRENT_PAPERCLIP_RUN_ID = {{runId}}", prompt)
        self.assertIn("HISTORICAL_RUN_IDS = 225b7f24", prompt)

    def test_output_scope_missing_secret_quality_gates_and_branch_fail_closed(self):
        act = self.ctl.activate("issue", "key")
        act = self.ctl.reconcile("key")
        act["pullRequestUrl"] = "https://github.com/owner/repo/pull/1"
        product = artifact(act)
        for change in [
            {"paths": ["outside/code.ts"]},
            {"bodies": {"qualification/result.md": "-----BEGIN PRIVATE KEY-----"}},
            {"remoteSessionId": "foreign"},
        ]:
            self.assertEqual(
                validate({**product, **change}, act, act["task"])["verdict"], "FAIL"
            )
        self.assertEqual(
            validate({**product, "branch": None}, act, act["task"])["verdict"],
            "REVIEW_REQUIRED",
        )
        self.assertEqual(
            validate(product, act, {**act["task"], "qualityGates": ["test"]})[
                "verdict"
            ],
            "REVIEW_REQUIRED",
        )

    def test_artifact_reader_failure_still_repauses_and_requires_review(self):
        self.ctl.activate("issue", "key")
        active = self.ctl.reconcile("key")
        self.native.complete(active)

        def fail(_):
            raise RuntimeError("Unavailable")

        recovered = Supervisor(self.native, "c", "control", fail).reconcile("key")
        self.assertEqual(recovered["status"], "REVIEW_REQUIRED")
        self.assertTrue(recovered["paused"])

    def test_unknown_work_product_response_recovers_without_duplicate(self):
        self.ctl.activate("issue", "key")
        active = self.ctl.reconcile("key")
        self.native.complete(active)
        self.native.uncertain_product = True
        with self.assertRaises(SafetyError):
            self.ctl.reconcile("key")
        self.native.uncertain_product = False
        done = Supervisor(self.native, "c", "control", artifact).reconcile("key")
        self.assertEqual(done["status"], "PASS")
        self.assertEqual(len(self.native.products["issue"]), 1)
        self.assertEqual(self.native.wakes, 1)

    def test_remote_failure_and_policy_pause_do_not_trigger_retries(self):
        self.ctl.activate("issue", "key")
        active = self.ctl.reconcile("key")
        self.native.activity.append(
            {
                "id": "failure",
                "action": "jules.session.failed",
                "entityType": "jules_session",
                "details": {
                    "issueId": "issue",
                    "remoteSessionId": active["remoteSessionId"],
                },
            }
        )
        self.assertEqual(self.ctl.reconcile("key")["status"], "FAIL")
        self.assertEqual(self.native.wakes, 1)
        other = next(
            a
            for a in self.native.agents
            if a["metadata"].get("agencyId") == "evidence-auditor"
        )
        other["pauseReason"] = "budget_hard_stop"
        self.assertIsNone(
            recommend(self.native.agents, {"agencyId": "evidence-auditor"})["selected"]
        )

    def test_founder_review_is_structured_and_not_a_prompt_echo(self):
        from agency_supervisor.manager import parse_decision, start_review

        self.assertIsNone(
            parse_decision('Example: {"decision":"<choose>","reason":"<explain>"}')
        )
        self.assertEqual(
            parse_decision(
                '{"decision":"NEEDS_EXTERNAL_EVIDENCE","reason":"Synthetic only"}'
            )["decision"],
            "NEEDS_EXTERNAL_EVIDENCE",
        )
        self.assertIsNone(
            parse_decision(
                '{"decision":"SUPPORTED","reason":"a"} {"decision":"UNSUPPORTED","reason":"b"}'
            )
        )
        definition = {
            "sourceSha": SOURCE_SHA,
            "id": "fixture-only",
            "steps": [{"id": "first", "agent_id": "problem-explorer"}],
        }
        self.ctl.workflow_create("flow", definition, ["issue"])
        with self.assertRaisesRegex(SafetyError, "Upstream"):
            start_review(self.ctl, "flow")

    def test_manager_ambiguous_wake_recovers_once_and_reviews_validated_packet(self):
        from agency_supervisor.manager import start_review, reconcile_review

        definition = {
            "sourceSha": SOURCE_SHA,
            "id": "fixture-only",
            "steps": [{"id": "first", "agent_id": "problem-explorer"}],
        }
        self.ctl.workflow_create("flow", definition, ["issue"])
        act = self.ctl.workflow_advance("flow")
        self.native.complete(act)
        self.assertEqual(self.ctl.reconcile(act["id"])["status"], "PASS")
        self.ctl.workflow_advance("flow")
        self.native.uncertain_wake = True
        with self.assertRaises(SafetyError):
            start_review(self.ctl, "flow")
        self.assertEqual(self.native.wakes, 2)
        review = self.ctl.read()[0]["workflows"]["flow"]["managerReview"]
        run = next(
            r for r in self.native.runs.values() if r["agentId"] == review["agentId"]
        )
        run["summary"] = (
            '{"decision":"NEEDS_EXTERNAL_EVIDENCE","reason":"Synthetic only"}'
        )
        result = reconcile_review(
            Supervisor(self.native, "c", "control", artifact), "flow"
        )
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["decision"]["decision"], "NEEDS_EXTERNAL_EVIDENCE")
        self.assertEqual(start_review(self.ctl, "flow"), result)
        self.assertEqual(self.native.wakes, 2)
        self.assertIsNone(self.native.issues[result["issueId"]]["assigneeAgentId"])

    def test_document_compare_and_swap_rejects_second_owner(self):
        state, doc = self.ctl.read()
        stale = copy.deepcopy(doc)
        self.ctl.save(state, doc)
        with self.assertRaisesRegex(SafetyError, "CAS"):
            self.ctl.save(state, stale)

    def test_workflow_dependency_gate_and_restart(self):
        self.native.add_task("second", "evidence-auditor")
        definition = {
            "sourceSha": SOURCE_SHA,
            "id": "fixture-only",
            "steps": [
                {"id": "first", "agent_id": "problem-explorer", "depends_on": []},
                {
                    "id": "second",
                    "agent_id": "evidence-auditor",
                    "depends_on": ["first"],
                },
            ],
        }
        self.ctl.workflow_create("flow", definition, ["issue", "second"])
        first = self.ctl.workflow_advance("flow")
        self.assertEqual(self.native.wakes, 1)
        self.assertEqual(self.ctl.workflow_advance("flow")["status"], "WAITING")
        active = self.ctl.reconcile(first["id"])
        self.native.complete(active)
        self.ctl.reconcile(first["id"])
        restarted = Supervisor(self.native, "c", "control", artifact)
        second = restarted.workflow_advance("flow")
        self.assertEqual(second["agencyId"], "evidence-auditor")
        self.assertEqual(self.native.wakes, 2)
        self.assertTrue(second["task"]["upstreamValidatedOutputs"])


if __name__ == "__main__":
    unittest.main()
