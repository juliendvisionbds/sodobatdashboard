// Reprise des cumuls d'ouverture des chantiers depuis le tableau de gestion.
//
//   npm run init:reports -- "<TABLEAU GESTION.xlsx>"            → aperçu, rien n'est écrit
//   npm run init:reports -- "<TABLEAU GESTION.xlsx>" --apply    → écrit en base
//   npm run init:reports -- "<TABLEAU GESTION.xlsx>" --sheet "TG 11-12 2025"
//   npm run init:reports -- "<Tableau gestion CVB.xlsx>" --entite covarbat [--apply]
//
// Préfixer par DOTENV_CONFIG_PATH=.env.local pour viser la production.
//
// Les balances analytiques importées ne remontent pas avant leur premier mois,
// alors que les cumuls d'un chantier courent depuis son ouverture. L'onglet du
// premier mois suivi par la DAF porte, par chantier, « Report Cumul Facturation »
// et « Report Cumul Résultat » : sa situation à la veille de ce mois. Le script
// les enregistre comme saisies « report_ouverture », que la vue Chantiers ajoute
// aux mois importés.
//
// Deux dispositions de tableau :
//   · Sodobat : un chantier par ligne, les reports en colonnes (onglet « TG MM AAAA ») ;
//   · CovarBat : un chantier par colonne, les reports sur deux lignes de l'onglet
//     du premier mois (« COVARBAT 30 11 25 »), celui de la plus ancienne période.
//
// Relançable : chaque exécution remplace les reports d'ouverture existants de
// l'entité. N'écrit que dans manual_entries — ni imports, ni balances, ni
// nomenclature.

import "dotenv/config";
import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { db, tables } from "../src/db";
import { getEntityByCode, loadCentreKinds } from "../src/lib/finance";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const COL = { code: 0, name: 1, reportFacturation: 26, reportResultat: 28 } as const;
const DEFAULT_SHEET = "TG 11-12 2025";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const eur = (x: number) =>
  x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(16);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

type Report = { code: string; label: string; facturation: number; resultat: number };
type Lecture = { sheet: string; period: string; reports: Report[] };

/** « TG 11-12 2025 » → « 2025-11-01 » : les reports sont arrêtés à la veille de ce mois. */
function openingPeriod(sheet: string): string {
  const m = /^TG (\d{2})(?:-\d{2})? (\d{4})$/.exec(sheet.trim());
  if (!m) throw new Error(`nom d'onglet « ${sheet} » non reconnu (attendu : « TG MM AAAA »)`);
  return `${m[2]}-${m[1]}-01`;
}

