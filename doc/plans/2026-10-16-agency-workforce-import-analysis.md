# Agency workforce import analysis — 2026-10-16

Paperclip source: `jules/live-qualification-validation-control-plane-17107534803350008827` at `858aa9984968b21b1c926d0bb9c34681787af3c1`.
Agency source: `JsonLord/agency-agents`, branch `validation-workforce`, fetched HEAD `cf909b0b5435a229ac7c7fd7b6abcfa97fd06d09`.

Read the actual persona frontmatter and bodies, native catalog builder/validator, all catalog metadata, capability registry and workflow files before implementation. The native Python catalog validator reports 45 active personas, 9 divisions, 28 skills, 13 workflows, 8 provider capabilities and 327 alias entries. The latter contains 45 active division/ID path aliases and 282 legacy persona paths. No legacy persona is eligible for active import. Frontmatter aliases are empty across this canonical roster.

## Exact active roster

| Division | Stable Agency ID | Display name | Source aliases |
| --- | --- | --- | --- |
| decision | founder-intelligence-reporter | Founder Intelligence Reporter | (none) |
| decision | kill-agent | Kill Agent | (none) |
| decision | pivot-strategist | Pivot Strategist | (none) |
| decision | portfolio-allocator | Portfolio Allocator | (none) |
| decision | venture-judge | Venture Judge | (none) |
| discovery | community-scout | Community Scout | (none) |
| discovery | customer-investigator | Customer Investigator | (none) |
| discovery | ethnographic-researcher | Ethnographic Researcher | (none) |
| discovery | problem-explorer | Problem Explorer | (none) |
| discovery | trend-scout | Trend Scout | (none) |
| distribution | channel-researcher | Channel Researcher | (none) |
| distribution | community-activation-specialist | Community Activation Specialist | (none) |
| distribution | content-experimenter | Content Experimenter | (none) |
| distribution | demand-generation-tester | Demand Generation Tester | (none) |
| distribution | outbound-experimenter | Outbound Experimenter | (none) |
| evaluation | demand-skeptic | Demand Skeptic | (none) |
| evaluation | distribution-skeptic | Distribution Skeptic | (none) |
| evaluation | evidence-auditor | Evidence Auditor | (none) |
| evaluation | red-team-analyst | Red-Team Analyst | (none) |
| evaluation | wtp-skeptic | WTP Skeptic | (none) |
| experimentation | experiment-designer | Experiment Designer | (none) |
| experimentation | fake-door-designer | Fake-Door Designer | (none) |
| experimentation | message-test-designer | Message-Test Designer | (none) |
| experimentation | pretotype-designer | Pretotype Designer | (none) |
| experimentation | pricing-test-designer | Pricing-Test Designer | (none) |
| hypothesis | assumption-mapper | Assumption Mapper | (none) |
| hypothesis | causal-analyst | Causal Analyst | (none) |
| hypothesis | counter-hypothesis-generator | Counter-Hypothesis Generator | (none) |
| hypothesis | hypothesis-formulator | Hypothesis Formulator | (none) |
| hypothesis | opportunity-synthesizer | Opportunity Synthesizer | (none) |
| intelligence | competitive-intelligence-analyst | Competitive Intelligence Analyst | (none) |
| intelligence | lead-researcher | Lead Researcher | (none) |
| intelligence | market-intelligence-analyst | Market Intelligence Analyst | (none) |
| intelligence | review-miner | Review Miner | (none) |
| intelligence | signal-analyst | Signal Analyst | (none) |
| production | copy-producer | Copy Producer | (none) |
| production | demo-producer | Demo Producer | (none) |
| production | landing-page-builder | Landing Page Builder | (none) |
| production | prototype-director | Prototype Director | (none) |
| production | visual-creative | Visual Creative | (none) |
| proposition | customer-language-analyst | Customer Language Analyst | (none) |
| proposition | offer-designer | Offer Designer | (none) |
| proposition | positioning-strategist | Positioning Strategist | (none) |
| proposition | pricing-strategist | Pricing Strategist | (none) |
| proposition | value-position-designer | Value Proposition Designer | (none) |

## Overlap and source cleanup

