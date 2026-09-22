// Rapprochement de l'application avec le tableau de gestion Excel de la DAF.
//
//   npm run rapprochement:tg -- "/chemin/vers/SODOBAT_TABLEAU GESTION_2026 05.xlsx"
//   npm run rapprochement:tg -- "<fichier>" --detail      (tous les écarts, chantier par chantier)
//
// Préfixer par DOTENV_CONFIG_PATH=.env.prod.local pour lire la base de production.
// Lecture seule : le script n'écrit rien, ni en base ni sur disque.
//
// Trois contrôles, du plus fin au plus global :
//
//  1. CHANTIERS — chaque onglet « TG MM AAAA » (ou « TG 11-12 2025 », deux mois
//     cumulés) est comparé à la vue Chantiers du même mois, chantier par chantier
//     et bloc par bloc. C'est ce que l'utilisateur voit à l'écran, pas un recalcul.
//  2. CUMULS — reports et cumuls de facturation et de résultat. L'écart attendu
//     est l'historique d'avant le premier mois importé, que seul le TG porte.
//  3. RÉSULTAT BG — la ligne « Resultat BG Comptable » de l'onglet Synthèse,
//     mois par mois, contre la Synthèse de l'application.
//
// Un écart n'est pas forcément une erreur : la DAF reclasse à la main des
// écritures d'un chantier à l'autre, et ses exports ont pu être révisés depuis.
// Le script chiffre chaque écart pour qu'il soit arbitré avec elle.

import "dotenv/config";
import * as XLSX from "xlsx";
import {
  CHANTIER_CODES,
  SYNTHESE_CODES,
  getChantiers,
  getEntityByCode,
  getSynthese,
  type ChantierValues,
} from "@/lib/finance";
import { describeTarget, requireEnvTarget } from "@/lib/env-target";

const TOL = 1; // euro : en dessous, on considère que ça colle

// ── Colonnes des onglets mensuels du TG ──────────────────────────────────────
const COL = {
  code: 0,
  annulation: 2,
  prevision: 3,
  facturation: 4,
  totalProduits: 5,
  achats: 10,
  sousTraitance: 13,
  eauEdfCarburant: 14,
  locationEntretien: 17,
  easymat: 18,
  dechets: 19,
  honoraires: 20,
  interims: 21,
  salaires: 22,
  totalCharges: 23,
  resultat: 24,
  reportFacturation: 26,
  cumulFacturation: 27,
  reportResultat: 28,
  cumulResultat: 29,
} as const;

