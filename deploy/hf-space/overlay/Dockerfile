# Combined HF Space image: paperclip control-plane + openviking memory sidecar.
# Built by HuggingFace (not the laptop). Runs as uid 1000 (node), listens on :7860.
# Based on paperclip's own multi-stage Dockerfile, extended with openviking,
# backup tooling, and a supervisor entrypoint. No secrets are baked in — the
# entrypoint templates all config from HF Space env secrets at runtime.

FROM node:lts-trixie-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/
COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/gemini-local/package.json packages/adapters/gemini-local/
COPY packages/adapters/jules/package.json packages/adapters/jules/
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/
COPY packages/plugins/sdk/package.json packages/plugins/sdk/
COPY packages/plugins/create-paperclip-plugin/package.json packages/plugins/create-paperclip-plugin/
COPY packages/plugins/examples/plugin-authoring-smoke-example/package.json packages/plugins/examples/plugin-authoring-smoke-example/
COPY packages/plugins/examples/plugin-file-browser-example/package.json packages/plugins/examples/plugin-file-browser-example/
COPY packages/plugins/examples/plugin-hello-world-example/package.json packages/plugins/examples/plugin-hello-world-example/
COPY packages/plugins/examples/plugin-kitchen-sink-example/package.json packages/plugins/examples/plugin-kitchen-sink-example/
COPY patches/ patches/
# Upstream policy (CLAUDE.md) is that pnpm-lock.yaml is NOT committed on feature
# branches — CI regenerates it on master. A branch that adds a workspace package
# (e.g. packages/adapters/jules) therefore ships a lockfile without that importer
# and --frozen-lockfile fails with ERR_PNPM_OUTDATED_LOCKFILE. Resolve rather
# than fail the Space build; deploy/hf-space/sync.sh refreshes the lockfile
# beforehand when pnpm is available locally, which keeps the fast path.
RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @paperclipai/ui build
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/server build
RUN pnpm --filter paperclipai build            # CLI (paperclipai) -> cli/dist/index.js, needed for `auth bootstrap-ceo`
RUN test -f server/dist/index.js || (echo "ERROR: server build output missing" && exit 1)
RUN test -f cli/dist/index.js    || (echo "ERROR: cli build output missing" && exit 1)

FROM base AS production
WORKDIR /app
COPY --chown=node:node --from=build /app /app

# Agent CLIs (local adapters) + paperclip home
RUN npm install --global --omit=dev @anthropic-ai/claude-code@latest @openai/codex@latest opencode-ai \
  && mkdir -p /paperclip \
  && chown node:node /paperclip

# Python toolchain + hermes CLI + OpenViking memory server + backup/runtime tooling.
# build-essential ensures any source-built openviking deps (tree-sitter etc.) succeed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       python3 python3-pip pipx build-essential gettext-base postgresql postgresql-contrib postgresql-client tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && (curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash || pipx install --global hermes-agent) \
  && pipx install --global openviking==0.4.6

# Firm CLI. Every FounderOS goal contract ends in "firm build passes" and the server
# shells out to `firm` (services/firm-cli.ts, FIRM_CLI_PATH or PATH), so without it the
# firm half of the model cannot be built or validated. Prebuilt release binary — no
# Rust toolchain in the image. The checksum is verified because this is an unpinned
# "latest" URL; update FIRM_SHA256 when bumping, and the build fails loudly on a
# mismatch rather than shipping something unexpected.
ARG FIRM_SHA256=2ef50f7bcc16916feef2e16391a0d07ddf52e6664d79191ed5827a1db3fa8caa
RUN set -eux; \
    tmp="$(mktemp -d)"; \
    curl -fsSL -o "$tmp/firm.tar.gz" https://github.com/42futures/firm/releases/latest/download/firm-linux-amd64.tar.gz; \
    echo "${FIRM_SHA256}  $tmp/firm.tar.gz" | sha256sum -c -; \
    tar -xzf "$tmp/firm.tar.gz" -C "$tmp"; \
    install -m 0755 "$tmp/firm" /usr/local/bin/firm; \
    rm -rf "$tmp"; \
    firm --version

# Baked-in HOME for the hermes_local subprocess (see docker/hermes-home)
COPY docker/hermes-home /opt/hermes-home
RUN chown -R node:node /opt/hermes-home

# Deploy glue is already present under /app/deploy (from `COPY . .`); make it executable.
RUN chmod +x /app/deploy/*.sh

ENV NODE_ENV=production \
  HOME=/paperclip \
  HOST=0.0.0.0 \
  PORT=7860 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=public \
  PAPERCLIP_AUTH_BASE_URL_MODE=explicit \
  PAPERCLIP_PUBLIC_URL=https://leon4gr45-paperclip-founder.hf.space \
  PAPERCLIP_MIGRATION_AUTO_APPLY=true \
  OPENVIKING_CONFIG_FILE=/paperclip/.openviking/ov.conf \
  HERMES_DASHBOARD_HOST=127.0.0.1 \
  HERMES_DASHBOARD_PORT=7861 \
  HERMES_DASHBOARD_URL=http://127.0.0.1:7861 \
  JULES_API_BASE_URL=https://jules.googleapis.com/v1alpha \
  JULES_RECONCILE_INTERVAL_MS=30000 \
  JULES_OUTBOX_INTERVAL_MS=15000 \
  HEARTBEAT_SCHEDULER_ENABLED=true

VOLUME ["/paperclip"]
EXPOSE 7860

USER node
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
