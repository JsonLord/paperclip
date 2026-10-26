#!/usr/bin/env bash
set -e

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "WARNING: DATABASE_URL not set. Trying to use embedded PostgreSQL..."
    
    # Try to initialize postgres manually
    PGDATA="/paperclip/pgdata"
    mkdir -p "$PGDATA"
    chmod 777 "$PGDATA"
    
    # Initialize postgres cluster
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
        echo "Initializing PostgreSQL cluster..."
        initdb -D "$PGDATA" -U paperclip --auth=trust --encoding=UTF8 2>&1 || {
            echo "ERROR: Failed to initialize PostgreSQL"
            exit 1
        }
    fi
    
    # Start postgres
    echo "Starting PostgreSQL..."
    pg_ctl -D "$PGDATA" -l /paperclip/pg.log start || {
        echo "ERROR: Failed to start PostgreSQL"
        exit 1
    }
    
    # Create database
    createdb -U paperclip paperclip 2>/dev/null || true
    
    # Set DATABASE_URL
    export DATABASE_URL="postgres://paperclip@localhost:5432/paperclip"
    echo "DATABASE_URL set to: $DATABASE_URL"
fi

echo "Database setup complete"
