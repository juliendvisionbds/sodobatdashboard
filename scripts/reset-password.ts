// Rotation du mot de passe d'un compte, ou de tous.
//
// Contrairement aux scripts de recette, celui-ci ne passe PAS par
// guard-local.ts : son objet est justement de tourner sur la base de
// production. Il n'écrit que la colonne password_hash de la table users.
//
//   npm run db:password -- --email admin@exemple.com
//   npm run db:password -- --all
//   npm run db:password -- --all --password 'celui-que-je-veux'
//
// Sans --password, un mot de passe est tiré au hasard et affiché une fois.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, tables } from "../src/db/index";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const email = arg("email");
  const all = process.argv.includes("--all");
  if (!email && !all) {
    console.error("Usage : --email <adresse> | --all   [--password <mdp>]");
    process.exit(1);
  }

  const targets = all
    ? await db.select({ email: tables.users.email }).from(tables.users)
    : [{ email: email! }];

  if (targets.length === 0) {
    console.error("Aucun compte trouvé.");
    process.exit(1);
  }

  // Un mot de passe distinct par compte : une fuite n'en compromet qu'un.
  const shared = arg("password");
  const results: { email: string; password: string }[] = [];

  for (const t of targets) {
    const password = shared ?? randomBytes(12).toString("base64url");
    const hash = await bcrypt.hash(password, 10);
    const updated = await db
      .update(tables.users)
      .set({ passwordHash: hash })
      .where(eq(tables.users.email, t.email))
      .returning({ email: tables.users.email });
    if (updated.length === 0) {
      console.error(`Compte introuvable : ${t.email}`);
      process.exit(1);
    }
    results.push({ email: t.email, password });
  }

  console.log(`${results.length} mot(s) de passe changé(s) :`);
  for (const r of results) console.log(`  ${r.email}  ${r.password}`);
  console.log("\nÀ noter maintenant : rien n'est conservé en clair.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