/** Disposition Sodobat : un chantier par ligne, les reports en colonnes fixes. */
function lireLignes(wb: XLSX.WorkBook, sheet: string): Lecture {
  const ws = wb.Sheets[sheet];
  if (!ws) throw new Error(`onglet « ${sheet} » absent du fichier`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const header = rows.findIndex((r) => String(r?.[COL.code] ?? "").includes("CHANTIER"));
  if (header < 0) throw new Error("ligne d'en-tête « N°CHANTIER » introuvable");
  const h = rows[header].map((v) => String(v ?? "").toUpperCase());
  if (!h[COL.reportFacturation].includes("REPORT") || !h[COL.reportResultat].includes("REPORT"))
    throw new Error("colonnes « Report Cumul … » introuvables à leur place : le TG a changé de forme");
  const reports: Report[] = [];
  for (const r of rows.slice(header + 1)) {
    const code = String(r?.[COL.code] ?? "").trim().toUpperCase();
    if (!code || code.startsWith("POLE")) continue;
    reports.push({
      code,
      label: String(r[COL.name] ?? "").trim(),
      facturation: n(r[COL.reportFacturation]),
      resultat: n(r[COL.reportResultat]),
    });
  }
  return { sheet, period: openingPeriod(sheet), reports };
}

/** « COVARBAT 30 11 25 » ou « COVARBAT 31 07 2026 » → « 2025-11-01 ». */
function periodOfSheet(name: string): string | null {
  const m = /(\d{2})\s+(\d{2})\s+(\d{2}|\d{4})\s*$/.exec(name.trim());
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-01`;
}

/** Disposition CovarBat : un chantier par colonne, les reports sur deux lignes. */
function lireColonnes(wb: XLSX.WorkBook, sheetArg?: string): Lecture {
  const onglets = wb.SheetNames.map((name) => ({ name, period: periodOfSheet(name) }))
    .filter((o): o is { name: string; period: string } => !!o.period)
    .sort((a, b) => a.period.localeCompare(b.period));
  const o = sheetArg ? onglets.find((x) => x.name === sheetArg) : onglets[0];
  if (!o) throw new Error(sheetArg ? `onglet « ${sheetArg} » absent ou sans date` : "aucun onglet mensuel reconnu (attendu : « … JJ MM AAAA »)");
  const g = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[o.name], { header: 1, raw: true, defval: null });
  const hr = g.findIndex((r) => String(r?.[1] ?? "").trim() === "CHANTIERS");
  if (hr < 1) throw new Error(`onglet « ${o.name} » : ligne « CHANTIERS » introuvable`);
  const codes = g[hr];
  const noms = g[hr - 1] ?? [];
  // Les colonnes de chantiers s'arrêtent là où commence le tableau croisé de
  // travail laissé à droite de l'onglet.
  const fin = codes.findIndex((c) => typeof c === "string" && /tiquettes/i.test(c));
  const ligne = (re: RegExp) => g.findIndex((r) => re.test(String(r?.[0] ?? "").trim()));
  const rResultat = ligne(/^Report Cumul R[ée]sultat/i);
  const rFacturation = ligne(/^Report Cumul facturation/i);
  if (rResultat < 0 || rFacturation < 0)
    throw new Error(`onglet « ${o.name} » : lignes « Report Cumul Résultat » / « Report Cumul facturation » introuvables`);
  const reports: Report[] = [];
  for (let c = 2; c < (fin > 0 ? fin : codes.length); c++) {
    const code = String(codes[c] ?? "").trim().toUpperCase();
    if (!code) continue;
    reports.push({
      code,
      label: String(noms[c] ?? "").trim(),
      facturation: n(g[rFacturation][c]),
      resultat: n(g[rResultat][c]),
    });
  }
  return { sheet: o.name, period: o.period, reports };
}

async function main() {
  requireEnvTarget();
  const file = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));
  if (!file) {
    console.error(
      'Usage : npm run init:reports -- "<tableau de gestion.xlsx>" [--entite covarbat] [--sheet "TG 11-12 2025"] [--apply]'
    );
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const code = arg("--entite") ?? "sodobat";
  const entity = await getEntityByCode(code);
  if (!entity) throw new Error(`entité ${code} absente`);
  const kindOf = await loadCentreKinds(entity.id);

  const wb = XLSX.readFile(file);
  const lecture =
    code === "sodobat" ? lireLignes(wb, arg("--sheet") ?? DEFAULT_SHEET) : lireColonnes(wb, arg("--sheet"));
  const { sheet, period } = lecture;

  console.log(`Base    : ${describeTarget()}`);
  console.log(`Entité  : ${entity.name}`);
  console.log(`Onglet  : ${sheet} → reports arrêtés à la veille de ${period.slice(0, 7)}\n`);

  const retenus: { centre: string; label: string; facturation: number; resultat: number }[] = [];
  const ecartes: string[] = [];
  for (const r of lecture.reports) {
    if (r.facturation === 0 && r.resultat === 0) continue;
    // « 56-58-59 » regroupe trois centres : le report est porté par le premier.
    const centre = r.code.split("-")[0];
    if (!/^\d/.test(centre) || kindOf(centre) !== "chantier") {
      ecartes.push(`${r.code.padEnd(10)} ${r.label.slice(0, 32).padEnd(32)}${eur(r.facturation)}${eur(r.resultat)}   pas un centre chantier dans l'application`);
      continue;
    }
    retenus.push({ centre, label: r.label, facturation: r.facturation, resultat: r.resultat });
  }

  // Un même chantier peut figurer deux fois dans l'onglet CovarBat : dans le
  // bloc des chantiers du mois, où quelques colonnes recopient par erreur la
  // valeur de leur voisine, et dans la liste complète des chantiers à droite,
  // où chacun porte sa propre valeur. C'est cette dernière qui fait foi.
  const doublons = [...new Set(retenus.map((r) => r.centre).filter((c, i, a) => a.indexOf(c) !== i))];
  if (doublons.length && code === "sodobat")
    throw new Error(`centre(s) présent(s) deux fois dans l'onglet : ${doublons.join(", ")}`);
  for (const d of doublons) {
    const occurrences = retenus.filter((r) => r.centre === d);
    const garde = occurrences[occurrences.length - 1];
    console.log(
      `! ${d} présent ${occurrences.length} fois : ` +
        occurrences.map((o) => `${eur(o.facturation).trim()} / ${eur(o.resultat).trim()}`).join(" puis ") +
        " — la dernière occurrence est retenue"
    );
    for (const o of occurrences) if (o !== garde) retenus.splice(retenus.indexOf(o), 1);
  }

  console.log(`${"centre".padEnd(10)} ${"chantier".padEnd(32)}${"report facturation".padStart(16)}${"report résultat".padStart(16)}`);
  for (const r of retenus)
    console.log(`${r.centre.padEnd(10)} ${r.label.slice(0, 32).padEnd(32)}${eur(r.facturation)}${eur(r.resultat)}`);
  console.log(
    `${"".padEnd(10)} ${`TOTAL · ${retenus.length} chantiers`.padEnd(32)}` +
      `${eur(retenus.reduce((s, r) => s + r.facturation, 0))}${eur(retenus.reduce((s, r) => s + r.resultat, 0))}`
  );
  if (ecartes.length) {
    console.log("\nLignes non reprises :");
    for (const e of ecartes) console.log(`  ${e}`);
  }

  const existing = await db
    .select({ id: tables.manualEntries.id })
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entity.id),
        eq(tables.manualEntries.field, "report_ouverture")
      )
    );

  if (!apply) {
    console.log(
      `\nAperçu seulement : ${retenus.length * 2} valeurs à écrire` +
        (existing.length ? `, ${existing.length} report(s) d'ouverture existant(s) seraient remplacés` : "") +
        ". Relancer avec --apply pour écrire."
    );
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(tables.manualEntries)
      .where(
        and(
          eq(tables.manualEntries.entityId, entity.id),
          eq(tables.manualEntries.field, "report_ouverture")
        )
      );
    await tx.insert(tables.manualEntries).values(
      retenus.flatMap((r) =>
        (["facturation", "resultat"] as const).map((subKey) => ({
          entityId: entity.id,
          period,
          centreCode: r.centre,
          field: "report_ouverture" as const,
          subKey,
          valueNum: r[subKey].toFixed(2),
          // Un chantier clos avant le premier mois importé n'existe dans aucune
          // balance : son intitulé ne peut venir que du tableau de gestion.
          valueText: r.label || null,
          status: "final" as const,
          updatedBy: "init-reports-cumul",
        }))
      )
    );
  });
  console.log(`\n✓ ${retenus.length * 2} valeurs écrites (${existing.length} remplacée(s)).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
