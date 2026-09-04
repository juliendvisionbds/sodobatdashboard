/**
 * Import des balances de juin 2026 (nouveau nommage BA / CEG) en base locale,
 * puis contrôles complets :
 *  - fiabilité fichier vs recalcul (mêmes contrôles que la recette de mai)
 *  - cohérence temporelle : les mois déjà connus (nov→mai) ne doivent pas avoir
 *    bougé entre l'import de mai et celui de juin (détection de révisions)
 *  - cohérence des snapshots analytiques : cumul juin vs cumul mai par centre
 *
 * Usage : node --import=tsx scripts/import-juin.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { db, tables } from "../src/db";
import { createImportPreview, validateImport } from "../src/lib/import-service";
import {
  getChantiers,
  getEntityByCode,
  getFx,
  getSynthese,
  latestValidatedImport,
} from "../src/lib/finance";
import { classifyCentre, parseBalanceFile } from "../src/lib/parsers";
import { CHANTIER_CODES, SYNTHESE_CODES } from "../src/lib/nomenclature/codes";
import { requireLocalDatabase } from "./guard-local";

const DIR = "/Users/juliend/Desktop/vision/Groupe SDG/dashboard financier/docs/balances juin";

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n) + " €";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  requireLocalDatabase("import-juin");
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("Entité sodobat absente");

  // ── 0) État AVANT import : données de mai en base ─────────────────────────
  console.log("\n0) ÉTAT AVANT IMPORT (mai 2026 en base)");
  const mayVent = await latestValidatedImport(entity.id, "ventilee");
  const mayAna = await latestValidatedImport(entity.id, "analytique");
  if (!mayVent || !mayAna) throw new Error("imports de mai absents de la base locale");
  console.log(`  ventilée   : ${mayVent.fileName} · période ${mayVent.period}`);
  console.log(`  analytique : ${mayAna.fileName} · snapshot ${mayAna.period}`);

  const syntheseMai = await getSynthese(entity);
  if (!syntheseMai) throw new Error("synthèse mai vide");

  // totaux mensuels de la ventilée de mai (par mois, tous comptes)
  const mayLines = await db
    .select()
    .from(tables.generalBalanceLines)
    .where(eq(tables.generalBalanceLines.importId, mayVent.id));
  const mayByMonth = new Map<string, number>();
  const mayByAccountMonth = new Map<string, number>();
  for (const l of mayLines) {
    const m = String(l.month);
    const amt = Number(l.amount);
    mayByMonth.set(m, (mayByMonth.get(m) ?? 0) + amt);
    mayByAccountMonth.set(`${l.account}|${m}`, (mayByAccountMonth.get(`${l.account}|${m}`) ?? 0) + amt);
  }

  // cumuls analytiques de mai par centre
  const mayAnaLines = await db
    .select()
    .from(tables.analyticLines)
    .where(eq(tables.analyticLines.importId, mayAna.id));
  const mayByCentre = new Map<string, number>();
  const mayAnaAccounts = new Set<string>();
  for (const l of mayAnaLines) {
    mayByCentre.set(l.centreCode, (mayByCentre.get(l.centreCode) ?? 0) + Number(l.solde));
    mayAnaAccounts.add(l.account);
  }
  console.log(
    `  analytique mai : ${mayAnaLines.length} lignes · ${mayByCentre.size} centres · ${mayAnaAccounts.size} comptes`
  );

  // ── 1) IMPORT ventilée puis analytique de juin ────────────────────────────
  console.log("\n1) IMPORT JUIN — ventilée (CEG) puis analytique (BA)");
  const ventBuf = readFileSync(`${DIR}/CEG 06.2026.xlsx`);
  const anaBuf = readFileSync(`${DIR}/BA 06.2026.xlsx`);

  const v = await createImportPreview({
    entity,
    buffer: ventBuf,
    fileName: "CEG 06.2026.xlsx",
    createdBy: "import-juin",
  });
  check("ventilée détectée avec période juin 2026", v.summary.period === "2026-06-01", String(v.summary.period));
  await validateImport(v.importId);
  console.log(`  ventilée : ${v.summary.lineCount} lignes · ${v.summary.accountCount} comptes`);

  const a = await createImportPreview({
    entity,
    buffer: anaBuf,
    fileName: "BA 06.2026.xlsx",
    createdBy: "import-juin",
    periodOverride: "2026-06-01",
  });
  await validateImport(a.importId);
  console.log(`  analytique : ${a.summary.lineCount} lignes · ${a.summary.centreCount} centres · snapshot 2026-06-01`);

  // ── 2) FIABILITÉ — fichier vs recalcul ────────────────────────────────────
  console.log("\n2) FIABILITÉ FICHIER VS RECALCUL");
  const parsed = parseBalanceFile(ventBuf);
  if (parsed.type !== "ventilee") throw new Error("détection ventilée KO");
  const koClasses = parsed.classTotals.filter((c) => !c.ok);
  check(
    `totaux par classe du fichier reproduits (${parsed.classTotals.length} classes)`,
    koClasses.length === 0,
    koClasses.map((c) => `classe ${c.class}`).join(", ") || undefined
  );

  const synthese = await getSynthese(entity);
  if (!synthese) throw new Error("synthèse juin vide");
  check("la synthèse pointe bien sur juin", synthese.period === "2026-06-01", synthese.period);

  const fileResultat = parsed.fileGrandTotal != null ? -parsed.fileGrandTotal : null;
  const resultatBg = synthese.byCode[SYNTHESE_CODES.resultatBg]?.total ?? 0;
  check(
    "résultat BG comptable = total général du fichier (au centime)",
    fileResultat != null && Math.abs(resultatBg - fileResultat) < 0.02,
    `calculé ${fmt(resultatBg)} vs fichier ${fmt(fileResultat ?? 0)}`
  );

  // Le résultat du TG exclut les dotations et la VNC : l'écart avec le résultat
  // comptable doit être exactement égal à ces retraitements.
  const ctrl = synthese.byCode[SYNTHESE_CODES.ctrl]?.total ?? 0;
  const dap = synthese.byCode["syn_retraitement_dap"]?.total ?? 0;
  const vnc = synthese.byCode["syn_retraitement_vnc"]?.total ?? 0;
  check(
    "écart de contrôle intégralement expliqué par les retraitements DAP et VNC",
    Math.abs(ctrl - (dap + vnc)) < 0.02,
    `Ctrl ${fmt(ctrl)} = DAP ${fmt(dap)} + VNC ${fmt(vnc)}`
  );

  const cls = (p: string) =>
    parsed.accounts.filter((x) => x.account.startsWith(p)).reduce((s, x) => s + x.total, 0);
  // Tous les produits sauf la quote-part SEP (75550000), portée par les FX.
  const fileCa = -(
    cls("70") + cls("71") + cls("74") + cls("75") + cls("76") + cls("79") - cls("7555")
  );
  check(
    "CA total = définition CA de la maquette, calculée sur le fichier",
    Math.abs(synthese.caTotal.total - fileCa) < 0.02,
    `calculé ${fmt(synthese.caTotal.total)} vs fichier ${fmt(fileCa)}`
  );
  check(
    "aucun compte de la ventilée non mappé",
    synthese.unmapped.length === 0,
    synthese.unmapped.map((u) => `${u.account} (${u.label}, ${fmt(u.total)})`).join(", ") || undefined
  );

  // ── 3) COHÉRENCE TEMPORELLE — les mois passés n'ont pas bougé ─────────────
  console.log("\n3) COHÉRENCE MAI → JUIN (révisions du cabinet ?)");
  const juneByMonth = new Map<string, number>();
  const juneByAccountMonth = new Map<string, number>();
  for (const l of parsed.lines) {
    juneByMonth.set(l.month, (juneByMonth.get(l.month) ?? 0) + l.amount);
    juneByAccountMonth.set(`${l.account}|${l.month}`, (juneByAccountMonth.get(`${l.account}|${l.month}`) ?? 0) + l.amount);
  }
  const overlapMonths = [...mayByMonth.keys()].sort();
  let revisedMonths = 0;
  for (const m of overlapMonths) {
    const before = mayByMonth.get(m) ?? 0;
    const after = juneByMonth.get(m) ?? 0;
    const same = Math.abs(before - after) < 0.02;
    if (!same) {
      revisedMonths++;
      console.log(`    · ${m} : total avant ${fmt(before)} → après ${fmt(after)} (écart ${fmt(after - before)})`);
    }
  }
  // Une révision des mois passés est normale (le cabinet corrige après coup) :
  // le script la met en évidence, il ne la traite pas comme une anomalie.
  console.log(
    revisedMonths === 0
      ? `  · aucun des ${overlapMonths.length} mois déjà connus n'a été révisé`
      : `  · ${revisedMonths}/${overlapMonths.length} mois révisé(s) par le cabinet entre mai et juin (détail ci-dessus)`
  );
  // détail par compte si révisions
  if (revisedMonths > 0) {
    const diffs: { key: string; d: number }[] = [];
    for (const [key, val] of juneByAccountMonth) {
      const beforeVal = mayByAccountMonth.get(key) ?? 0;
      if (Math.abs(val - beforeVal) >= 0.02 && mayByMonth.has(key.split("|")[1]))
        diffs.push({ key, d: val - beforeVal });
    }
    for (const key of mayByAccountMonth.keys()) {
      if (!juneByAccountMonth.has(key)) {
        const [, m] = key.split("|");
        if (mayByMonth.has(m)) diffs.push({ key, d: -(mayByAccountMonth.get(key) ?? 0) });
      }
    }
    diffs.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
    console.log(`    comptes×mois modifiés : ${diffs.length} (top 10)`);
    for (const { key, d } of diffs.slice(0, 10)) {
      const [acc, m] = key.split("|");
      console.log(`      ${acc} · ${m} : ${d > 0 ? "+" : ""}${fmt(d)}`);
    }
  }

  // ── 4) SNAPSHOTS ANALYTIQUES — cumul juin vs cumul mai ────────────────────
  console.log("\n4) ANALYTIQUE — cumul juin vs cumul mai par centre");
  const anaParsed = parseBalanceFile(anaBuf);
  if (anaParsed.type !== "analytique") throw new Error("détection analytique KO");
  const juneByCentre = new Map<string, number>();
  const juneAnaAccounts = new Set<string>();
  for (const l of anaParsed.lines) {
    juneByCentre.set(l.centreCode, (juneByCentre.get(l.centreCode) ?? 0) + l.solde);
    juneAnaAccounts.add(l.account);
  }
  const disparus = [...mayByCentre.keys()].filter((c) => !juneByCentre.has(c));
  const nouveaux = [...juneByCentre.keys()].filter((c) => !mayByCentre.has(c));
  check(
    "aucun centre de mai absent du snapshot de juin (cumul = jamais de disparition)",
    disparus.length === 0,
    disparus.join(", ") || undefined
  );
  console.log(`    nouveaux centres en juin : ${nouveaux.length ? nouveaux.join(", ") : "aucun"}`);
  const accountsDisparus = [...mayAnaAccounts].filter((x) => !juneAnaAccounts.has(x));
  console.log(
    `    comptes analytiques : mai ${mayAnaAccounts.size} → juin ${juneAnaAccounts.size}` +
      (accountsDisparus.length ? ` · disparus : ${accountsDisparus.slice(0, 8).join(", ")}${accountsDisparus.length > 8 ? "…" : ""}` : "")
  );

  // ── 5) VUES CHANTIERS & FX ─────────────────────────────────────────────────
  console.log("\n5) VUES CHANTIERS & FRAIS GÉNÉRAUX (juin)");
  const chantiers = await getChantiers(entity);
  if (!chantiers) throw new Error("chantiers vide");
  check(
    "le delta chantiers se calcule bien juin vs mai",
    chantiers.period === "2026-06-01" && chantiers.prevPeriod === "2026-05-01",
    `period ${chantiers.period}, prev ${chantiers.prevPeriod}`
  );
  console.log(
    `    ${chantiers.rows.length} centres affichés · résultat du mois ${fmt(chantiers.totals[CHANTIER_CODES.resultat] ?? 0)}`
  );

  const fx = await getFx(entity);
  if (!fx) throw new Error("fx vide");
  const fxFileTotal = anaParsed.lines
    .filter((l) => classifyCentre(l.centreCode) === "structure")
    .reduce((s, l) => s + l.solde, 0);
  const fxComputed =
    fx.controle.soldeMappe + fx.unmapped.reduce((s, u) => s + u.ytd, 0);
  check(
    "total FX (mappé + non mappé) = somme des soldes des centres de structure",
    Math.abs(fxComputed - fxFileTotal) < 0.02,
    `calculé ${fmt(fxComputed)} vs fichier ${fmt(fxFileTotal)}`
  );
  console.log(
    `    FX cumul ${fmt(fx.totalYtd)} · mois de juin ${fmt(fx.totalMois)} · non mappés : ${fx.unmapped.length}`
  );

  // ── 6) ALERTES & EXTRAIT SYNTHÈSE ──────────────────────────────────────────
  console.log("\n6) ALERTES OUVERTES APRÈS IMPORT");
  const alerts = await db
    .select()
    .from(tables.alerts)
    .where(and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "open")));
  const byType = new Map<string, number>();
  for (const al of alerts) byType.set(al.type, (byType.get(al.type) ?? 0) + 1);
  for (const [type, count] of byType) console.log(`    - ${type}: ${count}`);
  const unmappedAlerts = alerts.filter((al) => al.type === "compte_non_mappe");
  for (const al of unmappedAlerts) console.log(`      · ${al.title}`);

  console.log("\n7) SYNTHÈSE JUIN vs MAI");
  const rows: [string, number, number][] = [
    ["CA cumulé            ", syntheseMai.caTotal.total, synthese.caTotal.total],
    ["Charges exploitation ", syntheseMai.totalChargesExploitation.total, synthese.totalChargesExploitation.total],
    ["Charges personnel    ", syntheseMai.totalChargesPersonnel.total, synthese.totalChargesPersonnel.total],
    ["Résultat exploitation", syntheseMai.resultatExploitation.total, synthese.resultatExploitation.total],
    ["Frais généraux/autres", syntheseMai.totalFx.total, synthese.totalFx.total],
    ["Résultat net         ", syntheseMai.resultatNet.total, synthese.resultatNet.total],
  ];
  for (const [label, mai, juin] of rows)
    console.log(`  ${label} : mai ${fmt(mai)} → juin ${fmt(juin)} (${juin - mai >= 0 ? "+" : ""}${fmt(juin - mai)})`);
  const caJuin = synthese.caTotal.monthly["2026-06-01"] ?? 0;
  const rnJuin = synthese.resultatNet.monthly["2026-06-01"] ?? 0;
  console.log(`  Mois de juin seul : CA ${fmt(caJuin)} · résultat net ${fmt(rnJuin)}`);

  console.log(`\n${failures === 0 ? "IMPORT JUIN : TOUS CONTRÔLES OK" : `IMPORT JUIN : ${failures} contrôle(s) en échec`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
