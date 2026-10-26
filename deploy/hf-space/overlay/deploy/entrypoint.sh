#!/usr/bin/env bash
set -e

# Clean up any stale postgres data from previous runs
if [ -d "/paperclip/instances/default/db" ]; then
    echo "Cleaning up old postgres data..."
    rm -rf /paperclip/instances/default/db/*
fi

# Start the application
echo "Starting Paperclip server..."
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
