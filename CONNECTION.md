# Connect to Paperclip Founder

Paperclip is a control plane for companies, goals, projects, issues, agents,
approvals, execution runs and work products. Humans use the board; agents and
integrations use the native JSON API on the same HTTPS origin.

- Board: https://leon4gr45-paperclip-founder.hf.space/
- Public connection guide: https://leon4gr45-paperclip-founder.hf.space/api-docs
- Raw Markdown: https://leon4gr45-paperclip-founder.hf.space/api-docs/CONNECTION.md
- API base: https://leon4gr45-paperclip-founder.hf.space/api

This guide is public and contains no credentials. It grants no API access and is
not an exhaustive OpenAPI schema or a claim that every provider is configured.

## Humans: sign in to the board

Open the board URL, sign in with your existing account and select a company.
Creating companies and managing instance access require the native instance admin
role; signing in alone does not grant it. If you see “Instance admin required”,
ask the operator to check your account's role rather than creating another account.
`/aux` is the AUX company view. API clients should discover company IDs instead of
assuming that a UI slug is a database ID.

## Operators and trusted integrations: admin Bearer token

Ask the operator for access and store `PAPERCLIP_ADMIN_API_TOKEN` in a secret
manager or secure environment. Send it in the Authorization header. It is an
instance administrator credential with broad access: never give it to ordinary
agents, put it in a URL, commit it, or paste it into logs or chat.

The operator configures the Space with:

- `PAPERCLIP_ADMIN_API_TOKEN`: an independent random secret, at least 32 characters.
- `PAPERCLIP_ADMIN_API_EMAIL`: the email of exactly one existing instance admin.

For a new installation, generate the token securely (for example with
`openssl rand -hex 32`) and store it directly in secret settings. It must differ
from the UI password, `BETTER_AUTH_SECRET` and agent signing secrets. Environment
changes outside HF must also be synchronized to the Space, followed by a reload;
coordinate reloads with active work and backups.

`PAPERCLIP_ADMIN_PASSWORD` is a UI/native sign-in password, not a Bearer token.
`BETTER_AUTH_SECRET` signs authentication data; it is not an API credential.
`HF_TOKEN` manages Hugging Face itself; it does not authorize Paperclip API calls.

### Check connectivity and discover your company

Supply the token through secure environment settings. Do not enable shell tracing.

```sh
export PAPERCLIP_BASE_URL='https://leon4gr45-paperclip-founder.hf.space'

curl --fail-with-body --silent --show-error \
  "$PAPERCLIP_BASE_URL/api/health"

curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" \
  "$PAPERCLIP_BASE_URL/api/auth/get-session"

curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" \
  "$PAPERCLIP_BASE_URL/api/companies"
```

The admin-token session ID includes `:admin_token:`. Choose a company from the
response and set `PAPERCLIP_COMPANY_ID` to its `id` before the next requests.

```sh
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" \
  "$PAPERCLIP_BASE_URL/api/companies/$PAPERCLIP_COMPANY_ID/agents"

curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" \
  "$PAPERCLIP_BASE_URL/api/companies/$PAPERCLIP_COMPANY_ID/issues"
```

### Create a task without starting an agent

This creates an unassigned backlog issue; it does not request runtime allocation.
Use the returned issue `id` in subsequent API paths.

```sh
curl --fail-with-body --silent --show-error \
  -X POST \
  -H "Authorization: Bearer $PAPERCLIP_ADMIN_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"title":"Review repository assumptions","description":"Read-only analysis; report gaps. No external actions or engineering changes.","status":"backlog"}' \
  "$PAPERCLIP_BASE_URL/api/companies/$PAPERCLIP_COMPANY_ID/issues"
```

Admin Bearer requests need no cookies or Origin header. Native cookie login is
available through `/api/auth/sign-in/email`; cookie-authenticated mutations need
a trusted Origin. Do not silently fall back between authentication methods. For a
browser client on another origin, use a backend client or an explicitly configured
CORS policy; authentication does not itself grant cross-origin browser access.

## Agents: use a company-scoped credential

