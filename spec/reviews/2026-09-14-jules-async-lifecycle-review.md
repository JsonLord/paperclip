# Durable Asynchronous Jules Lifecycle Review

Date: 2026-09-14

Scope: `adaptations_spec.md` sections 3 and the lifecycle/reconciliation portions of sections 2, 4, and 5.

## Executive result

Paperclip now persists a Jules dispatch as a first-class execution mapping and reconciles that mapping independently of the heartbeat process. A completed heartbeat means only that Paperclip created or reattached to remote execution. It does not mean that the native Issue outcome was accepted.

The durable row binds the Jules remote ID to the native Paperclip Company, Agent, Goal, Project, Issue/outcome, heartbeat run, fleet profile, and company source. Recreating the lifecycle service after a process restart reads and updates the same mapping; attaching the same run again returns the existing row, while a conflicting remote or organizational binding is rejected.

## Files and services

- `server/src/services/jules-sessions.ts` owns idempotent attachment, state normalization, activity ingestion, output metadata, terminal capacity events, and lifecycle hooks.
- `server/src/services/jules-reconciler.ts` owns startup, periodic, and event-triggered reconciliation and resolves profile credentials through Paperclip's secret provider.
- `server/src/services/heartbeat.ts` delegates durable attachment to the lifecycle service and no longer treats adapter completion as business completion.
- `server/src/index.ts` starts reconciliation during every server startup.
- `packages/db/src/schema/jules.ts` and migration `0041_wise_blacklash.sql` add native organizational bindings, reconciliation metadata, PR metadata, and idempotent activity storage.
- `packages/shared/src/types/jules.ts` defines the complete lifecycle state union.
- `server/src/__tests__/jules-sessions.test.ts` exercises restart, state transitions, duplicate attachment/reconciliation, activity idempotency, PR recovery, and orphan detection.

## State machine behavior

The persisted model supports:

```text
DISPATCHING
QUEUED
PLANNING
AWAITING_PLAN_APPROVAL
AWAITING_USER_FEEDBACK
IN_PROGRESS
PAUSED
FAILED
COMPLETED_UNVALIDATED
VALIDATING
AWAITING_MANAGER_JUDGMENT
REVISION_REQUESTED
ACCEPTED
ESCALATED
ORPHANED
```

Remote `COMPLETED` maps only to `COMPLETED_UNVALIDATED`. No lifecycle path implemented in this slice writes `ACCEPTED`. Plan-approval and user-feedback states remain durable blocked/waiting states and are not automatically advanced. Failed sessions retain `FAILED`. A 404, missing session, or unknown remote state is marked `ORPHANED` rather than causing replacement dispatch.

Only remote-pollable states are selected by the reconciler. Validation/judgment states exist as explicit extension states but are intentionally left for the next slices.

## Restart and reconciliation behavior

On startup, Paperclip immediately loads every remote-pollable Jules row and queries Jules. It repeats on a configurable fallback interval (`JULES_RECONCILE_INTERVAL_MS`, default 30 seconds). Dispatch completion also requests an immediate reconciliation pass.

Each pass:

1. loads the persisted native binding;
2. resolves the selected profile credential without logging or storing its value in session metadata;
3. fetches the remote session and all activity pages;
4. inserts activities using a `(session_id, activity_id)` uniqueness boundary;
5. records the latest activity ID, remote update time, and PR URL/title/description;
6. conditionally advances state so duplicate passes do not repeat transition hooks or capacity events; and
7. invokes narrow completion, approval, feedback, failure, orphan, and capacity-release extension hooks.

Terminal discovery records a unique capacity event. Actual repository write-lease release is exposed through `onCapacityReleased`; persisted lease infrastructure belongs to the capacity/write-lease slice and is not falsely claimed here.

## Native Paperclip authority

No parallel FounderOS Goal, Project, task, or Agent objects were introduced. The Jules row supplements native execution and stores foreign keys to existing Paperclip objects. GitHub/Firm remains business and evidence memory; the Paperclip database contains only organizational and runtime control-plane state.

## Verification

The focused lifecycle tests demonstrate:

- `QUEUED → PLANNING → IN_PROGRESS → COMPLETED_UNVALIDATED`;
- restart during `IN_PROGRESS` with no duplicate attachment;
- preservation of Company/Agent/Goal/Project/Issue IDs;
- a PR first observed after restart;
- durable `AWAITING_PLAN_APPROVAL`, `AWAITING_USER_FEEDBACK`, and `FAILED` states;
- repeated reconciliation without duplicated activity or hooks; and
- missing remote session detection as `ORPHANED`.

## Specification status

- `adaptations_spec.md` §3.1 session lifecycle service: **PARTIAL**. Durable attachment, refresh, recovery, activity/output persistence, and hooks are implemented. Validation, manager judgment, same-session revision, and persisted write leases remain separate work.
- §3.2 state model: **COMPLETE for schema/types and lifecycle normalization**; later services still need to drive validation/judgment states.
- §3.3 reconciliation worker: **COMPLETE for startup, periodic, event-triggered remote reconciliation**.
- §2.3 output persistence: **COMPLETE for Jules session metadata**. Promotion into all native work-product views can be expanded in callback/output promotion work.
- §2.4 plan approval: **PARTIAL**. The blocked state is durable and a hook exists; native Approval creation and authorized `approvePlan` dispatch remain.
- §4 capacity broker and §5 write leases: **PARTIAL interface only**. Terminal hooks and idempotent capacity events exist; the DB-backed broker and lease table are not part of this slice.

## Known limitations

- Jules does not expose a create-session idempotency key in the implemented API contract. Paperclip persists the returned ID synchronously in the adapter metadata callback before dispatch returns, but an infrastructure failure in the narrow interval between Jules accepting creation and returning the ID cannot be recovered without source/session discovery heuristics.
- Plan approvals and user feedback are detected but not yet promoted into native Approval/Inbox workflows.
- Deterministic validation and Hermes judgment are extension hooks only.
- Write leases are not yet persisted or released because their schema/broker is the following capacity slice.

## Recommended next slice

Implement the DB-backed Jules Capacity Broker and repository write leases together. It should select profiles from live quota/concurrency state, resolve `secretRef`, acquire non-overlapping repository scopes before dispatch, release leases through the lifecycle's terminal hook, and wake queued work immediately when capacity is released. After that, implement scoped callback authentication and native callback promotion before deterministic validation/Hermes judgment.
