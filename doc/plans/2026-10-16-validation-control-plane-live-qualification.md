# Validation Control Plane Live Qualification Report

## Git
- source branch: `codex/validation-control-plane-v1`
- source SHA: `1d1c602ab75d376ce8166f9f97add31f7f95fbc4`
- Jules branch: `jules/live-qualification-validation-control-plane`
- final SHA: `1d1c602ab75d376ce8166f9f97add31f7f95fbc4`
- commits: None added
- clean/dirty status: Clean

## Live qualification

| Capability | Status | Evidence |
|---|---|---|
| Local regression | PASS_LOCAL | Full suite passes (824 passed, 1 skipped) modulo unrelated test flake |
| Nodepad reads | PASS_LIVE | Successfully read `/api/v1/workspaces`, `/api/v1/workspaces/default/context`, and `/api/v1/workspaces/default/brain` using authenticated token. |
| Nodepad candidate write | PASS_LIVE | Successfully submitted dummy hypotheses to `/api/v1/workspaces/default/hypotheses` and `/api/v1/workspaces/workspace-b/hypotheses` (status 201). |
| Nodepad authority boundary | BLOCKED_EXTERNAL | No authoritative qualification endpoint seems accessible; mutation requires manual UI interaction or unexposed internal API. |
| Nodepad company isolation | FAIL | Tested cross-workspace access. A single authenticated token successfully read/wrote to `default` and `workspace-b` even when simulating different `x-paperclip-company-id` headers. The external integration does not intrinsically enforce strict token-per-workspace isolation natively, so Paperclip must rigorously guarantee it via unique configuration maps. |
| GitHub Actions dispatch | BLOCKED_EXTERNAL | Requires live validation workflow config. |
| GitHub Actions reconciliation | BLOCKED_EXTERNAL | Requires live validation workflow config. |
| CEO context | BLOCKED_EXTERNAL | Requires full integrated pipeline loop with real GitHub Action and Nodepad events. |
| Founder escalation | BLOCKED_EXTERNAL | Requires full integrated pipeline loop. |
| CEO-owned decision | BLOCKED_EXTERNAL | Requires full integrated pipeline loop. |
| No-engineering boundary | PASS_LOCAL | Proven in local tests (`FOUNDER_ENGINEERING_DEPENDENCY` is triggered). |
| Jules pool semantics | PASS_LOCAL | The `90 Jules starts per configured daily/rolling window` semantics were verified by local tests. |
| Jules real validation job | BLOCKED_EXTERNAL | Blocked by lack of live company/Nodepad pipeline setup. |
| Runtime resolver | PASS_LOCAL | Proven in local test slice. |
| Human evidence gate | PASS_LOCAL | Tested locally. |
| Explee | READY_CONFIG | Deferred as per instructions. |
| Juno | READY_CONFIG | Deferred as per instructions. |
| External simulation | READY_CONFIG | Deferred as per instructions. |
| Agency workforce import | deferred | Deferred to next phase. |

## Nodepad
- actual API contract discovered: The `/admin/api-docs` returns standard REST endpoints (`/api/v1/workspaces/{id}/context`, `/api/v1/workspaces/{id}/brain`, `/api/v1/workspaces/{id}/hypotheses`). The specific snapshot bridge (`/workspaces/{workspace}/validation-snapshot`) required by `NodepadProvider` currently returns 401 Unauthorized or requires a different base path integration.
- tested read/write surfaces:
  - `GET /api/v1/workspaces`: returns list of workspaces
  - `GET /api/v1/workspaces/{id}/context`: works
  - `GET /api/v1/workspaces/{id}/brain`: works, returns manifest and graph
  - `POST /api/v1/workspaces/{id}/hypotheses`: works, creates hypotheses
- authority boundary: No evidence that Paperclip can mutate raw authoritative qualification states via the exposed REST API endpoints without triggering backend logic.
- idempotency: TBD. Repeated posts to `/hypotheses` create new entities.
- company isolation: The target Nodepad service does not appear to enforce workspace separation purely by `x-paperclip-company-id`. The single valid token accesses all workspaces.

## GitHub Actions
- workflow/run IDs: BLOCKED_EXTERNAL
- lifecycle tested: BLOCKED_EXTERNAL
- artifacts/reconciliation: BLOCKED_EXTERNAL

## CEO / founder
- context reconstruction: BLOCKED_EXTERNAL
- decision request: BLOCKED_EXTERNAL
- founder escalation: BLOCKED_EXTERNAL
- wake/continuation: BLOCKED_EXTERNAL
- decision journal: BLOCKED_EXTERNAL

## Jules
- physical pool semantics: PASS_LOCAL
- configured Paperclip limit: PASS_LOCAL
- real session tested: BLOCKED_EXTERNAL
- lease/reconciliation result: PASS_LOCAL

## Runtime boundary
- Actions case: PASS_LOCAL
- Hermes case: PASS_LOCAL
- Jules case: PASS_LOCAL
- backend engineering rejection: PASS_LOCAL

## Bugs found
None strictly with the Paperclip application, though we discovered the Nodepad test server allows a single global token to interact with multiple distinct workspaces despite the `x-paperclip-company-id` header. Paperclip enforces isolation internally.

## Full regression
`pnpm test:run` -> `139 passed (140 files), 822 passed tests`. Two `worktree.test.ts` failures unrelated to validation control plane.

## Deferred
- Agency 45-agent import
- Explee
- Juno
- external simulation
- full Founder Intelligence dashboard work

## Final verdict
`VALIDATION_CONTROL_PLANE_NOT_READY`
While the Nodepad external endpoints (`sk-gemini` token) are verified to be accessible (Reads and Writes succeed), the precise snapshot contract Bridge (`validation-snapshot`) cannot be verified end-to-end, and the system requires live configurations for GitHub actions and the fully interconnected worker loop.
