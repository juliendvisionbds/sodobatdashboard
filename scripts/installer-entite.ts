// Ouverture d'une entité du groupe dans l'application.
//
//   npm run entite:installer -- covarbat             → rapport seul, rien n'est écrit
//   npm run entite:installer -- covarbat --apply     → écrit en base
//   npm run entite:installer -- vbtp --apply
//   npm run entite:installer -- easymat --apply
//   npm run entite:installer -- easyhome --apply
//
// Préfixer par DOTENV_CONFIG_PATH=.env.local pour viser la production.
//
// Trois choses, dans cet ordre :
//   1. la maquette (table categories) est alignée sur le code : lignes nouvelles
//      ajoutées, libellés / formules / périmètres mis à jour, ordre réaligné ;
//   2. les règles de comptes propres à l'entité sont installées, signées
//      « seed:<entité> » (src/lib/nomenclature/entites.ts) ;
//   3. l'entité est ouverte dans le menu de l'en-tête.
//
// Pourquoi pas `npm run db:nomenclature` : il remplace toute la nomenclature et
// efface les règles créées depuis l'écran Mapping. Ici rien n'est supprimé, et
// une règle créée par un utilisateur n'est jamais modifiée : si elle contredit
// le code, elle est gardée et signalée.
//
// Idempotent : relancer le script ne change rien de plus. Aucune donnée
// importée n'est touchée ; les vues se recalculent à la volée.

import "dotenv/config";
import { db, tables } from "../src/db";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";
import { ENTITES_DECLAREES } from "../src/lib/nomenclature/entites";
import { appliquerEntite, appliquerLignes, planEntite, planLignes } from "../src/db/install-entite";

async function main() {
  requireEnvTarget();
  const apply = process.argv.includes("--apply");
  const code = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!code || !ENTITES_DECLAREES.includes(code)) {
    console.error(`Usage : npm run entite:installer -- <${ENTITES_DECLAREES.join(" | ")}> [--apply]`);
    process.exit(1);
  }
  console.log(`Base : ${describeTarget()}${apply ? "" : " — rapport seul, aucune écriture"}\n`);

  // 1 — maquette
  const lignes = await planLignes();
  console.log("Maquette");
  for (const { line } of lignes.ajouts)
    console.log(`  + ${line.code}  « ${line.label} »  (${line.view}, entités : ${line.entityScope ?? "all"})`);
  for (const { cat, champs, line } of lignes.modifs) {
    console.log(`  ~ ${cat.code}  ${champs.join(", ")}`);
    if (champs.includes("label")) console.log(`      libellé : « ${cat.label} » → « ${line.label} »`);
    if (champs.includes("entityScope"))
      console.log(`      entités : ${cat.entityScope} → ${line.entityScope ?? "all"}`);
  }
  console.log(`  ${lignes.rangs.length + lignes.modifs.length} ligne(s) à renuméroter`);
  for (const c of lignes.horsCode) console.log(`  ! ligne en base absente du code, laissée telle quelle : ${c}`);
  if (!lignes.ajouts.length && !lignes.modifs.length && !lignes.rangs.length)
    console.log("  déjà à jour");
  if (apply) await appliquerLignes(lignes);

  // 2 — règles et ouverture de l'entité. En rapport seul, une ligne que la
  //     maquette n'a pas encore ne peut pas recevoir de règle : on le dit.
  if (!apply && lignes.ajouts.length) {
    console.log(
      `\nRègles ${code} : calculées après l'ajout des ${lignes.ajouts.length} ligne(s) ci-dessus (--apply).`
    );
  } else {
    const plan = await planEntite(code);
    console.log(`\nRègles ${code}`);
    console.log(`  ${plan.ajouts.length} règle(s) à créer`);
    for (const d of plan.deplacees) console.log(`  ~ ${d.account} : ${d.from} → ${d.to}`);
    for (const r of plan.retirees) console.log(`  - ${r.account} (${r.code}) : n'est plus déclarée dans le code`);
    for (const c of plan.conflits)
      console.log(
        `  ! ${c.account} : déjà affecté à ${c.existing} par ${c.by ?? "?"}, règle gardée (le code prévoyait ${c.code})`
      );
    for (const c of plan.centres)
      console.log(`  centre ${c.code} : ${c.kind}${c.aliasOf ? ` → lu comme ${c.aliasOf}` : ""}`);
    console.log(plan.activer ? `  entité ${plan.entity.name} ouverte` : `  entité ${plan.entity.name} déjà ouverte`);
    if (apply) await appliquerEntite(plan, code);
  }

  if (!apply) {
    console.log("\nRelancer avec --apply pour écrire.");
    process.exit(0);
  }
  const nb = await db.select({ id: tables.accountRules.id }).from(tables.accountRules);
  console.log(`\nTerminé : ${nb.length} règles en base. Les vues se recalculent à la volée.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
