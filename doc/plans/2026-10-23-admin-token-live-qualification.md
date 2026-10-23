# Admin-token deployment and live qualification

Application source: `2b6c978a9e9b4f15a5eb328d88cfcb5c1cf00efa`, branch
`codex/native-admin-api-token-v1`, based on deployed `0eba2bb`.

HF revision `70929365485b47f56e7abfc4eb960c7bb4d2e1dc` is deployed and RUNNING.
The runtime SHA matches the Space Git SHA. The reviewed deployment tree is
`44324cf03ee4c8f4882f1a88b7b6a0dc8f226d60`, parent
`763bd8154b9e417ea171749936da6e968b3cb6ea`. A pre-push hook enforced that exact
tree, parent and target branch. Only the seven reviewed admin-auth/test/doc files
changed. No supervisor, quota, Nodepad, overlay or migration changes were deployed.

The build/startup monitor recorded DEPLOYMENT_HEALTHY on 2026-10-22. Exact runtime
revision and health were reverified on 2026-10-23. Existing native password login
and the instance-admin-only company-access endpoint both pass. The configured
email exactly matches the signed-in native account. HF secret metadata lists
`PAPERCLIP_ADMIN_API_TOKEN`; its variable metadata contains the correct
`PAPERCLIP_ADMIN_API_EMAIL`. Neither secret contents nor session cookies were logged.

## Current blocker

The published client token still receives HTTP 401 at `/api/auth/get-session`.
The earlier old-revision failure is superseded by this failure on the confirmed
new runtime. Token-based protected reads, writes and runtime dispatch therefore
cannot be marked PASS_LIVE. Presence of a secret key and a successful HF secret
write do not establish that the server accepts the client credential.

The existing native admin identity and email are verified. The remaining token
configuration/authentication mismatch is not diagnosed conclusively: secret
transfer, runtime provisioning, minimum length or prohibited reuse can each deny
authentication. The secure client credential may be network-proxied; its process
representation is not proof of the deployed secret's value. No secret was read
back, guessed, printed or copied into source to diagnose this.

Required operator action: set `PAPERCLIP_ADMIN_API_TOKEN` directly in the HF Space
Secrets settings to exactly the same new token supplied to the Codex environment,
at least 32 characters and distinct from the UI password and signing secrets.
Leave BETTER_AUTH_SECRET unchanged. After applying the secret, recheck/reload the
same revision as needed; another source deployment is not required for matching
token configuration. Resume the existing read-only token checks before mutations.

## Data and pipeline safety

Authenticated password-session checks establish that the predeployment agent
snapshot is unchanged: 48 native agents, 45 unique Agency IDs, all 37 new
specialists paused, zero active native runs. These are data-preservation checks,
not evidence of token access. No new qualification issue, agent wake, Jules remote
session, Founder Manager run or provider rebind occurred in this admin-token pass.

Fresh backup `1faca7c03d433f96a756e3ee7321c9bdfe9e3445` at
2026-10-23T09:50:17Z independently contains the same 48/45/37 roster. No restore
exercise was performed. The previous failed supervisor run
`0d6af1b0-ed5f-4b8e-8891-d3f89822dab8` remains an admission failure without a
Jules allocation; it must not be blindly dispatched again.

```ini
LOCAL_AUTH_TESTS = PASS_LOCAL
FULL_TYPECHECK_BUILD = PASS_LOCAL
FULL_TEST_SUITE = 785 passed, 1 skipped
HF_DEPLOYMENT = PASS_LIVE
HF_RUNTIME_REVISION = 70929365485b47f56e7abfc4eb960c7bb4d2e1dc
PASSWORD_ADMIN_ACCESS = PASS_LIVE
ADMIN_TOKEN_ACCESS = FAIL_HTTP_401
TOKEN_PROTECTED_READS = NOT_RUN
TOKEN_NATIVE_MUTATION = NOT_RUN
PROVIDER_REBIND = NOT_RUN
NEW_JULES_SESSIONS = 0
NEW_HERMES_RUNS = 0
ROSTER_PRESERVED = PASS_LIVE
FRESH_BACKUP = PASS
FULL_PIPELINE_VIA_ADMIN_TOKEN = BLOCKED_AUTH
```

Local receipts and restart-safe qualification scripts are in
`/workspace/agency-supervisor-qualification`: `admin-deployment-review.json`,
`admin-deployment-watch.log`, `admin-live-blocker.json`, `admin_live_check.py`,
`admin-pipeline.py` and the preserved supervisor journal/intent. The report makes
no claim that a local test or password-session read proves token authentication.
