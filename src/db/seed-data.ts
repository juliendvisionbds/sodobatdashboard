import { randomBytes } from "node:crypto";

// Référentiel des entités du groupe et comptes utilisateurs par défaut.
//
// La nomenclature comptable ne vit plus ici : elle est déclarée dans
// src/lib/nomenclature/sodobat.ts et installée par `npm run db:nomenclature`.

export const seedEntities = [
  { code: "sodobat", name: "Sodobat", active: true },
  { code: "easymat", name: "Easy Mat", active: false },
  { code: "easyhome", name: "Easy Home", active: false },
  { code: "vbtp", name: "VBTP", active: false },
  { code: "covarbat", name: "CovarBat", active: false },
];

// Un compte par rôle.
export const seedUsers: {
  email: string;
  name: string;
  role: "admin" | "daf" | "lecteur";
}[] = [
  { email: "admin@visionbds.com", name: "Admin", role: "admin" },
  { email: "daf@visionbds.com", name: "DAF", role: "daf" },
  { email: "lecteur@visionbds.com", name: "Lecteur", role: "lecteur" },
];

/**
 * Mot de passe initial des comptes de seed.
 *
 * Aucune valeur en dur : elle vivrait dans le dépôt et dans l'historique Git.
 * `SEED_PASSWORD` permet de la fixer (installation reproductible, conteneur) ;
 * à défaut, elle est tirée au hasard et affichée une seule fois par le seed.
 */
export function resolveSeedPassword(): string {
  const fromEnv = process.env.SEED_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  return randomBytes(12).toString("base64url");
}
