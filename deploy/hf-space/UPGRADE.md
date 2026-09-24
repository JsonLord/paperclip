# Updating the `Leon4gr45/Paperclip-Founder` Space to the current FounderOS build

The Space runs a pre-FounderOS snapshot of paperclip `0.3.1` plus a set of
Space-only adaptations. Upstream is still `0.3.1` — the delta is the FounderOS
work on `codex/continue-implementation`, not a release bump. This directory
holds the Space-side adaptations needed to take that delta, and `sync.sh`
applies them without touching the Space's own configuration.

```sh
git clone https://huggingface.co/spaces/Leon4gr45/Paperclip-Founder /tmp/space
./deploy/hf-space/sync.sh /tmp/space          # stage + review
./deploy/hf-space/sync.sh /tmp/space --push   # commit + push, triggers the build
```

---

## 1. What arrives with the update

| Area | What lands in the Space |
|---|---|
| `packages/adapters/jules` | Native Jules adapter (REST plane, async session lifecycle, capacity broker, repository write leases) registered in the server, UI and CLI registries |
| `server/src/services/jules-*` | Durable sessions, reconciler, outbox, capacity events, manager decisions, run-scoped callback capability tokens |
| `server/src/services/founderos-*` | Company bootstrap, content registry/runtime, validation manager, deployment catalog |
| `server/src/services/founder-manager` | Hermes manager operations (triage / judge / next best action) |
| `spec/`, `resources/` | FounderOS operating model, per-system reviews, and the reusable support packs (BMC, BPW business plan + finance, pitch, content, GTM, crowdfunding) |
| `packages/db` migrations | `jules_*`, `company_jules_sources`, `goal_template_instances`, `resource_pack_snapshots` tables (applied automatically — `PAPERCLIP_MIGRATION_AUTO_APPLY=true` is already set) |
| UI | **Companies → Import FounderOS**, and Goals now render acceptance criteria, blockers, skills, capabilities and support-pack versions |

Goal catalog installed on import (`founderOsDeploymentGoalTemplates`):
`validate-problem`, `define-initial-icp`, `analyze-market`, `validate-offer`,
`validate-demand`, `build-prospect-universe`, `validate-commercial-commitment`,
`maintain-mvp-reliability`, `observe-product-usage`, `validate-value-realization`,
`validate-retention`, `analyze-unit-economics`, `compile-business-model-canvas`,
`compile-bpw-financial-plan`, `compile-business-plan`, `compile-pitch`, plus the
content/GTM and Kickstarter goal sets.

## 2. The one change that is not optional

`packages/adapters/jules` is a new pnpm workspace package, and `server`, `ui`
and `cli` all depend on `@paperclipai/adapter-jules`. Two things in the Space's
current build break on it:

1. **The deps stage never copies its manifest.** The HF `Dockerfile` lists every
   workspace `package.json` by hand; without a `COPY packages/adapters/jules/…`
   line the workspace is incomplete.
2. **`pnpm install --frozen-lockfile` fails.** Upstream `CLAUDE.md` states the
   lockfile is not committed on feature branches (CI regenerates it on `master`),
   so the shipped `pnpm-lock.yaml` has no `packages/adapters/jules` importer and
   pnpm exits with `ERR_PNPM_OUTDATED_LOCKFILE`.

`overlay/Dockerfile` fixes both: it copies every workspace manifest (all eight
adapters, the plugin SDK, `create-paperclip-plugin` and the four plugin
examples) and falls back to `pnpm install --no-frozen-lockfile`. `sync.sh`
additionally regenerates `pnpm-lock.yaml` in the Space clone before pushing —
the Space is a deployment repo, not a pull request, so committing a lockfile
there is fine and keeps the fast path — and refuses to finish if a workspace
package has no `COPY` line, which is the failure that would otherwise recur on
the next upstream adapter.

## 3. Space files that change