type Bloc = {
  label: string;
  /** valeur lue dans la ligne du TG */
  daf: (r: unknown[]) => number;
  /** lignes de la nomenclature chantier qui lui correspondent */
  app: string[];
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const BLOCS: Bloc[] = [
  { label: "Annulation M-1", daf: (r) => n(r[COL.annulation]), app: [CHANTIER_CODES.annulation] },
  { label: "Prévision du mois", daf: (r) => n(r[COL.prevision]), app: [CHANTIER_CODES.provision] },
  {
    label: "Facturation du mois",
    daf: (r) => n(r[COL.facturation]),
    app: ["cha_produits_travaux", "cha_produits_marchandises", "cha_refacturations"],
  },
  { label: "TOTAL PRODUITS", daf: (r) => n(r[COL.totalProduits]), app: [CHANTIER_CODES.caTotal] },
  { label: "Achats MP / REP / emballages", daf: (r) => n(r[COL.achats]), app: ["cha_st_achats"] },
  { label: "Sous-traitance", daf: (r) => n(r[COL.sousTraitance]), app: ["cha_sous_traitance"] },
  {
    label: "Eau / EDF / carburant",
    daf: (r) => n(r[COL.eauEdfCarburant]),
    app: ["cha_carburant", "cha_edf_eau"],
  },
  {
    label: "Location / entretien / EasyMat",
    daf: (r) => n(r[COL.locationEntretien]) + n(r[COL.easymat]),
    app: ["cha_locations", "cha_entretien"],
  },
  { label: "Déchets", daf: (r) => n(r[COL.dechets]), app: ["cha_dechets"] },
  { label: "Honoraires / gardiennage", daf: (r) => n(r[COL.honoraires]), app: ["cha_honoraires"] },
  { label: "Intérims", daf: (r) => n(r[COL.interims]), app: ["cha_interim"] },
  {
    label: "Salaires et charges (63-64)",
    daf: (r) => n(r[COL.salaires]),
    app: [
      "cha_formation_continue", "cha_taxe_apprentissage", "cha_salaires", "cha_primes",
      "cha_urssaf", "cha_conges_payes", "cha_pole_emploi", "cha_probtp",
      "cha_autres_personnel", "cha_autres_charges",
    ],
  },
  {
    label: "TOTAL CHARGES",
    daf: (r) => n(r[COL.totalCharges]),
    app: [CHANTIER_CODES.totalExploitation, CHANTIER_CODES.totalPersonnel],
  },
  { label: "RÉSULTAT DU MOIS", daf: (r) => n(r[COL.resultat]), app: [CHANTIER_CODES.resultat] },
];

const CUMULS: Bloc[] = [
  { label: "Report cumul facturation", daf: (r) => n(r[COL.reportFacturation]), app: [CHANTIER_CODES.reportFacturation] },
  { label: "Cumul facturation", daf: (r) => n(r[COL.cumulFacturation]), app: [CHANTIER_CODES.cumulFacturation] },
  { label: "Report cumul résultat", daf: (r) => n(r[COL.reportResultat]), app: [CHANTIER_CODES.reportResultat] },
  { label: "Cumul résultat", daf: (r) => n(r[COL.cumulResultat]), app: [CHANTIER_CODES.cumulResultat] },
];

// ── Mise en forme ────────────────────────────────────────────────────────────
const eur = (x: number) =>
  x.toLocaleString("fr-FR", { maximumFractionDigits: 0 }).padStart(12);
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const moisLabel = (p: string) => `${MOIS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

/** « TG 05 2026 » → ["2026-05-01"] ; « TG 11-12 2025 » → novembre et décembre. */
function periodsOfSheet(name: string): string[] | null {
  const m = /^TG (\d{2})(?:-(\d{2}))? (\d{4})$/.exec(name.trim());
  if (!m) return null;
  const [, a, b, year] = m;
  return [a, ...(b ? [b] : [])].map((mm) => `${year}-${mm}-01`);
}

/**
 * Lignes chantier d'un onglet, indexées par code de centre de l'application.
 * « 56-58-59 » regroupe trois centres ; les autres codes sont repris tels quels.
 */
function readSheet(ws: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const header = rows.findIndex((r) => String(r?.[COL.code] ?? "").includes("CHANTIER"));
  if (header < 0) return null;
  // Garde-fou : si la DAF déplace une colonne, mieux vaut s'arrêter que comparer n'importe quoi.
  const h = rows[header].map((v) => String(v ?? "").toUpperCase());
  if (!h[COL.totalProduits].includes("TOTAL PRODUITS") || !h[COL.totalCharges].includes("TOTAL CHARGES"))
    throw new Error("colonnes du TG déplacées : TOTAL PRODUITS / TOTAL CHARGES introuvables à leur place");

  const out = new Map<string, { centres: string[]; row: unknown[] }>();
  for (const r of rows.slice(header + 1)) {
    const code = String(r?.[COL.code] ?? "").trim().toUpperCase();
    if (!/^\d/.test(code) && code !== "DEPOT" && code !== "SAV") continue;
    out.set(code, { centres: code.includes("-") ? code.split("-") : [code], row: r });
  }
  return out;
}

type Ecart = { sheet: string; bloc: string; centre: string; daf: number; app: number };

async function main() {
  requireEnvTarget();
  const file = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));
  if (!file) {
    console.error('Usage : npm run rapprochement:tg -- "<tableau de gestion.xlsx>" [--detail]');
    process.exit(1);
  }
  const detail = process.argv.includes("--detail");
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité sodobat absente");
  const wb = XLSX.readFile(file);

  console.log(`Base : ${describeTarget()}`);
  console.log(`TG   : ${file.split("/").pop()}\n`);

  const sheets = wb.SheetNames.map((name) => ({ name, periods: periodsOfSheet(name) }))
    .filter((s): s is { name: string; periods: string[] } => !!s.periods)
    // Les anciens exercices ne sont pas en base sous forme analytique.
    .sort((a, b) => a.periods[0].localeCompare(b.periods[0]));

  const ecarts: Ecart[] = [];
  const bilan: { sheet: string; cells: number; ok: number; totalCharges: [number, number]; resultat: [number, number] }[] = [];

  for (const { name, periods } of sheets) {
    const daf = readSheet(wb.Sheets[name]);
    if (!daf) continue;

    // Vue Chantiers du ou des mois de l'onglet, additionnés.
    const app = new Map<string, ChantierValues>();
    let lastMonth: Awaited<ReturnType<typeof getChantiers>> = null;
    let missing = false;
    for (const period of periods) {
      const data = await getChantiers(entity, { period });
      if (!data || data.period !== period) {
        missing = true;
        break;
      }
      lastMonth = data;
      for (const row of data.rows) {
        const acc = app.get(row.centreCode.toUpperCase()) ?? {};
        for (const [code, v] of Object.entries(row.values))
          if (typeof v === "number") acc[code] = (acc[code] ?? 0) + v;
        app.set(row.centreCode.toUpperCase(), acc);
      }
    }
    if (missing || !lastMonth) {
      console.log(`══ ${name} — pas de balance analytique importée pour ${periods.map(moisLabel).join(" + ")}, onglet ignoré\n`);
      continue;
    }

    const appOf = (centres: string[], codes: string[]) =>
      centres.reduce(
        (s, c) => s + codes.reduce((t, k) => t + (app.get(c)?.[k] ?? 0), 0),
        0
      );

    const couverts = new Set([...daf.values()].flatMap((d) => d.centres));
    const horsTg = [...app.keys()].filter(
      (c) => !couverts.has(c) && BLOCS.some((b) => Math.abs(appOf([c], b.app)) > TOL)
    );

    console.log(`══ ${name} · ${periods.map(moisLabel).join(" + ")} · ${daf.size} lignes DAF, ${app.size} chantiers dans l'application`);
    console.log(`${"".padEnd(32)}${"DAF".padStart(12)}${"application".padStart(12)}${"écart".padStart(12)}   chantiers en écart`);

    let cells = 0;
    let ok = 0;
    const totals: Record<string, [number, number]> = {};
    const compare = (blocs: Bloc[], count: boolean) => {
      for (const bloc of blocs) {
        let D = 0;
        let A = 0;
        const off: { centre: string; d: number; a: number }[] = [];
        for (const [code, { centres, row }] of daf) {
          // DEPOT et SAV sont suivis comme des chantiers par la DAF ; s'ils sont
          // classés en structure dans l'application, ils sortent de la
          // comparaison et sont signalés en périmètre.
          if ((code === "DEPOT" || code === "SAV") && !app.has(code)) continue;
          const d = bloc.daf(row);
          const a = appOf(centres, bloc.app);
          D += d;
          A += a;
          if (count && (d !== 0 || a !== 0)) {
            cells++;
            if (Math.abs(a - d) <= TOL) ok++;
          }
          if (Math.abs(a - d) > TOL) off.push({ centre: code, d, a });
        }
        for (const c of horsTg) {
          const a = appOf([c], bloc.app);
          A += a;
          if (Math.abs(a) > TOL) off.push({ centre: `${c} (hors TG)`, d: 0, a });
        }
        totals[bloc.label] = [D, A];
        off.sort((x, y) => Math.abs(y.a - y.d) - Math.abs(x.a - x.d));
        for (const o of off) ecarts.push({ sheet: name, bloc: bloc.label, centre: o.centre, daf: o.d, app: o.a });
        console.log(
          `${bloc.label.padEnd(32)}${eur(D)}${eur(A)}${eur(A - D)}   ${String(off.length).padStart(2)}` +
            (off.length ? `  ${off.slice(0, 3).map((o) => `${o.centre} ${Math.round(o.a - o.d)}`).join(" · ")}` : "")
        );
      }
    };
    compare(BLOCS, true);
    // Les cumuls se lisent à la fin du dernier mois de l'onglet.
    if (periods.length === 1) {
      console.log("  — cumuls sur la durée de vie du chantier —");
      compare(CUMULS, false);
    }

    const depot = daf.get("DEPOT");
    if (depot && !app.has("DEPOT") && Math.abs(n(depot.row[COL.totalCharges])) > TOL)
      console.log(`  périmètre : la DAF suit le DEPOT dans le TG chantier (charges ${eur(n(depot.row[COL.totalCharges])).trim()}), l'application le classe en structure`);
    if (horsTg.length)
      console.log(`  périmètre : chantiers mouvementés dans l'application, absents de l'onglet : ${horsTg.join(", ")}`);
    console.log(`  → ${ok}/${cells} valeurs identiques à l'euro près (${cells ? Math.round((ok / cells) * 100) : 100} %)\n`);
    bilan.push({ sheet: name, cells, ok, totalCharges: totals["TOTAL CHARGES"], resultat: totals["RÉSULTAT DU MOIS"] });
  }

  // ── Résultat BG comptable, mois par mois ───────────────────────────────────
  const syn = wb.Sheets["Synthese 2026"];
  if (syn) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(syn, { header: 1, defval: null });
    const dates = rows.find((r) => String(r?.[1] ?? "").trim() === "Libelles");
    const bg = rows.find((r) => String(r?.[1] ?? "").trim().startsWith("Resultat BG"));
    const data = await getSynthese(entity);
    if (dates && bg && data) {
      console.log("══ Résultat BG comptable · onglet « Synthese 2026 » contre la Synthèse de l'application");
      console.log(`${"".padEnd(14)}${"DAF".padStart(12)}${"application".padStart(12)}${"écart".padStart(12)}`);
      const app = data.byCode[SYNTHESE_CODES.resultatBg]?.cells ?? {};
      for (let c = 2; c < dates.length; c++) {
        if (typeof dates[c] !== "number" || typeof bg[c] !== "number") continue;
        // Numéro de série Excel → mois ; la DAF date chaque colonne du dernier jour du mois.
        const d = XLSX.SSF.parse_date_code(dates[c] as number);
        const period = `${d.y}-${String(d.m).padStart(2, "0")}-01`;
        const want = bg[c] as number;
        // Novembre et décembre sont cumulés dans la colonne de décembre du TG.
        const got =
          d.m === 12 ? (app[`${d.y}-11-01`] ?? 0) + (app[period] ?? 0) : (app[period] ?? 0);
        const label = d.m === 12 ? `nov.+${moisLabel(period)}` : moisLabel(period);
        console.log(
          `${label.padEnd(14)}${eur(want)}${eur(got)}${eur(got - want)}` +
            (Math.abs(got - want) <= TOL ? "   identique" : "   révisé depuis son export ?")
        );
      }
      console.log("");
    }
  }

  // ── Bilan ──────────────────────────────────────────────────────────────────
  console.log("══ BILAN");
  console.log(`${"onglet".padEnd(16)}${"identiques".padStart(14)}${"charges DAF".padStart(14)}${"charges app".padStart(14)}${"résultat DAF".padStart(14)}${"résultat app".padStart(14)}`);
  for (const b of bilan)
    console.log(
      `${b.sheet.padEnd(16)}${`${b.ok}/${b.cells}`.padStart(14)}${eur(b.totalCharges[0]).padStart(14)}${eur(b.totalCharges[1]).padStart(14)}${eur(b.resultat[0]).padStart(14)}${eur(b.resultat[1]).padStart(14)}`
    );

  if (detail) {
    console.log("\n══ DÉTAIL DES ÉCARTS (hors cumuls)");
    const cumulLabels = new Set(CUMULS.map((c) => c.label));
    for (const e of ecarts) {
      if (cumulLabels.has(e.bloc)) continue;
      console.log(`${e.sheet.padEnd(15)}${e.centre.padEnd(18)}${e.bloc.padEnd(32)}${eur(e.daf)}${eur(e.app)}${eur(e.app - e.daf)}`);
    }
  } else {
    console.log("\n(ajouter --detail pour la liste complète des écarts, chantier par chantier)");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
