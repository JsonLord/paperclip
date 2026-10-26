FROM node:lts-trixie-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git python3 python3-venv pipx postgresql sudo \
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
RUN PIPX_HOME=/opt/pipx PIPX_BIN_DIR=/usr/local/bin pipx install hermes-agent \
  && mkdir -p /paperclip/instances/default/db \
  && chown -R node:node /paperclip \
  && chown -R postgres:postgres /var/lib/postgresql/17 \
  && mkdir -p /var/log/postgresql && chown postgres:postgres /var/log/postgresql

ENV NODE_ENV=production \
  HOME=/paperclip \
  HOST=0.0.0.0 \
  PORT=7860 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=private

VOLUME ["/paperclip"]
EXPOSE 7860

# 创建启动脚本
COPY << 'EOF' /app/start.sh
#!/bin/bash
set -e

# 启动PostgreSQL作为postgres用户
echo "Starting PostgreSQL..."
su - postgres -c "/usr/lib/postgresql/17/bin/pg_ctl start -D /var/lib/postgresql/17/main -l /var/log/postgresql/postgresql-17-main.log" || true

# 等待PostgreSQL就绪
echo "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
    su - postgres -c "/usr/lib/postgresql/17/bin/pg_isready" && break
    sleep 1
done

# 设置环境变量
export DATABASE_URL="postgres://postgres@localhost:5432/paperclip"

# 启动应用
echo "Starting Paperclip server..."
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
EOF

RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
