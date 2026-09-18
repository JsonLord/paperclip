# Evidence-backed Business Model Canvas Review — 2026-09-17

## Canonical methodology and native mapping

FounderOS now registers the canonical `business-model` system as the native **Business Model Synthesis** Project and `compile-business-model-canvas` Goal after accepted `analyze-unit-economics`. The owner role is **Business Model Architect**, so native activation reuses the existing matching Agent rather than creating a duplicate. Native Issues compile segments, value propositions, channels/relationships, revenue/cost, resources/activities/partners, coherence, and risks.

The Goal references the existing canonical skills `business-model-canvas-design`, `jobs-to-be-done`, `value-proposition-design`, `bpw-business-model-canvas`, and `bpw-evidence-and-source-discipline`. Resource packs retain `bmc.standard` and `bpw.bmc` compatibility and provide the resource description, manifest, block contract, evidence mapping, layout guidance, and quality gate. The external BPW source is not embedded in this environment; its canonical identifier and content-registry provenance contract are preserved rather than replaced.

## Nine-block model and derived artifacts

The compiler always emits Customer Segments, Value Propositions, Channels, Customer Relationships, Revenue Streams, Key Resources, Key Activities, Key Partners, and Cost Structure. Empty or unsupported blocks remain explicitly unknown. `BUSINESS_MODEL_CANVAS.yaml` retains the canvas version, compilation timestamp, company, source-state version, per-entry provenance, open questions, stale dependencies, and evidence coverage. `BUSINESS_MODEL_CANVAS.md` is a compact human review and `BUSINESS_MODEL_RISKS.md` identifies weak blocks and registered validation Goals.

The Canvas is a derived view. It is not primary evidence, and every material statement traces through evidence IDs to canonical Firm, customer, commercial, usage/value/retention, and economic state.

## Evidence maturity, confidence, and contradictions

Entries preserve `VALIDATED`, `SUPPORTED`, `EARLY_EVIDENCE`, `HYPOTHESIS`, `ASSUMPTION`, `UNKNOWN`, or `CONTRADICTED`. Status and confidence are deterministic: evidence count, source diversity, staleness, synthetic origin, and contradictions determine LOW/MEDIUM/HIGH confidence. Hermes cannot upgrade maturity. Contradictions remain attached to the entry and lower confidence rather than being summarized into false consensus.

## Block-specific integrity

Customer segments require resolvable segment state and use ICP/JTBD, qualification, commitment, usage, and retention evidence rather than invented personas. Value propositions require problem/value evidence and current offer linkage. Channels and relationships retain observed or explicit hypothesis status and distinguish discovery, acquisition, sales, delivery, support, and retention when supplied. Revenue entries distinguish hypotheses, quotes, contracts, invoices, receipts, and refunds; `RECEIVED` must reconcile to verified payment evidence. Cost Structure must reconcile to Unit Economics evidence and retain measured/allocated/estimated/assumption/unknown classification. Resources and partners distinguish current/required/hypothesized and actual/dependency/proposed/hypothesized state.

## Deterministic validation, Firm, and Hermes

Validation checks all nine blocks, entry statuses, evidence/assumption/contradiction references, synthetic exclusion, segment and offer linkage, value evidence, verified received revenue, unit-economic cost evidence, and actual-partner provenance. Unsupported nine-box prose fails even though it is structurally complete. Firm builds before and after storing only business meaning—segments, propositions, channels, and claims—not duplicate raw evidence. Hermes then evaluates coherence, alignment, contradictions, unresolved assumptions, and the weakest block; it cannot repair referential integrity or invent an entry.

## Staleness, idempotency, risks, and work products

Each compiled Canvas persists its source-state version and normalized source fingerprint. An unchanged source fingerprint reuses the existing Canvas. Upstream ICP, offer, price, value, retention, channel, revenue, or cost changes use existing artifact staleness; recompilation is intentional rather than automatic. Accepted outputs are registered through the native work-product hook. Changes stale downstream financial planning, business plan, pitch, Kickstarter economics, and content/value claims.

Risks retain the affected block, evidence, assumptions, and a registered next Goal. Structured decisions include coherent, partially supported, channel/revenue/cost/segment/value validation, more retention data, or not supported; the compiler never declares the business model proven.

## Tests and scenarios

Focused tests cover native Goal/Project/Agent mapping, canonical packs, the nine-block structure, evidence and assumption provenance, maturity/confidence, unknowns, contradictions, revenue and cost reconciliation, segment/offer/value linkage, channel evidence, partner distinctions, synthetic exclusion, deterministic-before-Hermes ordering, Firm ordering, risk compilation, next-Goal recommendations, source-fingerprint idempotency, and scenarios A–J.

## Limitations

The compiler accepts a normalized current-state input assembled by the orchestrating Goal; it does not scrape prose or infer missing company facts. Recency is represented by stale inputs/source state rather than an arbitrary decay curve. UI output is structured YAML plus Markdown; no graphical editor is introduced. The full external BPW BMC pack remains content-source dependent.

## Exact next slice

Implement `compile-bpw-financial-plan` (or the nearest registered BPW finance Goal), consuming the evidence-backed Canvas and Unit Economics/Financial Case to produce formal financial planning. Business Plan, Pitch, Kickstarter, and broad content automation remain downstream.
