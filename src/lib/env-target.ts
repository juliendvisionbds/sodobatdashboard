// Sur quelle base un script de maintenance est-il en train d'agir ?
//
// Les scripts visent la production en préfixant la commande par
// DOTENV_CONFIG_PATH=.env.prod.local. Si ce fichier n'existe pas, dotenv se tait,
// DATABASE_URL reste vide et db/index.ts retombe sur le PGlite local — le script
// s'exécute alors sur la mauvaise base sans le dire. On refuse ce cas.

import { existsSync } from "fs";

/**
 * Interrompt le script si le fichier d'environnement demandé est introuvable.
 * À appeler avant toute lecture ou écriture.
 */
export function requireEnvTarget() {
  const path = process.env.DOTENV_CONFIG_PATH;
  if (!path) return; // aucun fichier demandé : base locale, c'est explicite
  if (existsSync(path)) return;

  console.error(
    `\n✗ DOTENV_CONFIG_PATH pointe sur « ${path} », qui n'existe pas.\n\n` +
      `  dotenv n'a donc rien chargé et le script agirait sur la base LOCALE,\n` +
      `  alors que tu visais manifestement une base distante.\n\n` +
      `  Recrée le fichier, par exemple :\n` +
      `    printf 'DATABASE_URL=<chaîne de connexion>\\n' > ${path}\n`
  );
  process.exit(1);
}

/** Description lisible de la base ciblée, pour l'afficher en tête de sortie. */
export function describeTarget(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "PGlite locale";
  const host = url.replace(/\/\/[^@]*@/, "//***@").split("@").pop();
  return `DISTANTE (${host})`;
}
