// Test du cycle de vie des règles de mapping : création, précédence,
// remplacement (désactivation) et rétablissement. Nettoie tout à la fin.
//
// La nomenclature Sodobat mappe des comptes exacts ; le test vérifie donc à la
// fois qu'une règle entité l'emporte sur la règle seed du même compte, et qu'un
// préfixe créé à la main reste dominé par les règles exactes existantes.

import { and, eq } from "drizzle-orm";
import { db, tables } from "../src/db";
import { getEntityByCode } from "../src/lib/finance";
import { loadMapper } from "../src/lib/mapping";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("Entité sodobat absente");

  // état initial : 61350500 (locations matériel) → poste « Location véhicules »
  // par une règle exacte de la nomenclature.
  const ACCOUNT = "61350500";
  const SIBLING = "61350510";
  const m0 = await loadMapper("fx", entity.id, entity.code);
  const before = m0.resolve(ACCOUNT);
  const siblingBefore = m0.resolve(SIBLING);
  check(`état initial : ${ACCOUNT} mappé par une règle seed`, before != null, before?.label);

  // 1) création d'une règle exacte entité → doit gagner sur le préfixe seed
  const otherCat = m0.categories.find((c) => c.id !== before?.id)!;
  const [created] = await db
    .insert(tables.accountRules)
    .values({
      categoryId: otherCat.id,
      entityId: entity.id,
      pattern: ACCOUNT,
      matchType: "exact",
      createdBy: "test",
    })
    .returning();
  const m1 = await loadMapper("fx", entity.id, entity.code);
  check(
    "règle exacte entité prioritaire sur la règle seed du même compte",
    m1.resolve(ACCOUNT)?.id === otherCat.id,
    `→ ${m1.resolve(ACCOUNT)?.label}`
  );
  check(
    "les comptes voisins restent sur leur règle seed",
    m1.resolve(SIBLING)?.id === siblingBefore?.id,
    `${SIBLING} → ${m1.resolve(SIBLING)?.label}`
  );
  await db.delete(tables.accountRules).where(eq(tables.accountRules.id, created.id));

  // 2) remplacement d'une règle seed : désactivation + règle entité même pattern
  const [seedRule] = await db
    .select()
    .from(tables.accountRules)
    .where(
      and(
        eq(tables.accountRules.pattern, ACCOUNT),
        eq(tables.accountRules.matchType, "exact"),
        eq(tables.accountRules.active, true)
      )
    );
  if (!seedRule) throw new Error(`règle seed ${ACCOUNT} introuvable — adapter le test`);
  await db
    .update(tables.accountRules)
    .set({ active: false })
    .where(eq(tables.accountRules.id, seedRule.id));
  const [repl] = await db
    .insert(tables.accountRules)
    .values({
      categoryId: otherCat.id,
      entityId: entity.id,
      pattern: seedRule.pattern,
      matchType: seedRule.matchType,
      createdBy: "test",
    })
    .returning();
  const m2 = await loadMapper("fx", entity.id, entity.code);
  check(
    `après remplacement : ${ACCOUNT} pointe vers la nouvelle catégorie`,
    m2.resolve(ACCOUNT)?.id === otherCat.id,
    `→ ${m2.resolve(ACCOUNT)?.label}`
  );

  // 3) rétablissement : suppression du remplacement + réactivation seed
  await db.delete(tables.accountRules).where(eq(tables.accountRules.id, repl.id));
  await db
    .update(tables.accountRules)
    .set({ active: true })
    .where(eq(tables.accountRules.id, seedRule.id));
  const m3 = await loadMapper("fx", entity.id, entity.code);
  check(
    "après rétablissement : résolution identique à l'état initial",
    m3.resolve(ACCOUNT)?.id === before?.id,
    `→ ${m3.resolve(ACCOUNT)?.label}`
  );

  // 4) un préfixe créé à la main ne doit pas prendre le pas sur les règles
  //    exactes de la nomenclature : la précédence « exact > préfixe » les protège.
  const [broad] = await db
    .insert(tables.accountRules)
    .values({
      categoryId: otherCat.id,
      entityId: entity.id,
      pattern: "6135",
      matchType: "prefix",
      createdBy: "test",
    })
    .returning();
  const m4 = await loadMapper("fx", entity.id, entity.code);
  check(
    "un préfixe manuel ne détourne pas les comptes déjà mappés à l'exact",
    m4.resolve(ACCOUNT)?.id === before?.id && m4.resolve(SIBLING)?.id === siblingBefore?.id,
    `${ACCOUNT} → ${m4.resolve(ACCOUNT)?.label}`
  );
  check(
    "mais il capte bien un compte inconnu du même préfixe",
    m4.resolve("61359999")?.id === otherCat.id
  );
  await db.delete(tables.accountRules).where(eq(tables.accountRules.id, broad.id));

  console.log(failures === 0 ? "\nCycle de vie des règles : OK" : `\n${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
