# Achieved-work review: Offer Engine and behavioral demand validation

**Date:** 2026-09-15

## Scope

Implemented canonical `offer-engine`, `validate-offer`, and `validate-demand` contracts using supplied FounderOS identifiers including `avatar-offer-landing-chain`, `sample-first-offer-validation`, `value-proposition-design`, `market-validation-sales`, `goal-contract-execution`, `creative-generation-review-loop`, `customer-journey-storyboarding`, `design-judgment-stack`, `platform-launch-readiness`, and `bpw-evidence-and-source-discipline`. The inaccessible FounderOS-DEMO PR #4 content was not recreated or claimed as migrated; runtime remains compatible with the pinned content registry.

Activation instantiates native Goals, reuses the matching native Experiment/Fake Door agent through the existing owner resolver, activates a native **Offer & Demand Validation** Project, and creates native Issues for offer, sample, landing page, Playwright verification, approval, evidence collection, and analysis.

## Offer and sample-first behavior

Offer hypotheses retain target segment, problem/JTBD claims, value proposition, delivery form, scope, outcome, price status, CTA, switching assumptions, evidence/assumption IDs, confidence, and status. Validated pricing/features without evidence are rejected. The contract explicitly prefers manual/concierge/sample proof over premature product construction. Samples demonstrate value but do not count as demand.

## Experiment and landing contract

Versioned experiment contracts are persisted before launch with immutable hypothesis, segment, offer, channel, variants, primary/secondary metrics, thresholds, minimum sample, stop rules, duration, actions, budget, deployment target, analytics plan, disclosure, and decision rules. Mutating a contract at the same version is rejected.

Landing assets are scoped to `website/experiments/<experimentId>/`, embed experiment/variant identity, CTA instrumentation, responsive viewport, evidence-derived copy inputs, and mandatory ethical disclosure. Presentation quality/Playwright are acceptance gates, never demand evidence.

## Governance

Launch checks native approved Approvals whenever deployment, publishing, outreach, or budget is involved. Jules cannot authorize launch or spend. Render Static remains appropriate for static pages; dynamic behavior remains subject to the existing HF Spaces policy.

## Behavioral evidence

Stable event types cover exposure, page/pricing views, CTA, signup, booking, quote/sample request, checkout, and payment intent. Events retain experiment/variant, time, privacy-conscious subject/session reference, channel, path, raw source, qualification, environment, and ingestion time. `TEST` events are excluded. Strength ordering prevents views/clicks from becoming conversions or willingness-to-pay.

Demand calculation requires a real denominator and qualified minimum sample. Completed signup/booking/sample/quote/checkout/payment-intent behavior is stronger than views/clicks. Missing traffic hard-fails; Tinybird or another adapter is identified by `rawEventSource` without inventing data.

## Waiting, Firm, and derived memory

After launch, `WAITING_FOR_MARKET` stores threshold/deadline/operator wake conditions and `julesPolling=false`. Analysis runs Firm before/after and writes experiment/metric evidence IDs. Material changes mark BMC, financial assumptions, plan, pitch, content, Kickstarter, and GTM artifacts stale.

Derived targets include `business-case/OFFER.md`, `business-case/VALUE_PROPOSITION.md`, `experiments/DEMAND_REPORT.md`, `experiments/EXPERIMENT_INDEX.md`, evidence ledgers, and Firm offer/value-proposition/experiment/evidence/metric/decision/channel records. Reports are not evidence.

Allowed decisions are `PROCEED_TO_COMMITMENT_VALIDATION`, `ITERATE_OFFER`, `ITERATE_MESSAGE`, `ITERATE_CHANNEL`, `REFINE_ICP`, `GATHER_MORE_TRAFFIC`, `GATHER_MORE_EVIDENCE`, `PIVOT_OFFER`, and `KILL_OFFER_HYPOTHESIS`; `READY_TO_BUILD` is unavailable.

## Persistence and APIs

Migration `0049_familiar_starbolt.sql` adds company-scoped offer hypotheses, immutable demand experiments, and idempotent behavioral events. APIs expose native activation, offer storage, experiment preparation/launch, event ingestion, analysis, and wait transitions.

## Tests and limitations

Tests cover canonical Goal/System IDs, unsupported feature claims, disclosed/instrumented landing generation, high-traffic weak response versus lower qualified conversion, TEST exclusion, CTA-versus-conversion separation, missing denominators, and pricing views not counting as WTP.

Production Playwright execution and Tinybird query clients remain deployment adapters; their required results/provenance are enforced by contracts but not mocked as live vendor calls. Repository/Firm hooks must be composed with existing company GitHub and Firm CLI services.

## Next slice

Implement **commercial commitment validation**: quote acceptance, deposits/payment intent versus actual payment, pilot commitments, delivery-capacity disclosure, governed payment configuration, and WAITING_FOR_MARKET—without interpreting CTA demand as revenue or permission to build the full product.
