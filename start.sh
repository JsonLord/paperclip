#!/bin/bash
set -e

# 清理可能残留的数据目录
if [ -d "/paperclip/instances/default/db" ]; then
    echo "Cleaning up stale database directory..."
    rm -rf /paperclip/instances/default/db/*
fi

# 确保目录存在且有正确权限
mkdir -p /paperclip/instances/default/db
chmod 777 /paperclip/instances/default/db

# 在启动前应用 embedded-postgres 补丁
echo "Applying embedded-postgres patch..."
patch_file="/app/node_modules/.pnpm/embedded-postgres@18.1.0-beta.16/node_modules/embedded-postgres/dist/index.js"
if [ -f "$patch_file" ]; then
    if ! grep -q "Auto-create postgres user" "$patch_file"; then
        sed -i '/if (this.isRootUser) {/a\                this.options.createPostgresUser = true;\n                yield this.getUidAndGid();' "$patch_file"
        echo "Patched embedded-postgres!"
    else
        echo "embedded-postgres already patched."
    fi
fi

echo "Starting Paperclip server with embedded PostgreSQL..."
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
