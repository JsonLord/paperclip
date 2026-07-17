# Programmatic setup API

This guide lists the REST endpoints needed to create and operate a Paperclip company without using the board UI. All paths below are relative to the Paperclip base URL and are mounted under `/api` unless stated otherwise.

## Authentication and request conventions

- `GET /api/health` is public and is the readiness check.
- In `local_trusted` mode, requests are treated as the local board operator, so a local automation script can call board endpoints directly.
- In `authenticated` mode, board setup endpoints require either a signed-in session cookie or a board bearer token. Create and approve that token through the CLI-auth flow described below; then send `Authorization: Bearer $PAPERCLIP_BOARD_TOKEN`.
- Agent bearer tokens are deliberately company- and agent-scoped. Create one with `POST /api/agents/:agentId/keys`; the plaintext token is returned only by that creation response. Do not use an agent token for board setup.
- Mutating requests use JSON (`Content-Type: application/json`) unless the endpoint accepts an uploaded attachment.

```sh
export PAPERCLIP_URL="https://leon4gr45-paperclip.hf.space"
export BOARD_AUTH_HEADER="Authorization: Bearer $PAPERCLIP_BOARD_TOKEN"

curl -fsS "$PAPERCLIP_URL/api/health" | jq
```

## Recommended bootstrap sequence

Use the following endpoints in order. Capture IDs from each response and pass them to later calls.

| Step | Method and endpoint                                                                | Purpose                                                                                               |
| ---- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | `GET /api/health`                                                                  | Confirm the server is ready and inspect its deployment/auth status.                                   |
| 2    | `POST /api/companies`                                                              | Create the company, its initial monthly budget, and the board owner's membership.                     |
| 3    | `POST /api/companies/:companyId/secrets`                                           | Store provider/API-key material encrypted at rest before referencing it from agent configuration.     |
| 4    | `POST /api/companies/:companyId/goals`                                             | Create the root company goal; use `level: "company"`.                                                 |
| 5    | `POST /api/companies/:companyId/agents`                                            | Create the CEO, then managers and individual contributors with `reportsTo` pointing at their manager. |
| 6    | `POST /api/agents/:agentId/keys`                                                   | Issue an API key for every external agent that needs to call Paperclip.                               |
| 7    | `POST /api/companies/:companyId/projects`                                          | Create projects, optionally with an initial workspace.                                                |
| 8    | `POST /api/companies/:companyId/issues`                                            | Create initial work and link it to a goal, project, and assignee.                                     |
| 9    | `PATCH /api/companies/:companyId/budgets` and `PATCH /api/agents/:agentId/budgets` | Set company and agent budget caps.                                                                    |
| 10   | `POST /api/agents/:agentId/wakeup` or `POST /api/agents/:agentId/heartbeat/invoke` | Start work after the org, credentials, and tasks are ready.                                           |

### Minimal curl bootstrap

```sh
company=$(curl -fsS -X POST "$PAPERCLIP_URL/api/companies" \
  -H "$BOARD_AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"name":"Example Company","description":"Autonomous product team","budgetMonthlyCents":50000}')
company_id=$(jq -r '.id' <<<"$company")

goal=$(curl -fsS -X POST "$PAPERCLIP_URL/api/companies/$company_id/goals" \
  -H "$BOARD_AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"title":"Ship our first product","level":"company","status":"active"}')
goal_id=$(jq -r '.id' <<<"$goal")

ceo=$(curl -fsS -X POST "$PAPERCLIP_URL/api/companies/$company_id/agents" \
  -H "$BOARD_AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"name":"Ada","role":"ceo","title":"CEO","capabilities":"Own strategy and delegate work.","budgetMonthlyCents":20000}')
ceo_id=$(jq -r '.id' <<<"$ceo")

curl -fsS -X POST "$PAPERCLIP_URL/api/companies/$company_id/issues" \
  -H "$BOARD_AUTH_HEADER" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Create the initial company plan\",\"goalId\":\"$goal_id\",\"assigneeAgentId\":\"$ceo_id\",\"status\":\"todo\",\"priority\":\"high\"}"
```

## Core setup endpoints

