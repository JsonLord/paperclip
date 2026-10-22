# Agency Supervisor v1 architecture

Start: `559a18cd76e42b0242446c2f7464a57f5aa9c967`, isolated branch
`codex/agency-supervisor-v1`. Live source remains `0eba2bb`; no deployment,
roster import, PR #14 modification, or provider requalification is part of startup.

## Existing execution path inspected before changes

| Transition | Existing owner |
| --- | --- |
| Issue assignment and wake-on-update | `server/src/routes/issues.ts`, issue update route and `issueService` |
| Explicit authenticated wake | `server/src/routes/agents.ts`, POST `/agents/:id/wakeup` |
| Durable native run, issue checkout, execution context | `server/src/services/heartbeat.ts`, `heartbeatService`, `wakeup`, run execution and assignment context |
| Company credential, source, quota and write lease | `server/src/services/jules-capacity-broker.ts`, `admit`, `resolveJulesExecutionRequirements` |
| Persona/sessionSpec and remote creation or continuation | `packages/adapters/jules/src/server/execute.ts`, `execute`; `server/api.ts`, `JulesApiClient` |
| Native dispatch binding and initial result | heartbeat `onAdapterMeta`, `attachDispatchedSession`, adapter result persistence |
| Durable provider reconciliation after heartbeat exits | `server/src/services/jules-reconciler.ts`, `createJulesReconciler`, `reconcileNow`; `jules-sessions.ts`, `reconcile` |
| Remote activities and completion candidate | `julesSessionService.storeActivities`, transition hooks, `COMPLETED_UNVALIDATED` |
| PR detection | adapter `extractPullRequest`; same extraction in durable session reconciliation |
| Initial work product | heartbeat's inline PR insertion into `issueWorkProducts` |
| Issue review / acceptance | native issue and work-product APIs; remote completion alone never authorizes acceptance |

PR #14 reproduced two gaps: ambiguous historical IDs in the rendered persona,
and a PR arriving after the initial heartbeat never reaching the inline insertion.
The native lifecycle is extended in place; a second provider watcher is not added.

## Implementation boundaries

1. Explicit current execution identity is prepended and appended to native Jules
   prompts. UUID references in task history are classified, not removed. An artifact
   provenance validator rejects the exact old/new run mismatch of PR #14.
2. Native durable reconciliation registers late PR candidates using existing work
   products and issues, under database locks. Registration is retried for already
   completed candidates after restart and does not mark them accepted.
3. A deterministic supervisor/controller uses the existing authenticated HTTPS
   APIs, not direct database or provider credentials. Its MANUAL default separates
   read-only recommendation from explicit activation. Native endpoints remain the
   authorization boundary. Operator CLI commands provide status/recommend/activate/
   reconcile/stop/workflow operations without deploying new server endpoints.
4. Supervisor state is a revisioned native issue document on an explicitly selected
   company control issue. Compare-and-swap revisions serialize reservation and
   dispatch intent across processes. Unknown mutation outcomes are reconciled,
   never blindly reissued. Native durable provider reconciliation remains the only
   provider watcher; the controller observes native run/events/completion activity.
5. A pinned catalog workflow is persisted with its source definition. Downstream
   activations require validated upstream products. Finance Lead remains an
   explicit legacy financial route. Backend engineering and external side effects
   fail closed; a persona's declared authority is not an external approval.
6. Live operation uses per-issue prompt overrides to carry the same authoritative
   identity contract through the stable native template renderer. This permits
   bounded live qualification without deploying the native application patch.

## Operational gates

No live mutation before full local tests/typecheck/build pass. No change to Docker,
entrypoint, lockfile, migrations, auth, provider configuration or HF variables.
Maximum two specialists in the live chain, one new Jules session each, sequential.
Each activation persists intent before wake and re-pauses its agent on terminal
completion/failure. Expired/ambiguous remote work keeps its capacity reservation;
time alone cannot authorize a new session. Synthetic artifacts never become
canonical Nodepad evidence. Historical PR #14 remains untouched.

## Implemented modules and recovery contract

`scripts/agency_supervisor/core.py` owns deterministic policy and selection;
`controller.py` owns revision-CAS reservations and native run reconciliation;
`validation.py` checks provenance, immutable source, scope and required outputs;
`artifacts.py` reads immutable Git objects and real PR metadata without executing
repository code; `manager.py` implements one explicit bounded Hermes review.
`scripts/agency-supervisor.py` is the operator interface and
`scripts/agency-supervisor-preflight.py` is the read-only live gate. Commands and
exact qualification task configuration are in the live handoff document.

An activation stores its reservation before assignment/resume, then stores
DISPATCH_INTENT before the one wake. A lost response is recovered from native
company/agent/issue context and the exact stable wake reason. The supplied
idempotency key is not treated as proof that the native API deduplicates wakes.
If no unique matching run exists, ambiguity holds the reservation. Scope-prefix
collisions are rejected before resume; the native broker still arbitrates against
other controllers. Budget and policy pauses cannot be resumed by selection.

Terminal provider completion causes pause before artifact fetch. Validation
FAIL/REVIEW_REQUIRED cannot advance a workflow. A product create intent is saved
before POST; a lost response is recovered by native product lookup, never another
POST. Cleanup intent survives a crash. Founder review likewise persists its issue
and dispatch intents, reads back uncertain wakes, and persists review-cleanup intent
before unassigning the review issue. Unknown issue creation stays held for review.

The native completion service uses existing session/issue row locks and one DB
transaction for product, review transition, audit and registration marker. The
session reconciler merges remote-state JSON in SQL so a stale poll cannot erase
that marker. Already-completed unregistered rows remain reconciliation candidates.
Real PostgreSQL tests prove concurrent registration and document-CAS single-winner
behavior. The existing native watcher remains the only provider watcher.

## Limits and deployed compatibility

The native failed/orphaned activity hooks in this branch are transition-based;
a crash between transition persistence and a hook can omit that activity. Such an
activation expires into a paused, capacity-held review state; it never authorizes
a replacement remote start. A later outbox would improve delivery durability.
The stable deployed source does not have these new native hooks or late-product
registration. During the bounded live pass, the external controller can register
existing native completion candidates through the same authenticated product API.

MANUAL mode requires explicit reconcile invocations; it is not a background
supervisor daemon. A stopped controller cannot promise immediate re-pause while
offline. Use a maintained operator polling session for live qualification and
verify native state before any further activation. Pausing a native agent is not
remote cancellation. Terminal sessions are never automatically replaced, even
when failed or completed without an artifact; a separately reviewed native task
session reset is required for a future retry. None of this accepts evidence or
weakens the typed Nodepad contract in its separately verified lineage.
