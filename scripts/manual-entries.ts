// Inspection et nettoyage des saisies manuelles.
//
//   npm run manual                          → liste, sans rien modifier
//   npm run manual -- --delete 12,13        → supprime ces identifiants
//   npm run manual -- --delete-corrupt      → supprime les valeurs illisibles (NaN)
//   npm run manual -- --delete-all --yes    → vide la table pour l'entité
//
// Ajouter DOTENV_CONFIG_PATH=.env.prod.local devant la commande pour viser la
// production.
//
// Les saisies manuelles sont les seules valeurs de l'application qui ne viennent
// pas des balances : provision de travaux en cours, annulation M-1, objectifs,
// ventilation d'un compte partagé, notes et statuts. Les supprimer ne touche à
// aucune donnée comptable — les vues repartent des montants calculés.

import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db, tables } from "../src/db";
import { getEntityByCode } from "../src/lib/finance";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Une valeur stockée que parseFloat ne sait pas relire — typiquement 'NaN'. */
const corrompue = (v: string | null) =>
  v != null && !Number.isFinite(parseFloat(v));

async function main() {
  requireEnvTarget();
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité sodobat absente");

  console.log(`Base : ${describeTarget()}\n`);

  const rows = await db
    .select()
    .from(tables.manualEntries)
    .where(eq(tables.manualEntries.entityId, entity.id));

  if (rows.length === 0) {
    console.log("Aucune saisie manuelle.");
    process.exit(0);
  }

  console.log(`${rows.length} saisie(s) manuelle(s) :`);
  for (const r of rows) {
    const flag = corrompue(r.valueNum) ? "   ⚠ VALEUR ILLISIBLE — contamine les totaux" : "";
    console.log(
      `   #${String(r.id).padEnd(4)} ${r.period} · ${(r.centreCode ?? "(entité)").padEnd(10)}` +
        ` · ${r.field.padEnd(16)}${r.subKey ? "/" + r.subKey : ""}` +
        ` · valeur=${JSON.stringify(r.valueNum)}` +
        (r.valueText ? ` · texte=${JSON.stringify(r.valueText)}` : "") +
        ` · ${r.status}${flag}`
    );
  }

  const corrompues = rows.filter((r) => corrompue(r.valueNum));
  if (corrompues.length)
    console.log(
      `\n⚠ ${corrompues.length} saisie(s) avec une valeur illisible : c'est la cause des NaN` +
        ` affichés dans les vues.`
    );

  // ── Suppressions ──────────────────────────────────────────────────────────
  let aSupprimer: number[] = [];
  if (process.argv.includes("--delete-corrupt")) aSupprimer = corrompues.map((r) => r.id);
  else if (process.argv.includes("--delete-all")) {
    if (!process.argv.includes("--yes")) {
      console.log("\n--delete-all supprime TOUTES les saisies. Confirmer avec --yes.");
      process.exit(0);
    }
    aSupprimer = rows.map((r) => r.id);
  } else {
    const ids = arg("--delete");
    if (ids)
      aSupprimer = ids
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && rows.some((r) => r.id === n));
  }

  if (aSupprimer.length === 0) {
    console.log("\nLecture seule : rien n'a été modifié.");
    process.exit(0);
  }

  await db.delete(tables.manualEntries).where(inArray(tables.manualEntries.id, aSupprimer));
  console.log(`\n${aSupprimer.length} saisie(s) supprimée(s) : ${aSupprimer.join(", ")}`);
  console.log("Les vues se recalculent à la volée — recharge la page.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