An operator can issue an agent key through the board or
`POST /api/agents/<agent-id>/keys` with `{"name":"integration-name"}` using board
credentials. Store the returned key securely when created. The agent sends its
own key as a Bearer token; board-only operations remain forbidden and company
boundaries remain enforced.

Local adapters may receive a short-lived `PAPERCLIP_API_KEY` automatically. Use the
credential supplied for the current run, never a human admin credential.

```sh
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_BASE_URL/api/agents/me"
```

Read the assigned issue and its instructions first. Use atomic native checkout
where required and respect approvals, budgets and company access. A remote Jules
worker is not automatically given board credentials. Its
`/api/jules/v1/runs/<run-id>/...` callbacks require a separately issued run-scoped
capability with explicitly allowed operations. Ordinary agent keys and admin
tokens do not substitute for that capability.

## Native API map

These paths are relative to the API base. Permissions and request validators
still apply; route existence does not authorize every caller or operation.

| Purpose | Native paths |
| --- | --- |
| Public health | `GET /health` |
| Board session | `GET /auth/get-session` |
| Agent identity | `GET /agents/me` |
| Companies | `GET /companies`, `POST /companies` |
| Agents | `GET /companies/<company-id>/agents`, `GET /agents/<agent-id>` |
| Goals/projects | `GET /companies/<company-id>/goals`, `GET /companies/<company-id>/projects` |
| Issues | `GET` / `POST /companies/<company-id>/issues`, `GET` / `PATCH /issues/<issue-id>` |
| Issue documents | `GET` / `PUT /issues/<issue-id>/documents/<key>` |
| Work products | `GET /issues/<issue-id>/work-products` |
| Approvals/audit | `GET /companies/<company-id>/approvals`, `GET /companies/<company-id>/activity` |
| Runs | `GET /companies/<company-id>/heartbeat-runs`, `GET /companies/<company-id>/live-runs` |
| Run output | `GET /heartbeat-runs/<run-id>`, `GET /heartbeat-runs/<run-id>/events`, `GET /heartbeat-runs/<run-id>/log` |
| Jules readiness | `GET /jules/profiles`, `GET /companies/<company-id>/jules-sources` |
| Admin token status | `GET /admin/api-token/status` (instance admin only; booleans, no secret values) |

For document updates, read the current document and send its `latestRevisionId`
as `baseRevisionId` when updating to detect concurrent edits. Preserve validation
errors instead of weakening the contract.

## Execution and provider readiness

An authorized board operator can explicitly wake an eligible agent using
`POST /agents/<agent-id>/wakeup`. Assignment, resume, approval, budget and provider
admission are separate concerns. Wakes may consume quota and incur cost; do not
wake an agent just to test authentication. Inspect existing runs and reservations
first. A timeout or lost response is ambiguous: reconcile existing work before
retrying. Do not assume that a client-supplied idempotency key makes every route
safe to replay.

API access does not guarantee GitHub import/source access, Jules capacity, Hermes
model connectivity or Nodepad binding. Those need their own credentials and
readiness checks. A native invocation can succeed while remote Jules work remains
active. A completed session or PR is a completion candidate, not evidence
acceptance, merge permission or approval for external actions.

For the reviewed external Agency supervisor CLI, use `--auth admin-token`. Its
preflight also requires the reviewed deployed HF SHA, board-controlled journal
issue and pinned catalog. Follow the repository's dated qualification handoff;
do not replay historical preparation or wake commands.

## Troubleshooting

- `401`: missing, wrong, disabled or stale credential. Check the exact origin,
  synchronized secret and native admin identity. Do not try signing secrets as keys.
- `403`: permission/company boundary denied, or an invalid run capability.
- `404`: wrong path/ID or missing resource. HF restores can omit historical run
  rows; a missing row does not prove that remote work never ran.
- `409`: conflict, ownership or admission state changed. Read current state first.
- `400` / `422`: payload validation failed; check the native schema.
- `5xx`, timeouts or connection failures: check health and Space status. Read-only
  requests may be retried with backoff; reconcile uncertain mutations.

Share run IDs, error codes and sanitized diagnostics when asking for help.
Never share tokens, cookies or passwords.
