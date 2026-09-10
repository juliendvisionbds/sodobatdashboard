// Remise à zéro des données importées.
//
//   npm run reset:data                          → état des lieux, rien n'est touché
//   npm run reset:data -- --apply               → vide la base locale
//   DOTENV_CONFIG_PATH=.env.prod.local npm run reset:data -- --apply --prod
//
// Supprime tout ce qui vient des fichiers et des saisies : imports et leurs lignes
// de balance, alertes, saisies manuelles, référentiel des centres.
// Conserve ce qui structure l'application : entités, utilisateurs, nomenclature
// et règles de mapping. Sont aussi gardés les paramètres saisis à la main qui ne
// dépendent d'aucun import — objectifs annuels du dirigeant et valeurs GEN — et
// les centres dont la classification chantier / structure a été forcée.

import "dotenv/config";
import { count, inArray, isNull, notInArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, tables } from "../src/db";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

async function n(table: PgTable) {
  const [r] = await db.select({ n: count() }).from(table);
  return Number(r.n);
}

/** Saisies qui sont des paramètres, pas des données du cycle mensuel. */
const PARAMETRES = ["objectif_annuel", "gen"] as const;

async function etat() {
  const centresForces = (
    await db.select({ kind: tables.centres.kind }).from(tables.centres)
  ).filter((c) => c.kind).length;
  return {
    imports: await n(tables.imports),
    lignesVentilee: await n(tables.generalBalanceLines),
    lignesAnalytique: await n(tables.analyticLines),
    alertes: await n(tables.alerts),
    saisies: await n(tables.manualEntries),
    parametres: (
      await db
        .select({ n: count() })
        .from(tables.manualEntries)
        .where(inArray(tables.manualEntries.field, [...PARAMETRES]))
    )[0].n,
    centres: await n(tables.centres),
    centresForces,
    utilisateurs: await n(tables.users),
    categories: await n(tables.categories),
    regles: await n(tables.accountRules),
  };
}

async function main() {
  requireEnvTarget();
  const apply = process.argv.includes("--apply");
  const distante = !!process.env.DATABASE_URL;
  console.log(`Base : ${describeTarget()}\n`);

  const avant = await etat();
  console.log("À SUPPRIMER");
  console.log(`   imports                 ${avant.imports}`);
  console.log(`   lignes balance ventilée ${avant.lignesVentilee}`);
  console.log(`   lignes balance analyt.  ${avant.lignesAnalytique}`);
  console.log(`   alertes                 ${avant.alertes}`);
  console.log(`   saisies manuelles       ${avant.saisies - Number(avant.parametres)}`);
  console.log(`   centres                 ${avant.centres - avant.centresForces}`);
  console.log("\nCONSERVÉ");
  console.log(`   utilisateurs            ${avant.utilisateurs}`);
  console.log(`   nomenclature            ${avant.categories} lignes · ${avant.regles} règles`);
  if (Number(avant.parametres))
    console.log(`   objectifs et valeurs GEN ${avant.parametres}`);
  if (avant.centresForces)
    console.log(`   centres à classification forcée : ${avant.centresForces}`);

  if (!apply) {
    console.log("\nÉtat des lieux seulement : rien n'a été modifié. Relancer avec --apply.");
    process.exit(0);
  }
  if (distante && !process.argv.includes("--prod")) {
    console.error(
      "\n✗ Base DISTANTE : la remise à zéro doit être confirmée explicitement avec --prod."
    );
    process.exit(1);
  }

  // Ordre imposé par les clés étrangères. Les lignes de balance partiraient en
  // cascade avec leur import ; on les supprime d'abord pour ne rien laisser au hasard.
  await db.delete(tables.alerts);
  await db
    .delete(tables.manualEntries)
    .where(notInArray(tables.manualEntries.field, [...PARAMETRES]));
  await db.delete(tables.generalBalanceLines);
  await db.delete(tables.analyticLines);
  await db.delete(tables.imports);
  await db.delete(tables.centres).where(isNull(tables.centres.kind));

  const apres = await etat();
  const reste =
    apres.imports +
    apres.lignesVentilee +
    apres.lignesAnalytique +
    apres.alertes +
    (apres.saisies - Number(apres.parametres));
  if (reste !== 0) {
    console.error(`\n✗ Il reste ${reste} ligne(s) de données : remise à zéro incomplète.`);
    process.exit(1);
  }
  console.log(
    `\n✓ Données remises à zéro. Nomenclature (${apres.categories} lignes), ` +
      `utilisateurs (${apres.utilisateurs}) et objectifs (${apres.parametres}) intacts.`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
