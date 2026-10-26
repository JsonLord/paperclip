FROM node:lts-trixie-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git python3 python3-venv pipx \
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
COPY packages/adapters/jules/package.json packages/adapters/jules/
COPY packages/plugins/sdk/package.json packages/plugins/sdk/

RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @paperclipai/ui build
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/server build
RUN test -f server/dist/index.js || (echo "ERROR: server build output missing" && exit 1)

FROM base AS production
WORKDIR /app
COPY --chown=node:node --from=build /app /app
# The 'postgres' system user makes embedded-postgres root-safe:
# checkForRootUser() returns early when `id -u postgres` succeeds, and
# initialise()/start() spawn initdb/postgres setuid'd to that user.
RUN PIPX_HOME=/opt/pipx PIPX_BIN_DIR=/usr/local/bin pipx install hermes-agent \
  && (getent group postgres || groupadd -r postgres) \
  && (id postgres >/dev/null 2>&1 || useradd -r -g postgres -d /nonexistent -s /usr/sbin/nologin postgres) \
  && mkdir -p /paperclip/instances/default/db \
  && chown -R node:node /paperclip \
  && chown -R postgres:postgres /paperclip/instances/default/db

ENV NODE_ENV=production \
  HOME=/paperclip \
  HOST=0.0.0.0 \
  PORT=7860 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
  PAPERCLIP_EMBEDDED_POSTGRES_VERBOSE=true \
  PAPERCLIP_MIGRATION_AUTO_APPLY=true

VOLUME ["/paperclip"]
EXPOSE 7860

COPY --chown=node:node start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
