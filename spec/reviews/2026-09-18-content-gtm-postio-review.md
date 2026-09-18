# Content / GTM and Postio Review — 2026-09-18

## Gateway and inspected contract
Postio at `https://leon4gr45-postio.hf.space/api` is the default social publishing gateway; FounderOS does not implement LinkedIn OAuth or direct social clients. Inspection was attempted on 2026-09-18 through the available web client and direct requests to `/`, `/api`, `/openapi.json`, `/api/openapi.json`, `/docs`, and `/api/docs`. The web client returned 401 and the environment proxy returned 403, while no Postio source documentation was present locally. Consequently the real request/response contract, connected-account endpoints, scheduling, media, status, and analytics operations could not be verified. Transport is explicitly `BLOCKED_BY_API_CONTRACT`; live posting support is not claimed and no path or JSON body was guessed.

## Provider and account boundary
The typed `PostioPublisher` boundary defines capability discovery, safe connected-account discovery, preparation, validation, submission, status, and result operations. An injected verified implementation can satisfy it once the real API is available. Stored account state is limited to POSTIO provider account ID, platform, display name, capabilities, verification time, and status. Platform credentials and tokens never enter Paperclip tables or APIs.

## LinkedIn-first compiler
The `content.linkedin` pack compiles supported claims, ICP, evidence, current prototype capabilities, objectives, and real media into the flexible Hook → Problem → Insight → Prototype → Proof → Why it matters → CTA story. Initial objectives prioritize problem awareness, product education, prototype discovery, qualified feedback, and demand generation. Capability and media states prevent planned features or mockups being described as live. Unsupported superlatives, unresolved claims, and unauthorized customer media fail validation.

## Governance, lifecycle, and idempotency
The state model is DRAFT → CLAIM_VALIDATED → CREATIVE_REVIEWED → APPROVAL_REQUIRED → APPROVED → READY_FOR_POSTIO → POSTIO_SUBMITTED → PUBLISHED/FAILED, with SCHEDULED when supported. Only a native approved `external_action` approval permits submission; agents and the provider cannot self-approve. Provider acceptance maps to POSTIO_SUBMITTED, never PUBLISHED. FounderOS publication IDs are company-unique, and successful/submitted/scheduled records are returned on retry rather than reposted. Authorization, disconnected-account, invalid-content, and policy failures are not automatically retryable; diagnostics are bounded.

## Analytics and learning limitations
Publication activity records whether a terminal result should wake the campaign. Platform impressions, reactions, and clicks may be ingested only when a verified Postio contract exposes them and remain weaker than qualified visits, replies, bookings, signups, quotes, and commitments. Likes never validate the product. No analytics transport is claimed in this slice.

## Tests and unsupported operations
Tests mock/replace the external boundary and cover blocked contract behavior, LinkedIn story compilation, capability/media truth, unsupported claims, customer authorization, native approval, accepted-versus-published semantics, permanent/transient failure retry rules, and the lifecycle. Live account discovery, publication, scheduling, media upload, status polling, result lookup, and analytics remain unsupported until Postio publishes or exposes an inspectable authenticated contract.
