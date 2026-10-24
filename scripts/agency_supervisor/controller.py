"""External MANUAL supervisor. Native revisioned documents are its durable journal.
No provider credentials, direct SQL, detached provider watcher, or native auth bypass.
"""

import copy, json, time, uuid, re
from .core import ACTIVE, TERMINAL, SOURCE_SHA, recommend, identity_prompt, template_id
from .validation import validate, classify_provenance


class SafetyError(RuntimeError):
    pass


class ArtifactUnavailable(RuntimeError):
    """Provider artifact cannot be retrieved now; recoverable without a new wake."""
    def __init__(self, code, status=None):
        super().__init__("provider artifact unavailable: " + str(code))
        self.code = code
        self.status = status


def require(value, reason):
    if not value:
        raise SafetyError(reason)


def find_remote(value):
    if isinstance(value, dict):
        if isinstance(value.get("julesSession"), dict):
            return value["julesSession"]
        for v in value.values():
            found = find_remote(v)
            if found:
                return found
    if isinstance(value, list):
        for v in value:
            found = find_remote(v)
            if found:
                return found
    return None


class Supervisor:
    def __init__(
        self,
        api,
        company_id,
        control_issue,
        artifact_reader=None,
        clock=time.time,
        persona_loader=None,
    ):
        self.api = api
        self.company = company_id
        self.control = control_issue
        self.artifact_reader = artifact_reader
        self.persona_loader = persona_loader
        self.clock = clock
        issue = self.call("GET", f"/api/issues/{control_issue}")
        require(
            issue["companyId"] == company_id and not issue.get("assigneeAgentId"),
            "Invalid/unisolated supervisor control issue",
        )

    def call(self, method, path, body=None):
        return self.api.request(method, path, body)

    def docpath(self, issue, key):
        return f"/api/issues/{issue}/documents/{key}"

    def read(self):
        doc = self.call("GET", self.docpath(self.control, "agency-supervisor"))
        require(
            not doc.get("updatedByAgentId") and not doc.get("createdByAgentId"),
            "Agent-mutated supervisor journal; founder review required",
        )
        state = json.loads(doc["body"])
        require(
            state["companyId"] == self.company and state["sourceSha"] == SOURCE_SHA,
            "Journal company/source drift",
        )
        return state, doc

    def save(self, state, doc):
        # CAS conflict/unknown response is propagated; callers reread instead of replaying a mutation.
        return self.call(
            "PUT",
            self.docpath(self.control, "agency-supervisor"),
            {
                "format": "markdown",
                "body": json.dumps(state, sort_keys=True),
                "baseRevisionId": doc["latestRevisionId"],
                "title": "Agency Supervisor v1 state",
            },
        )

    def initialize(self, max_active=2):
        require(1 <= max_active <= 2, "v1 concurrency is bounded to two")
        state = {
            "companyId": self.company,
            "sourceSha": SOURCE_SHA,
            "config": {"enabled": True, "mode": "MANUAL", "maxActive": max_active},
            "activations": {},
            "workflows": {},
        }
        # The native unique issue-document key makes creation single-winner. Never retry an uncertain init.
        return self.call(
            "PUT",
            self.docpath(self.control, "agency-supervisor"),
            {
                "format": "markdown",
                "body": json.dumps(state),
                "title": "Agency Supervisor v1 state",
            },
        )

    def roster(self):
        return self.call("GET", f"/api/companies/{self.company}/agents")

    def task(self, issue_id):
        issue = self.call("GET", f"/api/issues/{issue_id}")
        require(issue["companyId"] == self.company, "Foreign issue")
        doc = self.call("GET", self.docpath(issue_id, "agency-task"))
        require(
            not doc.get("updatedByAgentId") and not doc.get("createdByAgentId"),
            "Task approval must be board-controlled",
        )
        task = json.loads(doc["body"])
        task["description"] = issue.get("description") or issue["title"]
        require(
            task.get("repository")
            and task.get("branch")
            and task.get("writeScopes")
            and task.get("requiredOutputs"),
            "Explicit bounded task contract required",
        )
        return issue, task

    def status(self):
        state, _ = self.read()
        agents = self.roster()
        live = self.call("GET", f"/api/companies/{self.company}/live-runs")
        profiles = self.call("GET", "/api/jules/profiles")
        sources = self.call("GET", f"/api/companies/{self.company}/jules-sources")
        mapped = [a for a in agents if (a.get("metadata") or {}).get("agencyId")]
        ids = [a["metadata"]["agencyId"] for a in mapped]
        return {
            "companyId": self.company,
            "sourceSha": SOURCE_SHA,
            "mode": state["config"]["mode"],
            "nativeAgents": len(agents),
            "agencyIdentities": len(set(ids)),
            "duplicates": len(ids) - len(set(ids)),
            "paused": sum(a["status"] == "paused" for a in mapped),
            "activeActivations": [
                x for x in state["activations"].values() if x["status"] in ACTIVE
            ],
            "liveRuns": [x for x in live if x["status"] in ("running", "queued")],
            "sources": sources,
            "profiles": [
                {
                    k: p.get(k)
                    for k in [
                        "id",
                        "name",
                        "enabled",
                        "status",
                        "capabilities",
                        "sessionStartLimit",
                        "concurrentSessionLimit",
                    ]
                }
                for p in profiles
            ],
            "founderManager": [
                a["id"] for a in agents if template_id(a) == "founder-manager"
            ],
            "retainedFinance": [a["id"] for a in agents if template_id(a) == "finance"],
            "pendingReviews": [
                x["id"]
                for x in state["activations"].values()
                if x["status"] in ("REVIEW_REQUIRED", "FAIL")
            ],
            "pendingApprovals": self.call(
                "GET", f"/api/companies/{self.company}/approvals"
            ),
        }

    def recommend(self, issue_id):
        state, _ = self.read()
        issue, task = self.task(issue_id)
        return {
            "issueId": issue["id"],
            **recommend(self.roster(), task, state["activations"].values()),
        }

    def event(self, activation_id, action, details):
        # Activity API lacks an idempotency key. Persist intent before send; recover by read, never blind resend.
        state, doc = self.read()
        act = state["activations"][activation_id]
        events = act.setdefault("events", {})
        existing = self.call(
            "GET",
            f"/api/companies/{self.company}/activity?entityType=agency_activation&entityId={activation_id}",
        )
        if any(x["action"] == action for x in existing):
            return
        if action in events:
            raise SafetyError(
                "Ambiguous activity write; reconcile native audit before continuing"
            )
        events[action] = "INTENT"
        self.save(state, doc)
        self.call(
            "POST",
            f"/api/companies/{self.company}/activity",
            {
                "actorType": "system",
                "actorId": "agency-supervisor",
                "action": action,
                "entityType": "agency_activation",
                "entityId": activation_id,
                "details": details,
            },
        )

    def unknown_remote_work(self, state):
        runs = self.call(
            "GET", f"/api/companies/{self.company}/heartbeat-runs?limit=1000"
        )
        activity = self.call(
            "GET", f"/api/companies/{self.company}/activity?entityType=jules_session"
        )
        known = {
            x.get("remoteSessionId")
            for x in state["activations"].values()
            if x.get("remoteSessionId")
        }
        agency = {
            a["id"] for a in self.roster() if (a.get("metadata") or {}).get("agencyId")
        }
        unknown = []
        for run in runs:
            result = run.get("resultJson") or {}
            remote = result.get("julesSessionId")
            if (
                not remote
                or remote in known
                or run.get("agentId") not in agency
                or result.get("state") in ("COMPLETED", "FAILED", "CANCELLED")
            ):
                continue
            iid = (run.get("contextSnapshot") or {}).get("issueId")
            completed = [
                x
                for x in activity
                if x["action"] == "jules.session.completed_unvalidated"
                and (x.get("details") or {}).get("issueId") == iid
            ]
            if not iid or len(completed) != 1:
                unknown.append({"runId": run["id"], "remoteSessionId": remote})
        return unknown

    def activate(self, issue_id, key, task_override=None):
        state, doc = self.read()
        old = state["activations"].get(key)
        if old:
            return old  # Idempotency includes all terminal/uncertain activations.
        require(
            state["config"]["enabled"] and state["config"]["mode"] == "MANUAL",
            "Explicit MANUAL activation only",
        )
        require(
            not self.unknown_remote_work(state),
            "UNTRACKED_REMOTE_WORK_REQUIRES_RECONCILIATION",
        )
        issue, task = self.task(issue_id)
        historical = self.call("GET", f"/api/issues/{issue_id}/runs")
        require(
            not any(
                (r.get("resultJson") or {}).get("julesSessionId") for r in historical
            ),
            "EXISTING_ISSUE_PROVIDER_SESSION_REQUIRES_RECONCILIATION",
        )
        if task_override:
            task = task_override
        require(
            issue["status"] in ("todo", "blocked", "backlog")
            and not issue.get("assigneeAgentId")
            and not issue.get("assigneeUserId"),
            "Issue must be explicitly unassigned/actionable",
        )
        agents = self.roster()
        active = [x for x in state["activations"].values() if x["status"] in ACTIVE]
        require(len(active) < state["config"]["maxActive"], "CONCURRENCY_LIMIT")

        # Conservative static prefixes reject overlapping glob scopes before resume/wake.
        # Native repository leases remain the final authority against other controllers.
        def prefix(scope):
            return re.split(r"[?*\[]", scope, maxsplit=1)[0].rstrip("/")

        def overlaps(left, right):
            a, b = prefix(left), prefix(right)
            return (
                not a
                or not b
                or a == b
                or a.startswith(b + "/")
                or b.startswith(a + "/")
            )

        require(
            not any(
                x["task"]["repository"].lower() == task["repository"].lower()
                and x["task"]["branch"] == task["branch"]
                and any(
                    overlaps(a, b)
                    for a in x["task"]["writeScopes"]
                    for b in task["writeScopes"]
                )
                for x in active
            ),
            "WRITE_SCOPE_COLLISION",
        )
        require(
            not any(x["issueId"] == issue_id for x in active), "ISSUE_ALREADY_ACTIVATED"
        )
        result = recommend(agents, task, active)
        require(
            result["selected"] and not result["blockedBy"],
            "SELECTION_OR_POLICY_BLOCKED:" + ",".join(result["blockedBy"]),
        )
        agent = next(a for a in agents if a["id"] == result["recommendedAgentId"])
        require(
            agent["status"] == "paused",
            "Only an explicitly paused specialist may be leased",
        )
        live = self.call("GET", f"/api/companies/{self.company}/live-runs")
        require(
            not any(
                x["status"] in ("running", "queued")
                and (x.get("agentId") == agent["id"] or x.get("issueId") == issue_id)
                for x in live
            ),
            "LIVE_RUN_EXISTS",
        )
        require(
            not self.call("GET", f"/api/issues/{issue_id}/active-run"),
            "ISSUE_ACTIVE_RUN",
        )
        # Completed/active remote bindings are not reused across unrelated issue/activation identities.
        previous = [
            x
            for x in state["activations"].values()
            if x["agentId"] == agent["id"] and x["status"] in ACTIVE
        ]
        require(not previous, "REMOTE_OR_ACTIVATION_EXISTS")
        persona = (
            self.persona_loader(agent)
            if self.persona_loader and (agent.get("metadata") or {}).get("agencyId")
            else (agent.get("adapterConfig") or {}).get("promptTemplate")
        )
        if not persona and template_id(agent) == "finance":
            persona = "You are the retained FounderOS Finance Lead. Perform only the explicitly assigned financial analysis; do not initiate payments or account changes."
        require(
            persona,
            "Canonical Agency persona prompt required; no misleading FounderOS outcome",
        )
        act = {
            "id": key,
            "companyId": self.company,
            "agentId": agent["id"],
            "agencyId": (agent.get("metadata") or {}).get("agencyId")
            or "founderos:finance",
            "issueId": issue_id,
            "status": "PREPARING",
            "startedAt": self.clock(),
            "expiresAt": self.clock() + task.get("leaseSeconds", 1800),
            "runId": None,
            "remoteSessionId": None,
            "task": task,
            "recommendation": result,
            "originalOverrides": issue.get("assigneeAdapterOverrides"),
            "events": {},
        }
        state["activations"][key] = act
        self.save(state, doc)
        self.event(
            key,
            "supervisor.recommendation_created",
            {"issueId": issue_id, "selected": result["selected"]},
        )
        overrides = copy.deepcopy(issue.get("assigneeAdapterOverrides") or {})
        config = overrides.setdefault("adapterConfig", {})
        config.update(
            {
                "outcomeTemplate": "",
                "sessionSpec": None,
                "promptTemplate": identity_prompt(persona, issue, task),
                "writeScopes": task["writeScopes"],
                "maxWaitSec": 30,
                "pollIntervalSec": 5,
            }
        )
        self.call(
            "PATCH",
            f"/api/issues/{issue_id}",
            {
                "assigneeAgentId": agent["id"],
                "status": "todo",
                "assigneeAdapterOverrides": overrides,
            },
        )
        require(
            not self.call("GET", f"/api/issues/{issue_id}/active-run"),
            "Unexpected automatic run; no explicit wake sent",
        )
        try:
            require(
                self.call("POST", f"/api/agents/{agent['id']}/resume", {})["status"]
                == "idle",
                "Resume uncertain",
            )
            state, doc = self.read()
            state["activations"][key]["status"] = "DISPATCH_INTENT"
            self.save(state, doc)
            run = self.call(
                "POST",
                f"/api/agents/{agent['id']}/wakeup",
                {
                    "source": "on_demand",
                    "triggerDetail": "manual",
                    "reason": "agency_supervisor:" + key,
                    "idempotencyKey": key,
                    "payload": {"issueId": issue_id, "agencyActivationId": key},
                },
            )
            require(run and run.get("id"), "Wake response uncertain")
            state, doc = self.read()
            act = state["activations"][key]
            act.update(runId=run["id"], status="DISPATCHED")
            self.save(state, doc)
            self.event(
                key,
                "supervisor.activation_started",
                {"runId": run["id"], "issueId": issue_id, "agentId": agent["id"]},
            )
            return act
        except Exception:
            # The durable DISPATCH_INTENT stays reserved. No retry/start is authorized by this failure.
            self.call("POST", f"/api/agents/{agent['id']}/pause", {})
            raise

    def reconcile(self, key):
        state, doc = self.read()
        act = state["activations"][key]
        if act["status"] in TERMINAL:
            return act
        if act["status"] == "STOPPING" and act.get("finalStatus"):
            return self.finish(key, act["finalStatus"])
        if not act.get("runId"):
            # Recover an accepted-but-lost wake by its persisted idempotency key in native context.
            runs = self.call(
                "GET",
                f'/api/companies/{self.company}/heartbeat-runs?agentId={act["agentId"]}&limit=1000',
            )
            matching = [
                r
                for r in runs
                if r.get("agentId") == act["agentId"]
                and (r.get("contextSnapshot") or {}).get("issueId") == act["issueId"]
                and (r.get("contextSnapshot") or {}).get("triggeredBy") == "user"
                and (r.get("contextSnapshot") or {}).get("wakeReason")
                == "agency_supervisor:" + key
            ]
            if len(matching) == 1:
                act["runId"] = matching[0]["id"]
                act["status"] = "DISPATCHED"
                self.save(state, doc)
                state, doc = self.read()
                act = state["activations"][key]
            else:
                act["status"] = "AMBIGUOUS"
                self.save(state, doc)
                return act
        run = self.call("GET", f'/api/heartbeat-runs/{act["runId"]}')
        require(
            run["companyId"] == self.company and run["agentId"] == act["agentId"],
            "Foreign native run binding",
        )
        events = self.call("GET", f'/api/heartbeat-runs/{act["runId"]}/events')
        remote = find_remote(events)
        result = run.get("resultJson") or {}
        if remote:
            require(
                not act.get("remoteSessionId")
                or act["remoteSessionId"] == remote["id"],
                "Remote identity changed",
            )
            act.update(
                remoteSessionId=remote["id"],
                profileId=remote.get("profileId"),
                companySourceId=remote.get("companySourceId"),
                source=remote.get("source"),
                startingBranch=remote.get("startingBranch"),
            )
        elif result.get("julesSessionId"):
            act["remoteSessionId"] = result["julesSessionId"]
        if remote:
            sources = self.call("GET", f"/api/companies/{self.company}/jules-sources")
            require(
                any(
                    x["id"] == remote.get("companySourceId")
                    and x["repository"] == act["task"]["repository"]
                    and x["startingBranch"] == act["task"]["branch"]
                    for x in sources
                ),
                "Remote company source binding mismatch",
            )
        act["nativeRunStatus"] = run["status"]
        act["remoteState"] = result.get("state")
        self.save(state, doc)
        if act.get("remoteSessionId"):
            self.event(
                key,
                "supervisor.provider_bound",
                {
                    "runId": act["runId"],
                    "remoteSessionId": act["remoteSessionId"],
                    "profileId": act.get("profileId"),
                },
            )
        state, doc = self.read()
        act = state["activations"][key]
        activity = self.call(
            "GET", f"/api/companies/{self.company}/activity?entityType=jules_session"
        )
        completed = [
            x
            for x in activity
            if x["action"] == "jules.session.completed_unvalidated"
            and (x.get("details") or {}).get("issueId") == act["issueId"]
        ]
        failed = [
            x
            for x in activity
            if x["action"] in ("jules.session.failed", "jules.session.orphaned")
            and (x.get("details") or {}).get("issueId") == act["issueId"]
            and (
                not (x.get("details") or {}).get("remoteSessionId")
                or x["details"]["remoteSessionId"] == act.get("remoteSessionId")
            )
        ]
        if failed:
            return self.finish(
                key,
                "FAIL",
                {
                    "verdict": "FAIL",
                    "findings": ["REMOTE_TERMINAL_FAILURE"],
                    "accepted": False,
                },
            )
        if completed and act.get("stopRequested"):
            return self.finish(key, "STOPPED")
        if completed:
            current_agent = next(a for a in self.roster() if a["id"] == act["agentId"])
            if current_agent["status"] != "paused":
                require(
                    self.call("POST", f'/api/agents/{act["agentId"]}/pause', {})[
                        "status"
                    ]
                    == "paused",
                    "Terminal specialist pause failed",
                )
            # Only the current activation's PR is allowed: artifact reader proves actual run/agent/issue headers.
            require(
                len(completed) == 1, "Multiple completion candidates require review"
            )
            act["completionActivity"] = completed[0]["id"]
            act["pullRequestUrl"] = completed[0]["details"].get("pullRequestUrl")
            act["remoteState"] = "COMPLETED"
            act["status"] = "VALIDATING"
            self.save(state, doc)
            self.event(
                key,
                "supervisor.remote_completed",
                {
                    "remoteSessionId": act["remoteSessionId"],
                    "pullRequestUrl": act["pullRequestUrl"],
                },
            )
            if not self.artifact_reader:
                return self.finish(
                    key,
                    "REVIEW_REQUIRED",
                    {
                        "verdict": "REVIEW_REQUIRED",
                        "findings": ["ARTIFACT_READER_UNAVAILABLE"],
                        "accepted": False,
                    },
                )
            try:
                product = self.artifact_reader(act)
            except ArtifactUnavailable as miss:
                return self.finish(
                    key,
                    "REVIEW_REQUIRED",
                    {
                        "verdict": "REVIEW_REQUIRED",
                        "findings": ["ARTIFACT_RETRIEVAL_RECOVERABLE:" + str(miss.code)],
                        "accepted": False,
                        "recoverable": True,
                        "classification": "API_REGISTRATION_ONLY",
                    },
                )
            except Exception:
                return self.finish(
                    key,
                    "REVIEW_REQUIRED",
                    {
                        "verdict": "REVIEW_REQUIRED",
                        "findings": ["ARTIFACT_READER_FAILED"],
                        "accepted": False,
                    },
                )
            verdict = validate(product, act, act["task"])
            state, doc = self.read()
            act = state["activations"][key]
            if any("SECRET_LEAKAGE" in f for f in verdict["findings"]):
                product = {
                    **product,
                    "bodies": {k: "[REDACTED]" for k in product.get("bodies", {})},
                }
            classification = classify_provenance(product, verdict)
            verdict = {**verdict, "classification": classification}
            act.update(
                validation=verdict,
                product=product,
                status="VALIDATING",
                lifecycle={
                    "executionSucceeded": True,
                    "artifactRetrieved": bool(product.get("artifactRetrieved", True)),
                    "artifactValidated": verdict["verdict"] != "FAIL",
                    "workProductRegistered": False,
                    "accepted": False,
                    "classification": classification,
                },
            )
            self.save(state, doc)
            self.register_product(key)
            state, doc = self.read()
            act = state["activations"][key]
            act["lifecycle"] = {**(act.get("lifecycle") or {}), "workProductRegistered": True}
            self.save(state, doc)
            return self.finish(key, verdict["verdict"])
        if run["status"] in ("failed", "cancelled") and not act.get("remoteSessionId"):
            return self.finish(
                key,
                "FAIL",
                {
                    "verdict": "FAIL",
                    "findings": [run.get("errorCode") or "NATIVE_RUN_FAILED"],
                    "accepted": False,
                },
            )
        if self.clock() > act["expiresAt"]:
            state, doc = self.read()
            act = state["activations"][key]
            act["status"] = "EXPIRED"
            self.save(state, doc)
            self.call("POST", f'/api/agents/{act["agentId"]}/pause', {})
            self.event(
                key,
                "supervisor.review_required",
                {"reason": "Lease expired; remote work remains reserved, no new wake"},
            )
            return act
        state, doc = self.read()
        act = state["activations"][key]
        if act["status"] != "STOPPING":
            act["status"] = (
                "REMOTE_ACTIVE" if act.get("remoteSessionId") else "DISPATCHED"
            )
        self.save(state, doc)
        return act

    def register_product(self, key):
        state, doc = self.read()
        act = state["activations"][key]
        product = act["product"]
        existing = self.call("GET", f'/api/issues/{act["issueId"]}/work-products')
        matches = [
            x
            for x in existing
            if (x.get("metadata") or {}).get("activationId") == key
            or (
                x.get("createdByRunId") == act["runId"]
                and x.get("url") == act["pullRequestUrl"]
            )
        ]
        if matches:
            require(len(matches) == 1, "Duplicate work products")
            row = matches[0]
            meta = row.get("metadata") or {}
            require(
                not meta.get("accepted") and row.get("reviewState") != "approved",
                "Board review already exists; do not override it",
            )
            merged = {
                **meta,
                "activationId": key,
                "paperclipRunId": act["runId"],
                "remoteSessionId": act["remoteSessionId"],
                "repository": act["task"]["repository"],
                "pullRequestHeadSha": product["headSha"],
                "artifactPaths": product["paths"],
                "completionCandidate": True,
                "accepted": False,
                "validation": act["validation"],
            }
            if meta != merged:
                row = self.call(
                    "PATCH", f"/api/work-products/{row['id']}", {"metadata": merged}
                )
            return row
        require(
            not any(x.get("url") == act["pullRequestUrl"] for x in existing),
            "Artifact already belongs to another run",
        )
        require(
            not act.get("workProductIntent"),
            "Uncertain work-product write; reconcile before retry",
        )
        act["workProductIntent"] = True
        self.save(state, doc)
        row = self.call(
            "POST",
            f'/api/issues/{act["issueId"]}/work-products',
            {
                "type": "pull_request",
                "provider": "github",
                "externalId": act["pullRequestUrl"],
                "title": "Agency completion candidate",
                "url": act["pullRequestUrl"],
                "status": "ready_for_review",
                "reviewState": "needs_board_review",
                "isPrimary": False,
                "createdByRunId": act["runId"],
                "metadata": {
                    "provider": "jules",
                    "activationId": key,
                    "paperclipRunId": act["runId"],
                    "remoteSessionId": act["remoteSessionId"],
                    "repository": act["task"]["repository"],
                    "pullRequestHeadSha": product["headSha"],
                    "artifactPaths": product["paths"],
                    "completionCandidate": True,
                    "accepted": False,
                    "validation": act["validation"],
                },
            },
        )
        return row

    def finish(self, key, status, validation=None):
        state, doc = self.read()
        act = state["activations"][key]
        if validation:
            act["validation"] = validation
        # Persist cleanup intent before native changes. Repeating idempotent pause/update is safe; never repeat wake.
        act["status"] = "STOPPING"
        act["finalStatus"] = status
        self.save(state, doc)
        self.call(
            "PATCH",
            f'/api/issues/{act["issueId"]}',
            {
                "status": (
                    "in_review" if status in ("PASS", "REVIEW_REQUIRED") else "blocked"
                ),
                "assigneeAgentId": None,
            },
        )
        require(
            self.call("POST", f'/api/agents/{act["agentId"]}/pause', {})["status"]
            == "paused",
            "Re-pause failed",
        )
        state, doc = self.read()
        act = state["activations"][key]
        act.update(status=status, paused=True, finishedAt=self.clock())
        self.save(state, doc)
        action = {
            "PASS": "supervisor.validation_passed",
            "FAIL": "supervisor.validation_failed",
            "REVIEW_REQUIRED": "supervisor.review_required",
            "STOPPED": "supervisor.activation_stopped",
        }[status]
        self.event(
            key, action, {"validation": act.get("validation"), "accepted": False}
        )
        return act

    def stop(self, key):
        state, doc = self.read()
        act = state["activations"][key]
        if act["status"] in TERMINAL:
            return act
        act["status"] = "STOPPING"
        act["stopRequested"] = True
        self.save(state, doc)
        require(
            self.call("POST", f'/api/agents/{act["agentId"]}/pause', {})["status"]
            == "paused",
            "Pause failed",
        )
        # Pausing is not cancellation of a remote Jules session: keep the reservation until reconciliation proves terminal.
        self.event(
            key,
            "supervisor.activation_stopped",
            {
                "remoteSessionId": act.get("remoteSessionId"),
                "remoteCancellationConfirmed": False,
            },
        )
        return act

    def workflow_create(self, key, definition, issue_ids):
        require(
            definition.get("sourceSha") == SOURCE_SHA
            and len(definition["steps"]) == len(issue_ids),
            "Pinned canonical workflow/step count required",
        )
        state, doc = self.read()
        if key in state["workflows"]:
            return state["workflows"][key]
        for step, iid in zip(definition["steps"], issue_ids):
            _, task = self.task(iid)
            require(
                task.get("agencyId") == step["agent_id"],
                "Workflow role must match canonical step",
            )
        flow = {
            "id": key,
            "definition": definition,
            "issues": issue_ids,
            "activations": {},
            "status": "READY",
        }
        state["workflows"][key] = flow
        self.save(state, doc)
        return flow

    def workflow_advance(self, key):
        state, doc = self.read()
        flow = state["workflows"][key]
        previous = []
        for step, iid in zip(flow["definition"]["steps"], flow["issues"]):
            aid = flow["activations"].get(step["id"])
            if aid and aid in state["activations"]:
                act = state["activations"][aid]
                if act["status"] != "PASS":
                    return {
                        "status": "WAITING" if act["status"] in ACTIVE else "BLOCKED",
                        "activation": act,
                    }
                previous.append(act)
                continue
            _, task = self.task(iid)
            task["upstreamValidatedOutputs"] = [
                {
                    "activationId": a["id"],
                    "headSha": a["product"]["headSha"],
                    "bodies": a["product"]["bodies"],
                }
                for a in previous
            ]
            aid = aid or str(uuid.uuid5(uuid.NAMESPACE_URL, key + "/" + step["id"]))
            flow["activations"][step["id"]] = aid
            self.save(state, doc)
            return self.activate(iid, aid, task)
        flow["status"] = "AWAITING_FOUNDER_REVIEW"
        self.save(state, doc)
        return flow
