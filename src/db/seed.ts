import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, tables } from "./index";
import {
  DEFAULT_PASSWORD,
  seedCategories,
  seedEntities,
  seedUsers,
} from "./seed-data";

async function main() {
  // Entités
  await db
    .insert(tables.entities)
    .values(seedEntities)
    .onConflictDoNothing({ target: tables.entities.code });

  // Utilisateurs (un par rôle)
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await db
    .insert(tables.users)
    .values(seedUsers.map((u) => ({ ...u, passwordHash: hash })))
    .onConflictDoNothing({ target: tables.users.email });

  // Nomenclature + règles de mapping
  for (const [i, cat] of seedCategories.entries()) {
    const inserted = await db
      .insert(tables.categories)
      .values({
        code: cat.code,
        view: cat.view,
        section: cat.section,
        label: cat.label,
        sign: cat.sign,
        sortOrder: i,
        entityScope: cat.entityScope ?? "all",
        notes: cat.notes,
      })
      .onConflictDoNothing({ target: tables.categories.code })
      .returning({ id: tables.categories.id });

    if (inserted.length === 0) continue; // déjà seedée, on ne duplique pas les règles

    const categoryId = inserted[0].id;
    await db.insert(tables.accountRules).values(
      cat.rules.map((r) => ({
        categoryId,
        entityId: null,
        pattern: typeof r === "string" ? r : r.exact,
        matchType: (typeof r === "string" ? "prefix" : "exact") as
          | "prefix"
          | "exact",
        createdBy: "seed",
      }))
    );
  }

  console.log("Seed terminé :");
  console.log(`- ${seedEntities.length} entités`);
  console.log(`- ${seedUsers.length} utilisateurs (mot de passe par défaut : ${DEFAULT_PASSWORD})`);
  console.log(`- ${seedCategories.length} catégories de nomenclature`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
