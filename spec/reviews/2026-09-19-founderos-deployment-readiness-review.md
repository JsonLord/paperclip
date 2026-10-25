# FounderOS Deployment Readiness Review — 2026-09-19

## Deployment entry point

The Companies UI now exposes **Import FounderOS**. The operator supplies the GitHub company repository and a pinned FounderOS content commit. The existing company-import API inspects the repository, creates the company and membership, binds the repository, resolves a configured Jules profile/source, installs the versioned FounderOS context when GitHub credentials permit, and bootstraps native Paperclip state.

A normal blank-company creation remains intentionally generic; FounderOS state is installed through the explicit FounderOS import path so Paperclip does not silently impose the operating model on unrelated companies.

## Native state visible after import

Bootstrap creates one native company-level Vision Goal and the complete currently implemented Goal-template catalog beneath it. Each Goal stores its description, owner, required skills, support packs, capabilities, input/output paths, acceptance criteria, and completion blockers. The Goals UI now displays acceptance criteria, blockers, skills, capabilities, and support-pack versions rather than hiding those native fields.

Bootstrap also creates the Initial Venture Validation Project and evidence-baseline Issue linked to the native `validate-problem` Goal. Downstream Goals are visible as `planned`; they are not prematurely activated or treated as completed.

## Initial employees and execution readiness

The native organization contains a Hermes **Founder Manager** and ten Jules employees covering evidence, market/ICP, customer/value research, offer/demand experiments, commercial work, product/retention, engineering/reliability, finance, business-case compilation, and content/GTM/crowdfunding. Every registered Goal owner role resolves to one of these native Agents.

Each Jules employee is configured with the imported repository, resolved Jules source, default branch, and bootstrap outcome template. When a configured Jules profile exposes the repository, workers are created idle and the initial Issue may be dispatched through the existing heartbeat, capacity-broker, lease, and durable Jules-session path. If profile/source access is unavailable, workers are visibly paused with a readiness reason and the initial Issue is blocked; deployment does not pretend Jules is operational.

The server and UI registries both ship the `jules` adapter. A deployer must still configure a company secret-backed Jules profile whose source grants access to the imported repository. API credentials remain runtime-only and are not written into Agent configuration, artifacts, Firm files, or repository context.

## Release gates

Deployment-catalog validation rejects duplicate Goal IDs, missing acceptance criteria, missing owner roles, and dangling next-Goal hints. Tests verify that every registered Goal has a matching initial employee, bootstrap is idempotent, native IDs are retained, repository/source configuration reaches Jules Agents, unavailable Jules access pauses workers, and both Hermes and Jules adapters are registered.

The reusable Pitch Framework now uses the canonical `DOMAIN` support tier, restoring server type safety without weakening `SupportTier`.

## Operator checklist

1. Configure the deployment and board access normally.
2. Create a secret-backed Jules profile with the required capabilities.
3. Confirm the profile can list the intended GitHub repository as a Jules source.
4. Open **Companies → Import FounderOS**.
5. Enter `owner/repository` and the pinned FounderOS content commit.
6. After import, inspect **Goals** for native contracts, **Agents/Org** for Founder Manager and Jules employees, **Projects** for Initial Venture Validation, and **Issues** for the evidence baseline.
7. If employees are paused, repair Jules credential/source access before resuming them. Do not manually mark the blocked evidence Issue complete.

## Known environment limitation

The local embedded PostgreSQL development server cannot start as the container's root user, so a browser screenshot could not be captured in this environment. Server/UI typechecks and focused deployment tests validate the added surface and contracts.
