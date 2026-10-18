# Typed Nodepad evidence contract v1

Base: `de4df095d8d9d785acd7bff6046d7ba3c01c9fcc`.
Branch: `codex/nodepad-evidence-contract-v1-8270622338848593962`.

The previous remote head `f6ebb2047c17f5d3d9e141b67c788c9dbf426ee6` has no contract implementation relative to the requested base: its changes are reports, package metadata and lockfile edits. It is retained locally as `archive/nodepad-evidence-contract-before-rebuild-f6ebb204`. This rebuild starts at the exact requested base and replaces that branch using an exact force-with-lease. It does not merge or modify the Actions/Jules qualification work.

## Contract

`packages/shared/src/validation.ts` exports a strict Zod discriminated union over `type` with six independently typed variants:

| Candidate type | Required type-specific payload | Provider operation | HTTP bridge suffix |
| --- | --- | --- | --- |
| `evidence_submission` | source reference, SHA-256 content hash, pipeline run reference | `submitEvidence` | `/evidence` |
| `research_gap` | question and source references | `proposeResearchGap` | `/research-gaps` |
| `hypothesis_proposal` | statement and source references | `proposeHypothesis` | `/hypotheses` |
| `counter_hypothesis` | statement and source references | `proposeCounterHypothesis` | `/counter-hypotheses` |
| `experiment_spec` | question, behavioral metric, stop condition, source references | `proposeExperiment` | `/experiments/specifications` |
| `experiment_result` | experiment ID, source reference, content hash, pipeline run reference | `submitExperimentResult` | `/experiments/results` |

All candidates require idempotency key, canonical hypothesis reference and summary. Untagged legacy evidence is rejected rather than guessed. Qualification, confidence, band, status, arbitrary endpoint and operation fields are rejected by strict schemas. The exported extracted types constrain each provider method's candidate argument at compile time.

The generic provider `submitCandidate` and `candidateContract` flag are removed. An exhaustive switch dispatches each validated discriminant to exactly its corresponding required provider operation. Missing operations return `READY_CONFIG`; HTTP errors and redirects never trigger an alternative write. A direct untyped call to the wrong provider operation also fails before HTTP.

These paths define Paperclip's explicit HTTP bridge contract. They are **not** a claim of verified vendor endpoint availability. Existing Nodepad projection reads, real-provider qualification, Actions and Jules qualification remain outside this change.

## Authorization and provenance

The submission service passes `candidate.type` to the existing workforce authorizer, requiring the exact corresponding grant, current active specialist assignment, unchanged typed intent, current programme phase and matching canonical hypothesis. A grant for one candidate type does not authorize any other type. Non-specialist actors must be the company's programme CEO or a founder established by the server's authenticated board actor; a client body cannot confer founder authority.

The HTTP bridge validates both candidate type and input company/workspace against the binding. It transmits the complete typed candidate, including source, content hash, pipeline reference and hypothesis linkage, without translating evidence to a hypothesis statement. Responses require a typed receipt with company/workspace identity, checked at both bridge and service boundaries. Credentials remain server-side. Provider idempotency keys remain company-scoped; reuse for a different candidate or type conflicts. Existing untagged records are not silently reinterpreted.

Projection refresh marks a receipt accepted only for `evidence_submission`; another candidate's ID appearing in the evidence projection does not convert that candidate into accepted evidence. Submission itself never mutates canonical qualification.

## Verification

- `nodepad-evidence-contract.test.ts`: all six strict schemas; missing/unknown types; missing provenance; canonical-field injection; all six HTTP routes and exact payloads; evidence rejection at HTTP 404/405/422/500/503 with no fallback; missing evidence operation with no hypothesis call; wrong-operation smuggling; input/response company isolation; redirect refusal.
- PostgreSQL integration: a 6×6 authorization matrix grants each operation independently and rejects the other five; an authorized evidence submission travels through the actual service and HTTP bridge only to `/evidence`; per-type acceptance and cross-type idempotency are verified; existing scoped/legacy and golden-slice checks remain passing.
- Focused contract/validation suite: **81 passed**.
- Full workspace tests: **874 passed, 1 skipped, 142 files**. Workspace typecheck/build, token policy, formatting and whitespace checks pass. Fetched remote HEAD is reported in the delivery message.
- No schema migration or dependency change is needed.

After pushing, fetch the exact branch, compare its HEAD with both the local commit and `git ls-remote`, then inspect the fetched blobs for the discriminated union, six provider methods, `candidate.type` authorization and evidence routing tests. Compare blob IDs to the tested local files. Check the fetched diff from the base contains no Actions/Jules qualification files. `REMOTE_CODE_GATE_PASS` means these code conditions and remote visibility were verified; it does not mean live Nodepad or runtime qualification passed.