| File | Change |
|---|---|
| `Dockerfile` | jules + plugin manifests in the deps stage; lockfile fallback; new `JULES_*` / `HEARTBEAT_SCHEDULER_ENABLED` env defaults. Node/openviking/hermes/postgres layers, port 7860 and the entrypoint are unchanged. |
| `deploy/entrypoint.sh` | New step **1a**: derives `PAPERCLIP_JULES_CAPABILITY_SECRET`, points the Founder Manager at Blablador, exports the Jules worker cadence, passes `FIRM_CLI_PATH` through, and logs the instantiated goal-template count after boot. Everything else byte-for-byte as before. |
| `deploy/backup.sh` | Excludes the three append-only Jules event tables from the dump; adds `goals.json`, `goal-templates.json` and `support-packs.json` to each per-company folder; missing-table tolerant. |
| `README.md` | Space card documents the jules adapter, the FounderOS import flow and this upgrade path. |
| `pnpm-lock.yaml` | Regenerated to include the jules importer. |
| `package.json` | Upstream's, with the `pnpm.patchedDependencies` entry for the embedded-postgres locale patch re-injected. |

Everything else is the upstream tree mirrored in.

## 3b. Divergent migration lineage (read before deploying)

The Space's tree is not simply an older commit of this repo. Both share drizzle
migrations `0000`–`0037` and then fork:

| | `0038` onwards | count |
|---|---|---|
| Space (current) | `0038_careless_iron_monger` … `0050_curious_night_nurse` | 51 |
| FounderOS branch | `0038_firm_integration`, `0039_jules_control_plane` … `0061` | 62 |

A database carrying the Space's lineage has a `__drizzle_migrations` table
describing migrations the new build has never heard of. Restoring such a dump and
then running the shipped migrations either re-creates existing objects or skips
them entirely, leaving the server on a schema with no `jules_*`/`founderos_*`
tables. So `deploy/entrypoint.sh` now checks the dump for `jules_sessions` — a
table only the FounderOS lineage creates — and **refuses the restore** when it is
absent, logging the company-row count it skipped and starting on a fresh schema
instead. `deploy/backup.sh` copies that dump to `db/paperclip.pre-founderos.sql`
before the next backup overwrites `db/paperclip.sql`, so nothing is lost.

Because a refused (or absent) dump leaves the repo holding nothing this build can
read back, the entrypoint runs one **initial backup** as soon as the boot is
healthy, instead of waiting for the 20:00 run. Without it every restart between
boot and the nightly job would discard whatever was created in the meantime.
`backup.sh` commits only when something changed, and archives the superseded dump
as `db/paperclip.pre-founderos.sql` first.

Note that `session` data is excluded from the dump, so a restore never carries
browser sessions: expect to sign in again after any restart.

Consequence: **a Space whose backup predates this lineage comes up empty.** If
those rows matter, migrate them by hand before or after the deploy; the dump stays
in `COMPANIES_BACKUP_REPO` either way.

Two tables the old lineage had are gone from the new schema — `agent_kpis` and
`activity`. The per-company export tolerates both (missing tables yield `[]`), and
the `--exclude-table-data` patterns for them are simply no-ops.

## 4. Space configuration that is preserved

`sync.sh` stashes these before mirroring and restores them afterwards:

- `deploy/ov.conf.tmpl`, `deploy/restore.sh`, `deploy/e2e-smoke.sh` — OpenViking
  config template, boot restore, and the smoke script.
- `docker/hermes-home/` — baked `HOME` for the `hermes_local` subprocess, now
  holding only `config.yaml` (the Blablador model for Hermes).
- `patches/` — the embedded-postgres locale patch (plus its `package.json` entry).
- `FounderOS-DEMO/` — the vendored company content app.
- `Agent.md`, `CLAUDE.md`, `.gitattributes`, `.hfignore`.
- `.agents/skills/company-creator` and the `.claude/skills/company-creator`
  symlink that points at it.

