#!/usr/bin/env bash
# scripts/start-local-pg.sh - spin up a temporary, isolated PostgreSQL for tests.
# Uses the bundled PostgreSQL binaries from @embedded-postgres/linux-x64 (no root).
# Listens on a high unprivileged port on loopback with trust auth. Developer/test
# use only - it does NOT touch the deployed HF Space or any production database.
set -uo pipefail

topdir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
store="$topdir/node_modules/.pnpm/@embedded-postgres+linux-x64@18.1.0-beta.16/node_modules/@embedded-postgres/linux-x64/native"
pg_bin="$store/bin"
pg_lib="$store/lib"
export LD_LIBRARY_PATH="$pg_lib:${LD_LIBRARY_PATH:-}"

PORT=55432
PGDATA="$topdir/tmp/pgdata"
LOGFILE="$topdir/tmp/pg.log"

rm -rf "$PGDATA"
mkdir -p "$topdir/tmp"

"$pg_bin/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null

# -w waits until the server reports ready (removes the startup race).
"$pg_bin/pg_ctl" -D "$PGDATA" -l "$LOGFILE" -w -t 60 \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c fsync=off" start

# Create the test database. Run node from packages/db so the 'postgres' transitive
# dependency resolves there (it is not importable from the repo root under pnpm).
(cd "$topdir/packages/db" && node - <<'NODE'
const sql = require('postgres')({ host: '127.0.0.1', port: 55432, username: 'postgres' });
(async () => {
  try {
    await sql`CREATE DATABASE paperclip_test`;
    console.log('Database paperclip_test created');
  } catch (e) {
    console.error('create db note:', String(e).slice(0, 140));
  }
  await sql.end();
})();
NODE
)

export DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/paperclip_test"
echo "PostgreSQL ready on port $PORT"
echo "DATABASE_URL=$DATABASE_URL"
echo "To stop later: $pg_bin/pg_ctl -D $PGDATA -m fast stop"
