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

// Un compte par rôle. Mot de passe par défaut à changer à la mise en production.
export const seedUsers: {
  email: string;
  name: string;
  role: "admin" | "daf" | "lecteur";
}[] = [
  { email: "admin@visionbds.com", name: "Admin", role: "admin" },
  { email: "daf@visionbds.com", name: "DAF", role: "daf" },
  { email: "lecteur@visionbds.com", name: "Lecteur", role: "lecteur" },
];

export const DEFAULT_PASSWORD = "sodobat2026!";
