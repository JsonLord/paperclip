# Jules Callback Authentication, Context, and Native Promotion Review

Date: 2026-09-15

Scope: `adaptations_spec.md` sections 6–8 and the callback/context portions of sections 2–3.

## Executive result

The Jules callback namespace now uses a signed, short-lived capability tied to the exact persisted company, Paperclip run, remote Jules session, Agent, Goal, Project, Issue/outcome, allowed operation set, and capability version. Callback payload IDs cannot override this durable binding. Accepted callbacks promote organizational effects into native Paperclip Activity, Issue/comment, work-product, and Approval records; completion stops at `COMPLETED_UNVALIDATED`.

## Endpoints

- `POST /api/jules/v1/runs/:runId/capability` — board-only one-time issuance response.
- `POST /api/jules/v1/runs/:runId/capability/revoke` — board-only version rotation/revocation.
- `GET /api/jules/v1/runs/:runId/context` — requires `read_run_context`.
- `POST .../progress` — requires `report_progress`.
- `POST .../blockers` — requires `report_blocker`.
- `POST .../artifacts` — requires `report_artifact`.
- `POST .../proposals` — requires `propose_workstream`.
- `POST .../approvals` — requires `request_approval`.
- `POST .../complete` — requires `submit_completion_candidate`.

## Capability model

Claims contain `companyId`, `paperclipRunId`, `julesSessionId`, `agentId`, `goalId`, `projectId`, `issueId`, `outcomeId`, `allowedOperations`, `issuedAt`, `expiresAt`, `jti`, and a persisted capability version. Tokens use HMAC-SHA256 with `PAPERCLIP_JULES_CAPABILITY_SECRET`, falling back to the existing agent JWT secret. Verification checks signature, expiry, endpoint operation, every persisted binding, callback ID contradictions, run cancellation, terminal session writability, and token version.

The board can increment the session capability version to invalidate previously issued credentials. `ACCEPTED`, `ESCALATED`, `ORPHANED`, and `FAILED` sessions reject remote writes. Jules can request an Approval but cannot resolve one; callback payloads claiming `approved` or `rejected` are rejected.

## Credential delivery strategy

The current API-created Jules session interface does not provide a proven per-session remote environment-secret injection channel. Therefore this slice does not put `PAPERCLIP_RUN_TOKEN` in prompts, Git, Firm, Linear, logs, activities, PR descriptions, or adapter configuration. The capability issuance response identifies the expected environment variable for deployments that can inject it safely. GitHub outbox is the universal fallback.

## GitHub outbox fallback

The reconciler inspects only `.founderos/outbox/<persisted-paperclip-run-id>/` in the bound company repository and branch. It accepts `founderos.outbox/v1` JSON, verifies run/session and any supplied company/Agent/Goal/Project/Issue IDs, and promotes through the same idempotent callback service. It never requires a bearer credential in Git. GitHub access may use the server's runtime-only `GITHUB_TOKEN`; the token is never returned or logged.

Outbox completion is handled by the same completion-candidate path and cannot self-accept or self-approve. Malformed, cross-run, cross-session, or cross-company files are rejected. Repeated scans are safe because `(session_id, event_id)` is durable and unique.

## Authoritative context

The context response includes live run status; Company; Agent; Goal; Project; Issue/outcome; objective; input/output paths; acceptance and cannot-complete criteria; required skills and capabilities; resolved support-pack versions, paths, commits and quality gates; write scope; external-action policy; Linear metadata; pending/current approvals; work products; blockers; manager notes; repository/source/branch/base reference; explicit forbidden actions; and the authoritative persisted binding.

Paperclip live context is authoritative for organizational execution identity. GitHub/Firm remains canonical business/evidence memory. No callback can rewrite Goal, Project, Issue, Agent, or company identity from payload data.

## Native promotion rules

- Meaningful progress creates native Activity; command-count telemetry does not.
- Blockers set the bound native Issue to `blocked`, add an Agent-authored Issue comment, and create Activity with severity/governance metadata.
- Artifacts create native GitHub-backed issue work products containing references/provenance, not copied artifact bodies.
- Approval requests create native pending Approvals linked to the Issue.
- Proposals remain attached callback records plus manager-attention Activity and are not auto-instantiated as Goals/Projects/Issues.
- Completion stores submitted PR metadata, emits Activity/hook, and transitions only to `COMPLETED_UNVALIDATED`.

All effects happen only after the callback event wins its durable uniqueness insert. Duplicate progress, blocker, artifact, proposal, approval, and completion delivery creates no second native effect.

## Extension hooks

The callback service exposes `onMeaningfulProgress`, `onBlockerReported`, `onApprovalRequested`, `onArtifactReported`, `onWorkstreamProposed`, and `onCompletionCandidate`. These are deterministic post-commit emissions for the later validation/manager slice; no Hermes judgment is implemented here.

## Tests and results

Focused tests cover signature and expiry; company/run/session/Agent/organizational isolation; operation-level authorization; capability revocation version; contradictory payload IDs; real Express route enforcement; authoritative context; progress filtering; all six promotion types and duplicate delivery; native Activity/Issue/comment/work-product/Approval state; no self-approval; completion without acceptance; malformed/cross-binding outbox rejection; and repeated outbox application.

## Specification status

- §6 scoped callback authentication: **COMPLETE** for direct HTTP callback routes and persisted binding/revocation.
- §7 enriched run context: **COMPLETE** for the current native data model and installed support-pack metadata.
- §8 callback promotion semantics: **COMPLETE** for progress, blocker, artifact, proposal, approval request, and completion candidate.
- GitHub outbox fallback: **COMPLETE** for repository polling, binding validation, idempotency, and common promotion semantics.
- Direct secret delivery into API-created Jules runtime: **PARTIAL / environment-dependent**; no unsafe prompt delivery is used.

## Known limitations

- GitHub outbox polling reads the bound branch through GitHub's Contents API. Private repositories require a server-side runtime `GITHUB_TOKEN` until a per-company GitHub credential binding is introduced.
- Blocker resolution is not inferred from later progress; a later manager/operator flow must resolve blockers deliberately.
- Proposal acceptance/instantiation is reserved for the manager/human orchestration slice.
- Capability issuance is board/API driven because remote per-session environment injection is not proven by the current Jules API.

## Recommended next slice

Implement deterministic acceptance validation followed by the structured Hermes result-judgment interface. It should consume `onCompletionCandidate`, inspect the actual PR branch, enforce structural/Git/Firm/evidence/security/write-scope gates, persist validation results, and only then request an `ACCEPT`, `REVISE_SAME_SESSION`, `RETRY_NEW_SESSION`, `WAIT`, `ESCALATE`, or `FAIL_OUTCOME` manager verdict.
