// Rapprochement de la Synthèse avec l'onglet de synthèse d'un tableau de
// gestion de la DAF : « Synthese » (CovarBat), « Synthese 2026 » (VBTP),
// « EM 2026 » (Easy Mat). Lecture seule.
//
//   npm run rapprochement:synthese -- "<Tableau gestion CVB.xlsx>" --entite covarbat
//   npm run rapprochement:synthese -- "<2026 06_TG EASYMAT.XLSX>" --entite easymat [--sheet "EM 2026"]
//
// L'onglet se trouve seul : celui nommé « Synthese… », sinon le premier dont une
// ligne porte les mois en dates Excel ; --sheet le désigne explicitement.
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
import { fiscalYearLabel } from "../src/lib/format";
import { debutExercice } from "../src/lib/nomenclature/entites";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Le tableau de gestion écrit les charges en négatif ; l'application en positif. */
const neg = (v: number | null) => (v == null ? null : round2(-v));
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
  const file = process.argv.slice(2).find((a) => /\.xlsx$/i.test(a));
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
  const grille = (nom: string) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nom], { header: 1, raw: true, defval: null });
  const ligneDesMois = (g: unknown[][]) =>
    g.find((r) => (r ?? []).filter((c) => monthOfSerial(c)).length >= 6);
  // « Synthese » (CovarBat), « Synthese 2026 » (VBTP), « EM 2026 » (Easy Mat) :
  // l'onglet demandé, sinon celui nommé Synthese, sinon le premier qui porte les mois.
  const nomSynthese =
    arg("--sheet") ??
    wb.SheetNames.find((s) => /^synth[eè]se/i.test(s.trim())) ??
    wb.SheetNames.find((s) => ligneDesMois(grille(s)));
  if (!nomSynthese || !wb.Sheets[nomSynthese])
    throw new Error(`onglet de synthèse introuvable (${wb.SheetNames.join(", ")})`);
  const g = grille(nomSynthese);
  const header = ligneDesMois(g);
  if (!header) throw new Error(`ligne des mois introuvable dans l'onglet « ${nomSynthese} »`);
  console.log(`Onglet  : ${nomSynthese}`);
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
  // Libellés selon l'entité : « annulation » / « Provision » (CovarBat, VBTP),
  // « Reprise Travaux en cours » / « Travaux en cours mois » (Easy Mat).
  const tgAnnulation = (m: string) => tg(/^(annulation|Reprise Travaux en cours)$/i, m);
  const tgProvision = (m: string) => tg(/^(Provision|Travaux en cours mois)$/i, m);
  const tgCaTotal = (m: string) => tg(/^(CA Total|Total CA)$/i, m);
  // Sans ligne de facturation (Easy Mat détaille ses produits), elle se déduit du total.
  const tgFacturation = (m: string) => {
    const direct = tg(/^CA MOIS Facturation$/i, m);
    if (direct != null) return direct;
    const total = tgCaTotal(m);
    return total == null ? null : round2(total - (tgAnnulation(m) ?? 0) - (tgProvision(m) ?? 0));
  };
  const lignes: { label: string; tg: (m: string) => number | null; app: (m: string) => number | null }[] = [
    { label: "CA facturation", tg: tgFacturation, app: (m) => app("syn_ca_facturation", m) },
    { label: "Annulation M-1", tg: tgAnnulation, app: (m) => app(SYNTHESE_CODES.annulation, m) },
    { label: "Prévision M", tg: tgProvision, app: (m) => app(SYNTHESE_CODES.tecProvision, m) },
    { label: "CA total", tg: tgCaTotal, app: (m) => app(SYNTHESE_CODES.caTotal, m) },
    // Sous-totaux du tableau VBTP : donnés à titre indicatif, la maquette de
    // l'application n'y range pas exactement les mêmes comptes.
    {
      label: "Charges d'exploitation (indicatif)",
      tg: (m) => neg(tg(/^Total Charges exploitations?$/i, m)),
      app: (m) => app(SYNTHESE_CODES.exploitation, m),
    },
    {
      label: "Charges de personnel (indicatif)",
      tg: (m) => neg(tg(/^(Total|Sous Total) Charges Personnel$/i, m)),
      app: (m) => app(SYNTHESE_CODES.personnel, m),
    },
    {
      label: "Impôts et taxes (indicatif)",
      tg: (m) => neg(tg(/^Imp[oô]ts$/i, m)),
      app: (m) => app(SYNTHESE_CODES.impots, m),
    },
    {
      label: "Résultat d'exploitation (indicatif)",
      tg: (m) => tg(/^Resultat Exploitation$/i, m),
      app: (m) => app(SYNTHESE_CODES.resultatExploitation, m),
    },
    {
      label: "Résultat balance générale",
      tg: (m) => tg(/^Resultat BG Comptable$/i, m),
      app: (m) => app(SYNTHESE_CODES.resultatBg, m),
    },
  ];

  console.log(`Base    : ${describeTarget()}`);
  console.log(`Entité  : ${entity.name} · exercice ${fiscalYearLabel(synthese.fiscalYearStart, debutExercice(entity.code))}\n`);
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
