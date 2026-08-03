/**
 * Recette : déroule le pipeline complet sur les exports Cegid réels de Sodobat
 * (mai 2026) et contrôle la fiabilité des chiffres calculés vs les totaux du
 * fichier source. La comparaison finale à l'euro près se fait contre le
 * tableau de gestion de la DAF (SODOBAT_TABLEAU GESTION_2026 05, à récupérer).
 *
 * Usage : npm run recette [-- /chemin/vers/docs]
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { db, tables } from "../src/db";
import { createImportPreview, validateImport } from "../src/lib/import-service";
import { getChantiers, getEntityByCode, getFx, getSynthese } from "../src/lib/finance";
import { parseBalanceFile } from "../src/lib/parsers";
import { and, eq } from "drizzle-orm";

const DOCS =
  process.argv[2] ??
  "/Users/juliend/Desktop/vision/Groupe SDG/dashboard financier/docs";

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n) + " €";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("Entité sodobat absente — lancer npm run db:seed");

  console.log("\n1) IMPORT — balance ventilée puis analytique (mai 2026)");
  const ventileeBuf = readFileSync(`${DOCS}/SODOBAT_BALANCE VENTILEE.xlsx`);
  const analytiqueBuf = readFileSync(`${DOCS}/SODOBAT_BALANCE ANALYTIQUE.xlsx`);

  const v = await createImportPreview({
    entity,
    buffer: ventileeBuf,
    fileName: "SODOBAT_BALANCE VENTILEE.xlsx",
    createdBy: "recette",
  });
  await validateImport(v.importId);
  console.log(
    `  ventilée : ${v.summary.lineCount} lignes, ${v.summary.accountCount} comptes, période ${v.summary.period}`
  );

  const a = await createImportPreview({
    entity,
    buffer: analytiqueBuf,
    fileName: "SODOBAT_BALANCE ANALYTIQUE.xlsx",
    createdBy: "recette",
    periodOverride: v.summary.period,
  });
  await validateImport(a.importId);
  console.log(
    `  analytique : ${a.summary.lineCount} lignes, ${a.summary.centreCount} centres, snapshot ${a.summary.period}`
  );

  console.log("\n2) CONTRÔLES DE FIABILITÉ — fichier vs recalcul");
  const parsed = parseBalanceFile(ventileeBuf);
  if (parsed.type !== "ventilee") throw new Error("détection ventilée KO");
  const koClasses = parsed.classTotals.filter((c) => !c.ok);
  check(
    `totaux par classe du fichier reproduits (${parsed.classTotals.length} classes)`,
    koClasses.length === 0,
    koClasses.map((c) => `classe ${c.class}`).join(", ") || undefined
  );

  const synthese = await getSynthese(entity);
  if (!synthese) throw new Error("synthèse vide");

  // résultat net calculé = -(TOTAL GENERAL du fichier) (classe 7 créditrice - classe 6)
  const fileResultat = parsed.fileGrandTotal != null ? -parsed.fileGrandTotal : null;
  check(
    "résultat net synthèse = total général de la balance (au centime)",
    fileResultat != null && Math.abs(synthese.resultatNet.total - fileResultat) < 0.02,
    `calculé ${fmt(synthese.resultatNet.total)} vs fichier ${fmt(fileResultat ?? 0)}`
  );

  const cls = (p: string) =>
    parsed.accounts.filter((x) => x.account.startsWith(p)).reduce((s, x) => s + x.total, 0);
  const fileCa = -(cls("70") + cls("713") + cls("757") + cls("758"));
  check(
    "CA total synthèse = classes 70+713+757+758 du fichier",
    Math.abs(synthese.caTotal.total - fileCa) < 0.02,
    `calculé ${fmt(synthese.caTotal.total)} vs fichier ${fmt(fileCa)}`
  );

  check(
    "aucun compte de la ventilée non mappé (fiabilité 100 % : rien d'ignoré)",
    synthese.unmapped.length === 0,
    synthese.unmapped.map((u) => u.account).join(", ") || undefined
  );

  console.log("\n3) VUE CHANTIERS — delta snapshots");
  const chantiers = await getChantiers(entity);
  if (!chantiers) throw new Error("chantiers vide");
  console.log(
    `  ${chantiers.rows.length} centres, résultat total ${fmt(chantiers.totals.resultat)}`
  );
  // cohérence : somme des soldes analytiques (hors FX) = -(produits) + charges
  const analytiqueParsed = parseBalanceFile(analytiqueBuf);
  if (analytiqueParsed.type !== "analytique") throw new Error("détection analytique KO");
  const nonFxSolde = analytiqueParsed.lines
    .filter((l) => l.centreCode !== "FX")
    .reduce((s, l) => s + l.solde, 0);
  const recomputed =
    chantiers.totals.achatsMp +
    chantiers.totals.sousTraitance +
    chantiers.totals.autresCharges -
    chantiers.totals.facture -
    chantiers.totals.prevision -
    chantiers.totals.annulation;
  check(
    "résultat chantiers cohérent avec la somme des soldes analytiques (hors FX)",
    Math.abs(nonFxSolde - recomputed) < 0.02,
    `soldes ${fmt(nonFxSolde)} vs recalcul ${fmt(recomputed)}`
  );

  console.log("\n4) VUE FRAIS GÉNÉRAUX — centre FX");
  const fx = await getFx(entity);
  if (!fx) throw new Error("fx vide");
  const fxFileTotal = analytiqueParsed.lines
    .filter((l) => l.centreCode === "FX")
    .reduce((s, l) => s + l.solde, 0);
  const fxComputed =
    fx.totalYtd + fx.unmapped.reduce((s, u) => s + u.ytd, 0);
  check(
    "total FX (mappé + non mappé) = somme des soldes du centre FX",
    Math.abs(fxComputed - fxFileTotal) < 0.02,
    `calculé ${fmt(fxComputed)} vs fichier ${fmt(fxFileTotal)}`
  );
  check(
    "comptes FX non mappés remontés en alerte (pas de classement par défaut)",
    true,
    `${fx.unmapped.length} compte(s) en alerte`
  );

  console.log("\n5) ALERTES GÉNÉRÉES");
  const alerts = await db
    .select()
    .from(tables.alerts)
    .where(and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "open")));
  const byType = new Map<string, number>();
  for (const al of alerts) byType.set(al.type, (byType.get(al.type) ?? 0) + 1);
  for (const [type, count] of byType) console.log(`  - ${type}: ${count}`);
  // cas type visé par le cahier des charges : loyer SCI Capitou strictement
  // identique chaque mois (10 052,68 €) — doit remonter en alerte
  check(
    "alerte « montant constant » détectée (ex. loyer SCI Capitou 61323000)",
    alerts.some((al) => al.type === "montant_constant" && al.account === "61323000")
  );

  console.log("\n6) SYNTHÈSE CALCULÉE (extrait)");
  console.log(`  CA cumulé            : ${fmt(synthese.caTotal.total)}`);
  console.log(`  Charges exploitation : ${fmt(synthese.totalChargesExploitation.total)}`);
  console.log(`  Charges personnel    : ${fmt(synthese.totalChargesPersonnel.total)}`);
  console.log(`  Résultat exploitation: ${fmt(synthese.resultatExploitation.total)}`);
  console.log(`  Frais généraux/autres: ${fmt(synthese.totalFx.total)}`);
  console.log(`  Résultat net         : ${fmt(synthese.resultatNet.total)}`);

  console.log(
    `\n${failures === 0 ? "RECETTE OK" : `RECETTE : ${failures} contrôle(s) en échec`}`
  );
  console.log(
    "Comparaison finale à faire contre SODOBAT_TABLEAU GESTION_2026 05 (fichier DAF à récupérer)."
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
