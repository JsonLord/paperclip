# Achieved-work review: Market Intelligence, ICP refinement, competition, and sourced sizing

**Date:** 2026-09-15

## Scope

Implemented the native `market-intelligence` system with two sequential native Goal templates: `define-initial-icp` and `analyze-market`. Activation uses the existing template runtime, existing Market Analysis Agent, one native **Market & ICP Validation** Project, and native Issues for ICP refinement, source collection, alternatives, sizing, and decision synthesis. It never completes `validate-problem`.

Canonical supplied skill IDs are retained: `jobs-to-be-done`, `bpw-market-segmentation`, `customer-discovery-methods`, `switching-cost-analysis`, `bpw-market-analysis`, `bpw-primary-secondary-research`, `competitor-landscape`, `venture-gap-analysis`, `search-demand-intelligence`, and `bpw-evidence-and-source-discipline`. Network restrictions still prevent byte-for-byte inspection of FounderOS-DEMO PR #4, so the content-source boundary is used without claiming migration of inaccessible prose.

## Evidence and provenance

External sources have stable company-scoped IDs, class, URL/reference, publisher, title, publication/retrieval/verification dates, reliability, content hash, and raw provenance. Idempotent ingestion emits native Activity and wakes matching evidence waits. External sources remain distinct from customer evidence.

Market claims retain external source IDs, customer-evidence IDs, classification, confidence, and explicit contradiction links. Competitor records cover direct, indirect, manual/internal, agency/service, do-nothing, and adjacent categories; pricing is rejected unless a pricing source ID exists. Customer-mentioned alternatives retain their interaction evidence IDs.

## ICP and market sizing

The ICP contract requires observed attributes/JTBD to cite customer evidence and keeps hypotheses, assumptions, unknowns, buyer/user distinctions, reachability, and contradictions explicit.

Market estimates retain kind (TAM/SAM/SOM/reachable), method, formula, numeric inputs, input source IDs, explicit assumptions, geography, segment, currency, confidence, and calculation date. Inputs without a valid source or explicit assumption are rejected. Arbitrary `1% of TAM` SOM is rejected unless an obtainable-share assumption model is documented.

## Firm and derived views

Material analysis runs company-local Firm build before, writes source-linked claims/competitors/estimates, then runs Firm after. It compiles derived ICP, Segment Map, Market Analysis, Competitor Landscape, Opportunity Gaps, and machine-readable Market Sizing YAML. These views cite IDs and are not new evidence.

Source freshness warnings flag important old sources. Customer/external contradictions survive into reports rather than being averaged into consensus. Search-demand metrics must come from ingested sources; unavailable volume/CPC/difficulty remains unavailable and never implies willingness to pay.

## Gates, waits, and decisions

The deterministic sufficiency gate requires real external sources, customer evidence linkage, complete provenance, resolvable claim source IDs, valid estimates, required reports, and Firm before/after success. Synthetic sources do not count. These failures are hard and therefore cannot be overridden by Hermes under the existing manager invariant.

`WAITING_FOR_EVIDENCE` reuses the persisted market-wait infrastructure, blocks the native Issue, records `julesPolling=false`, and wakes on `new_market_source`, founder data, scheduled review, material customer-evidence change, or operator resume.

Allowed decisions are `PROCEED_TO_OFFER_VALIDATION`, `REFINE_ICP`, `REFINE_MARKET_SCOPE`, `GATHER_MORE_MARKET_EVIDENCE`, `GATHER_MORE_CUSTOMER_EVIDENCE`, `PIVOT_SEGMENT`, and `KILL_MARKET_HYPOTHESIS`. `READY_TO_BUILD` is intentionally unavailable. New market/ICP claims mark offer, BMC, financial case, business plan, pitch, content strategy, fake-door messaging, and Kickstarter positioning stale without regenerating them.

## Persistence and APIs

Migration `0048_tearful_hemingway.sql` adds company-scoped `market_sources`, `market_claims`, `market_estimates`, and `competitor_records`. Company-scoped APIs support activation, source ingestion, analysis persistence, evidence waits, and deterministic wake events. Operator-visible changes use native Goals, Projects, Issues, and Activity.

## Tests

Fixtures contain three external sources including stale/conflicting material, direct competition, an agency workaround, do-nothing, explicit assumptions, a calculable bottom-up estimate, and unsupported sizing cases. Tests prove source-backed and assumption-labelled calculations, unsupported-number rejection, arbitrary-SOM rejection, stale warnings, contradiction preservation, alternative categories, formula/source output, and hard failure without customer/external evidence.

## Limitations and next slice

Production repository/Firm hooks must be composed with the existing GitHub PR writer and Firm CLI, as with Customer Discovery. Rich source refresh scheduling and changed-input estimate invalidation are recorded as staleness but not automatically recomputed. Actual PR #4 methodology remains blocked on network access.

The exact next business slice is **Offer Validation and behavioral-demand measurement**: consume accepted problem/ICP/market evidence, prepare an offer/fake-door artifact, gate publishing/spend through native Approvals, ingest real behavioral demand, wait without polling, and distinguish interest from commercial commitment.
