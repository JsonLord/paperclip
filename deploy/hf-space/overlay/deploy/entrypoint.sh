#!/usr/bin/env bash
set -e

# Clean up any stale postgres data from previous runs
rm -rf /paperclip/instances/default/db/*

# Start the application
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
