# MVP Reliability & Product Learning Review — 2026-09-16

## Dual-track correction

FounderOS now explicitly separates the primary business evidence track—Problem → ICP/Market → Offer → Demand → Commercial Commitment → Usage/Value → Retention → Economics—from a parallel product track—existing MVP → HF runtime observation → native defect/product-learning Issue → brokered Jules change → validation/PR → deployment verification → observe again. Commercial commitment no longer mandates a standalone concierge/pilot delivery-validation project. Delivery facts remain valid evidence, but the next primary Goals are `observe-product-usage`, `validate-value-realization`, and `validate-retention`.

## HF deployment registration

`company_deployments` binds a native Company and its active repository binding to non-secret Hugging Face Space metadata: stable deployment and Space identity, URL, runtime type, deployment ref, health/main endpoints, observed health timestamps, and known revision. Registration rejects credential-shaped metadata; provider credentials remain Paperclip secrets. GitHub remains canonical source and the Space remains the runtime.

## Lightweight monitoring

Health and supplied runtime observations are deterministic service operations, not Jules work. Healthy checks update deployment health and revision without dispatch. Failures retain type, severity, endpoint/component, status, redacted source reference, affected commit/revision, timestamps, and evidence. Paperclip does not invent telemetry HF does not expose. Browser journeys are reserved for user-flow regressions; direct probes remain suitable for health endpoints.

## Fingerprinting and restart safety

A normalized SHA-256 fingerprint covers observation type, endpoint, status, and stable error signature. The deployment/fingerprint uniqueness constraint provides one lineage across restarts; repeats increment occurrence count and last-seen time rather than creating new Issues. Different failures retain distinct observations. Deployment, observation, Issue, dispatch, and verification states are durable.

## Native Issue promotion and priority

Actionable observations are promoted into the native **MVP Reliability & Product Learning** Project, with links to deployment, endpoint, revision, evidence, and observation. P0 covers availability, startup, commercial/validation blockers and other critical failures; P1 blocks core behavior; P2 is degraded operation; P3 is minor. P0 becomes native critical priority. There is no parallel bug tracker.

## Repair eligibility and Jules integration

Automatic repair eligibility requires an active repository binding, reproducible evidence, bounded write scope, maintenance-policy fit, and no high-impact governance requirement. Dispatch is an injected boundary to the existing capacity broker, preserving repository write leases, Jules lifecycle, validation, Hermes judgment, same-session revision, and bounded retry. Observation itself never consumes Jules capacity and an already-dispatched observation cannot dispatch twice.

Major redesigns, payment/privacy/security changes, large migrations, integrations, scope expansion and policy changes require managerial/operator approval. An error does not authorize redesign.

## Deployment verification

A PR or passing test suite is not resolution. Verification records runtime revision, endpoint response, source reference and optional Playwright journey. Healthy runtime plus a non-failing journey resolves the native Issue. Failed or unavailable verification leaves `VERIFICATION_PENDING`, enabling revision through the existing Issue/Jules lifecycle.

## Product-learning observations

`PRODUCT_LEARNING` captures actual friction, commercial requests, analytics abandonment, customer confusion and workflow limitations with evidence IDs. A single speculative request yields `EXPERIMENT_FIRST` rather than a feature. Repeated or commercially linked evidence can be considered for `SMALL_IMPROVEMENT`, while high-impact changes remain governed. Allowed managerial outcomes are FIX, SMALL_IMPROVEMENT, EXPERIMENT_FIRST, BACKLOG, REJECT and ESCALATE.

The derived `product/PRODUCT_LEARNING.md` ledger carries source observations, evidence, severity/frequency, decision, native Issue and deployment verification. It is a view; persisted observations are the factual source.

## Interaction with business evidence

Runtime defects may invalidate demand or commercial measurements; product learning may stale offer, value proposition, demand, pricing, economics or GTM assumptions. Only a critical defect that invalidates a measurement/customer experience blocks the related business experiment. Prospecting and commercial work otherwise continue concurrently with reliability.

## Tests and results

Focused tests cover corrected next-goal hints, registered system contracts, deterministic same/different fingerprints, P0/P1 classification, bounded repair eligibility, high-impact exclusion, speculative-request rejection, evidence-backed improvement eligibility, evidence retention, native Issue references, and verification context. Schema generation, workspace typecheck, build, and focused tests are recorded in the PR.

## Known HF telemetry limitations

HF Space public endpoints do not guarantee access to container logs, build lifecycle, private telemetry, or deployment-to-commit correlation. Paperclip records only supplied/observable facts and leaves unavailable revision or diagnostic fields unknown. Provider-specific authenticated telemetry can be added behind the observation interface without changing company knowledge or exposing credentials.

## Exact next primary slice

Implement **Usage / Value Realization / Retention**: ingest genuine product-use and customer-outcome events, validate activation and successful workflow completion, measure repeated use, renewal/referral/churn, connect those signals to commercial accounts and runtime revisions, and feed economics without treating health checks or page views as value realization.