The GitHub backup wiring is **runtime configuration, not files**: `GITHUB_TOKEN`,
`OPENVIKING_BACKUP_REPO` and `COMPANIES_BACKUP_REPO` live in Space secrets and are
untouched. Company data lives in the container's local Postgres, restored on boot
from `COMPANIES_BACKUP_REPO` — no file in this update touches either path.

The first real run removed 222 stale files — paths the Space tracked that this
branch no longer has, including nine stray `node_modules/` entries from an earlier
`hf upload`. Most of the rest are the pre-FounderOS lineage's own sources: the 13
divergent migrations, and code since refactored (for example
`cli/src/commands/client/auth.ts`, whose `auth bootstrap-ceo` now lives in
`cli/src/commands/auth-bootstrap-ceo.ts` — the entrypoint still calls it and it
still resolves).

## 5. Space secrets and variables

Existing entries keep working unchanged. Add only what you want to switch on.

`COMPANIES_BACKUP_REPO` and `OPENVIKING_BACKUP_REPO` are **`owner/repo`**, not
clone URLs — they are interpolated into
`https://x-access-token:$GITHUB_TOKEN@github.com/$REPO.git`. A pasted
`https://github.com/owner/repo.git` would build a nonsense address and, since every
backup step is best-effort with its output suppressed, fail silently. The entrypoint
now normalises the usual paste formats (https, http, ssh, `git@`, trailing `/`
or `.git`) and warns loudly about anything that still is not `owner/repo`.

**Already required** — `BETTER_AUTH_SECRET`, `PAPERCLIP_PUBLIC_URL`,
`OPENVIKING_ROOT_API_KEY`, `OPENVIKING_API_KEY`, `BLABLADOR_TOKEN`,
`GITHUB_TOKEN`, `OPENVIKING_BACKUP_REPO`, `COMPANIES_BACKUP_REPO`.

`DESK_AGENT_HOST` is gone. The desk_agent tailscale-funnel proxy was retired, so
the boot-time loopback→funnel agent-URL rewrite, `deploy/rewire-agents.sql.tmpl`
and the `hermes-gateway` skill were all removed; Jules now runs through the native
`jules` adapter against the Jules REST API instead of that proxy. Removing the
skill also stops this public Space publishing the tailnet hostname it hardcoded.

| Name | Needed for | Default if unset |
|---|---|---|
| `PAPERCLIP_JULES_CAPABILITY_SECRET` | Signing run-scoped Jules callback tokens. Min. 32 chars. | Falls back to `PAPERCLIP_AGENT_JWT_SECRET`, then to `BETTER_AUTH_SECRET` when that is ≥32 chars. **If `BETTER_AUTH_SECRET` is shorter, set this or Jules callbacks fail** — the entrypoint logs a warning. |
| `FOUNDER_MANAGER_BASE_URL` / `_API_KEY` / `_MODEL` | Hermes Founder Manager | Blablador + `BLABLADOR_TOKEN` + `alias-fast`, set by the entrypoint |
| `JULES_API_BASE_URL` | Jules REST endpoint | `https://jules.googleapis.com/v1alpha` |
| `JULES_RECONCILE_INTERVAL_MS` / `JULES_OUTBOX_INTERVAL_MS` | Worker cadence | `30000` / `15000` |
| `HEARTBEAT_SCHEDULER_ENABLED` | Dispatch loop | `true` |
| `FIRM_CLI_PATH` | Firm business-as-code validation | unset — see §7 |
| `PAPERCLIP_AGENT_JWT_SECRET` | Signs the `PAPERCLIP_API_KEY` injected into agent runs. Without it `createLocalAgentJwt()` returns null and every `hermes_local` agent gets 401 from the Paperclip API. | Derived from `BETTER_AUTH_SECRET` (≥32 chars) by the entrypoint |
| `PAPERCLIP_ADMIN_PASSWORD` | Password for the seeded admin. Without it the Space falls back to the log-only invite. | unset |
| `PAPERCLIP_ADMIN_GITHUB_LOGIN` | Pins which GitHub login may be seeded as admin. | unset — the token's own login is trusted |
| `GITHUB_API_URL` | GitHub API base, for GitHub Enterprise or testing. | `https://api.github.com` |

