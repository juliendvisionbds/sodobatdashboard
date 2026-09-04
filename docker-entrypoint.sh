#!/bin/sh
set -e
export NODE_PATH=/app/node_modules_full
# Pousse le schéma puis seed (idempotent), avec les node_modules complets
node_modules_full/.bin/drizzle-kit push --force
# entités et utilisateurs (idempotent)
node_modules_full/.bin/tsx src/db/seed.ts
# nomenclature Sodobat : réinstallée seulement si elle a changé dans le code, pour
# ne pas effacer à chaque redémarrage les règles créées depuis l'écran Mapping.
# Sans cette étape, aucun compte ne serait mappé au premier démarrage.
node_modules_full/.bin/tsx src/db/seed-nomenclature.ts --only-if-changed
exec node server.js
