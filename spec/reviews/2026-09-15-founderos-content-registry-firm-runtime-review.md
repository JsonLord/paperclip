# Achieved-work review: FounderOS content registry, native goal instantiation, and Firm CLI runtime

**Date:** 2026-09-15

## Exact scope

- Added a pinned content-source descriptor (`repository`, `ref`, `commit`, package root, registry/content versions) and durable company registrations.
- Added a strict machine-readable registry contract retaining systems, goal templates, skills, resource packs, Firm schemas, content versions, and migration provenance as distinct concepts.
- Registry validation rejects duplicate IDs, invalid goal contracts, unknown systems, missing skills/resources, missing system goals, source-commit mismatch, missing dependencies, and cyclic resource dependencies.
- Added template-to-native-Goal instantiation. Native Goals receive owner, support packs, skills, capabilities, inputs, outputs, acceptance criteria, and cannot-complete gates; a provenance record points to the native Goal rather than replacing it.
- Added system activation as native Project creation and native Project-Goal linkage, plus native Issue creation/reuse for active work.
- Added company-repository support installation with dependency ordering, tier preservation (`CORE`, `DOMAIN`, `GOAL_SPECIFIC`), SHA-256 file inventory, source/version/commit provenance, idempotency, explicit upgrades, and refusal to overwrite local drift.
- Extended Goal Support Resolver output with content/template provenance, write scope, external-action policy, and Firm before/after contract while continuing to resolve only referenced packs.
- Added a real process-based Firm CLI runtime: configured executable discovery, version capture, company `<repository>/firm/` build cwd, before/after phase, exit code, bounded redacted diagnostics, and deterministic validator adapter.
- Added a representative offline cross-repository fixture with the expected tree, all requested system identifiers, the four proving goal templates, four proving packs, Firm schema reference, and explicit `claude_local -> Hermes/Jules` migration provenance.

## FounderOS-DEMO PR #4 inspection

Direct inspection was attempted with web search and `git ls-remote` for `JsonLord/FounderOS-DEMO` PR #4. This environment returned web authorization failure and a network proxy 403, so no claim is made that remote PR content was copied or verified byte-for-byte. The fixture records PR #4 provenance and models the user-supplied inventory, but it deliberately contains only testing methodology stubs rather than recreating that substantial content.

Before production, PR #4 must be fetched and normalized into `company-package/` without rewriting validated methodology. The following migration audit remains required:

- map the existing validation agents and business systems to registry entries;
- preserve BPW/transcript/source provenance as methodology, never evidence;
- enumerate content reused unchanged versus path/manifest normalization;
- remove or explicitly map remaining `claude_local` runtime references;
- identify missing manifests, goal contracts, pack dependencies, and quality gates;
- merge or pin an immutable commit that production can install.

## First proving content contracts

The fixture proves:

- Goals: `assess-venture-thesis`, `analyze-market`, `validate-problem`, `define-initial-icp`.
- Packs: `core.evidence-discipline`, `validation.venture-thesis`, `market-analysis.core`, `customer-discovery.core`.
- Systems: Venture/Market Intelligence, Customer Discovery, Offer, Business Model, Prospecting, Sales Second Brain, Fake Door, Content/Distribution, Campaign, Search Demand, Financial Case, Business Planning, Pitch, and Red Team.

These are registry/runtime fixtures, not duplicated production methodology.

## Runtime and persistence

Migration `0046_graceful_morg.sql` adds:

- `founderos_content_sources` for pinned source registrations;
- `goal_template_instances` for immutable provenance attached to native Goals;
- `founderos_system_activations` for provenance attached to native Projects.

Resource installation continues using native `resource_pack_snapshots`; file hashes, dependencies, compatibility, and installation PR/commit live in the versioned manifest. Business artifacts/evidence remain in the company repository and Firm.

## Tests executed

Focused tests cover all required registry rejection cases, provenance retention, native Goal creation/reuse, exact support fields, hashed/idempotent pack installation, local drift refusal, Firm CLI target/version/success/failure/before-after phase, and diagnostic redaction.

## `adaptations_spec.md` status

- Content-source/registry contract: **COMPLETE** at runtime/schema level; production PR #4 normalization remains **PARTIAL** because remote inspection was unavailable.
- Goal template -> native Goal and system -> native Project: **COMPLETE** for service paths and idempotent provenance.
- Resource-pack installation/resolution: **COMPLETE** for tiered selection, hashing, drift, explicit upgrades, and minimal bundle resolution; the large production pack library remains intentionally **PARTIAL**.
- Firm CLI runtime: **COMPLETE** for execution, targeting, redaction, versions, and validator integration boundary. Deployment must configure/install a compatible CLI executable.
- Full goal flow: **PARTIAL**. Content resolution and native instantiation exist, while a repository-backed end-to-end Jules execution using actual PR #4 content requires that immutable content commit and configured external services.

## Known limitations

- Registry format is JSON (`registry.json`), an allowed machine-readable equivalent chosen to avoid adding an unreviewed YAML parser dependency.
- Goal template provenance uses a dedicated attachment table, not a shadow Goal state machine; native Goal remains authoritative.
- The Firm runtime does not install arbitrary binaries at execution time. Operators/images must supply a pinned `FIRM_CLI_PATH` or `firm` on PATH.
- Firm entity extraction is not implemented; build success and diagnostics are captured, while richer compiler output mapping requires the selected Firm CLI's stable output contract.

## Recommended next slice

Fetch and pin the mergeable FounderOS-DEMO PR #4 commit in a network-enabled environment, create its production `company-package/registry.json` and manifests without altering methodology prose, publish a compatible Firm CLI image/version contract, then run the repository-backed `validate-problem` acceptance scenario through broker, Jules, Firm before/after validation, Hermes judgment, and native Goal/Issue completion.
