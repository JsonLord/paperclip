# Achieved-work review: FounderOS company bootstrap and company-local Firm

**Date:** 2026-09-15

## Scope implemented

- Removed automatic `42futures/firm` initialization from native company creation. Firm initialization now requires an explicit company repository binding and snapshots only metadata for that repository's `firm/*.firm` files at a pinned commit.
- Added durable, company-scoped repository bindings containing repository identity/ID, default branch, import ref/commit, workspace root, Firm path, and `.founderos` path.
- Added a GitHub repository inspector and non-destructive bootstrap writer. Missing structural files are written to a dedicated branch and pull request; existing files are not overwritten and no PR is auto-merged.
- Added `POST /api/companies/import/github`. It validates the repository, creates a native Company, resolves the repository through configured Jules profiles and runtime `secret_ref` credentials, persists the Jules Source/profile binding, inspects seeds, bootstraps native organization, and queues the first Issue through the existing heartbeat/Jules broker path only when ready.
- Added versioned, secret-free `.founderos` templates and a minimal core support manifest pinned to a supplied FounderOS-DEMO source commit.
- Added the company-local Firm layout and reusable schema vocabulary for hypotheses, claims, evidence, experiments, market/validation concepts, and sales relationships. Empty files explicitly contain no facts.
- Added idempotent native organization instantiation: company-level Vision Goal, four child validation Goals using native Goal Support fields, one visible Hermes Founder Manager, three visible Jules workers with `reportsTo`, a native validation Project, and a native evidence-first Issue.
- Missing overview, website seed, or Jules Source access produces a blocked native Issue/readiness result and prevents dispatch instead of fabricating content.
- Extended deterministic Firm acceptance data to represent `firm build before` and `firm build after`, both against the bound company repository.

## Files and schema

- `packages/db/src/schema/founderos_bootstrap.ts`: repository binding and bootstrap provenance/state.
- `server/src/services/founderos-bootstrap.ts`: templates, source resolution, idempotent native instantiation, support snapshots, readiness, and dispatch handoff.
- `server/src/services/founderos-github.ts`: GitHub inspection and bootstrap PR writer.
- `server/src/services/firm.ts`: company-local Firm cache semantics; no upstream default.
- `server/src/routes/companies.ts`: GitHub import entrypoint and removal of automatic upstream Firm initialization.
- Migration `0045_neat_maginty.sql` and Drizzle metadata.

## Idempotency and restart behavior

The unique repository binding per company and unique company/context-version bootstrap record preserve the original native IDs. Retrying bootstrap returns the persisted Vision/Goal/Agent/Project/Issue IDs. Repository context upgrades require a new explicit version/source commit rather than startup mutation. Existing repository files are excluded from the proposed patch.

## Tests

Focused tests cover versioned secret-free templates, Firm schema concepts, preservation of existing content, prohibition of upstream Firm initialization, native hierarchy relationships, idempotent repeated bootstrap, and blocked readiness for missing seeds/source access. Existing deterministic validation tests cover required Firm failure as a hard blocker.

## `adaptations_spec.md` status

- §12 Firm architecture: **COMPLETE for canonical binding/cache behavior; PARTIAL for CLI execution**. Company repositories are canonical and upstream Firm is no longer a default. A production Firm CLI runner still needs packaging/profile verification.
- §13 GitHub import/bootstrap: **COMPLETE for the primary runtime path covered here**. The route creates native objects, discovers Jules Source access, and queues through heartbeat/broker only when ready.
- §14 `.founderos` bootstrap: **COMPLETE for v1 structural context and explicit PR installation**. Future context upgrades require a version bump and migration policy.
- §15 resource-pack infrastructure: **PARTIAL**. Existing resource-pack snapshots install only four minimal core manifests; full content is intentionally excluded.
- §16 Goal Support Resolver: **COMPLETE for bootstrap Goals**. Runtime native Goal IDs carry support fields consumed by the existing resolver.
- §17 FounderOS-DEMO migration: **PARTIAL**. The source repository/commit contract is pinned, but full content migration and adapter normalization are future work.

## Known limitations

- Private GitHub import and bootstrap PR creation require `GITHUB_TOKEN`; without it, public inspection can work but missing structural files remain reported as drift rather than being silently written.
- Source discovery currently stops at the first accessible eligible profile/source match; normal broker selection still independently enforces complete capacity and capability policy at dispatch.
- The Firm CLI/tool distribution and exact Firm DSL compiler version remain external. The workspace contract and validation boundary are ready, but this slice does not vendor `42futures/firm`.
- The bootstrap schema files are minimal representational contracts, not the later business-methodology content library.

## Recommended next slice

Package and verify the Firm CLI in Jules profiles, implement a pinned Firm schema/compiler compatibility check, and add repository-backed integration tests that execute `firm build` before and after a bootstrap PR. Then implement the first richer evidence-discipline resource pack without expanding into pitch, Kickstarter, social, or sales systems.
