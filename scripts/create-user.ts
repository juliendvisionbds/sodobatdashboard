// Création ou mise à jour d'un compte : nom, rôle, entité.
//
// Comme reset-password, ce script est fait pour tourner sur la base de
// production ; il n'écrit que dans la table users.
//
//   npm run db:user -- --email marie@sodobat.fr --name "Marie Dupont" --role saisie --entity sodobat
//   npm run db:user -- --email daf@visionbds.com --role daf            (modifie un compte existant)
//   … --password 'celui-que-je-veux'                                    (sinon tiré au hasard, affiché une fois)
//
// Rôles : admin, daf (tout, toutes entités) · saisie (prévision, note et
// statut de la vue Chantiers de son entité, sans figer) · lecteur.
// Un compte saisie doit avoir une entité ; admin et daf n'en ont pas (toutes).
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, tables } from "../src/db/index";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const ROLES = ["admin", "daf", "saisie", "lecteur"] as const;
type Role = (typeof ROLES)[number];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  requireEnvTarget();
  const email = arg("email")?.toLowerCase().trim();
  const role = arg("role") as Role | undefined;
  const name = arg("name");
  const entityCode = arg("entity");
  if (!email || !role || !ROLES.includes(role)) {
    console.error(
      "Usage : --email <adresse> --role admin|daf|saisie|lecteur [--name <nom>] [--entity <code>] [--password <mdp>]"
    );
    process.exit(1);
  }
  if (role === "saisie" && !entityCode) {
    console.error("Un compte saisie doit être rattaché à une entité : --entity sodobat");
    process.exit(1);
  }
  console.log(`Base : ${describeTarget()}\n`);

  // Colonne ajoutée au schéma le 24 septembre 2026 ; équivalent de `drizzle-kit push`.
  await db.execute(
    sql`alter table users add column if not exists entity_id integer references entities(id)`
  );

  let entityId: number | null = null;
  if (entityCode) {
    const [e] = await db
      .select({ id: tables.entities.id })
      .from(tables.entities)
      .where(eq(tables.entities.code, entityCode));
    if (!e) {
      console.error(`Entité inconnue : ${entityCode}`);
      process.exit(1);
    }
    entityId = e.id;
  }

  const [existing] = await db.select().from(tables.users).where(eq(tables.users.email, email));
  const givenPassword = arg("password");
  const password = existing && !givenPassword ? null : (givenPassword ?? randomBytes(12).toString("base64url"));

  if (existing) {
    await db
      .update(tables.users)
      .set({
        role,
        entityId,
        ...(name ? { name } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      })
      .where(eq(tables.users.id, existing.id));
    console.log(`Compte mis à jour : ${email} · ${name ?? existing.name} · ${role} · ${entityCode ?? "toutes entités"}`);
  } else {
    if (!name) {
      console.error("Un nouveau compte a besoin d'un nom : --name \"Prénom Nom\"");
      process.exit(1);
    }
    await db.insert(tables.users).values({
      email,
      name,
      role,
      entityId,
      passwordHash: await bcrypt.hash(password!, 10),
    });
    console.log(`Compte créé : ${email} · ${name} · ${role} · ${entityCode ?? "toutes entités"}`);
  }
  if (password) console.log(`Mot de passe : ${password}\n\nÀ transmettre maintenant : rien n'est conservé en clair.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
