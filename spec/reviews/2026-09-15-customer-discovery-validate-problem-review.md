# Achieved-work review: Customer Discovery / validate-problem

**Date:** 2026-09-15

## Customer Discovery system and Goal

Implemented the first business operating loop under canonical IDs `customer-discovery` and `validate-problem`. The native Goal contract references the exact canonical skills `customer-discovery-methods`, `jobs-to-be-done`, `switching-cost-analysis`, and `bpw-evidence-and-source-discipline`, plus `core.evidence-discipline` and `customer-discovery.core`. It requires company/Firm/evidence inputs, source-mapped reports and Firm outputs, and Firm builds before/after.

Activation uses the existing content runtime to create/reuse a native Goal below its parent, activate/reuse a native Customer Discovery Project, assign the existing native Customer Discovery Agent, and create three native Issues: preparation, gathering real interactions, and synthesis/decision. No discovery-specific Goal/Project/Agent hierarchy was added.

## FounderOS-DEMO content

Network restrictions from the preceding slice still prevented reading `JsonLord/FounderOS-DEMO` PR #4. This implementation therefore preserves the specified canonical IDs and paths and consumes them through the existing content-source/registry boundary. It does not claim byte-for-byte reuse and does not add substitute methodology prose. Merging/pinning PR #4 content can replace the fixture without runtime changes.

## Stages and waiting

The loop models `PREPARE_DISCOVERY`, `IDENTIFY_PROSPECTS`, `PREPARE_OUTREACH`, `WAIT_FOR_RESPONSES`, `RUN_INTERVIEWS`, `INGEST_EVIDENCE`, `SYNTHESIZE`, and `DECIDE`. Interview-plan generation records hypotheses, sampling, past-behavior prompts, forbidden leading/pitch questions, evidence sought, stop conditions, targets, and assumptions—never answers.

`WAITING_FOR_MARKET` is persisted against the native Goal/Project/Issue with reason and deterministic wake conditions. It blocks the native Issue/Goal and records Activity with `julesPolling=false`. Recreating the service returns the same wait. Only matching events wake it, restore native states, and invoke the supplied issue scheduler. Supported conditions include new interactions/transcripts, external-action completion, operator resume, thresholds, and scheduled review; this slice exercises interaction wakes.

## Evidence ingestion

Real source types include transcripts, call/meeting notes, surveys, email replies, and CRM interactions. Each durable interaction retains company/native IDs, stable interaction ID, source reference, participant/anonymized reference, date, channel, collector, raw provenance, content hash, synthetic flag, and processing time. Raw private content is not stored in the runtime table.

Evidence retains stable ID, source interaction FK, class, semantic kind, exact statement, quote/reference location, extractor, confidence, and contradiction links. Classes are:

- `CUSTOMER_BEHAVIOR`
- `CUSTOMER_STATEMENT`
- `COMMERCIAL_COMMITMENT`
- `EXTERNAL_SOURCE`
- `BEHAVIORAL_ANALYTICS`
- `CALCULATED_ESTIMATE`
- `FOUNDER_ASSUMPTION`
- `HYPOTHESIS`
- `SYNTHETIC`

Synthetic interactions may create only synthetic/hypothesis records. They never increment real interaction counts or satisfy customer/commitment evidence gates. Stable company+interaction and company+evidence uniqueness makes retries idempotent.

## Firm and Business Second Brain

Material ingestion runs the company-local Firm build before, writes source-linked interaction/evidence records through the repository hook, then runs Firm after. Either required build failure stops the operation.

Synthesis derives, without treating them as evidence:

- `evidence/CLAIM_EVIDENCE_LEDGER.md`
- `evidence/ASSUMPTION_REGISTER.md`
- `evidence/customer-discovery/INTERACTIONS_INDEX.md`
- `business-case/CUSTOMER_PROBLEM_REPORT.md`
- `business-case/ICP.md`

Reports include evidence IDs/source interaction IDs, retain contradictions and weak future-intent statements as stated, and label unsupported ICP attributes unknown.

## Sufficiency, judgment, and decisions

The deterministic gate requires the configured minimum non-synthetic interactions and source-provenanced real customer evidence. Failure is a hard failure, so the existing Founder Manager invariant prevents Hermes from returning operational `ACCEPT`. Allowed business decisions are `CONTINUE_VALIDATION`, `REFINE_ICP`, `REFINE_PROBLEM`, `PIVOT_PROBLEM`, `WAIT_FOR_MORE_EVIDENCE`, and `KILL_HYPOTHESIS`; `READY_TO_BUILD` is intentionally absent.

Next-Goal recommendations are accepted only if both allowed by `validate-problem.nextGoalHints` and present in the registered template catalog. Instantiation remains through the native Goal template service.

## Governance and downstream feedback

Preparation and drafts are autonomous. Outreach sends, community posts, booking, and other real external effects remain governed by the existing native Approval callback/action path. Ingestion never claims outreach or interviews happened merely because they were planned.

Every new non-synthetic evidence record marks dependent BMC, business-plan, pitch, offer, content-positioning, and Kickstarter-positioning artifacts stale with evidence ID, reason, affected dependency, and timestamp. It does not regenerate them.

## Tests

Fixtures include three real interactions and one synthetic interaction: agreement/contradiction, differing severity, weak hypothetical willingness, and concrete historical spend/workaround. Tests cover canonical contracts, interview planning, real counts, synthetic exclusion, provenance, contradiction preservation, weak-vs-behavioral evidence, idempotent ingestion, Firm before/after hooks, restart-safe waiting, no Jules polling, deterministic wake, native Activity, and staleness creation.

## Limitations and next slice

Repository hooks are explicit because source material and derived artifacts belong in the company GitHub repository; deployment composition must bind them to the existing GitHub PR writer and company-local Firm CLI. Threshold wake evaluation beyond direct interaction events (for example minimum evidence count) is represented in the durable contract but should be generalized in the next slice.

The exact next business slice is **Offer Validation / Fake-Door preparation** only after real problem evidence: consume accepted/refined problem and ICP evidence, preserve approval gates for publishing/spend, implement behavioral-demand events and `WAITING_FOR_MARKET`, and never treat landing-page creation or simulated clicks as demand.