Per-company **Jules API credentials are not env vars.** They belong in
secret-backed Jules profiles created inside Paperclip, and are never written into
agent config, artifacts, Firm files or repository context.

## 6. After the build

1. Space logs: `paperclip started … on 0.0.0.0:7860`, then `paperclip healthy`.
   Existing instances skip `bootstrap-ceo` (`instance admin already present`).
2. `https://leon4gr45-paperclip-founder.hf.space/api/health` returns 200.
3. Existing companies, agents, issues and budgets are unchanged — migrations only
   add tables.
4. Create a secret-backed Jules profile; confirm it lists your company repo as a
   Jules source.
5. **Companies → Import FounderOS** → `owner/repository` + the pinned FounderOS
   content commit.
6. Verify **Goals** (contracts + acceptance criteria), **Agents/Org** (Founder
   Manager + ten Jules employees), **Projects** (Initial Venture Validation),
   **Issues** (evidence baseline). The next boot logs `founderos: N instantiated
   goal templates`.
7. Paused employees mean Jules credential/source access needs repairing. Do not
   hand-complete the blocked evidence issue.

Blank company creation stays generic — FounderOS is only installed through the
explicit import path.

## 6a. Claiming the instance without an invite

The Space's disk is ephemeral: every restart runs `initdb`, so the account you
registered is gone and the bootstrap invite URL only lives in that boot's logs.
`deploy/seed-admin.sh` removes that loop by re-creating the operator's own admin
on each boot, from the GitHub profile behind `GITHUB_TOKEN`:

1. `GET $GITHUB_API_URL/user` with the token → `login`, `name`, `email`
   (falling back to `<login>@users.noreply.github.com` when the address is private)
2. refuse unless `login` equals `PAPERCLIP_ADMIN_GITHUB_LOGIN`, when that is set
3. `POST /api/auth/sign-up/email` — better-auth owns the password hashing; this
   script never writes to the `account` table or invents a hash format
4. `INSERT INTO instance_user_roles … 'instance_admin'`, guarded by `NOT EXISTS`

You then sign in with that email and `PAPERCLIP_ADMIN_PASSWORD`. When either
secret is missing, or the login does not match, or GitHub rejects the token, the
script exits non-zero and the entrypoint falls back to the bootstrap invite
exactly as before.

**A PAT cannot provide "Sign in with GitHub".** Browser SSO needs an OAuth App
with a client ID/secret and a redirect flow, and `server/src/auth/better-auth.ts`
configures only `emailAndPassword` — there is no `socialProviders` block. This
seeds an ordinary email/password account *from* your GitHub profile; it does not
add an SSO button.

Security: possession of `GITHUB_TOKEN` is the authorization, and pinning
`PAPERCLIP_ADMIN_GITHUB_LOGIN` means a different token cannot claim the instance.
The password is passed to `curl` over a pipe, never as an argument, so it does
not appear in the process table.

Verified against a real PostgreSQL with a stubbed GitHub and sign-up endpoint:
seeds on a clean database; idempotent on re-run; refuses a non-matching login;
falls back on HTTP 401, on a missing password and on a missing token; and
re-seeds to a working admin after a full wipe of both the database and the auth
store. A password containing quotes, `$` and spaces arrived intact.

## 6b. Claiming the instance (invite fallback)

`paperclipai auth bootstrap-ceo` reads `server.deploymentMode` from a config file
and returns early with *"No config found … Run paperclip onboard first"* when the
deployment is configured purely through environment variables, as this Space is.
The entrypoint therefore writes `~/.paperclip-bootstrap-config.json` and passes it
with `--config` for that one command; the DB URL and invite base URL still come
from the environment and the server keeps running without a config file of its
own. `paperclipConfigSchema` rejects `exposure: public` unless `auth.baseUrlMode`
is `explicit` with a valid `auth.publicBaseUrl`, so both are set from
`PAPERCLIP_PUBLIC_URL`; when that variable is empty the entrypoint says so instead
of writing a config that fails validation.

