// Rapprochement de la Synthèse avec l'onglet « Synthese » d'un tableau de
// gestion tenu par chantier en colonnes (CovarBat). Lecture seule.
//
//   npm run rapprochement:synthese -- "<Tableau gestion CVB.xlsx>" --entite covarbat
//
// Préfixer par DOTENV_CONFIG_PATH=.env.local pour lire la production.
//
// Sont comparés, mois par mois, les montants que les deux tableaux définissent
// de la même façon : le chiffre d'affaires (facturation, annulation, prévision,
// total) et le résultat de la balance générale, que l'onglet Synthese donne
// hors amortissement (« Resultat BG Comptable »). Un écart sur un mois ancien
// signale le plus souvent une écriture passée en comptabilité après la clôture
// du tableau de gestion.
//
// Les sous-totaux de charges ne sont pas comparés ligne à ligne : la maquette
// de l'application est celle du groupe, pas celle du tableau de l'entité.

import "dotenv/config";
import * as XLSX from "xlsx";
import { getEntityByCode, getSynthese, SYNTHESE_CODES } from "../src/lib/finance";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const eur = (x: number | null) =>
  x == null
    ? "".padStart(13)
    : x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(13);

/** Serial Excel d'un en-tête de mois → « 2025-11-01 ». */
function monthOfSerial(v: unknown): string | null {
  if (typeof v !== "number" || v < 40000 || v > 60000) return null;
  const d = XLSX.SSF.parse_date_code(v);
  return d ? `${d.y}-${String(d.m).padStart(2, "0")}-01` : null;
}

async function main() {
  requireEnvTarget();
  const file = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));
  const code = arg("--entite");
  if (!file || !code) {
    console.error('Usage : npm run rapprochement:synthese -- "<tableau de gestion.xlsx>" --entite <code>');
    process.exit(1);
  }
  const entity = await getEntityByCode(code);
  if (!entity) throw new Error(`entité ${code} absente`);
  const synthese = await getSynthese(entity);
  if (!synthese) throw new Error("aucune balance ventilée validée pour cette entité");

  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["Synthese"];
  if (!ws) throw new Error("onglet « Synthese » absent du fichier");
  const g = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const header = g.find((r) => r?.some((c) => monthOfSerial(c)));
  if (!header) throw new Error("ligne des mois introuvable dans l'onglet Synthese");
  const colOf = new Map<string, number>();
  header.forEach((c, i) => {
    const m = monthOfSerial(c);
    if (m) colOf.set(m, i);
  });
  const tg = (re: RegExp, month: string): number | null => {
    const row = g.find((r) => re.test(String(r?.[1] ?? "").trim()));
    const v = row?.[colOf.get(month) ?? -1];
    return typeof v === "number" ? round2(v) : null;
  };

  const app = (lineCode: string, month: string) => synthese.byCode[lineCode]?.cells[month] ?? null;
  const lignes: { label: string; tg: (m: string) => number | null; app: (m: string) => number | null }[] = [
    { label: "CA facturation", tg: (m) => tg(/^CA MOIS Facturation$/i, m), app: (m) => app("syn_ca_facturation", m) },
    { label: "Annulation M-1", tg: (m) => tg(/^annulation$/i, m), app: (m) => app(SYNTHESE_CODES.annulation, m) },
    { label: "Prévision M", tg: (m) => tg(/^Provision$/i, m), app: (m) => app(SYNTHESE_CODES.tecProvision, m) },
    { label: "CA total", tg: (m) => tg(/^CA Total$/i, m), app: (m) => app(SYNTHESE_CODES.caTotal, m) },
    {
      label: "Résultat balance générale",
      tg: (m) => tg(/^Resultat BG Comptable$/i, m),
      app: (m) => app(SYNTHESE_CODES.resultatBg, m),
    },
  ];

  console.log(`Base    : ${describeTarget()}`);
  console.log(`Entité  : ${entity.name} · exercice ${synthese.fiscalYearStart}/${synthese.fiscalYearStart + 1}\n`);
  let ecarts = 0;
  for (const month of synthese.monthsWithData) {
    console.log(month.slice(0, 7));
    console.log(`  ${"".padEnd(32)}${"tableau".padStart(13)}${"application".padStart(13)}${"écart".padStart(13)}`);
    for (const l of lignes) {
      const a = l.tg(month);
      const b = l.app(month);
      const e = a != null && b != null ? round2(b - a) : null;
      // Le tableau de gestion est arrondi à l'euro sur certaines lignes saisies.
      const marque = e != null && Math.abs(e) >= 1 ? "  ←" : "";
      if (marque) ecarts++;
      console.log(`  ${l.label.padEnd(32)}${eur(a)}${eur(b)}${eur(e)}${marque}`);
    }
  }
  console.log(
    ecarts
      ? `\n${ecarts} écart(s) d'un euro ou plus avec l'onglet Synthese.`
      : "\nAucun écart d'un euro ou plus avec l'onglet Synthese."
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
