# Unit Economics & Financial Case Review — 2026-09-17

## Native operating model

FounderOS registers `unit-economics` as the primary **Unit Economics & Financial Case** Project and instantiates the native `analyze-unit-economics` Goal after accepted retention evidence. Native Issues reconcile revenue, measure variable cost, calculate contribution, assess CAC and retention/LTV evidence, model scenarios, run sensitivity analysis, and compile the financial case. The next eligible Goal is `compile-business-model-canvas`; this slice does not compile a BMC or multi-year forecast.

## Authoritative evidence and input model

The system derives from existing Commercial Validation payment records and Customer Value cost observations. Verified revenue import admits only deposit, paid-pilot, or payment records whose paid state is `PAID`/`RECEIVED`, amount is known, and system-of-record event exists. Customer costs retain their original measured, allocated, estimated, or unknown provenance. Economic inputs add business meaning—unit, period, scope, category, confidence, sources, and formulas—without becoming a second revenue or accounting truth.

Inputs preserve `MEASURED`, `CALCULATED`, `ALLOCATED`, `ESTIMATED`, `ASSUMPTION`, and `UNKNOWN`. Calculated/allocated inputs require formulas; assumptions require resolvable assumption IDs; known non-assumption inputs require source IDs. Synthetic data, mixed currency without conversion evidence, missing units/periods/scopes, and unsupported values fail deterministically.

## Revenue, direct cost, and contribution

Revenue models support one-time purchase, subscription, usage-based, service, pilot, license, project, and hybrid businesses. Realized revenue is received less refunded; quotes, contracts, invoices, LOIs, and payment intent do not enter realized revenue. The Goal defines the economic unit rather than assuming SaaS customers.

The variable-cost boundary is explicit. Contribution is calculated only when received revenue exists and every required direct-cost type has evidence. Missing compute, API, support, processing, or delivery cost remains missing rather than zero. Gross margin is calculated only from a positive revenue denominator and a complete declared direct-cost boundary. Fixed operating costs remain separate.

## CAC, LTV, payback, and break-even

CAC requires attributable acquisition cost and a real acquired-customer denominator for the same scope/period. Channel CAC requires channel-specific costs and customers; unattributed channels are not blended. Founder/sales effort must be measured, allocated, estimated, or unknown rather than silently omitted.

Observed LTV-to-date is actual net received revenue per observed account. Modeled LTV is a separate calculated input and requires an explicit formula plus retention/churn assumption IDs. Guessed retention never becomes observed LTV. Payback requires both CAC and periodic contribution. Break-even requires positive contribution and defined fixed cost. Burn/runway additionally require actual or explicitly supplied cash; absent cash remains unknown.

## Assumptions, scenarios, and sensitivity

Financial assumptions retain statement, value/range, units, reason, sources, confidence, sensitivity, status, owner, and validation need. Conservative/base/upside scenarios may change only existing inputs and must cite a source or resolved assumption. Values outside documented ranges are rejected. Sensitivity is deterministic one-variable-at-a-time arithmetic and ranks impact on contribution; Hermes does not perform hidden calculations.

## Maturity, reports, Firm, and judgment

Metrics carry `UNKNOWN`, `OBSERVED_EARLY`, `PARTIALLY_OBSERVED`, `MODELED`, or `SUPPORTED` maturity. Derived outputs are `UNIT_ECONOMICS.md`, `UNIT_ECONOMICS.yaml`, `FINANCIAL_CASE.md`, `FINANCIAL_ASSUMPTIONS.yaml`, `SCENARIOS.yaml`, and the claim/assumption ledgers. Every material figure exposes evidence, input IDs, formula, or assumption context; derived reports are not evidence.

Deterministic validation runs before Firm and Hermes. Material accepted analysis builds Firm before and after storing metrics, assumptions, and the structured decision. Hermes may judge promising, fragile, uncertain, or unattractive economics, but cannot create CAC, LTV, margin, payback, or scenario arithmetic. Material changes stale BMC, financial planning, GTM, business plan, pitch, Kickstarter economics, and pricing/value claims.

## Decisions and tests

Structured decisions include proceeding to business-model synthesis, improving unit economics, validating pricing, reducing delivery/acquisition costs, gathering retention/revenue/cost data, refining the model, or rejecting unsupported economics. The implementation never emits guaranteed-profitability or product-market-fit verdicts.

Focused tests cover native mapping, unit definition, provenance, currency consistency, received/refunded revenue, cost boundaries, contribution, gross-margin gating, CAC and channel denominators, observed versus modeled LTV, payback, break-even, cash/runway unknowns, deterministic scenarios, sensitivity, unknown propagation, report output, and required scenarios A–L. Workspace typecheck, build, and related FounderOS tests are recorded in the handoff.

## Limitations

No foreign-exchange conversion is attempted without a conversion evidence input. Observed LTV-to-date is not a prediction. Early retention cohorts cannot establish a stable long-run curve. The financial case is an evidence-backed early model, not a five-year P&L, cash-flow statement, liquidity plan, or capital requirement forecast.

## Exact next slice

Implement `compile-business-model-canvas`, consuming validated problem, ICP/market, offer, demand, commercial commitment, usage, realized value, retention, and unit economics. Formal multi-year finance, business-plan, and pitch compilation remain downstream.