Without this the Space builds and serves, but `bootstrapStatus` stays
`bootstrap_pending` with no active invite and nobody can become instance admin.

## 6c. Hermes LLM routing

`hermes-paperclip-adapter` spawns the CLI with `env = { ...process.env }` and never
sets `HOME`, so Hermes reads `$HOME/.hermes` — `/paperclip/.hermes` at runtime. The
baked `/opt/hermes-home/.hermes/config.yaml` was therefore never read by either the
adapter or the dashboard. The entrypoint now writes the config where Hermes
actually looks, from `OPENAI_COMPATIBLE_ENDPOINT`, `OPENAI_MODEL` and
`BLABLADOR_TOKEN`, and exports `OPENAI_API_KEY`/`OPENAI_BASE_URL`.

The adapter's environment check inspects the **server's** `process.env` for
`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` or `OPENAI_API_KEY` — it never inspects
`~/.hermes`. "No LLM API keys found in environment" meant only that those variables
were absent from the Paperclip process, not that Hermes was unconfigured.

Per-agent model matters too: `execute` passes `-m <model>` from the agent's adapter
config, defaulting to `anthropic/claude-sonnet-4`. An agent left on an
`anthropic/*` model will route to Anthropic regardless of the config file, so set
it to the Blablador model id (`alias-large`).

## 6d. Jules profiles from Space secrets

A Jules profile's `secretRef` is a UUID in Paperclip's encrypted secret store,
resolved company-scoped by `resolveSecretValue()` with **no environment fallback**,
so `JULES_API_1`/`JULES_API_2` cannot be referenced directly. The disk is also
ephemeral, so a hand-made profile is lost at the next restore.

`deploy/seed-jules.sh` closes both gaps on every boot. It signs in as the seeded
admin and calls `POST /api/companies/<id>/founderos/rebind-jules-source`, which
does the work server-side:

1. imports each `JULES_API_*` value as a company secret (never SQL — the
   `local_encrypted` provider owns the material format) and creates one profile
   per key at `sessionStartLimit=15` / `sessionStartWindowSec=86400`, so two keys
   give **30 session starts per 24h**;
2. resolves the company's bound GitHub repository to a Jules Source by listing
   sources with each profile's key, and records it in `company_jules_sources` +
   `jules_profile_sources`;
3. resumes the Jules workers that bootstrap paused for the missing Source and
   unblocks the bootstrap issue.

The endpoint is idempotent and safe to call on an already-bound company. It
answers `200` when the company is bound and `409` with a `reason` when no profile
can see the repository — usually because the repo has not been connected in the
Jules account that owns that key. Only workers paused with exactly the bootstrap's
own reason resume; one paused by an operator keeps its pause.

Profile names are scoped to the company (`jules-<companyId>-<n>`) because
`jules_profiles` carries no `companyId` while `secretRef` is company-scoped — a
bare name would look present while pointing at another company's secret and fail
only at dispatch. A profile is adopted by `secretRef` before name, so a profile an
earlier deployment created under a different naming scheme is reused rather than
duplicated.

| Variable | Effect |
|---|---|
| `JULES_SEED_COMPANY` | Target company id or exact name. Without it every company that has a bound GitHub repository is rebound. |
| `JULES_SEED_ROTATE` | Push the current env value as a new secret version. Off by default so boots do not pile up versions. |
| `JULES_SESSION_START_LIMIT` / `JULES_SESSION_WINDOW_SEC` | Override the 15 / 86400 defaults. |

### Why a re-import does not fix an unbound company

Jules profiles can only be created against a company, but `founderOsBootstrapService`
resolves the Source exactly once and is idempotent afterwards. A company imported
before its profiles existed therefore keeps every worker paused forever, and
re-importing only creates a *duplicate* company — the original is never repaired.
The rebind endpoint exists for that state. Binding a repository by hand is still
possible where the Jules-side source id is already known:
`POST /api/companies/<id>/jules-sources {repository, source, profileIds}`.

