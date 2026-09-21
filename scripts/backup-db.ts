// Sauvegarde logique de la base : toutes les tables du schéma public dans un
// fichier JSON horodaté, hors du dépôt git.
//
//   DOTENV_CONFIG_PATH=.env.prod.local npm run backup:db
//
// Lecture seule : uniquement des SELECT. Le fichier contient les données
// financières et les empreintes de mots de passe — il est écrit dans
// ../backups/, jamais dans le dépôt, et ne doit pas être partagé.
//
// C'est un filet de sécurité avant une écriture en production, pas un substitut
// aux sauvegardes Supabase : on y retrouve chaque ligne telle qu'elle était,
// mais la restauration se fait table par table, à la main ou par script.

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { Pool, types } from "pg";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

// Dates et horodatages gardés tels que PostgreSQL les écrit : les convertir en
// Date JavaScript les décalerait selon le fuseau de la machine.
for (const oid of [1082, 1114, 1184]) types.setTypeParser(oid, (v) => v);

async function main() {
  requireEnvTarget();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "✗ DATABASE_URL est vide : la base locale PGlite est un simple dossier (.data/pglite),\n" +
        "  il suffit de le copier. Pour la production : DOTENV_CONFIG_PATH=.env.prod.local npm run backup:db"
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const { rows: tables } = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"
  );

  console.log(`Base : ${describeTarget()}`);
  const dump: Record<string, unknown[]> = {};
  for (const { table_name } of tables) {
    const { rows } = await pool.query(`select * from "${table_name}" order by 1`);
    dump[table_name] = rows;
    console.log(`  ${table_name.padEnd(24)} ${String(rows.length).padStart(7)} lignes`);
  }
  await pool.end();

  const dir = resolve(process.cwd(), "..", "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const file = join(dir, `sodobat-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), tables: dump }));
  console.log(`✓ ${file}`);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
