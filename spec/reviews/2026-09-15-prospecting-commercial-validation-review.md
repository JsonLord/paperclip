# FounderOS Prospecting and Commercial Commitment Review — 2026-09-15

## Scope

This slice connects behavioral demand to real commercial commitment. It implements the canonical `prospecting` operating system, `build-prospect-universe` and `validate-commercial-commitment` goal contracts without introducing a shadow CRM or project tracker. Runtime work remains native Paperclip Goals, Projects, Issues, Agents, Approvals and Activity.

## Canonical content and provenance

The runtime preserves the FounderOS-DEMO PR #4 identifiers `market-validation-sales`, `sales-second-brain`, `waterfall-prospect-sourcing`, `waterfall-contact-enrichment`, `diagnostic-community-outreach`, `watering-hole-discovery`, `customer-discovery-methods`, `sample-first-offer-validation`, `goal-contract-execution`, `bpw-evidence-and-source-discipline`, and `value-proposition-design`. Content continues to resolve through the pinned content-source abstraction. This environment did not vendor or claim a byte-for-byte copy of the still-unmerged PR; production requires the canonical packs to be merged and pinned.

## Native mapping

- System activation creates/reuses **Prospecting & Commercial Validation** as a native Project.
- Templates instantiate native **Build Prospect Universe** and **Validate Commercial Commitment** Goals.
- Native matching Prospect/Sales agents own Goals and Issues.
- Issues cover sourcing, qualification, governed outreach, sales discovery, quotes, commitment, and analysis.
- Mutations produce native Activity; consequential sends, posts, quotes, LOIs, payment links and collection require native Approvals.

## Prospecting intelligence

Prospects retain deterministic identities, per-field sources, retrieval/verification times and confidence. Qualification distinguishes unresolved, matches, partial matches, exclusions and outreach readiness. Conflicting attributes remain conflicts; absent data remains unknown. Guessed people, emails, phone numbers, titles and profiles are rejected. Domain, registry ID, canonical URL and verified contact references provide deterministic deduplication and repeated imports are idempotent. Suppression prevents opted-out prospects becoming outreach-ready.

## Sales Second Brain

Company-local GitHub/Firm remains durable sales intelligence. Derived views include prospect universe, interaction index, objections, commitments, next actions and pricing evidence. Views cite source records and do not become evidence themselves. The schema stores accounts/prospects, real interactions, quotes and commercial commitments while preserving source artifacts/system events.

## Commercial evidence

Evidence strength is ordered from outreach open and reply through qualified conversation, problem confirmation, sample/pilot discussion, quote, negotiated terms, LOI, deposit, paid pilot and payment. Binding, non-binding, conditional, paid and unpaid meanings remain distinct. Draft/sent quotes, compliments, synthetic interactions and test events cannot satisfy commercial commitment. Deposit/payment claims require a verified system-of-record event.

## Pricing, quotes, LOIs, and payments

Pricing distinguishes hypothesis, reaction, quote, accepted quote, deposit and payment. Quotes carry scope, terms, currency, validity and explicit lifecycle status. A sent quote is not commitment. LOIs retain binding status, conditions and source provenance. Payment evidence is accepted only from a verified event, never a filename or unsupported note.

## Waiting and wake conditions

After outreach or a commercial ask, the native Issue enters `WAITING_FOR_MARKET`; Jules polling is explicitly disabled. Deterministic wakes include reply, meeting completion, quote request/acceptance, LOI, deposit, payment, follow-up due and operator resume. Persisted wait rows provide restart safety.

## Deterministic and Hermes boundaries

The deterministic gate requires real qualified prospects, real source-linked interactions, non-synthetic signals, verified artifacts/events and Firm success. Thresholds remain goal-specific. Hermes may judge commitment consistency, ICP fit, objections, price response and sales-cycle friction, but cannot upgrade sentiment, drafts or synthetic records into commitment. Allowed decisions advance to usage observation, value-realization, and retention validation—not full product build. MVP reliability runs in parallel.

## Firm and downstream feedback

Material analysis runs Firm build before and after writing source-linked commitment records. Changes mark BMC, financial model, GTM, business plan, pitch, content strategy and Kickstarter economics stale rather than regenerating them automatically.

## Tests

The fixture covers: many prospects/no replies; qualified replies; positive discussion without next step; quote requested/rejected; non-binding LOI; verified deposit/paid pilot; and synthetic fake activity. Tests verify canonical identifiers, provenance, no invented contacts, suppression, evidence ordering, draft-quote exclusion, payment verification, synthetic exclusion and source-linked derived views.

## Remaining limitations and exact next slice

Canonical PR #4 pack prose still must be merged and pinned for production. Provider-specific CRM/payment adapters and UI-specific sales visualizations remain future integrations; this slice defines their strict ingestion boundary. The next primary business slice is **usage, value-realization, and retention validation**. Delivery facts remain evidence, while defects and bounded improvements flow through the parallel MVP Reliability & Product Learning system.
