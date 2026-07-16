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

Paperclip-surfers agent control-plane and its OpenViking memory server, packaged into
one Docker Space. Paperclip serves its native HTTP API + UI on the Space URL; OpenViking
runs as an internal sidecar on `127.0.0.1:1933`.

- **DB**: external managed Postgres via the `DATABASE_URL` secret (durable; not stored in the Space).
- **Persistence**: file-state (paperclip instance data + openviking memory) is stored nightly
  and on shutdown as a large object **inside the Neon DB**, and restored on every boot — see `deploy/`.
- **Agents**: executed remotely via HTTP adapters (desk_agent over the tailscale funnel and
  openoperator). The baked hermes-gateway skill points at the desk_agent public funnel URL.
- **Secrets**: everything (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `PAPERCLIP_PUBLIC_URL`,
  `OPENVIKING_ROOT_API_KEY`, `OPENVIKING_API_KEY`, `BLABLADOR_TOKEN`, `DESK_AGENT_HOST`)
  is injected from **Space Settings → Secrets**. Nothing is hardcoded in the image or this repo.

## First run
After the build, watch the Space logs for a `[bootstrap-ceo] …/invite/<token>` line, sign
up at the Space URL, then open that invite link to become the instance admin.
