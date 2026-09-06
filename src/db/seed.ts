import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, tables } from "./index";
import { resolveSeedPassword, seedEntities, seedUsers } from "./seed-data";

async function main() {
  // Entités
  await db
    .insert(tables.entities)
    .values(seedEntities)
    .onConflictDoNothing({ target: tables.entities.code });

  // Utilisateurs (un par rôle)
  const password = resolveSeedPassword();
  const hash = await bcrypt.hash(password, 10);
  await db
    .insert(tables.users)
    .values(seedUsers.map((u) => ({ ...u, passwordHash: hash })))
    .onConflictDoNothing({ target: tables.users.email });

  // La nomenclature est installée séparément : npm run db:nomenclature
  // (remplacement intégral depuis src/lib/nomenclature/sodobat.ts).

  console.log("Seed terminé :");
  console.log(`- ${seedEntities.length} entités`);
  // Affiché une seule fois : le mot de passe n'est stocké nulle part en clair.
  // `onConflictDoNothing` ci-dessus n'a pu créer que les comptes absents — les
  // comptes déjà présents gardent le leur, ce message ne les concerne pas.
  console.log(`- ${seedUsers.length} utilisateurs · mot de passe initial : ${password}`);
  console.log("  (à noter maintenant, il ne sera pas réaffiché ; rotation : npm run db:password)");
  console.log("- nomenclature : lancer `npm run db:nomenclature`");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
