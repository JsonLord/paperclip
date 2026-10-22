# Validation workforce port assessment

Agency Supervisor v1 starts from `559a18c`. The later validation/runtime lineage
at `6dae39b` was inspected selectively, including workforce routing, lifecycle,
scheduler, control, metrics and validation task policy. It is not merged.

| Capability | Decision | Reason / boundary |
| --- | --- | --- |
| Deterministic skills/capability routing | ALREADY_COVERED | Current selector uses the existing 45 canonical identities and explains exclusions. |
| Activation leases, bounded concurrency, collision prevention | ALREADY_COVERED | Revisioned native document reservations plus native repository leases; ambiguity retains capacity. |
| Playbook/workflow dependencies | REIMPLEMENT_SIMPLER | Persist pinned catalog definitions and require PASS before explicit sequential advance. No scheduler fanout. |
| Metrics | PORT later | Add read-only counts from native runs/products and supervisor journal. The inspected implementation joins workforce tables and Nodepad snapshots that this deployment does not own. |
| Founder statements / decision requests | PORT later | Preserve explicit board approval and company scope; use native issues/documents before introducing another state model. |
| Validation cycles / autonomous scheduling | DEFER | First qualify one bounded synthetic chain; v1 remains MANUAL. |
| Typed Nodepad operations | DEFER | Separate canonical authority. Preserve the verified discriminated contract in its lineage; synthetic output is never accepted evidence. |
| GitHub Actions runtime | DEFER | Independent runtime qualification and default-branch workflow discovery requirements. |
| Engineering / commercial boundary | ALREADY_COVERED | Selection rejects engineering and external actions before assignment, resume or wake. Native budgets/approvals remain authoritative. |
| Workforce boot roster seeding | DROP | The live roster already contains 45 unique canonical roles. Reimport/seeding risks duplicates and bootstrap drift. |
| Parallel workforce tables, endpoints and migrations | DROP for v1 | Existing issue documents, heartbeat runs, activity and work products are sufficient and already backed up. |

Port individual behavior with tests. Do not copy the divergent branch wholesale,
replace native agent identities, or attach canonical evidence semantics to provider
completion. Artifact PASS means the bounded synthetic artifact passed validation;
it does not mean a business hypothesis is supported.
