# Native admin API token

Live status on 2026-10-23: the focused patch is deployed at HF revision
`70929365485b47f56e7abfc4eb960c7bb4d2e1dc` and healthy. Admin-token access still
returns 401; password/admin access and roster preservation pass. See
[live qualification and exact blocker](2026-10-23-admin-token-live-qualification.md).

Focused branch `codex/native-admin-api-token-v1`, from deployed application source
`0eba2bb8dce7093b77ccb952f71fea91edee6da8`. This change does not include the
Agency supervisor application patches, Jules quota changes, Nodepad or migrations.

## Configuration and access

Configure these server environment variables on the HF Space:

- Secret `PAPERCLIP_ADMIN_API_TOKEN`: a new random credential, at least 32
  characters; prefer 32 cryptographically random bytes encoded as hex.
- Variable `PAPERCLIP_ADMIN_API_EMAIL`: `leon.m.gr45@gmail.com`, exactly matching
  the existing native account. The account must already have `instance_admin`.

Set the same token securely in the cloud environment for API clients. Do not paste
it into chat, source, URLs, Git configuration or command arguments. Do not reuse
`BETTER_AUTH_SECRET`, `PAPERCLIP_AGENT_JWT_SECRET`, or the UI password: signing
secrets/password reuse is explicitly rejected. No account or admin role is created.

After the focused application patch is deployed and configured:

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" \
  https://leon4gr45-paperclip-founder.hf.space/api/companies
```

Normal native board/admin endpoints use this authenticated existing user identity
and their existing authorization rules. Company creation and administration,
issues, agent management, work products and other normal board operations follow
the native routes. This is full instance-admin access, not an agent API key.
Provider dispatch still requires working provider credentials, quota and native
admission. A token does not repair inaccessible Jules credentials or prove any
provider runtime is live-ready.

Cookie login continues to work. Agent keys/JWTs retain their company scope and
cannot access board-only APIs. UI sign-in, ownership bootstrap routes that explicitly
require a browser session, and provider callback capabilities keep their existing
contracts; this token does not replace those distinct protocols.

Explicit bearer admin requests can mutate without a browser Origin header.
Cookie-authenticated board mutations still require trusted Origin/Referer. HTTP
Authorization, Cookie and Set-Cookie fields are redacted before logging. The token
is never included in the actor, response, DB record or audit details.

## Revocation and failure behavior

The server checks the configured token with constant-time SHA-256 digest
comparison and resolves the exact existing user/admin role on every matching
request. Removing the admin role or user immediately denies subsequent requests.
Rotating/removing the server token takes effect when the process reloads its
environment; old tokens stop working. Missing configuration, short token, unknown
or duplicate email, signing-key/password reuse and invalid credentials grant no
board access. A failed DB identity lookup fails closed and does not fall back to
a cookie identity. No mutation retry or token-mint endpoint is introduced.

`GET /api/admin/api-token/status` provides instance-admin-only configuration
diagnostics using an existing authenticated admin session. It returns booleans for
presence, minimum length, independence from signing keys/password, bound admin
identity and malformed-prefix/whitespace warnings. It returns no credential,
digest, exact length or secret value. A non-admin session and an invalid Bearer
credential cannot access this diagnostic.

## Qualification and deployment boundary

Six focused tests cover exact/invalid token, missing/weak/reused configuration,
missing/duplicate identity, role revocation, token rotation, actual HTTP board
access, cookie and agent isolation, mutation-origin behavior, DB failure and log
redaction. Existing board-origin guard tests remain unchanged and pass.

Qualification completed on 2026-10-22: full workspace typecheck PASS; full suite
139 files, 785 tests passed and 1 skipped; production build PASS; the final server
typecheck after log-redaction changes PASS. Focused auth/origin suites: 12 passed.
The lower suite count than the supervisor branch is expected: this branch starts
at the deployed source and intentionally excludes subsequent supervisor/Jules
changes. Token/whitespace checks are required again on the staged change.

Full typecheck, tests and build must pass before deployment. Preserve the existing
HF overlay, data and backup configuration. The existing `deploy/hf-space/sync.sh`
must be previewed against a clean real Space clone, with only this focused branch's
application diff relative to the deployed source. No provider rebind or workforce
activation belongs in deployment startup. A secret configured only in this Codex
environment is not automatically installed on HF or evidence of live token access.

Read-only live proof after deployment: public health and exact HF revision,
token-authenticated session and companies, admin-only GET; invalid token denied;
password login preserved; 48 AUX agents and 45 unique Agency identities unchanged,
all 37 new specialists paused and no active qualification runs. Do not launch
agents merely to test the admin token.
