// Purge des imports de test laissés par les scripts de recette.
//
//   npm run purge:imports              → rapport seul, aucune suppression
//   npm run purge:imports -- --apply   → supprime
//
// Chaque exécution de `npm run recette` ou de `scripts/import-juin.ts` crée un
// nouvel import et bascule le précédent en « remplacé ». Après quelques passes,
// l'historique de l'écran Imports est encombré de doublons qui n'ont aucune
// valeur de traçabilité : ce sont des rejeux techniques, pas des arrêtés réels.
//
// Ne sont supprimés que les imports qui remplissent LES DEUX conditions :
//   - statut « replaced » (jamais un import validé, jamais un brouillon) ;
//   - créés par un script de recette, pas par un utilisateur.
// Les lignes de balance associées partent avec (cascade) ; les alertes, elles,
// survivent — leur importId passe simplement à null.

import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { db, tables } from "../src/db";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

/** Auteurs correspondant à un rejeu de script, par opposition à un import humain. */
const AUTEURS_SCRIPTS = ["recette", "import-juin"];

const fmtDate = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "—";

async function main() {
  requireEnvTarget();
  const apply = process.argv.includes("--apply");
  console.log(`Base : ${describeTarget()}\n`);

  const all = await db.select().from(tables.imports);
  const parStatut = new Map<string, number>();
  for (const i of all) parStatut.set(i.status, (parStatut.get(i.status) ?? 0) + 1);

  console.log(`${all.length} import(s) en base`);
  for (const [s, n] of [...parStatut].sort()) console.log(`   ${s.padEnd(10)} ${n}`);

  const purgeables = all.filter(
    (i) => i.status === "replaced" && AUTEURS_SCRIPTS.includes(i.createdBy ?? "")
  );
  const conserves = all.filter(
    (i) => i.status === "replaced" && !AUTEURS_SCRIPTS.includes(i.createdBy ?? "")
  );

  if (conserves.length) {
    console.log(
      `\n${conserves.length} import(s) remplacé(s) CONSERVÉ(S) — créés par un utilisateur,` +
        ` ils gardent leur valeur de traçabilité :`
    );
    for (const i of conserves)
      console.log(
        `   ${i.type.padEnd(11)} ${i.period}  ${fmtDate(i.createdAt)}  par ${i.createdBy ?? "?"}`
      );
  }

  if (purgeables.length === 0) {
    console.log("\nAucun import de test à purger.");
    process.exit(0);
  }

  console.log(`\n${purgeables.length} import(s) de test à supprimer :`);
  for (const i of purgeables)
    console.log(
      `   ${i.type.padEnd(11)} ${i.period}  ${fmtDate(i.createdAt)}  par ${i.createdBy}  ${i.fileName}`
    );

  if (!apply) {
    console.log("\nRapport seul. Relancer avec --apply pour supprimer.");
    process.exit(0);
  }

  const ids = purgeables.map((i) => i.id);
  // Les lignes de balance partent en cascade ; on détache d'abord les alertes
  // pour qu'elles survivent à la suppression de leur import d'origine.
  await db
    .update(tables.alerts)
    .set({ importId: null })
    .where(inArray(tables.alerts.importId, ids));
  await db.delete(tables.imports).where(
    and(inArray(tables.imports.id, ids), eq(tables.imports.status, "replaced"))
  );

  console.log(`\n${ids.length} import(s) supprimé(s). Les alertes ont été conservées.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
