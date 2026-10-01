// Honoraires de management : une seule ligne, NJW (réponse de la DAF du
// 1er octobre 2026 — il n'existe pas d'honoraires de management entre Sodobat
// et SDG). À appliquer une fois sur la base visée :
//
//   DOTENV_CONFIG_PATH=.env.local node --import=tsx scripts/honoraires-management-njw.ts           (rapport seul)
//   DOTENV_CONFIG_PATH=.env.local node --import=tsx scripts/honoraires-management-njw.ts --apply
//
// Dans les Frais généraux, les lignes « Honoraires management SDG (holding) »
// et « Honoraires management NJW » et leur sous-total masqué deviennent une
// ligne « Honoraires management NJW », alimentée par 62263000 (et 62263100).
//
// Pourquoi pas `npm run db:nomenclature` : il remplace toute la nomenclature et
// efface les règles créées depuis l'écran Mapping. Ce script ne touche que ces
// trois lignes, puis réaligne l'ordre des lignes sur celui du code.
//
// Idempotent : relancer le script ne change rien de plus. Aucune donnée
// importée n'est touchée ; les vues se recalculent à la volée.

import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db, tables } from "../src/db";
import { nomenclature } from "../src/lib/nomenclature/sodobat";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const CIBLE = "fx_honoraires_management";
const ANCIENNES = ["fx_honoraires_sdg", "fx_honoraires_njw"];

async function main() {
  requireEnvTarget();
  const apply = process.argv.includes("--apply");
  console.log(`Base : ${describeTarget()}${apply ? "" : " — rapport seul, aucune écriture"}\n`);

  const line = nomenclature.find((l) => l.code === CIBLE);
  if (!line || line.kind !== "poste") throw new Error(`${CIBLE} n'est pas un poste dans le code`);

  const cats = await db.select().from(tables.categories);
  const byCode = new Map(cats.map((c) => [c.code, c]));
  const cible = byCode.get(CIBLE);
  if (!cible) throw new Error(`${CIBLE} absente de la base : installer la nomenclature d'abord`);
  const anciennes = ANCIENNES.map((c) => byCode.get(c)).filter((c) => !!c);

  const rules = anciennes.length
    ? await db
        .select()
        .from(tables.accountRules)
        .where(inArray(tables.accountRules.categoryId, anciennes.map((c) => c.id)))
    : [];
  const dejaSurCible = await db
    .select()
    .from(tables.accountRules)
    .where(eq(tables.accountRules.categoryId, cible.id));
  const manquants = (line.accounts ?? []).filter(
    (a) => ![...rules, ...dejaSurCible].some((r) => r.pattern === a)
  );

  console.log(`« ${cible.label} » (${cible.kind}) → « ${line.label} » (poste)`);
  for (const c of anciennes) console.log(`ligne supprimée : « ${c.label} »`);
  for (const r of rules) console.log(`règle ${r.pattern} (${r.createdBy}) rattachée à la ligne NJW`);
  for (const a of manquants) console.log(`règle ${a} créée`);

  // L'ordre des lignes suit leur rang dans le code, comme à l'installation.
  const rangs = nomenclature
    .map((l, i) => ({ cat: byCode.get(l.code), i }))
    .filter((x) => x.cat && x.cat.sortOrder !== x.i) as { cat: (typeof cats)[number]; i: number }[];
  console.log(`${rangs.length} ligne(s) à renuméroter`);

  const horsCode = cats.filter(
    (c) => !ANCIENNES.includes(c.code) && !nomenclature.some((l) => l.code === c.code)
  );
  for (const c of horsCode) console.log(`! ligne en base absente du code, laissée telle quelle : ${c.code}`);

  if (!apply) {
    console.log("\nRelancer avec --apply pour écrire.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tables.categories)
      .set({
        label: line.label,
        kind: "poste",
        formula: null,
        hidden: line.hidden ?? false,
        notes: line.notes ?? null,
      })
      .where(eq(tables.categories.id, cible.id));
    if (rules.length)
      await tx
        .update(tables.accountRules)
        .set({ categoryId: cible.id })
        .where(inArray(tables.accountRules.id, rules.map((r) => r.id)));
    if (manquants.length)
      await tx.insert(tables.accountRules).values(
        manquants.map((account) => ({
          categoryId: cible.id,
          entityId: null,
          pattern: account,
          matchType: "exact" as const,
          createdBy: "seed",
        }))
      );
    if (anciennes.length)
      await tx
        .delete(tables.categories)
        .where(inArray(tables.categories.id, anciennes.map((c) => c.id)));
    for (const { cat, i } of rangs)
      await tx.update(tables.categories).set({ sortOrder: i }).where(eq(tables.categories.id, cat.id));
  });

  console.log("\nTerminé. Les vues se recalculent à la volée : aucun réimport nécessaire.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
