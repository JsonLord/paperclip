#!/bin/bash
set -e

DB_DIR=/paperclip/instances/default/db

# Start fresh each boot; data is restored from the GitHub backup afterwards
if [ -d "$DB_DIR" ]; then
    echo "Cleaning up stale database directory..."
    rm -rf "$DB_DIR"
fi
mkdir -p "$DB_DIR"

# Ensure the postgres system user exists (normally baked into the image)
if ! id postgres >/dev/null 2>&1; then
    echo "postgres user missing - creating it now..."
    groupadd -r postgres
    useradd -r -g postgres -d /nonexistent -s /usr/sbin/nologin postgres
fi

# initdb/postgres run setuid to 'postgres' - they must own the data dir
chown -R postgres:postgres "$DB_DIR"
chmod 700 "$DB_DIR"

echo "Starting Paperclip server (embedded PostgreSQL as '$(id -nu postgres)' user)..."
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
