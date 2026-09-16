# Jules Capacity Broker and Repository Lease Review

Date: 2026-09-14

Scope: `adaptations_spec.md` sections 4 and 5, plus the capacity/credential/dispatch parts of sections 2 and 3.

## Executive result

Ordinary Paperclip-to-Jules heartbeat execution now passes through a database-backed admission broker before the Jules adapter can create or resume remote work. The broker resolves the native company repository binding, source-authorized profiles, required capabilities, live rolling quota, live concurrency, reserve policy, profile health, credential, and repository write lease. A denied admission returns a deterministic code and executes zero Jules API calls.

The selected API credential exists only on the in-memory admission boundary. It is defined as a non-enumerable property and injected into the adapter's runtime environment after admission. It is not placed in agent configuration, session contracts, prompts, activity details, capacity records, leases, or this review.

## Runtime path

```text
native Company / Goal / Project / Issue / Agent / heartbeat run
  → derive goal/session capabilities and write scopes
  → resolve company_jules_sources
  → resolve jules_profile_sources
  → calculate profile health, rolling starts, concurrency and reserve
  → reject known-missing capabilities
  → resolve profile secret_ref in memory
  → acquire persisted repository write lease
  → inject selected profile/source/repository/credential into runtime config
  → invoke Jules REST adapter
  → atomically attach lease and remote session
  → record session_started once
  → durable reconciler renews or terminally releases lease
```

The legacy pure `selectJulesProfile()` remains available for compatibility and focused selection tests, but it is no longer the ordinary dispatch gate.

## Services and schema

- `server/src/services/jules-capacity-broker.ts` implements persisted admission, quota accounting, profile/source/capability filtering, secret resolution, scoring, lease acquisition/recovery/release, and deterministic scope overlap.
- `server/src/services/heartbeat.ts` calls the broker and injects its selected control-plane bindings immediately before adapter execution. Failed remote creation releases the reservation.
- `server/src/services/jules-sessions.ts` binds the pre-acquired lease to the durable session, renews it while remote execution remains active, and releases it at `FAILED`, `COMPLETED_UNVALIDATED`, or `ORPHANED`.
- `server/src/services/jules-reconciler.ts` recovers stale unbound reservations at startup; linked active-session leases remain protected and are renewed by reconciliation.
- `packages/db/src/schema/jules.ts` and migration `0042_flowery_captain_flint.sql` add `jules_repository_leases` and profile capability-readiness metadata.

## Admission algorithm

Admission executes under a PostgreSQL transaction-wide advisory lock so concurrent Paperclip requests cannot over-admit the same persisted fleet state.

For the selected enabled company source, each mapped profile derives:

- `startsInWindow` from `session_started` and `session_retry_started` events whose timestamps fall inside the configured rolling interval;
- `activeSessions` from durable nonterminal session states plus acquired-but-not-yet-attached reservations;
- `remainingRollingStarts` and `remainingConcurrency` from profile configuration;
- `reserveRemaining` from persisted starts;
- source accessibility from `jules_profile_sources`;
- capability readiness from configured capabilities and known `missing`/`error` readiness entries;
- profile health and recent terminal failures;
- recent usage by the requesting company; and
- write conflicts from active persisted leases.

Profiles are selected by rolling-quota utilization, then concurrency, company recent usage, and stable profile ID. The returned deterministic priority score provides a foundation for company priority, dependency unlocks, evidence/revenue value, deadline urgency, starvation age, and retry cost. None of these values can bypass hard admission rules.

## Rolling quota and reserve

The broker uses each profile's `sessionStartWindowSec`; there is no midnight reset. Terminal sessions free concurrency through the lifecycle state and lease release, but their start events stay in the ledger until their timestamps age outside the rolling window.

Normal work is ineligible when remaining starts are at or below `reserveSessionStarts`. Only a request carrying the deterministic `julesUrgentAuthorized=true` execution context may consume reserve. Restart does not reset reserve because all calculations come from durable event timestamps.

## Profile health and credentials

Disabled, degraded, quota-exhausted, source-missing, and cooldown profiles cannot receive new work. An inaccessible or empty credential transitions the profile to `auth_required` and records `profile_degraded`. A later successful credential check restores an `auth_required` profile to active and records `profile_restored`. Existing sessions remain reconcilable regardless of admission health.

## Write leases

Leases are acquired before calling the Jules adapter and are unique per heartbeat run. The default company repository burst is two (`JULES_COMPANY_WRITE_BURST` may configure it), but the second writer is admitted only if deterministic scope comparison proves the scopes do not overlap. Wildcard ancestry and exact-file equality are conservative conflicts.

Expired, unbound dispatch reservations are released on startup and before admission. Leases already attached to live sessions are never expired merely because Paperclip was offline; reconciliation renews them. Terminal transition release uses `released_at IS NULL`, making repeated polling/callback observations harmless.

## Tests executed

Focused broker/lifecycle tests cover:

- 15 starts in rolling 24 hours blocking another start;
- an old event aging out and restoring rolling capacity;
- concurrency release without restoring start allowance;
- reserve derivation from persisted usage;
- all required exact/glob overlap examples;
- capability and scope derivation without credential leakage;
- alternate source-authorized/capable profile selection;
- non-enumerable runtime credentials;
- missing capability denial before lease/API creation;
- overlapping-lease denial and non-overlapping burst admission;
- idempotent stale-reservation recovery after restart; and
- terminal lifecycle lease release.

## Specification status

- `adaptations_spec.md` §4.1 live profile state: **COMPLETE** for required persisted inputs and calculations.
- §4.2 secret resolution: **COMPLETE** for brokered heartbeat dispatch.
- §4.3 automatic source/profile matching: **COMPLETE** for ordinary heartbeat dispatch.
- §4.4 capacity events: **COMPLETE** for start/completed/failed/orphaned and credential health transitions; retry events are recognized by accounting but will be emitted by the later retry controller.
- §4.5 fairness/value priority: **PARTIAL**. Deterministic inputs and scoring exist; a persistent multi-company queue is not yet implemented.
- §4.6 reserve capacity: **COMPLETE** for normal versus explicitly authorized urgent admission.
- §5 repository write leases: **COMPLETE** for acquisition, overlap, binding, renewal, terminal release, and startup recovery in the current dispatch path.
- Actual broker use by ordinary Paperclip → Jules dispatch: **COMPLETE**.

## Known limitations

- Denied heartbeat admission is surfaced as a deterministic failed/deferred run result; a durable ranked multi-company waiting queue and automatic wake-on-release are still required to provide unattended retry ordering.
- Capability readiness is operational for configured capabilities and explicit `missing`/`error` records. Automated external capability probes and verification timestamps are not yet implemented.
- Profile health recovery is automatic for credential failures. Automated recovery probes for other degraded causes remain future work.
- The narrow remote-create-before-ID persistence limitation documented in the asynchronous lifecycle review remains dependent on Jules API idempotency/source-session discovery.

## Recommended next slice

Implement scoped Jules callback authentication, enriched native run context, and callback promotion semantics. That slice should issue run/company-scoped capabilities, promote blockers/artifacts/proposals/approval requests into native Paperclip surfaces, trigger immediate broker/reconciler work safely, and never allow a completion callback to self-accept an outcome. The deterministic acceptance validator and Hermes judge should follow after that boundary is secure.
