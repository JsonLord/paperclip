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

## 4. Space configuration that is preserved

`sync.sh` stashes these before mirroring and restores them afterwards:

- `deploy/ov.conf.tmpl`, `deploy/restore.sh`, `deploy/rewire-agents.sql.tmpl`,
  `deploy/e2e-smoke.sh` — OpenViking config template, boot restore, the
  loopback→funnel agent-URL rewrite, and the smoke script.
- `docker/hermes-home/` — baked `HOME` for the `hermes_local` subprocess, incl.
  the `hermes-gateway` skill pointing at the desk_agent funnel.
- `patches/` — the embedded-postgres locale patch (plus its `package.json` entry).
- `FounderOS-DEMO/` — the vendored company content app.
- `Agent.md`, `CLAUDE.md`, `.gitattributes`, `.hfignore`.
- `.agents/skills/company-creator` and the `.claude/skills/company-creator`
  symlink that points at it.

The GitHub backup wiring is **runtime configuration, not files**: `GITHUB_TOKEN`,
`OPENVIKING_BACKUP_REPO` and `COMPANIES_BACKUP_REPO` live in Space secrets and are
untouched. Company data lives in the container's local Postgres, restored on boot
from `COMPANIES_BACKUP_REPO` — no file in this update touches either path.

One deliberate deletion: the Space currently tracks a committed `node_modules/`
tree from an earlier `hf upload`. The image installs dependencies itself and HF
caps a repo at 20k files, so `sync.sh` removes it along with other stale files.

## 5. Space secrets and variables

Existing entries keep working unchanged. Add only what you want to switch on.

**Already required** — `BETTER_AUTH_SECRET`, `PAPERCLIP_PUBLIC_URL`,
`OPENVIKING_ROOT_API_KEY`, `OPENVIKING_API_KEY`, `BLABLADOR_TOKEN`,
`DESK_AGENT_HOST`, `GITHUB_TOKEN`, `OPENVIKING_BACKUP_REPO`, `COMPANIES_BACKUP_REPO`.

| Name | Needed for | Default if unset |
|---|---|---|
| `PAPERCLIP_JULES_CAPABILITY_SECRET` | Signing run-scoped Jules callback tokens. Min. 32 chars. | Falls back to `PAPERCLIP_AGENT_JWT_SECRET`, then to `BETTER_AUTH_SECRET` when that is ≥32 chars. **If `BETTER_AUTH_SECRET` is shorter, set this or Jules callbacks fail** — the entrypoint logs a warning. |
| `FOUNDER_MANAGER_BASE_URL` / `_API_KEY` / `_MODEL` | Hermes Founder Manager | Blablador + `BLABLADOR_TOKEN` + `alias-fast`, set by the entrypoint |
| `JULES_API_BASE_URL` | Jules REST endpoint | `https://jules.googleapis.com/v1alpha` |
| `JULES_RECONCILE_INTERVAL_MS` / `JULES_OUTBOX_INTERVAL_MS` | Worker cadence | `30000` / `15000` |
| `HEARTBEAT_SCHEDULER_ENABLED` | Dispatch loop | `true` |
| `FIRM_CLI_PATH` | Firm business-as-code validation | unset — see §7 |

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
