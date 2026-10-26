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
