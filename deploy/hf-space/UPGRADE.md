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

`deploy/seed-jules.sh` closes both gaps on every boot: it signs in as the seeded
admin, imports each `JULES_API_*` value as a company secret through the REST API
(never SQL — the `local_encrypted` provider owns the material format), and creates
one profile per key at `sessionStartLimit=15` / `sessionStartWindowSec=86400`. Two
keys therefore give **30 session starts per 24h**.

Profile names are scoped to the company (`jules-<companyId8>-<n>`) because
`jules_profiles` carries no `companyId` while `secretRef` is company-scoped — a
bare name would look present while pointing at another company's secret and fail
only at dispatch.

| Variable | Effect |
|---|---|
| `JULES_SEED_COMPANY` | Target company id or exact name. Required once more than one company exists; the seeder refuses to guess. |
| `JULES_SEED_ROTATE` | Push the current env value as a new secret version. Off by default so boots do not pile up versions. |
| `JULES_SESSION_START_LIMIT` / `JULES_SESSION_WINDOW_SEC` | Override the 15 / 86400 defaults. |

Binding a repository stays manual, since it needs the Jules-side source id:
`POST /api/companies/<id>/jules-sources {repository, source, profileIds}`.

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
