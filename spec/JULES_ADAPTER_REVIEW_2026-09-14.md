# Jules Adapter REST Contract Review

Date: 2026-09-14

Scope: `adaptations_spec.md` sections 2.1–2.4 (native Jules REST adapter corrections)

## Executive result

This change completes the adapter-local portion of the P0 REST contract correction:

- create-session requests now use the documented `sourceContext.source` and `githubRepoContext.startingBranch` shape, without placing Paperclip's repository metadata in the Jules payload;
- the outcome contract's plan-approval requirement is sent to Jules;
- source, session, and activity listing operations are available for later broker and reconciliation services;
- pull-request metadata is read only from `session.outputs[].pullRequest`;
- activity and remote-update metadata are included in the adapter result; and
- a live, nonterminal session is explicitly reported as remotely active and is never represented as a completion candidate.

The adapter still treats a successful remote-session creation as a successful local dispatch. This follows `adaptations_spec.md` section 3: dispatch completion is distinct from business-outcome completion. The result retains `completionCandidate=false` and `accepted=false` until Jules reports `COMPLETED`.

## Implemented details

### Request correctness

`JulesApiClient.createSession` now sends:

```json
{
  "prompt": "...",
  "sourceContext": {
    "source": "sources/...",
    "githubRepoContext": {
      "startingBranch": "main"
    }
  },
  "title": "...",
  "requirePlanApproval": true,
  "automationMode": "AUTO_CREATE_PR"
}
```

The `repository` value remains Paperclip metadata and prompt context, but is not sent as an undocumented Jules `githubRepoContext` property.

### Recovery API surface

The client now exposes paginated methods for:

- `listSources`;
- `listSessions`;
- `getSession`; and
- `listActivities`.

Existing `approvePlan` and `sendMessage` operations remain available. Page tokens and resource/session IDs are URL encoded.

### Output parsing

The adapter inspects `outputs` and selects the first populated `pullRequest.url`. It records the optional PR title and description, last fetched activity ID, and Jules update time. A Jules web-session URL is no longer a fallback PR URL.

### Plan policy

Generated session specifications continue to derive `requirePlanApproval` from the configured policy. Caller-supplied `sessionSpec.execution.requirePlanApproval` takes precedence and flows into session creation. An explicit requirement cannot be bypassed by the legacy `autoApprovePlan` setting.

## Verification achieved

- Jules package TypeScript typecheck passed.
- All Jules adapter tests passed: 4 files and 10 tests.
- New contract tests inspect the exact create-session request body, pagination paths, and safe PR extraction behavior.

## Explicit remaining work

This review does **not** claim completion of the entire 3,292-line delta specification. The following cross-cutting P0 work remains:

1. Build the database-backed durable Jules session lifecycle and startup/periodic reconciler.
2. Connect source discovery to repository-to-source resolution and the capacity broker.
3. Persist fetched activities and all output metadata in `jules_sessions` during reconciliation.
4. Route `AWAITING_PLAN_APPROVAL` to native manager/human approval instead of relying on adapter configuration.
5. Implement repository leases, scoped callback credentials, deterministic validation, and Hermes judgment/revision.

Those items require server, database, shared-contract, and UI work and should be reviewed as separate coherent implementation slices.
