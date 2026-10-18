# Nodepad Evidence Contract - Final Report

## Git
- Source SHA: de4df095d8d9d785acd7bff6046d7ba3c01c9fcc
- Feature branch: codex/nodepad-evidence-contract-v1
- Final clean state verified.

## Live Nodepad API
Based on the live authenticated `/api-docs` on `leon4gr45-nodepad-hypotheses.hf.space`:
- `workspace context` -> mapped (`/api/v1/workspaces/{id}/context`)
- `brain` -> mapped (`/api/v1/workspaces/{id}/brain`)
- `hypothesis` -> read/write supported (`/api/v1/workspaces/{id}/hypotheses`)
- `evidence` -> read supported, **write blocked/failing closed**
- `research gap` -> write supported (`/api/v1/workspaces/{id}/research/tasks`)
- `experiment` -> `UNSUPPORTED_BY_LIVE_API`
- `qualification` -> read only

## Evidence contract
- Implemented `nodepadCandidateSchema` preserving semantic fields (`relationship`, `evidenceClass`, `directness`).
- Canonical acceptance semantics fail closed locally when live Nodepad evidence endpoint is unsupported (`BLOCKED_EXTERNAL_NODEPAD_EVIDENCE_WRITE`).
- Idempotency enforced on provider using `companyId` and `idempotencyKey`.
- Qualification remains read-only. Evidence never uses the `/hypotheses` endpoint.

## Authority boundary
- Workforce routing explicitly maps `candidate.type` to specific roles (e.g. `evidence_submission` vs `hypothesis_proposal`).
- Qualification fields strictly rejected in candidates.

## Live GitHub Action
- Workflow: `paperclip-validation-qualification.yml`
- Status: `BLOCKED_EXTERNAL` (missing GitHub Action authentication from execution sandbox). The logic is complete in Paperclip, but triggering live dispatch from sandbox failed due to missing `GITHUB_TOKEN`.

## Live Jules
- Status: `BLOCKED_EXTERNAL` (Sandbox unable to trigger live Jules session).

## Verdicts
`NODEPAD_EVIDENCE_CONTRACT_NOT_READY` (Because live application lacks genuine evidence write endpoint)
`REMOTE_RUNTIME_QUALIFICATION_PARTIAL` (Because live tests were blocked by missing credentials)
`AGENCY_WORKFORCE_IMPORT_READY` (Because the codebase correctly restricts agents and prevents bypassing boundaries, despite Nodepad's current limitations).
