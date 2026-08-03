#!/bin/sh
set -e
export NODE_PATH=/app/node_modules_full
# Pousse le schéma puis seed (idempotent), avec les node_modules complets
node_modules_full/.bin/drizzle-kit push --force
node_modules_full/.bin/tsx src/db/seed.ts
exec node server.js