## 6c-bis. Extra instance admins

`seed-admin.sh` runs only when the instance has no admin at all, so a second operator
account granted by hand is lost to the next restore from a dump that predates the
grant. `deploy/grant-admins.sh` re-applies the grant on every boot instead.

| Variable | Effect |
|---|---|
| `PAPERCLIP_ADMIN_EMAILS` | Comma- or space-separated addresses granted `instance_admin` each boot. Unset disables the step. |

It grants only to an account that **already exists** — it never creates a user and
never touches passwords, so a typo is reported rather than silently provisioning an
admin. Matching is case-insensitive and the grant is idempotent.

Security note: whoever can set this variable can make themselves an instance admin.
On a Space that is the owner, who already controls `GITHUB_TOKEN` and
`PAPERCLIP_ADMIN_PASSWORD`, so it grants no privilege they did not already have.

There is no password-recovery path in this build: better-auth is configured without
`sendResetPassword`, and `paperclipai auth bootstrap-ceo` only mints an invite while
no admin exists. If the admin password is lost, granting a second account through
this variable is the way back in.

## 6c-ter. Deployment settings for hermes_local agents

An agent's `adapter_config` is written once when the agent is created, so changing a
deployment default moves only agents created afterwards, and the ephemeral disk keeps
restoring the old values. The UI exposes no model field for `hermes_local` either — it
offers "Hermes default" only — so there is no way to change it by hand.
`deploy/set-hermes-config.sh` re-applies the deployment's choices on every boot.

| Variable | Effect |
|---|---|
| `PAPERCLIP_HERMES_MODEL` | Model for all `hermes_local` agents. |
| `PAPERCLIP_HERMES_WORKDIR` | Working directory for all `hermes_local` agents. |
| `PAPERCLIP_HERMES_TIMEOUT_SEC` | Seconds before the adapter kills a run (bootstrap writes 900). Whole numbers only; written as a JSON number because the adapter ignores a quoted one. |
| `FOUNDER_MANAGER_MODEL` | Model written into a Founder Manager at bootstrap (default `alias-large`). Only affects newly created agents. |

While a variable is set it is authoritative and re-applied every boot, overwriting a
value changed elsewhere; unset it to manage that setting per agent. Other
`adapter_config` keys (`timeoutSec`, `promptTemplate`, `env`, …) are untouched, and
non-hermes agents are never modified.

**On the working directory.** The adapter takes its cwd from
`adapter_config.workspaceDir` and falls back to `"."` — whatever directory the server
process runs in, which in this image is `/app`. Paperclip resolves a workspace of its
own (`<instance>/workspaces/<agentId>`, or a project workspace) and logs about it, but
`runtimeForAdapter` carries only session fields and `workspaceDir` is never set, so
that resolution never reaches the adapter. The effective directory was therefore
implicit; setting it here makes it explicit. Note that `/app` is the application
itself — an agent working there can read and modify the running deployment.

**Why `alias-large`.** On `alias-fast` the Founder Manager repeatedly fabricated
reasons it could not work — claiming a security scanner blocked its API calls when
hermes-agent's own `check_dangerous_command` approves them, and asking the operator for
a token it already had. The same task on `alias-large` ran 56 tool calls and reasoned
correctly. `alias-fast` was adopted only to avoid 429s from the provider; if those
return, the trade-off is rate limits against a model that invents blockers.

## 6d-bis. Re-establishing the company from its repository

The disk is ephemeral, so a boot can come up with the company simply absent.
`deploy/seed-company.sh` imports it back from GitHub before the Jules binding runs
(the import resolves the Jules Source itself). It is strictly opt-in and idempotent:
nothing happens unless `FOUNDEROS_IMPORT_REPO` is set, and nothing happens when a
company is already bound to that repository — matched case-insensitively, so it will
not duplicate one.

