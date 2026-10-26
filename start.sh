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

echo "Starting Paperclip server with embedded PostgreSQL..."
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
