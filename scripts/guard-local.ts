// Garde-fou : les scripts de recette écrivent des données de test (imports de mai
// et juin, règles de mapping temporaires). Les laisser tourner sur une base
// distante écraserait la production. On refuse donc dès que DATABASE_URL est
// défini, sauf --allow-remote explicite.

export function requireLocalDatabase(scriptName: string) {
  const url = process.env.DATABASE_URL;
  if (!url) return; // PGlite local : rien à protéger
  if (process.argv.includes("--allow-remote")) {
    console.log(`⚠️  ${scriptName} : exécution autorisée sur une base DISTANTE.`);
    return;
  }
  const host = url.replace(/\/\/[^@]*@/, "//***@").split("@").pop();
  console.error(
    `\n✗ ${scriptName} refuse de tourner sur une base distante (${host}).\n\n` +
      `  Ce script écrit des données : il importe des balances et crée des règles de\n` +
      `  mapping temporaires. Le lancer sur la production écraserait les imports réels.\n\n` +
      `  Pour la recette locale, retire DOTENV_CONFIG_PATH / DATABASE_URL de la commande.\n` +
      `  Si tu sais vraiment ce que tu fais : ajouter --allow-remote.\n`
  );
  process.exit(1);
}