| Variable | Effect |
|---|---|
| `FOUNDEROS_IMPORT_REPO` | The company repository, `owner/name`. Unset disables the step entirely. |
| `FOUNDEROS_IMPORT_NAME` | Company name to import under. Defaults to the repository's last path segment, so set it when `JULES_SEED_COMPANY` expects a different name. |
| `FOUNDEROS_IMPORT_COMMIT` | Pin the FounderOS context commit. Defaults to the head of `FOUNDEROS_CONTENT_REPO` (`JsonLord/FounderOS-DEMO`). |

Caveat: the step reacts to the company being *absent*, and an import always creates a
new company id with a new bootstrap pull request. It restores the ability to work,
not the previous company's history — a boot that lost data and re-imports starts that
company over. Recovering the original rows instead means restoring the dump from the
backup repo's git history.

## 6e. Backups never overwrite a dump this boot did not start from

`backup.sh` runs on shutdown as well as daily, and the shutdown push lands about ten
seconds after the next container has already restored. Publishing then overwrites
work this container never saw, and the Space alternates between two states forever.

The boot records the sha256 of the dump it restored in
`$HOME/.paperclip-backup-baseline`, and a backup publishes only when the repo still
holds that dump. If something else landed in between, the run refuses and leaves the
repo untouched. A successful push updates the baseline, so a daily backup does not
make the same container's shutdown backup refuse itself.

An earlier version compared company *counts* and refused to shrink. That is the wrong
invariant in both directions: a legitimate re-import after a lossy restore has fewer
companies than a stale repo dump and was refused, while a boot that restored stale
data and then grew past it was allowed to publish over newer work. Content identity
answers the question the count was standing in for.

| Situation | Result |
|---|---|
| Repo holds the dump this boot restored | Publish |
| Repo holds something else | Refuse, repo untouched |
| Repo empty | Publish |
| No baseline, boot could not restore (`PAPERCLIP_BACKUP_STALE`) | Publish — this is how the repo gets a usable dump |
| No baseline, no such reason | Refuse |
| `PAPERCLIP_BACKUP_FORCE=1` (or the older `PAPERCLIP_BACKUP_ALLOW_SHRINK=1`) | Publish regardless |

A failed `pg_dump` publishes nothing and leaves the repo's dump in place: the `>`
redirect truncates the file before the failure is known, so the previous behaviour
committed an empty dump and rewrote the per-company JSON from a database it had just
failed to read.

Nothing is lost when a run refuses — the state is still in the running database, and
every earlier dump is in the backup repo's git history.

## 6f. Seeding the first validation round

The FounderOS bootstrap makes `validate-problem` the active goal, but its contract
cannot be met by a company with no customers — `cannotCompleteIf` includes "Required
real interaction count is unmet". The opening goal is therefore structurally
uncompletable, and the workforce has nothing it can honestly finish.

`analyze-market` needs only external sources, and its decision set is exactly the
define/redefine loop: `PROCEED_TO_OFFER_VALIDATION`, `REFINE_ICP`,
`REFINE_MARKET_SCOPE`, `GATHER_MORE_MARKET_EVIDENCE`, `PIVOT_SEGMENT`,
`KILL_MARKET_HYPOTHESIS`. `deploy/seed-round.sh` therefore opens with the competitive
field and leaves customer outreach for a later round, behind the approval gate that
`DEPLOYMENT_POLICY.md` already requires.

| Variable | Effect |
|---|---|
| `FOUNDEROS_ROUND_SEED` | Set to seed the round. Unset disables the step entirely. |
| `FOUNDEROS_ROUND_COMPANY` | Company id or name. Falls back to `JULES_SEED_COMPANY`, then `FOUNDEROS_IMPORT_NAME`. |
| `FOUNDEROS_ROUND_TITLE` | Round goal title, which is also the idempotency guard. |

**Why the chain is `backlog` and not `blocked`.** The issue create route wakes the
assignee for every status except backlog:
`issue.assigneeAgentId && issue.status !== "backlog"`. Creating the six dependent
issues as "blocked" would wake six agents at once and spend six Jules session starts
— out of 30 per 24h — on work whose inputs do not exist yet. They are created as
backlog, which wakes nobody, and each issue names its successor so the finishing agent
promotes it to `todo`, which is what dispatches the next worker.

