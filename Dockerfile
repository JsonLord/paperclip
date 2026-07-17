# Combined HF Space image: paperclip control-plane + openviking memory sidecar.
# Built by HuggingFace (not the laptop). Runs as uid 1000 (node), listens on :7860.
# Based on paperclip-surfers' own multi-stage Dockerfile, extended with openviking,
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
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/
COPY packages/plugins/sdk/package.json packages/plugins/sdk/
COPY patches/ patches/
RUN pnpm install --frozen-lockfile

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
  PAPERCLIP_MIGRATION_AUTO_APPLY=true \
  OPENVIKING_CONFIG_FILE=/paperclip/.openviking/ov.conf \
  HERMES_DASHBOARD_HOST=127.0.0.1 \
  HERMES_DASHBOARD_PORT=7861 \
  HERMES_DASHBOARD_URL=http://127.0.0.1:7861

VOLUME ["/paperclip"]
EXPOSE 7860

USER node
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
