# Usage, Value Realization & Retention Review — 2026-09-16

## Primary business evidence track

FounderOS now registers **Customer Value & Retention** as a primary native Paperclip Project while **MVP Reliability & Product Learning** continues independently. The Project instantiates the native Goals `observe-product-usage`, `validate-value-realization`, and `validate-retention` in order after commercial commitment, and creates the visible Issues Instrument/verify usage, Analyze activation, Measure customer outcome, Review retention window, Analyze churn, and Capture economic observations. The successful handoff is `analyze-unit-economics`; this slice does not compile a BMC, financial model, business plan, pitch, Kickstarter plan, or content program.

## Usage system and activation semantics

The `customer-value` system ingests idempotent deployment-linked events through the existing event-source abstraction (including Tinybird as a source label, without requiring it). Events preserve stable event, company, deployment, pseudonymous account/customer/session/user, offer/opportunity, revision, timestamp, source, environment, metadata, and evidence references. `PRODUCTION`, `TEST`, `SYNTHETIC`, and `INTERNAL` are explicit; only genuine production events can enter customer-value calculations, and health, Playwright, or developer traffic is excluded.

Activation is an offer-specific, versioned contract with required event types, a meaningful value event, effective date, and source IDs. Signup is not globally activation. Funnels retain qualified committed-account denominators, unique-account stage counts, drop-off, conversion, and evidence. A missing denominator stays `UNKNOWN`; it never produces a rate.

## Value realization

Value hypotheses retain offer, segment, expected outcome, optional metric/baseline/target, measurement window, evidence requirements, sources, and assumptions. Customer outcomes retain account/customer, offer/version, hypothesis, evidence class, observation and measurement, source and date/window, confidence, contradictions, evidence, and product version. The deterministic gate rejects login/workflow behavior alone, assumptions, and synthetic evidence as proof of value. `product/VALUE_REALIZATION_REPORT.md` remains a derived, evidence-linked view rather than the factual source.

## Retention models, windows, and waiting

Contracts support recurring subscription, repeated usage, repeat purchase, project renewal, paid extension, expansion, referral, ongoing workflow, and one-off-with-referral models. Windows are persisted before observation with definition, start/end, required signal, sources, and state. An open window returns `WAIT_FOR_MORE_RETENTION` and uses native `WAITING_FOR_MARKET`; its activity explicitly records `julesPolling: false`. Return, purchase, renewal, expansion, referral, cancellation, churn, expiry, operator, and customer-interaction events wake the work. Persisted waits and windows survive restart.

## Renewal, expansion, referral, and churn

Renewal and expansion retain `DISCUSSED`, `QUOTED`, `ACCEPTED`, or `PAID`; only paid events qualify as completed retention in the deterministic gate. A referral requires an actual referred account, channel, source event/interaction, timestamp, and result—stated intent is not a referral. Churn retains a controlled reason only when provenance exists; otherwise the durable reason is `UNKNOWN`, and Hermes cannot invent one.

## Product Reliability and Product Learning interaction

The customer-value service routes proven `PRODUCT_FAILURE` churn into the existing MVP Reliability service, creates/deduplicates a `USER_REPORTED_DEFECT` runtime observation, promotes it into the supplied native Reliability Project/Goal, and stores the resulting observation and Issue linkage on the retention event. Evidence-backed repeated customer learning enters the existing Product Learning observation path but never automatically builds the request. A runtime failure is a product blocker, not automatic disproof of the value proposition.

## Economic observations and revenue provenance

Customer-level costs retain cost type, amount/currency where known, period, account, source, provenance (`MEASURED`, `ALLOCATED`, `ESTIMATED`, or `UNKNOWN`), allocation formula, and evidence. Allocated observations require their formula. Economic compilation counts only `RECEIVED` revenue—not quoted, contracted, invoiced, LOI, quote acceptance, or payment intent—and reports real known serving cost and an observed contribution only when currency is coherent. CAC, LTV, margin percentage, and payback remain explicitly unknown without their necessary history and denominators.

## Firm and Business Second Brain

Minimal Firm concepts are added for usage, customer outcome, retention event, and cost observation while detailed event streams remain in their purpose-built company-scoped tables. Firm builds are hard gates before and after finalization. Derived outputs cover usage, activation, value realization, retention, churn, and economic observations; claim and assumption ledgers remain existing Business Second Brain outputs. Material value, retention, churn, cost, revenue, and pricing changes stale BMC, financial case, GTM, business plan, pitch, Kickstarter economics, and content/value claims without regenerating them.

## Deterministic validation and Hermes

Usage acceptance requires real production events, qualified-account correlation where required, a versioned activation definition, source provenance, valid denominators, and Firm. Value acceptance additionally requires a source-backed hypothesis and outcome evidence distinct from product behavior. Retention acceptance requires a supported model, predefined window, real account, qualifying event or elapsed window, provenance, and Firm. Hermes judges meaning only after these hard gates and cannot override absent usage, value, or retention evidence. No decision claims product-market fit.

## Tests and results

The focused suite covers native system/Goal contracts; production, fixture, fake-door and Playwright filtering; qualification; versioned activation; missing denominators and time-to-stage; usage-versus-value; calculable measurements; retention model/window/wait behavior; renewal and referral stages; churn provenance and `UNKNOWN`; Reliability/Product Learning routing; cost provenance; received/refunded revenue distinctions; deterministic-before-Hermes and Firm ordering; derived reports; and fixtures A–J (paid/non-user, login-only, one-time completion, repeat value, paid renewal, actual referral, product-failure churn, price churn, synthetic-only traffic, and support cost exceeding revenue). Database migrations `0052_bent_thunderbolts.sql` and `0053_puzzling_millenium_guard.sql` establish and complete the durable model. Workspace typecheck, test, and build results are recorded in the change handoff.

## Limitations

FounderOS does not infer identity from anonymous traffic, fabricate unavailable telemetry, or claim a qualified customer when correlation is absent. Event ingestion stays on the existing source-neutral/Tinybird-compatible boundary and does not add provider-specific authentication. Time-to-stage accuracy depends on source timestamps. Qualitative outcomes remain qualitative where no baseline exists. Product-failure promotion requires deployment plus native Reliability Project/Goal context; it uses the existing Reliability service rather than a parallel defect tracker.

## Exact next slice

Implement **Unit Economics + Financial Case**, beginning with `analyze-unit-economics`: aggregate adequate histories and denominators from verified received revenue and customer-level costs, while preserving cohort/model context and unknowns. Only after that evidence passes deterministic and Hermes gates should FounderOS advance toward BMC, business-plan, or pitch synthesis.