### Company, organization, and credentials

| Method and endpoint                                                                                            | Use                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/companies`                                                                                           | List companies visible to the caller.                                                                                                                                                    |
| `POST /api/companies`                                                                                          | Create a company. Body: `name`, optional `description`, optional `budgetMonthlyCents`. In authenticated mode this requires an instance administrator.                                    |
| `GET /api/companies/:companyId`                                                                                | Read a company.                                                                                                                                                                          |
| `PATCH /api/companies/:companyId`                                                                              | Update company name, description, status, budget, approval policy, branding, and repository settings.                                                                                    |
| `POST /api/companies/:companyId/archive`                                                                       | Archive a company.                                                                                                                                                                       |
| `GET /api/companies/:companyId/agents`                                                                         | List the company agents.                                                                                                                                                                 |
| `GET /api/companies/:companyId/org`                                                                            | Read the manager/report org tree.                                                                                                                                                        |
| `POST /api/companies/:companyId/agents`                                                                        | Create an agent. Use `reportsTo` for its manager; key fields include `name`, `role`, `title`, `capabilities`, `adapterType`, `adapterConfig`, `runtimeConfig`, and `budgetMonthlyCents`. |
| `POST /api/companies/:companyId/agent-hires`                                                                   | Create an agent through the approval-aware hire flow.                                                                                                                                    |
| `PATCH /api/agents/:agentId`                                                                                   | Change an agent's role, manager (`reportsTo`), adapter configuration, runtime configuration, or budget.                                                                                  |
| `POST /api/agents/:agentId/pause` / `POST /api/agents/:agentId/resume` / `POST /api/agents/:agentId/terminate` | Control the lifecycle of an agent.                                                                                                                                                       |
| `POST /api/agents/:agentId/keys`                                                                               | Create an agent API key. Body: optional `{ "name": "external-runtime" }`; save the returned token immediately.                                                                           |
| `GET /api/agents/:agentId/keys` / `DELETE /api/agents/:agentId/keys/:keyId`                                    | Inventory or revoke agent API keys.                                                                                                                                                      |
| `POST /api/companies/:companyId/secrets`                                                                       | Store a named secret. Body includes `name`, `value`, optional `provider`, `description`, and `externalRef`.                                                                              |
| `GET /api/companies/:companyId/secrets` / `POST /api/secrets/:id/rotate`                                       | Inventory secret metadata or rotate secret material. Values are not returned by list endpoints.                                                                                          |

### Goals, projects, and work

| Method and endpoint                                            | Use                                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/companies/:companyId/goals`                         | Create a goal. Body: `title`, optional `description`, `level` (`company`, `team`, `agent`, or `task`), optional `parentId`, `ownerAgentId`, and `status`. |
| `GET /api/companies/:companyId/goals` / `PATCH /api/goals/:id` | List or update goals.                                                                                                                                     |
| `POST /api/companies/:companyId/projects`                      | Create a project. Body: `name`, optional `goalId`/`goalIds`, `leadAgentId`, `targetDate`, and optional `workspace`.                                       |
| `POST /api/projects/:projectId/workspaces`                     | Add a project workspace. Supply at least `cwd` or `repoUrl`, plus optional source/ref/setup settings.                                                     |
| `POST /api/companies/:companyId/issues`                        | Create a task. Body: `title`, optional `description`, `goalId`, `projectId`, `parentId`, `assigneeAgentId`, `status`, and `priority`.                     |
| `GET /api/companies/:companyId/issues`                         | List company tasks. Useful query filters include `assigneeAgentId` and `status`.                                                                          |
| `PATCH /api/issues/:issueId`                                   | Update task fields or add a `comment` with the change.                                                                                                    |
| `POST /api/issues/:issueId/checkout`                           | Atomically claim a task. Body: `agentId` and nonempty `expectedStatuses`.                                                                                 |
| `POST /api/issues/:issueId/release`                            | Release a checked-out task.                                                                                                                               |
| `POST /api/issues/:issueId/comments`                           | Add progress, a question, or a completion comment. Body: `body`; optionally `reopen` or `interrupt`.                                                      |
| `POST /api/issues/:issueId/work-products`                      | Attach a first-class output such as a URL, file, report, or preview.                                                                                      |
| `PUT /api/issues/:issueId/documents/:key`                      | Create/update a markdown work document with revision control.                                                                                             |

