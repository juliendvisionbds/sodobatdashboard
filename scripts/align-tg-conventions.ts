// Reprise de deux conventions du tableau de gestion de la DAF (rapprochement du
// 22 septembre 2026), à appliquer une fois sur la base visée :
//
//   DOTENV_CONFIG_PATH=.env.prod.local node --import=tsx scripts/align-tg-conventions.ts
//
//  1. DEPOT et SAV sont suivis comme des chantiers dans le TG : classement
//     forcé en « chantier » (centres.kind), avec leurs reports d'ouverture de
//     l'onglet « TG 11-12 2025 ».
//  2. Quatre centres créés par Cegid sur une faute de frappe (import ASCII)
//     sont lus comme leur vrai chantier (centres.alias_of). Les lignes
//     importées ne bougent pas.
//
// Idempotent : relancer le script ne change rien de plus. Réversible : remettre
// kind et alias_of à null, supprimer les quatre reports d'ouverture.
//
// La nomenclature (déplacements et réceptions de chantier rangés avec les
// honoraires) s'installe à part : `npm run db:nomenclature`.

import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, tables } from "../src/db";
import { getEntityByCode } from "../src/lib/finance";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const ALIAS: [string, string][] = [
  ["1034B", "1034E"],
  ["1047A", "1047E"],
  ["1036C", "1036A"],
  ["52MF", "52"],
];

// Reports d'ouverture au 31 octobre 2025, onglet « TG 11-12 2025 » de la DAF.
const REPORTS: { centre: string; name: string; facturation: number; resultat: number }[] = [
  { centre: "DEPOT", name: "DEPOT", facturation: 7943.05, resultat: -860440.63 },
  { centre: "SAV", name: "SAV Anciens Clients", facturation: -1051.27, resultat: -1363.54 },
];

const SOURCE = "TG 11-12 2025 · rapprochement du 2026-09-22";

async function main() {
  requireEnvTarget();
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité sodobat absente");
  console.log(`Base : ${describeTarget()}\n`);

  // Colonne ajoutée au schéma le 22 septembre ; équivalent de `drizzle-kit push`.
  await db.execute(sql`alter table centres add column if not exists alias_of text`);

  const cibles = await db
    .select({ code: tables.centres.code })
    .from(tables.centres)
    .where(
      and(eq(tables.centres.entityId, entity.id), inArray(tables.centres.code, ALIAS.map(([, c]) => c)))
    );
  const manquantes = ALIAS.map(([, c]) => c).filter((c) => !cibles.some((x) => x.code === c));
  if (manquantes.length) throw new Error(`chantiers cibles inconnus : ${manquantes.join(", ")}`);

  await db.transaction(async (tx) => {
    for (const r of REPORTS) {
      await tx
        .insert(tables.centres)
        .values({ entityId: entity.id, code: r.centre, name: r.name, pole: null, kind: "chantier" })
        .onConflictDoUpdate({
          target: [tables.centres.entityId, tables.centres.code],
          set: { kind: "chantier" },
        });
      for (const [subKey, value] of [
        ["facturation", r.facturation],
        ["resultat", r.resultat],
      ] as const) {
        await tx
          .insert(tables.manualEntries)
          .values({
            entityId: entity.id,
            period: "2025-11-01",
            centreCode: r.centre,
            field: "report_ouverture",
            subKey,
            valueNum: String(value),
            status: "final",
            updatedBy: SOURCE,
          })
          .onConflictDoUpdate({
            target: [
              tables.manualEntries.entityId,
              tables.manualEntries.period,
              tables.manualEntries.centreCode,
              tables.manualEntries.field,
              tables.manualEntries.subKey,
            ],
            set: { valueNum: String(value), status: "final", updatedBy: SOURCE, updatedAt: new Date() },
          });
      }
      console.log(`✓ ${r.centre} classé en chantier, reports ${r.facturation} / ${r.resultat}`);
    }
    for (const [fantome, vrai] of ALIAS) {
      const res = await tx
        .update(tables.centres)
        .set({ aliasOf: vrai })
        .where(and(eq(tables.centres.entityId, entity.id), eq(tables.centres.code, fantome)))
        .returning({ code: tables.centres.code });
      console.log(res.length ? `✓ ${fantome} lu comme ${vrai}` : `– ${fantome} absent du référentiel, rien à faire`);
    }
  });

  console.log("\nTerminé. Les vues se recalculent à la volée : aucun réimport nécessaire.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
