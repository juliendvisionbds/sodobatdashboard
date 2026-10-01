// Copie d'une sauvegarde dans une base locale jetable, pour répéter une
// opération avant de la lancer en production.
//
//   PGLITE_DIR=/tmp/clone npx drizzle-kit push --force
//   PGLITE_DIR=/tmp/clone npm run clone:local -- ../backups/sodobat-AAAA-MM-JJ-….json
//
// La sauvegarde est celle de `npm run backup:db`. Sont copiées les tables dont
// dépendent les tableaux : entités, centres, maquette, règles, imports et leurs
// lignes, saisies, validations, alertes. Les comptes utilisateurs (et leurs
// empreintes de mot de passe) et les conversations de l'assistant ne le sont pas.
//
// Refuse de tourner dès que DATABASE_URL est défini : il n'écrit que dans une
// base PGlite, vide de préférence.

import "dotenv/config";
import { readFileSync } from "fs";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { requireLocalDatabase } from "./guard-local";

// Dans l'ordre des clés étrangères.
const TABLES = [
  "entities",
  "centres",
  "categories",
  "account_rules",
  "imports",
  "general_balance_lines",
  "analytic_lines",
  "manual_entries",
  "rapprochement_decisions",
  "month_validations",
  "alerts",
];

async function main() {
  if (process.argv.includes("--allow-remote"))
    throw new Error("ce script n'écrit jamais sur une base distante");
  requireLocalDatabase("clone-local");
  const file = process.argv.slice(2).find((a) => a.endsWith(".json"));
  if (!file) {
    console.error("Usage : PGLITE_DIR=<dossier> npm run clone:local -- <sauvegarde.json>");
    process.exit(1);
  }
  const dump = JSON.parse(readFileSync(file, "utf-8")) as {
    takenAt: string;
    tables: Record<string, Record<string, unknown>[]>;
  };
  console.log(`Sauvegarde du ${dump.takenAt} → ${process.env.PGLITE_DIR ?? "./.data/pglite"}`);

  for (const table of [...TABLES].reverse()) await db.execute(sql`delete from ${sql.identifier(table)}`);

  for (const table of TABLES) {
    const rows = dump.tables[table] ?? [];
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      const value = (v: unknown) =>
        v != null && typeof v === "object" ? sql`${JSON.stringify(v)}::jsonb` : sql`${v}`;
      for (let i = 0; i < rows.length; i += 400) {
        const chunk = rows.slice(i, i + 400);
        await db.execute(sql`
          insert into ${sql.identifier(table)} (${sql.join(cols.map((c) => sql.identifier(c)), sql`, `)})
          values ${sql.join(
            chunk.map((r) => sql`(${sql.join(cols.map((c) => value(r[c])), sql`, `)})`),
            sql`, `
          )}`);
      }
      // Les identifiants sont repris tels quels : la séquence repart après le dernier.
      await db.execute(
        sql`select setval(pg_get_serial_sequence(${table}, 'id'), (select max(id) from ${sql.identifier(table)}))`
      );
    }
    console.log(`  ${table.padEnd(24)} ${String(rows.length).padStart(7)} lignes`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