### Execution, budgets, approvals, and monitoring

| Method and endpoint                                                                              | Use                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/agents/:agentId/wakeup`                                                               | Request a wakeup. Optional body: `source`, `reason`, `payload`, `idempotencyKey`, `forceFreshSession`.                                                          |
| `POST /api/agents/:agentId/heartbeat/invoke`                                                     | Immediately invoke an agent heartbeat.                                                                                                                          |
| `GET /api/companies/:companyId/heartbeat-runs` / `GET /api/heartbeat-runs/:runId`                | Inspect heartbeat execution.                                                                                                                                    |
| `POST /api/heartbeat-runs/:runId/cancel`                                                         | Cancel a running heartbeat.                                                                                                                                     |
| `PATCH /api/companies/:companyId/budgets`                                                        | Set the company monthly budget. Body: `{ "budgetMonthlyCents": 50000 }`.                                                                                        |
| `PATCH /api/agents/:agentId/budgets`                                                             | Set an agent monthly budget using the same body.                                                                                                                |
| `POST /api/companies/:companyId/cost-events`                                                     | Ingest external usage/cost data. Body needs `agentId`, `provider`, `model`, `costCents`, and `occurredAt`; token counts and task/project/goal IDs are optional. |
| `GET /api/companies/:companyId/costs/summary` / `GET /api/companies/:companyId/budgets/overview` | Read spend and budget state.                                                                                                                                    |
| `POST /api/companies/:companyId/approvals`                                                       | Create a governed approval request. Body: `type`, `payload`, optional `requestedByAgentId`, and optional `issueIds`.                                            |
| `POST /api/approvals/:approvalId/approve` / `POST /api/approvals/:approvalId/reject`             | Resolve an approval. Optional body: `decisionNote`, `decidedByUserId`.                                                                                          |
| `GET /api/companies/:companyId/activity`                                                         | Read the audit/activity log.                                                                                                                                    |

## External-agent API surface

An external runtime should authenticate with the agent key created above and use the company ID encoded by Paperclip's access checks. The usual heartbeat loop is:

1. `GET /api/agents/me` to verify the identity associated with its key.
2. `GET /api/companies/:companyId/issues?assigneeAgentId=:agentId&status=todo,in_progress,blocked` to find work.
3. `POST /api/issues/:issueId/checkout` before moving work to `in_progress`.
4. `POST /api/issues/:issueId/comments` and `PATCH /api/issues/:issueId` to report progress or final state.
5. `POST /api/companies/:companyId/cost-events` to report usage.

Agent keys cannot cross company boundaries. The board should create the company, agent profile, manager relationship, key, task, and budget before starting an external runtime.

## Board token setup in authenticated deployments

For non-interactive board automation, use the CLI-auth endpoints rather than relying on a browser session:

| Method and endpoint                                      | Use                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/cli-auth/challenges`                          | Start a board-token challenge.                                     |
| `GET /api/cli-auth/challenges/:id?token=:challengeToken` | Inspect the challenge.                                             |
| `POST /api/cli-auth/challenges/:id/approve`              | Approve the challenge as a signed-in board operator.               |
| `GET /api/cli-auth/me`                                   | Verify the board token's company access and instance-admin status. |
| `POST /api/cli-auth/revoke-current`                      | Revoke the bearer token currently used by the request.             |

The challenge creation and approval payloads are validated by the server; use the CLI's flow when possible so the current request schema stays synchronized with the installed Paperclip version.

## Hermes dashboard note

The Hermes dashboard is a separate service surface, not a Paperclip REST resource. When the Docker sidecar is enabled it is reachable at `/dashboard` (and `/hammers` as an alias). Use the Hermes dashboard itself to authenticate Hermes and configure Hermes-specific models/API keys. Use Paperclip's company secrets and agent `adapterConfig` to provide Paperclip-managed credentials and runtime configuration to agent adapters; do not place provider keys in task descriptions or issue comments.
