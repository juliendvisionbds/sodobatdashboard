import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, tables } from "./index";
import { DEFAULT_PASSWORD, seedEntities, seedUsers } from "./seed-data";

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

  // La nomenclature est installée séparément : npm run db:nomenclature
  // (remplacement intégral depuis src/lib/nomenclature/sodobat.ts).

  console.log("Seed terminé :");
  console.log(`- ${seedEntities.length} entités`);
  console.log(`- ${seedUsers.length} utilisateurs (mot de passe par défaut : ${DEFAULT_PASSWORD})`);
  console.log("- nomenclature : lancer `npm run db:nomenclature`");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
