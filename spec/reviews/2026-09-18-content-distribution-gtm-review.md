# Content & Distribution / GTM Runtime Review — 2026-09-18

## Completed foundation and native mapping
The prior slice established the typed Postio gateway, safe account/publication records, LinkedIn evidence compiler, native approval, idempotency, and truthful `BLOCKED_BY_API_CONTRACT`. This slice adds native **Content & Distribution** and **GTM Campaigns** Projects and registered Goals from strategy definition through package production, creative/approval/publishing preparation, real demand measurement, learning synthesis, and versioned strategy updates. Goals are selected incrementally rather than instantiated as a hidden parallel tracker.

## Strategy, pillars, atoms, and messages
Versioned content strategy retains ICP/audience, business and content objectives, evidence-backed pillars, proof/prototype/problem/founder-learning themes, CTA hierarchy, channel maturity, claim policy, voice, cadence, measurement, and privacy. GTM strategy preserves buyer/user distinctions through its source contract, real channel evidence, conversion events, Sales Second Brain handoff, and economic constraints. Durable content atoms reference claims/evidence with maturity, allowed language, privacy, and freshness; they do not duplicate business truth. Campaign message maps provide the reusable audience/problem/outcome/alternative/insight/value/proof/objection/capability/CTA layer needed later by Kickstarter.

## Campaigns, LinkedIn, packages, and calendar
Campaign contracts require a business-learning objective, audience/segment/offer hypotheses, selected channel and formats, CTA, immutable pre-result sample and thresholds, stop/decision rules, budget, external actions, and approvals. Post-count objectives fail. LinkedIn remains the deepest channel using `content.linkedin`; product and media claims continue to reconcile to the registered MVP. Derived campaign packages, strategy views, content calendar, results, and message/channel learning never replace native Issues or raw evidence. Capability changes use the existing staleness ledger.

The minimum pack set is `content.core`, `content.linkedin`, `content.email`, `content.reddit`, and `gtm.campaign-core`. Email is semantic-only and remains READY_FOR_SEND without a connector. Reddit requires verified community permission before promotion. No direct network client was added.

## Analytics, waiting, and learning
Campaign events are idempotent and retain campaign/content/channel/variant, timestamp, source, provider publication ID, pseudonymous subject reference, qualification, ATTRIBUTED/ASSISTED/UNKNOWN state, and metadata. The deterministic hierarchy separates impressions/reactions from qualified visits, replies, signups, bookings, quotes, commitments, and payments. High likes with no qualified action remain weak; low reach with qualified meetings is stronger. Qualified commercial events are explicitly handed to the existing Sales Second Brain rather than a marketing-lead database.

Only actually PUBLISHED campaigns may enter restart-safe `WAITING_FOR_MARKET`; READY_FOR_POSTIO cannot pretend to be exposed. Wake conditions are events, thresholds, deadline, commercial action, or operator resume, with `julesPolling:false`. Decisions are bounded to scale, continue, iterate, refine, stop, or gather data—never viral/PMF claims.

## Adapters, blocked actions, tests, and next phase
The real adapters currently present are source-neutral production event ingestion with Tinybird-compatible source labels, manual/campaign event ingestion, landing-page/demand events, customer-value events, and commercial/Sales Second Brain records. Tinybird is not a configured live client. Postio publication/account/status/analytics transport remains blocked, as do email send and unverified Reddit promotion. Native approvals still govern all external action.

Focused tests cover native mappings, canonical packs, strategy/package outputs, learning objectives, threshold timing, vanity protection, qualified-signal strength, and derived learning/calendar views. Existing Postio tests cover approval, provider blocking, idempotency semantics, capability truth, and failures. Exact next phase: **Kickstarter / Crowdfunding**, consuming this message/campaign/content/approval/analytics foundation without implementing it here.
