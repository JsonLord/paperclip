#!/bin/bash
set -e

DB_DIR=/paperclip/instances/default/db
PORT="${PAPERCLIP_EMBEDDED_POSTGRES_PORT:-54329}"

# --- ensure the 'postgres' system account exists -----------------------------
# embedded-postgres refuses to run binaries as root and only needs this account
# to exist: it then spawns initdb/postgres setuid'd to it.
if ! id postgres >/dev/null 2>&1; then
    echo "postgres user missing - creating it..."
    groupadd -r postgres
    useradd -r -g postgres -d /nonexistent -s /usr/sbin/nologin postgres
fi

# --- locate the bundled PostgreSQL binaries ----------------------------------
NATIVE_BIN="$(ls -d /app/node_modules/.pnpm/@embedded-postgres+linux-*/*/node_modules/@embedded-postgres/*/native/bin 2>/dev/null | head -1)"
if [ -z "$NATIVE_BIN" ]; then
    echo "FATAL: could not locate embedded-postgres native binaries"
    exit 1
fi
echo "Using bundled PostgreSQL binaries: $NATIVE_BIN"

# --- (re)initialise the cluster ourselves ------------------------------------
# The server swallows initdb's stderr, so we run initdb here with full logging.
# The app skips initdb itself as soon as it sees PG_VERSION.
echo "Cleaning stale cluster data..."
rm -rf "$DB_DIR"
mkdir -p "$DB_DIR"
chown -R postgres:postgres "$DB_DIR"
chmod 700 "$DB_DIR"

PWFILE="$(mktemp)"
printf 'paperclip\n' > "$PWFILE"
chmod 644 "$PWFILE"

echo "Running initdb as 'postgres' (port $PORT)..."
setpriv --reuid=postgres --regid=postgres --clear-groups \
  env -i HOME=/tmp LC_MESSAGES=C.UTF-8 \
  "$NATIVE_BIN/initdb" \
    --pgdata="$DB_DIR" \
    --auth=password \
    --username=paperclip \
    --pwfile="$PWFILE" \
    --lc-messages=C.UTF-8 \
    --encoding=UTF8 --locale=C 2>&1 | sed 's/^/[initdb] /'
INITDB_RC=${PIPESTATUS[0]}
rm -f "$PWFILE"

if [ "$INITDB_RC" != "0" ]; then
    echo "FATAL: initdb failed with exit code $INITDB_RC"
    exit "$INITDB_RC"
fi
chown -R postgres:postgres "$DB_DIR"
echo "Cluster initialised OK."

echo "Starting Paperclip server..."
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
