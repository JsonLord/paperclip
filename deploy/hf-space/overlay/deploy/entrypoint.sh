#!/usr/bin/env bash

# Clean up any stale postgres data from previous runs
if [ -d "/paperclip/instances/default/db" ]; then
    rm -rf /paperclip/instances/default/db/*
fi

# Ensure permissions are correct
mkdir -p /paperclip/instances/default/db
chown -R node:node /paperclip

# Start the application
exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
