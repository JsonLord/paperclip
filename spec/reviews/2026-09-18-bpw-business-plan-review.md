# BPW Business Plan Compiler Review — 2026-09-18

## Native mapping and canonical content

FounderOS registers `bpw-business-plan` as the native **Business Plan Compilation** Project and `compile-business-plan` as the Goal downstream of `compile-bpw-financial-plan`. The owner role is the existing **Business Plan Editor**; activation reuses the native content registry, Goal, Project, Issues, activity, Firm, and Work Product hooks. The `bpw.business-plan` support pack preserves canonical BPW skill identifiers. No authoritative BPW submission template exists in this repository, so exact page, scoring, heading, DOCX, and PDF rules are not invented.

## Chapter and evidence model

The compiler implements Executive Summary, Product / Service, Founding Team, Market Analysis, Marketing / Go-to-Market, Company / Organisation, Financial Planning, and Sustainability. Statements retain stable IDs, type, evidence and source-artifact IDs, assumption and calculation IDs, contradictions, freshness, and deterministic confidence. `UNKNOWN` is a valid result. The plan remains a derived view and is never promoted into primary evidence.

Substantive chapters compile first. The Executive Summary selects existing body claims and cannot introduce a new fact. Chapter readiness is `SUPPORTED`, `PARTIALLY_SUPPORTED`, `ASSUMPTION_HEAVY`, `BLOCKED`, or `STALE`; plan readiness is `COMPILABLE`, `COMPILABLE_WITH_GAPS`, `NEEDS_EVIDENCE`, or `STALE`. These states depend on provenance, unknowns, contradictions, and freshness—not writing quality.

## Consistency, editorial safety, and privacy

Deterministic validation resolves evidence, assumption, calculation, contradiction, team, and capability references. Financial and market figures must exactly match their canonical metric maps. Planned capability cannot masquerade as an unregistered current capability, and team biographies cannot be invented. Synthetic material cannot validate factual prose. Private customer data requires explicit authorization; traceable internal identifiers allow public outputs to use anonymized labels.

Editorial synthesis occurs only after deterministic assembly. The fact-preservation contract rejects unregistered claim IDs and changed material numbers. Firm builds before and after structured records are written; Hermes runs only after deterministic success and cannot repair missing evidence or reconciliation failures.

## Artifacts, sources, risks, rendering, and staleness

The compiler emits `BUSINESS_PLAN.yaml`, `BUSINESS_PLAN.md`, `CLAIM_EVIDENCE_MAP.yaml`, `SOURCES.yaml`, `BUSINESS_PLAN_RISKS.md`, and `READINESS.yaml`. Source notes map publishers/origins and references to claims without requiring raw customer transcripts. Risks retain affected chapter, evidence/assumptions, impact, status, and a registered mitigation Goal.

YAML is canonical and Markdown is the human narrative. DOCX/PDF are presentation renderers downstream of the validated model. Because no verified BPW layout is present, render status is truthfully `NOT_RENDERED`. Changes to the compiled plan stale Pitch through the existing staleness ledger; later changes in BMC, finance, market, team, or product inputs are represented through the plan's source fingerprint and stale dependencies rather than silently overwriting an artifact.

## Tests and limitations

Focused tests cover native mapping, canonical chapters, Executive Summary ordering, provenance, contradictions, exact financial/market reconciliation, unknown legal status, team and product referential integrity, privacy, synthetic exclusion, chapter readiness, editorial fact preservation, canonical artifacts, Firm-before-Hermes ordering, idempotent fingerprints, and scenarios A–L.

The compiler does not provide jurisdiction-specific legal or sustainability advice, infer team facts, or implement an official BPW DOCX/PDF layout. Narrative editing is exposed as a constrained contract; a production LLM editor and verified renderer can be attached later without moving business logic into presentation code.

## Exact next slice

Implement `compile-pitch`: derive a concise, audience-specific, evidence-traceable pitch from the accepted Business Plan and its claim map. Do not add Kickstarter or broad content automation in that slice.
