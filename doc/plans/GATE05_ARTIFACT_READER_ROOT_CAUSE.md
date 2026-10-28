# GATE 05-R — Artifact-Reader Root Cause (Agent 2 / Engineering)

Symptom (Agent 1): after a GENUINE Ethnographic Researcher Jules run **succeeded**,
the supervisor reported `ARTIFACT_READER_FAILED`; a manually registered dummy
Paperclip document nevertheless **passed registration**. Confirms registration and
provider-artifact retrieval are separate paths.

## Where the failure is raised
`scripts/agency_supervisor/controller.py` reconcile():
- `if not self.artifact_reader:` -> finding `ARTIFACT_READER_UNAVAILABLE`
- `try: product = self.artifact_reader(act) except Exception:` -> finding `ARTIFACT_READER_FAILED`
  (a bare `except Exception` masks the real cause).

## What the reader actually does
`scripts/agency_supervisor/artifacts.py: read_product(activation, cache)` is wired as the
artifact_reader (`agency-supervisor.py:87  lambda a: read_product(a, args.cache)`).
It performs provider retrieval itself using **NO GitHub credential at all**:
1. `git clone --bare --single-branch https://github.com/<repo>.git` (anonymous HTTPS).
2. `git fetch origin refs/pull/<N>/head:refs/qualification/pr-<N>` (anonymous).
3. `urllib` `GET https://api.github.com/repos/<repo>/pulls/<N>` with **no Authorization header**.
It also `require`s a strict PR-URL regex on `activation.pullRequestUrl`.

## Root cause (primary)
The qualification repository `JsonLord/aux-company` is **private**. Anonymous `git clone`
raises (stderr discarded -> CalledProcessError) and the unauthenticated PR API returns
404. Both are inside `read_product`, so ANY exception -> controller -> `ARTIFACT_READER_FAILED`.
The provider execution succeeded and a real PR/branch exists, but the retrieval path never
carries the GitHub authorization that Paperclip ALREADY holds server-side. Information is
lost at the execution->retrieval boundary — a **credential-boundary defect**, not a
provenance/registration defect.

## Root cause (secondary)
`read_product` conflates artifact form with presence: the PR-URL regex `require` plus
`validation.validate` `requirePR` default True means a genuine session that committed to a
branch WITHOUT opening a PR hard-fails (`PR_REPOSITORY_MISMATCH` from a None regex match, then
`PR_MISSING`). Provider outputs may be commits/branches, not only open PRs.

## Evidence the server already has the correct pattern
- `server/src/services/jules-outbox.ts` uses `options.githubToken ?? process.env.GITHUB_TOKEN`,
  resolves the PR head via authenticated `api.github.com/repos/<repo>/pulls/<n>`, then reads
  file contents via authenticated `api.github.com/repos/<repo>/contents/<path>?ref=<head>`
  (and `download_url`). This is the documented, authorized retrieval the supervisor lacks.
- `packages/adapters/jules/src/server/github.ts:testGitHubConnection` also takes a token.
- `server/src/routes/supervisor.ts` exposes the real read-only contract
  `GET /api/companies/:companyId/jules/sessions` (assertBoard + assertCompanyAccess + paging
  + status filter) returning `pullRequestUrl, paperclipRunId, julesSessionId,
  completionCandidate, status, startedAt, finishedAt`. (The stale memory's
  `/api/jules/sessions` is not the real path.)

## Correct boundary for the fix (E3)
The supervisor CLI MUST NOT hold a GitHub secret (E5: no new secret storage / no token in CLI).
The already-authorized GitHub credential lives in the SERVER. Therefore:
- Add a read-only, board-authenticated, company-scoped endpoint that, using the server's
  existing GitHub token, discovers/retrieves/verifies the real Jules artifact (immutable head
  SHA, repository, branch, changed paths, content or content-hash) and returns a provenance
  envelope with SEPARATE flags.
- Rewrite `read_product` to call that authenticated native endpoint via `AdminTokenApi`
  instead of anonymous git; drop anonymous clone/fetch/API.
- Split the controller success flag into: executionSucceeded, artifactRetrieved,
  artifactValidated, workProductRegistered, accepted (E4). Never collapse to one flag.
- `validation.validate` keeps failing closed on provenance; add classification so a manual
  document is `API_REGISTRATION_ONLY` and never `PROVIDER_ARTIFACT_VERIFIED`/`E2E_ACCEPTED` (E6).
- Where retrieval is impossible (private repo without server credential, missing session id,
  GitHub rejected) return a STRUCTURED, recoverable failure — never synthesize or placeholder.

## Not assumed
A successful remote session does NOT guarantee a usable artifact. Historical sessions may be
reconciled without creating new remote sessions. Registration success is not acceptance.
