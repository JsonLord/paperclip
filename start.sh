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
EP_FILE="/app/node_modules/.pnpm/embedded-postgres@18.1.0-beta.16/node_modules/embedded-postgres/dist/index.js"
if [ -f "$EP_FILE" ]; then
    if ! grep -q "createPostgresUser = true" "$EP_FILE"; then
        echo "Patching embedded-postgres to auto-create postgres user..."
        # 使用 sed 在 checkForRootUser 方法中添加自动创建用户的逻辑
        sed -i 's/if (!this.isRootUser) {/if (!this.isRootUser) {\n                return;\n            }\n            \/\/ Auto-enable createPostgresUser for root environments/g; s/return;\n            }/}/' "$EP_FILE" 2>/dev/null || true
        # 确保 createPostgresUser 被设置
        if ! grep -q "createPostgresUser = true" "$EP_FILE"; then
            sed -i '/if (!this.options.createPostgresUser) {/i\                this.options.createPostgresUser = true;\n                yield this.getUidAndGid();' "$EP_FILE"
        fi
        echo "embedded-postgres patched!"
    else
        echo "embedded-postgres already patched."
    fi
else
    echo "embedded-postgres file not found at $EP_FILE"
fi

echo "Starting Paperclip server with embedded PostgreSQL..."
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
