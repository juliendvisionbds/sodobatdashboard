// Reprise des cumuls d'ouverture des chantiers depuis le tableau de gestion.
//
//   npm run init:reports -- "<TABLEAU GESTION.xlsx>"            → aperçu, rien n'est écrit
//   npm run init:reports -- "<TABLEAU GESTION.xlsx>" --apply    → écrit en base
//   npm run init:reports -- "<TABLEAU GESTION.xlsx>" --sheet "TG 11-12 2025"
//
// Préfixer par DOTENV_CONFIG_PATH=.env.prod.local pour viser la production.
//
// Les balances analytiques importées ne remontent pas avant leur premier mois,
// alors que les cumuls d'un chantier courent depuis son ouverture. L'onglet du
// premier mois suivi par la DAF porte, par chantier, « Report Cumul Facturation »
// et « Report Cumul Résultat » : sa situation à la veille de ce mois. Le script
// les enregistre comme saisies « report_ouverture », que la vue Chantiers ajoute
// aux mois importés.
//
// Relançable : chaque exécution remplace les reports d'ouverture existants.
// N'écrit que dans manual_entries — ni imports, ni balances, ni nomenclature.

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

/** « TG 11-12 2025 » → « 2025-11-01 » : les reports sont arrêtés à la veille de ce mois. */
function openingPeriod(sheet: string): string {
  const m = /^TG (\d{2})(?:-\d{2})? (\d{4})$/.exec(sheet.trim());
  if (!m) throw new Error(`nom d'onglet « ${sheet} » non reconnu (attendu : « TG MM AAAA »)`);
  return `${m[2]}-${m[1]}-01`;
}

async function main() {
  requireEnvTarget();
  const file = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));
  if (!file) {
    console.error('Usage : npm run init:reports -- "<tableau de gestion.xlsx>" [--sheet "TG 11-12 2025"] [--apply]');
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const sheet = arg("--sheet") ?? DEFAULT_SHEET;
  const period = openingPeriod(sheet);

  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité sodobat absente");
  const kindOf = await loadCentreKinds(entity.id);

  const ws = XLSX.readFile(file).Sheets[sheet];
  if (!ws) throw new Error(`onglet « ${sheet} » absent du fichier`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const header = rows.findIndex((r) => String(r?.[COL.code] ?? "").includes("CHANTIER"));
  if (header < 0) throw new Error("ligne d'en-tête « N°CHANTIER » introuvable");
  const h = rows[header].map((v) => String(v ?? "").toUpperCase());
  if (!h[COL.reportFacturation].includes("REPORT") || !h[COL.reportResultat].includes("REPORT"))
    throw new Error("colonnes « Report Cumul … » introuvables à leur place : le TG a changé de forme");

  console.log(`Base    : ${describeTarget()}`);
  console.log(`Onglet  : ${sheet} → reports arrêtés à la veille de ${period.slice(0, 7)}\n`);

  const retenus: { centre: string; label: string; facturation: number; resultat: number }[] = [];
  const ecartes: string[] = [];
  for (const r of rows.slice(header + 1)) {
    const code = String(r?.[COL.code] ?? "").trim().toUpperCase();
    if (!code || code.startsWith("POLE")) continue;
    const facturation = n(r[COL.reportFacturation]);
    const resultat = n(r[COL.reportResultat]);
    if (facturation === 0 && resultat === 0) continue;
    // « 56-58-59 » regroupe trois centres : le report est porté par le premier.
    const centre = code.split("-")[0];
    const label = String(r[COL.name] ?? "").trim();
    if (!/^\d/.test(centre) || kindOf(centre) !== "chantier") {
      ecartes.push(`${code.padEnd(10)} ${label.slice(0, 32).padEnd(32)}${eur(facturation)}${eur(resultat)}   pas un centre chantier dans l'application`);
      continue;
    }
    retenus.push({ centre, label, facturation, resultat });
  }

  const doublons = retenus.map((r) => r.centre).filter((c, i, a) => a.indexOf(c) !== i);
  if (doublons.length) throw new Error(`centre(s) présent(s) deux fois dans l'onglet : ${[...new Set(doublons)].join(", ")}`);

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