- Collection and analysis overlap in broad `research.web`, `research.reddit` and `research.linkedin` defaults. Restrict collection to collection-capable roles and explicit task intent; analysis/evaluation/decision roles receive no broad browsing permission by default.
- Community Scout is explicitly collection-only; Customer Investigator is an existing reproducible analyst. Preserve their distinct outputs and permissions.
- `value-position-designer` is the canonical ID despite the display name Value Proposition Designer. Preserve the ID; add `value-proposition-designer` as an explicit normalized alias, never another agent.
- Experiment specialists and production specialists overlap on fake-door creation. Split task stages: experiment design/analysis use Actions; frontend implementation uses Jules. Identity never changes with runtime.
- Most roles have no explicit runtime field. The three explicit hints are Community Scout (`hermes-hf`, fallback Actions), Customer Investigator (Actions, fallback `hermes-hf`) and Reporter (Actions, frontend Jules). Hermes hints map to the existing `hermes_local` runtime; interactive work has no implicit Jules fallback.
- All 45 source approval policies require approval for external writes. Preserve and strengthen this: discovery/enrichment and contact/outreach have separate gates. Imported research methods never grant qualification writes.
- Reporter is an independent observer. Evaluation/decision/hypothesis methods should not echo CEO strategy. Persist specialist results immutably before CEO reflection.
- No nine-manager hierarchy is necessary. Reuse the existing company CEO; imported specialists report directly to it. Reporter is AVAILABLE with a configurable reporting schedule; other 44 definitions start DORMANT with no timer.
- Production means validation-only: no backend, auth/billing/database/inference or production deployment capabilities. Legacy FounderOS Product Engineer must be disabled for deliberately migrated companies, while preserving its history.
- Existing persona prose contains 43 quantity-oriented instruction lines. These are not imported as KPIs. All definitions use minimum-sufficient falsifiable output, decision relevance, provenance, limitations and information gain. Controlled experiments are optional when attribution warrants them.
- Many workflows are short generic hints (12 have two steps, validate-idea has seven). Preserve all 13 playbooks as source metadata, not unconditional executable pipelines. Every step must independently pass current gap, phase, WIP, evidence, scope, approval and runtime policy.

## Capabilities and field treatment

The eight source capabilities are provider/tool capabilities: research.web, research.hackernews, research.github, research.reddit, research.trends, research.linkedin, research.reality_check, artifact.generate. They are not a validation-need taxonomy. Add typed semantic capabilities and evidence-gap mappings as versioned data, retain source provider requirements separately, and expose transparent resolution reasons.

Imported fields: stable ID, display name, division, aliases, skills, source provider capabilities, logical Nodepad reads/candidate writes, approval/bias, runtime hints, normalized methodology, handoff hints, exact persona/skill/workflow source paths and content hashes, source repo/branch/SHA and importer version. Build a reviewed JSON representation from the pinned source; do not parse Markdown during task execution.

Normalized fields: success criteria, allowed task stages/phases, logical capability/gap contracts, analytical browsing restrictions, runtime preferences, validation-production boundary, independent-review status and lifecycle defaults. Company overrides may restrict/disable but cannot expand Nodepad authority or bypass human/approval gates.

Deferred: source provider implementations, live credentials, Explee, Juno, external simulation (INTEGRATION_PENDING), live outreach, deeper Reporter UI and intermediate managers. Import is not blocked by these external integrations.

## Compatibility and verification

Add company-scoped import/member/activation tables and native issue linkage. Keep existing native agent IDs, CEO identity, activity, heartbeat/session continuity, budgets and Nodepad integration. Import is explicit for an existing idea-validation company; it preserves local runtime credentials and records drift/removed roles instead of deleting history. New idea-validation programmes may seed the pinned inventory idempotently. Legacy companies retain existing bootstrap behavior.

Verify exact roster/alias/provenance and repeat imports against PostgreSQL; test phase, WIP, evidence/approval/runtime restrictions, Nodepad scopes, independent results and routes A–H. Prove a fixture golden slice with real native issues and injected runtimes. Run workspace typecheck/tests/build, migration regeneration, formatting and forbidden-token checks. Prior qualification claims are source context, not evidence of live activity in this environment.
