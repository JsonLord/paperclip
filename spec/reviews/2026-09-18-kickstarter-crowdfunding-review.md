# Kickstarter / Crowdfunding Review — 2026-09-18

## Completed behavior

FounderOS registers **Kickstarter / Crowdfunding** as a native Paperclip Project with the Goals Prepare Case, Build Campaign, Prepare Prelaunch, Produce Assets, Prepare Launch Content, Launch, Measure, and Optimize. The reusable pack depends on the Pitch Framework, Content & Distribution, and GTM Campaigns; normal native Project, Goal, Issue, Approval, Activity, and Work Product state remains authoritative.

Suitability does not assume crowdfunding is appropriate. It evaluates fit, audience, demonstrable product, story, rewards, fulfillment, economics, capital need, readiness, and proof. Campaign economics reconcile the funding target to capital need, production, fulfillment, fees, marketing, and contingency. Unknown inputs, non-positive reward contribution, unknown capacity, and unsupported dates fail rather than being invented.

Compilation produces the case, economics, reward tiers, story/page, claim map, video, shot list, FAQ, risks, prelaunch, email/social sequences, and readiness artifacts under `campaign/kickstarter/`. Claims preserve evidence, maturity, allowed language, capability status, privacy, and freshness. Planned functionality and mockups cannot be presented as live.

Postio remains `BLOCKED_BY_API_CONTRACT`, so social stops at `READY_FOR_POSTIO`; email stops at `READY_FOR_SEND` without a verified provider. Launch is an approval-gated `MANUAL_EXTERNAL_ACTION` / `PLATFORM_BLOCKED` operation with an immutable version/fingerprint snapshot. No Kickstarter API is invented.

Only verified source-bearing campaign events are accepted. Interest, pledge intent, pledge creation, and received revenue remain distinct. Attribution remains `ATTRIBUTED`, `ASSISTED`, or `UNKNOWN`. Only a verified external launch may enter restart-safe `WAITING_FOR_MARKET`, with `julesPolling:false`.

Fulfillment stress testing covers reward mix, provisioning, support, compute/API capacity, dependencies, backer volume, cancellations, and spend. Readiness assesses case, economics, story, rewards, product proof, video, FAQ, risks, prelaunch audience, content, fulfillment, platform, and analytics.

## Persistence and tests

Campaign snapshots and events are company-scoped. Deterministic source fingerprints make compilation idempotent, and event IDs are company-unique. Focused tests cover suitability, provenance, reward safety, planned/mockup truth, Pitch and Content/GTM reuse, provider-blocked semantics, pledge distinctions, fulfillment, privacy, staleness, native mappings, and event-driven waiting.

## Limitations

There is no verified Kickstarter API, automatic launch, account management, pledge polling, or platform analytics transport. Fees, taxes, shipping, production capacity, delivery dates, refunds, and current platform rules remain unknown until supported by current evidence.
