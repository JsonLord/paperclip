#!/usr/bin/env bash
# Set up environment variables for HF Space

# Try to use a free PostgreSQL service
# Options: Neon, Supabase, etc.
# For now, we'll use a simple approach

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    # Try to use a free PostgreSQL instance
    # This is a placeholder - user should set their own DATABASE_URL
    export DATABASE_URL="postgres://postgres:password@localhost:5432/paperclip"
fi

export PORT="${PORT:-7860}"
export NODE_ENV="${NODE_ENV:-production}"