Re-running is safe: the round goal's title is the guard, so a restart does not
re-queue the round.

## 6g. Changing the company from git, without a restart

The mutating API needs a board session, which an operator outside the deployment does
not have, and the alternative was baking every change into the boot script and
restarting. `startOpsApplier` polls a GitHub repository instead: a change is a commit.

| Variable | Effect |
|---|---|
| `PAPERCLIP_OPS_REPO` | `owner/name` holding the ops documents. Unset disables the poller. |
| `PAPERCLIP_OPS_PATH` | Directory to read (default `ops`). |
| `PAPERCLIP_OPS_INTERVAL_MS` | Poll interval, floor 60s (default 300s). |

A document is `apiVersion: paperclip.ops/v1` with an `operations` array. Five
operations exist and nothing else parses: `goal.create`, `goal.update`,
`issue.create`, `issue.update` and `issue.comment`. Companies, agents and goals are
referenced by name and resolved **within the named company**, so two companies may
both have a "Market Analyst". A comment is attributed to `ops-repo`, not to an agent —
the audit trail should show a human steering.

### Reading state back

| Variable | Effect |
|---|---|
| `PAPERCLIP_OPS_STATUS_PATH` | Where the snapshot is committed (default `status/state.json`). |

Every cycle the poller commits a snapshot of each company — agents and their status,
goals, issues with assignee and goal, pending approvals, and the last 20 runs — so an
operator outside the deployment can see current state instead of reasoning from a
backup dump up to a day old. It is republished whether or not a document applied,
because a stale snapshot is worse than none, and skipped when the content has not
changed.

Only structural fields are exported. Descriptions, comment bodies and approval
payloads are left out: the snapshot says what state the company is in, not what is in
it. The file is a read-only mirror — editing it changes nothing and is overwritten on
the next cycle.

```json
{"apiVersion":"paperclip.ops/v1","operations":[
  {"op":"issue.update","company":"aux","title":"Map the competitor landscape for journey/flow decisions","status":"done"},
  {"op":"issue.update","company":"aux","title":"Position the laya capability against the landscape","status":"todo"}
]}
```

Applied file shas are recorded in `instance_settings.experimental.opsApplied`, so each
version is applied once; editing a file applies it again, and the per-operation
existence checks stop that duplicating anything. A document that fails mid-way is left
unrecorded and retried on the next tick — operations before the failure have already
been applied, so write them to be safe to repeat. A malformed document is recorded and
skipped rather than re-read every tick.

**Security.** Whoever can push to the ops repository can create goals and issues and
move issues between statuses. Keep it private and restrict who can push. The allowlist
is deliberately narrow: no secrets, no adapter configuration, no agent creation, no
deletions — anything destructive stays a deliberate human action through the UI.

**Approvals are deliberately absent.** `POST /approvals/:id/approve` exists, but the
approval gate's purpose is to require a human. Putting approve/reject behind a
repository that an automated operator can push to would let that operator approve its
own agents' requests, and the governance invariant becomes decorative. Approvals stay
in the UI. The snapshot reports what is waiting so an operator can say so; it cannot
decide.

## 7. Known limitation

Upstream does not vendor the Firm CLI (`42futures/firm`); the reviews under
`spec/reviews/` record CLI packaging as outstanding. Goals that declare the
`firm` capability with `buildBefore`/`buildAfter` stay blocked until a `firm`
binary exists in the image or under `/paperclip` and `FIRM_CLI_PATH` points at
it. The entrypoint passes the variable through and logs it; nothing else in this
update depends on it.

## 8. Rollback

The Space is a git repo: `git -C /tmp/space revert <sync commit> && git push`
rebuilds the previous image. Company data is unaffected — it lives in the
container Postgres and in `COMPANIES_BACKUP_REPO`, not in the Space repo.
