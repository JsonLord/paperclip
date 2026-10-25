---
title: Paperclip
emoji: 📎
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Paperclip (control plane) + OpenViking (memory), single Space

Paperclip agent control-plane and its OpenViking memory server, packaged into
one Docker Space. Paperclip serves its native HTTP API + UI on the Space URL; OpenViking
runs as an internal sidecar on `127.0.0.1:1933`.

- **DB**: local PostgreSQL inside the container, dumped to the GitHub companies backup
  repo nightly and on shutdown, restored on boot before Paperclip starts — see `deploy/`.
- **Persistence**: OpenViking memory (`vectordb/` + `viking/`) is mirrored to a second
  private GitHub repo and restored on every boot.
- **Agents**: local adapters (claude/codex/cursor/gemini/opencode/pi), the OpenClaw
  gateway, `hermes_local`, and the native **`jules`** adapter for remote asynchronous
  execution. Jules runs through that native adapter against the Jules REST API — the
  old desk_agent tailscale-funnel proxy has been removed.
- **FounderOS**: Companies → **Import FounderOS** installs the validation-first operating
  model — one Vision Goal, the full Goal-template catalog, the Initial Venture Validation
  project, a Hermes Founder Manager and ten Jules employees.
- **Secrets**: everything (`BETTER_AUTH_SECRET`, `PAPERCLIP_PUBLIC_URL`,
  `OPENVIKING_ROOT_API_KEY`, `OPENVIKING_API_KEY`, `BLABLADOR_TOKEN`, `GITHUB_TOKEN`,
  `PAPERCLIP_ADMIN_PASSWORD`, `PAPERCLIP_ADMIN_GITHUB_LOGIN`,
  `OPENVIKING_BACKUP_REPO`, `COMPANIES_BACKUP_REPO`) is injected from
  **Space Settings → Secrets**. Nothing is hardcoded in the image or this repo.

## First run
After the build, watch the Space logs for a `[bootstrap-ceo] …/invite/<token>` line, sign
up at the Space URL, then open that invite link to become the instance admin.

## FounderOS first run
1. Create a secret-backed **Jules profile** with the required capabilities.
2. Confirm the profile lists the intended GitHub company repository as a Jules source.
3. Open **Companies → Import FounderOS**, enter `owner/repository` and the pinned
   FounderOS content commit.
4. Check **Goals** (contracts, acceptance criteria, support packs), **Agents/Org**
   (Founder Manager + Jules employees) and **Issues** (evidence baseline).
5. Paused employees mean Jules credential/source access needs repairing — repair it
   rather than completing the blocked evidence issue by hand.

## Updating this Space
Do not upload a fresh checkout over the top. Run `deploy/hf-space/sync.sh` from the
`JsonLord/paperclip` checkout: it overlays the new upstream code while preserving the
Space-only files (`deploy/`, `docker/hermes-home/`, `patches/`, `FounderOS-DEMO/`,
`Agent.md`, `CLAUDE.md`, `.gitattributes`, `.hfignore`). See `deploy/hf-space/UPGRADE.md`.
