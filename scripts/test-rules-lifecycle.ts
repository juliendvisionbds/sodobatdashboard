// Test du cycle de vie des règles de mapping : création, précédence,
// remplacement (désactivation) et rétablissement. Nettoie tout à la fin.

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

  // état initial : compte 61350000 (locations) → catégorie via règle seed préfixe
  const m0 = await loadMapper("fx", entity.id, entity.code);
  const before = m0.resolve("61350000");
  check("état initial : 61350000 mappé par une règle seed", before != null, before?.label);

  // 1) création d'une règle exacte entité → doit gagner sur le préfixe seed
  const otherCat = m0.categories.find((c) => c.id !== before?.id)!;
  const [created] = await db
    .insert(tables.accountRules)
    .values({
      categoryId: otherCat.id,
      entityId: entity.id,
      pattern: "61350000",
      matchType: "exact",
      createdBy: "test",
    })
    .returning();
  const m1 = await loadMapper("fx", entity.id, entity.code);
  check(
    "règle exacte entité prioritaire sur préfixe seed",
    m1.resolve("61350000")?.id === otherCat.id,
    `→ ${m1.resolve("61350000")?.label}`
  );
  check(
    "les autres comptes du préfixe restent sur la règle seed",
    m1.resolve("61350099")?.id === before?.id
  );
  await db.delete(tables.accountRules).where(eq(tables.accountRules.id, created.id));

  // 2) remplacement d'une règle seed : désactivation + règle entité même pattern
  const [seedRule] = await db
    .select()
    .from(tables.accountRules)
    .where(
      and(
        eq(tables.accountRules.pattern, "6135"),
        eq(tables.accountRules.matchType, "prefix"),
        eq(tables.accountRules.active, true)
      )
    );
  if (!seedRule) throw new Error("règle seed 6135 introuvable — adapter le test");
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
    "après remplacement : le préfixe 6135 pointe vers la nouvelle catégorie",
    m2.resolve("61350000")?.id === otherCat.id,
    `→ ${m2.resolve("61350000")?.label}`
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
    m3.resolve("61350000")?.id === before?.id,
    `→ ${m3.resolve("61350000")?.label}`
  );

  console.log(failures === 0 ? "\nCycle de vie des règles : OK" : `\n${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
