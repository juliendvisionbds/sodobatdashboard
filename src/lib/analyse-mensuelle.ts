// Analyse mensuelle de performance (page Objectifs).
//
// Pour un mois validé par la DAF, on assemble ce qu'un dirigeant doit voir en
// deux minutes : le flash du mois, les objectifs du dirigeant (cumul et mois
// seul), les fortes variations de charges, l'effet ciseau charges / CA, les
// chantiers à regarder, les frais généraux et la fiabilité des données.
//
// Aucun chiffre n'est calculé à part : tout est relu dans la Synthèse, la vue
// Chantiers et les Objectifs, déjà recoupés avec la comptabilité. Les chiffres
// sont figés à la génération (`figures`), puis l'IA rédige un texte à partir
// d'eux seuls ; la DAF le relit et publie.

import { and, desc, eq } from "drizzle-orm";
import { generateText, Output } from "ai";
import { z } from "zod";
import { db, tables } from "@/db";
import { openai } from "./openai";
import {
  CHANTIER_CODES,
  SYNTHESE_CODES,
  getChantiers,
  getObjectifs,
  getSynthese,
  latestValidatedImport,
  type Entity,
  type SyntheseData,
} from "./finance";
import { fiscalMonths } from "./parsers";
import { debutExercice } from "./nomenclature/entites";
import { fmtEurAuto, monthLabelLong } from "./format";
import { OBJECTIFS, statutObjectif, type ObjectifStatut } from "./objectifs";

// ── Seuils ───────────────────────────────────────────────────────────────────
//
// Posés en attendant les repères de la DAF. Une variation n'est signalée que si
// elle dépasse À LA FOIS le seuil en % et le seuil en euros : un poste de 5 k€
// qui double ne dit rien, un écart de 60 k€ sur un poste de 2 M€ non plus.
// Sur un CA mensuel de l'ordre de 1,5 M€, 50 k€ pèsent déjà 3 points de marge.
export const SEUILS = {
  /** mois de référence : moyenne des N derniers mois disposant de données */
  moisReference: 3,
  alerte: { pct: 40, eur: 50_000 },
  critique: { pct: 80, eur: 150_000 },
  /** poste de charge à zéro alors qu'il pèse au moins ce montant d'habitude */
  posteAbsent: 50_000,
  /** effet ciseau : charges qui progressent d'au moins N points de plus que le CA */
  ciseauPoints: 10,
  /** taux de charges du mois qui dépasse le cumul d'au moins N points */
  decrochageTaux: 5,
  /** chantier dont les charges du mois dépassent ce montant sans facturation ni prévision */
  chantierCharges: 20_000,
} as const;

/** Postes suivis pour les fortes variations, dans l'ordre de la Synthèse. */
const POSTES_SURVEILLES: { code: string; famille: "produit" | "charge" }[] = [
  { code: "syn_ca_facturation", famille: "produit" },
  { code: "syn_st_achats", famille: "charge" },
  { code: "syn_sous_traitance_sodobat", famille: "charge" },
  { code: "syn_sous_traitance_direct", famille: "charge" },
  { code: "syn_location_materiel_externe", famille: "charge" },
  { code: "syn_location_easymat", famille: "charge" },
  { code: "syn_location_autres", famille: "charge" },
  { code: "syn_dechets", famille: "charge" },
  { code: "syn_entretien", famille: "charge" },
  { code: "syn_edf_eau_chantier", famille: "charge" },
  { code: "syn_carburant", famille: "charge" },
  { code: "syn_deplacements", famille: "charge" },
  { code: "syn_honoraires_chantier", famille: "charge" },
  { code: "syn_masse_salariale", famille: "charge" },
  { code: "syn_interims", famille: "charge" },
  { code: "syn_total_fx", famille: "charge" },
];

/**
 * Ligne mensuelle de chaque objectif. Les objectifs lus dans les Frais généraux
 * (cumul seulement) ont leur équivalent mois par mois dans la Synthèse.
 */
const CODE_MENSUEL_OBJECTIF: Record<string, string> = {
  salaires_sedentaires: "syn_fx_ms_structure",
};

// ── Types ────────────────────────────────────────────────────────────────────

export type Niveau = "alerte" | "critique";

export type Variation = {
  code: string;
  label: string;
  famille: "produit" | "charge";
  /** hausse, baisse, ou poste absent ce mois alors qu'il ne l'est jamais */
  sens: "hausse" | "baisse" | "absent";
  mois: number;
  /** moyenne des mois de référence */
  reference: number;
  ecart: number;
  ecartPct: number | null;
  /** même mois de l'exercice précédent */
  n1: number | null;
  niveau: Niveau;
};

export type ObjectifAnalyse = {
  key: string;
  label: string;
  objectif: number | null;
  realiseCumul: number | null;
  ecartCumul: number | null;
  statut: ObjectifStatut;
  /** ratio du mois seul, en % du CA du mois */
  realiseMois: number | null;
  statutMois: ObjectifStatut;
  /** statut du cumul à la fin du mois précédent */
  statutPrecedent: ObjectifStatut;
  montantMois: number | null;
};

export type ChantierSignal = {
  code: string;
  label: string;
  chargesMois: number;
  facturationMois: number;
  provisionMois: number;
  /** reprise de la prévision de M-1 (négative) */
  annulationMois: number;
  resultatMois: number;
  cumulResultat: number | null;
  cumulFacturation: number | null;
};

export type AnalyseFigures = {
  version: 1;
  period: string;
  fiscalYearStart: number;
  /** mois dont la moyenne sert de référence aux variations */
  moisReference: string[];
  /** nombre de mois du cumul de l'exercice */
  moisCumul: number;
  flash: {
    caMois: number;
    caMoisN1: number | null;
    caCumul: number;
    caCumulN1: number | null;
    resultatExploitationMois: number;
    resultatExploitationCumul: number;
    margeMois: number | null;
    margeCumul: number | null;
    /** marge cumulée à la fin du mois précédent */
    margeCumulPrecedente: number | null;
    resultatNetCumul: number;
    /**
     * Chiffre d'affaires facturé, hors travaux en cours (prévision du mois et
     * reprise de celle du mois précédent) : c'est celui que cite le texte, à
     * la demande de la DAF. Absent des analyses générées avant le 14 octobre 2026.
     */
    factureMois?: number;
    factureReference?: number | null;
    factureMoisN1?: number | null;
    factureCumul?: number;
    factureCumulN1?: number | null;
  };
  objectifs: {
    rows: ObjectifAnalyse[];
    renseignes: number;
    tenus: number;
    surveiller: number;
    mauvais: number;
    totalControle: number | null;
  };
  variations: Variation[];
  /**
   * Charges directes face au CA. N'est plus affiché ni transmis à la rédaction
   * (retour de la DAF du 14 octobre 2026) ; gardé dans les chiffres figés.
   */
  ciseau: {
    chargesMois: number;
    chargesReference: number | null;
    chargesEvolPct: number | null;
    caMois: number;
    caReference: number | null;
    caEvolPct: number | null;
    facturationMois: number;
    facturationEvolPct: number | null;
    provisionMois: number;
    annulationMois: number;
    tauxMois: number | null;
    tauxCumul: number | null;
    tauxCumulN1: number | null;
    /**
     * ciseau : les charges progressent nettement plus vite que le CA ;
     * taux : le taux de charges du mois décroche du cumul.
     */
    signal: "ciseau" | "taux" | null;
    lectures: string[];
  };
  chantiers: {
    disponible: boolean;
    mouvementes: number;
    sansFacturation: ChantierSignal[];
    resultatsNegatifs: ChantierSignal[];
  };
  fraisGeneraux: {
    mois: number;
    reference: number | null;
    evolPct: number | null;
    pctCaMois: number | null;
    pctCaCumul: number | null;
  };
  fiabilite: {
    valideePar: string;
    valideeLe: string;
    alertesOuvertes: number;
    comptesNonMappes: number;
    analytiquePresente: boolean;
    moisSansAnalytique: string[];
  };
  seuils: typeof SEUILS;
};

export type Redaction = {
  enBref: string;
  pointsForts: string[];
  pointsAttention: string[];
  /** actions réparties entre la DAF et l'exploitation, depuis le 14 octobre 2026 */
  actionsDaf?: string[];
  actionsExploitation?: string[];
  /** liste unique des analyses rédigées avant ; vide depuis */
  actions: string[];
};

export type AnalyseStatut = "draft" | "published";

/** Ligne de l'historique : un résumé, sans le détail des chiffres. */
export type AnalyseResume = {
  period: string;
  status: AnalyseStatut;
  caduque: boolean;
  caMois: number;
  margeCumul: number | null;
  objectifsMauvais: number;
  alertes: number;
  generatedBy: string;
  generatedAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
};

export type AnalyseDetail = AnalyseResume & {
  figures: AnalyseFigures;
  redaction: Redaction | null;
  commentaire: string | null;
  model: string | null;
};

// ── Outils ───────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number | null | undefined) =>
  den ? round2((num / den) * 100) : null;
const evol = (v: number, ref: number | null) =>
  ref == null || ref === 0 ? null : round1(((v - ref) / Math.abs(ref)) * 100);

/** "2026-06-01" → "2025-06-01" */
function unAnAvant(period: string) {
  const [y, m] = period.split("-");
  return `${Number(y) - 1}-${m}-01`;
}

const dateFr = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : null;

// ── Mois analysables ─────────────────────────────────────────────────────────

/**
 * Un mois s'analyse quand la DAF l'a validé et que sa balance analytique est
 * toujours celle sur laquelle la validation a porté.
 */
async function validationCourante(entityId: number, period: string) {
  const [[v], imp] = await Promise.all([
    db
      .select()
      .from(tables.monthValidations)
      .where(
        and(
          eq(tables.monthValidations.entityId, entityId),
          eq(tables.monthValidations.period, period)
        )
      ),
    latestValidatedImport(entityId, "analytique", { atPeriod: period }),
  ]);
  if (!v || !imp || v.analytiqueImportId !== imp.id) return null;
  return { validation: v, analytiqueImportId: imp.id };
}

/** Mois validés et encore valables, plus récents en premier. */
export async function listMoisAnalysables(entity: Entity): Promise<string[]> {
  const rows = await db
    .select({ period: tables.monthValidations.period })
    .from(tables.monthValidations)
    .where(eq(tables.monthValidations.entityId, entity.id))
    .orderBy(desc(tables.monthValidations.period));
  const ok = await Promise.all(
    rows.map(async (r) => ((await validationCourante(entity.id, r.period)) ? r.period : null))
  );
  return ok.filter((p): p is string => p != null);
}

// ── Calcul ───────────────────────────────────────────────────────────────────

/** Série mensuelle d'une ligne de la Synthèse, sur l'exercice et le précédent. */
function serie(code: string, syntheses: SyntheseData[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of syntheses) {
    for (const m of s.monthsWithData) {
      const v = s.byCode[code]?.cells[m];
      if (v != null) out.set(m, v);
    }
  }
  return out;
}

function moyenne(values: (number | undefined)[]): number | null {
  const ok = values.filter((v): v is number => v != null);
  return ok.length ? round2(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
}

function niveauVariation(ecart: number, ecartPct: number | null): Niveau | null {
  const a = Math.abs(ecart);
  const p = ecartPct == null ? Infinity : Math.abs(ecartPct);
  if (a >= SEUILS.critique.eur && p >= SEUILS.critique.pct) return "critique";
  if (a >= SEUILS.alerte.eur && p >= SEUILS.alerte.pct) return "alerte";
  return null;
}

export async function computeAnalyse(entity: Entity, period: string) {
  const courante = await validationCourante(entity.id, period);
  if (!courante)
    throw new Error("Ce mois n'est pas validé par la DAF, ou sa balance analytique a été réimportée depuis.");

  const synthese = await getSynthese(entity, { period });
  if (!synthese || !synthese.monthsWithData.includes(period))
    throw new Error("La balance ventilée ne couvre pas ce mois.");

  const months = fiscalMonths(synthese.fiscalYearStart, debutExercice(entity.code));
  const idx = months.indexOf(period);
  const moisPrecedent = idx > 0 ? months[idx - 1] : null;

  const [prevYear, objectifs, objectifsPrec, chantiers, alertesOuvertes] = await Promise.all([
    getSynthese(entity, { fiscalYearStart: synthese.fiscalYearStart - 1 }),
    getObjectifs(entity, { period }),
    moisPrecedent ? getObjectifs(entity, { period: moisPrecedent }) : Promise.resolve(null),
    getChantiers(entity, { period }),
    db
      .select({ id: tables.alerts.id })
      .from(tables.alerts)
      .where(
        and(
          eq(tables.alerts.entityId, entity.id),
          eq(tables.alerts.status, "open"),
          eq(tables.alerts.period, period)
        )
      ),
  ]);
  if (!objectifs) throw new Error("Objectifs indisponibles pour ce mois.");

  const syntheses = prevYear ? [prevYear, synthese] : [synthese];
  const cell = (code: string, m: string = period) => synthese.byCode[code]?.cells[m] ?? 0;
  const cumul = (code: string) => synthese.byCode[code]?.total ?? 0;

  // Mois de référence : les derniers mois avec données avant le mois analysé,
  // en remontant sur l'exercice précédent en début d'exercice.
  const tousMois = [...new Set(syntheses.flatMap((s) => s.monthsWithData))].sort();
  const moisReference = tousMois.filter((m) => m < period).slice(-SEUILS.moisReference);
  const refDe = (code: string) => {
    const s = serie(code, syntheses);
    return moyenne(moisReference.map((m) => s.get(m)));
  };
  const n1De = (code: string) => serie(code, syntheses).get(unAnAvant(period)) ?? null;

  const labels = new Map<string, string>();
  for (const sec of synthese.sections) for (const r of sec.rows) labels.set(r.category.code, r.category.label);

  // ── Flash ──
  const caMois = cell(SYNTHESE_CODES.caTotal);
  const caCumul = cumul(SYNTHESE_CODES.caTotal);
  const rexMois = cell(SYNTHESE_CODES.resultatExploitation);
  const rexCumul = cumul(SYNTHESE_CODES.resultatExploitation);
  const moisAvant = months.slice(0, idx).filter((m) => synthese.monthsWithData.includes(m));
  const somme = (code: string, ms: string[]) => ms.reduce((t, m) => t + cell(code, m), 0);
  const caCumulPrec = somme(SYNTHESE_CODES.caTotal, moisAvant);
  const rowCa = synthese.sections.flatMap((s) => s.rows).find((r) => r.category.code === SYNTHESE_CODES.caTotal);

  const factureCode = "syn_ca_facturation";
  const rowFacture = synthese.sections.flatMap((s) => s.rows).find((r) => r.category.code === factureCode);
  const flash: AnalyseFigures["flash"] = {
    caMois,
    caMoisN1: n1De(SYNTHESE_CODES.caTotal),
    caCumul,
    caCumulN1: rowCa?.prevTotal ?? null,
    resultatExploitationMois: rexMois,
    resultatExploitationCumul: rexCumul,
    margeMois: pct(rexMois, caMois),
    margeCumul: pct(rexCumul, caCumul),
    margeCumulPrecedente: moisAvant.length
      ? pct(somme(SYNTHESE_CODES.resultatExploitation, moisAvant), caCumulPrec)
      : null,
    resultatNetCumul: cumul(SYNTHESE_CODES.resultatNet),
    factureMois: cell(factureCode),
    factureReference: refDe(factureCode),
    factureMoisN1: n1De(factureCode),
    factureCumul: cumul(factureCode),
    factureCumulN1: rowFacture?.prevTotal ?? null,
  };

  // ── Objectifs ──
  const precParCle = new Map(objectifsPrec?.rows.map((r) => [r.key, r.statut]) ?? []);
  const rowsObj: ObjectifAnalyse[] = objectifs.rows.map((r) => {
    const def = OBJECTIFS.find((d) => d.key === r.key);
    const code =
      CODE_MENSUEL_OBJECTIF[r.key] ?? (def?.source.view === "synthese" ? def.source.code : null);
    const montantMois = code ? cell(code) : null;
    const realiseMois = montantMois != null ? pct(montantMois, caMois) : null;
    return {
      key: r.key,
      label: r.label,
      objectif: r.objectif,
      realiseCumul: r.realise,
      ecartCumul: r.ecart,
      statut: r.statut,
      realiseMois,
      statutMois:
        realiseMois != null && r.objectif != null ? statutObjectif(round2(realiseMois - r.objectif)) : null,
      statutPrecedent: precParCle.get(r.key) ?? null,
      montantMois,
    };
  });
  const avecStatut = rowsObj.filter((r) => r.statut);

  // ── Variations ──
  const variations: Variation[] = [];
  if (moisReference.length >= 2) {
    for (const p of POSTES_SURVEILLES) {
      const mois = cell(p.code);
      const reference = refDe(p.code);
      if (reference == null) continue;
      const ecart = round2(mois - reference);
      const ecartPct = evol(mois, reference);
      const base = {
        code: p.code,
        label: labels.get(p.code) ?? p.code,
        famille: p.famille,
        mois,
        reference,
        ecart,
        ecartPct,
        n1: n1De(p.code),
      };
      if (p.famille === "charge" && mois === 0 && reference >= SEUILS.posteAbsent) {
        variations.push({ ...base, sens: "absent", niveau: "alerte" });
        continue;
      }
      // Une charge qui baisse ou un produit qui monte n'appellent pas d'alerte.
      const defavorable = p.famille === "charge" ? ecart > 0 : ecart < 0;
      if (!defavorable) continue;
      const niveau = niveauVariation(ecart, ecartPct);
      if (niveau) variations.push({ ...base, sens: ecart > 0 ? "hausse" : "baisse", niveau });
    }
    variations.sort(
      (a, b) =>
        (a.niveau === b.niveau ? 0 : a.niveau === "critique" ? -1 : 1) ||
        Math.abs(b.ecart) - Math.abs(a.ecart)
    );
  }

  // ── Effet ciseau ──
  const chargesCodes = [SYNTHESE_CODES.exploitation, SYNTHESE_CODES.personnel];
  const chargesMois = chargesCodes.reduce((t, c) => t + cell(c), 0);
  const refCharges = chargesCodes.map(refDe);
  const chargesReference = refCharges.every((v) => v != null)
    ? round2((refCharges as number[]).reduce((a, b) => a + b, 0))
    : null;
  const caReference = refDe(SYNTHESE_CODES.caTotal);
  const facturationMois = cell("syn_ca_facturation");
  const facturationRef = refDe("syn_ca_facturation");
  const chargesEvolPct = evol(chargesMois, chargesReference);
  const caEvolPct = evol(caMois, caReference);
  const facturationEvolPct = evol(facturationMois, facturationRef);
  const provisionMois = cell(SYNTHESE_CODES.tecProvision);
  const annulationMois = cell(SYNTHESE_CODES.annulation);
  const tauxMois = pct(chargesMois, caMois);
  const tauxCumul = objectifs.chargesDirectes;
  const prevRows = synthese.sections.flatMap((s) => s.rows);
  const prevTot = (code: string) => prevRows.find((r) => r.category.code === code)?.prevTotal ?? null;
  const caN1 = prevTot(SYNTHESE_CODES.caTotal);
  const chargesN1 = chargesCodes.map(prevTot);
  const tauxCumulN1 =
    caN1 && chargesN1.every((v) => v != null)
      ? pct((chargesN1 as number[]).reduce((a, b) => a + b, 0), caN1)
      : null;

  const ecartCiseau =
    chargesEvolPct != null && caEvolPct != null ? chargesEvolPct - caEvolPct : null;
  const ecartTaux = tauxMois != null && tauxCumul != null ? tauxMois - tauxCumul : null;
  const signal =
    ecartCiseau != null && ecartCiseau >= SEUILS.ciseauPoints
      ? ("ciseau" as const)
      : ecartTaux != null && ecartTaux >= SEUILS.decrochageTaux
        ? ("taux" as const)
        : null;
  const lectures: string[] = [];
  const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const sg = (n: number) => `${n >= 0 ? "+" : "−"}${fr(Math.abs(n))} %`;
  if (signal === "ciseau")
    lectures.push(
      `Les charges directes progressent de ${sg(chargesEvolPct!)} contre ${sg(caEvolPct!)} pour le CA.`
    );
  if (signal === "taux")
    lectures.push(
      `Le taux de charges du mois (${fr(tauxMois!)} %) dépasse de ${fr(ecartTaux!)} points celui du cumul.`
    );
  if (signal) {
    if (facturationEvolPct != null && facturationEvolPct <= -15)
      lectures.push("La facturation du mois est en net retrait : un décalage de facturation pourrait l'expliquer.");
    if (provisionMois <= 0)
      lectures.push("Aucune prévision (TEC) comptabilisée ce mois : le CA non encore facturé n'est pas pris en compte.");
    if (!lectures.length)
      lectures.push("Ni la facturation ni les prévisions ne l'expliquent : l'écart porte sur la marge de production.");
  }

  // ── Chantiers ──
  const chantiersOk = !!chantiers && chantiers.period === period;
  const signaux: ChantierSignal[] = chantiersOk
    ? chantiers!.rows.map((r) => {
        const v = (c: string) => r.values[c] ?? 0;
        const provision = v(CHANTIER_CODES.provision);
        return {
          code: r.centreCode,
          label: r.centreLabel,
          chargesMois: round2(v(CHANTIER_CODES.totalExploitation) + v(CHANTIER_CODES.totalPersonnel)),
          facturationMois: round2(v(CHANTIER_CODES.caTotal) - provision - v(CHANTIER_CODES.annulation)),
          provisionMois: provision,
          annulationMois: v(CHANTIER_CODES.annulation),
          resultatMois: v(CHANTIER_CODES.resultat),
          cumulResultat: r.values[CHANTIER_CODES.cumulResultat] ?? null,
          cumulFacturation: r.values[CHANTIER_CODES.cumulFacturation] ?? null,
        };
      })
    : [];

  // ── Frais généraux ──
  const fxMois = cell(SYNTHESE_CODES.fx);
  const fxRef = refDe(SYNTHESE_CODES.fx);

  const figures: AnalyseFigures = {
    version: 1,
    period,
    fiscalYearStart: synthese.fiscalYearStart,
    moisReference,
    moisCumul: moisAvant.length + 1,
    flash,
    objectifs: {
      rows: rowsObj,
      renseignes: avecStatut.length,
      tenus: avecStatut.filter((r) => r.statut === "BON" || r.statut === "BIEN").length,
      surveiller: avecStatut.filter((r) => r.statut === "À SURVEILLER").length,
      mauvais: avecStatut.filter((r) => r.statut === "MAUVAIS").length,
      totalControle: objectifs.totalControle,
    },
    variations,
    ciseau: {
      chargesMois: round2(chargesMois),
      chargesReference,
      chargesEvolPct,
      caMois,
      caReference,
      caEvolPct,
      facturationMois,
      facturationEvolPct,
      provisionMois,
      annulationMois,
      tauxMois,
      tauxCumul,
      tauxCumulN1,
      signal,
      lectures,
    },
    chantiers: {
      disponible: chantiersOk,
      mouvementes: chantiersOk ? chantiers!.rows.filter((r) => r.mouvemente).length : 0,
      sansFacturation: signaux
        .filter(
          (s) => s.chargesMois >= SEUILS.chantierCharges && s.facturationMois <= 0 && s.provisionMois <= 0
        )
        .sort((a, b) => b.chargesMois - a.chargesMois)
        .slice(0, 8),
      resultatsNegatifs: signaux
        .filter((s) => s.resultatMois < 0)
        .sort((a, b) => a.resultatMois - b.resultatMois)
        .slice(0, 5),
    },
    fraisGeneraux: {
      mois: fxMois,
      reference: fxRef,
      evolPct: evol(fxMois, fxRef),
      pctCaMois: pct(fxMois, caMois),
      pctCaCumul: pct(cumul(SYNTHESE_CODES.fx), caCumul),
    },
    fiabilite: {
      valideePar: courante.validation.validatedBy,
      valideeLe: dateFr(courante.validation.validatedAt) ?? "",
      alertesOuvertes: alertesOuvertes.length,
      comptesNonMappes: synthese.unmapped.length,
      analytiquePresente: chantiersOk,
      moisSansAnalytique: synthese.moisSansAnalytique.filter((m) => m <= period),
    },
    seuils: SEUILS,
  };

  const ventilee = await latestValidatedImport(entity.id, "ventilee");
  return {
    figures,
    analytiqueImportId: courante.analytiqueImportId,
    ventileeImportId: ventilee?.id ?? null,
  };
}

// ── Rédaction ────────────────────────────────────────────────────────────────

export const ANALYSE_MODEL = process.env.ANALYSE_MODEL ?? "gpt-5-mini";

const redactionSchema = z.object({
  enBref: z.string().describe("2 à 3 phrases complètes, 450 caractères au plus"),
  pointsForts: z.array(z.string()).max(4),
  pointsAttention: z.array(z.string()).max(5).describe("« Sujet : constat chiffré », une ligne chacun"),
  actionsDaf: z.array(z.string()).max(2),
  actionsExploitation: z.array(z.string()).max(2),
});

// Montants déjà écrits à la française (« 433 k€ », « 1,911 M€ ») : le modèle
// les recopie tels quels au lieu de les reformater.
const k = (n: number | null | undefined) => (n == null ? null : fmtEurAuto(n));
const p1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);
const diff = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? null : round2(a - b);

/**
 * Écart à une référence : le sens en toutes lettres, le montant et le % sans
 * signe. Avec des écarts signés, le modèle écrivait parfois « en retrait de
 * 417 k€ » pour une hausse.
 */
function ecart(v: number | null | undefined, ref: number | null | undefined) {
  if (v == null || ref == null) return null;
  const e = round2(v - ref);
  const pctE = evol(v, ref);
  return {
    sens: e > 0 ? "hausse" : e < 0 ? "baisse" : "stable",
    montant: k(Math.abs(e)),
    "en %": pctE == null ? null : p1(Math.abs(pctE)),
  };
}

// Le modèle reprend volontiers les étiquettes qu'on lui donne : « MAUVAIS » ou
// « critique » finissaient tels quels dans le texte. On lui passe une
// description du statut, aussi précise mais sans jugement.
const STATUT_REDACTION: Record<NonNullable<ObjectifStatut>, string> = {
  BON: "sous l'objectif (favorable)",
  BIEN: "conforme à l'objectif",
  "À SURVEILLER": "au-dessus de l'objectif de 0,2 à 2 points, à suivre",
  MAUVAIS: "au-dessus de l'objectif de plus de 2 points",
};
const statutRedaction = (s: ObjectifStatut) => (s ? STATUT_REDACTION[s] : null);
const AMPLEUR: Record<Niveau, string> = { alerte: "marqué", critique: "très marqué" };

/**
 * Les chiffres utiles à la rédaction, en k€ et en %, sans le superflu. Les
 * intitulés sont écrits sans sigle (ni « CA », ni « N-1 ») : le modèle les
 * recopie. Chaque comparaison arrive avec sa référence et son écart, en euros
 * et en %, pour que le texte dise toujours « par rapport à quoi et de combien ».
 */
function briefing(f: AnalyseFigures) {
  const x = f.flash;
  const facture = x.factureMois ?? null;
  const factureCumul = x.factureCumul ?? null;
  return {
    mois: monthLabelLong(f.period),
    cumul: `${f.moisCumul} mois depuis l'ouverture de l'exercice`,
    "mois de référence": f.moisReference.map(monthLabelLong),
    "chiffre d'affaires du mois": {
      "facturé, hors travaux en cours": k(facture),
      "variation des travaux en cours (prévision du mois moins reprise de celle du mois précédent)": k(
        diff(x.caMois, facture)
      ),
      "total, travaux en cours compris": k(x.caMois),
      "facturé, moyenne des trois mois précédents": k(x.factureReference),
      "facturé par rapport à cette moyenne": ecart(facture, x.factureReference),
      "facturé du même mois l'an dernier": k(x.factureMoisN1),
      "facturé par rapport au même mois l'an dernier": ecart(facture, x.factureMoisN1),
    },
    "chiffre d'affaires cumulé de l'exercice": {
      "facturé, hors travaux en cours": k(factureCumul),
      "variation cumulée des travaux en cours": k(diff(x.caCumul, factureCumul)),
      "total, travaux en cours compris": k(x.caCumul),
      "facturé sur la même période l'an dernier": k(x.factureCumulN1),
      "facturé par rapport à la même période l'an dernier": ecart(factureCumul, x.factureCumulN1),
    },
    "résultat d'exploitation": {
      "du mois": k(x.resultatExploitationMois),
      "marge du mois, en % du chiffre d'affaires total du mois": p1(x.margeMois),
      cumulé: k(x.resultatExploitationCumul),
      "marge cumulée, en % du chiffre d'affaires total cumulé": p1(x.margeCumul),
      "marge cumulée à la fin du mois précédent (%)": p1(x.margeCumulPrecedente),
      "évolution de la marge cumulée sur le mois":
        x.margeCumul == null || x.margeCumulPrecedente == null
          ? null
          : {
              sens: x.margeCumul > x.margeCumulPrecedente ? "hausse" : x.margeCumul < x.margeCumulPrecedente ? "baisse" : "stable",
              points: p1(Math.abs(x.margeCumul - x.margeCumulPrecedente)),
            },
    },
    "objectifs de l'exploitation, en % du chiffre d'affaires cumulé": f.objectifs.rows
      .filter((r) => r.objectif != null)
      .map((r) => ({
        indicateur: r.label,
        "objectif (%)": p1(r.objectif),
        "réalisé cumulé (%)": p1(r.realiseCumul),
        "écart (points)": p1(r.ecartCumul),
        situation: statutRedaction(r.statut),
        "situation à la fin du mois précédent": statutRedaction(r.statutPrecedent),
        "réalisé du mois seul (%)": p1(r.realiseMois),
      })),
    "indicateurs sans objectif saisi": f.objectifs.rows.filter((r) => r.objectif == null).map((r) => r.label),
    "fortes variations du mois, déjà affichées dans l'encadré « Alertes du mois »": f.variations.map((v) => ({
      poste: v.label,
      sens: v.sens,
      "ampleur de l'écart": AMPLEUR[v.niveau],
      "montant du mois": k(v.mois),
      "moyenne des trois mois précédents": k(v.reference),
      "par rapport à cette moyenne": ecart(v.mois, v.reference),
      "même mois l'an dernier": k(v.n1),
    })),
    "chantiers avec charges sans facturation ni prévision": f.chantiers.sansFacturation.map((c) => ({
      chantier: `${c.code} ${c.label}`,
      "charges du mois": k(c.chargesMois),
    })),
    "chantiers au résultat du mois négatif": f.chantiers.resultatsNegatifs.map((c) => ({
      chantier: `${c.code} ${c.label}`,
      "résultat du mois": k(c.resultatMois),
      "charges du mois": k(c.chargesMois),
      "facturé du mois": k(c.facturationMois),
      "reprise de la prévision du mois précédent": k(c.annulationMois),
    })),
    "frais généraux": {
      "montant du mois": k(f.fraisGeneraux.mois),
      "moyenne des trois mois précédents": k(f.fraisGeneraux.reference),
      "par rapport à cette moyenne": ecart(f.fraisGeneraux.mois, f.fraisGeneraux.reference),
      "frais généraux du mois, en % du chiffre d'affaires du mois": p1(f.fraisGeneraux.pctCaMois),
      "frais généraux cumulés, en % du chiffre d'affaires cumulé": p1(f.fraisGeneraux.pctCaCumul),
    },
    // Seules les réserves sur les données sont transmises : un mois validé
    // n'est pas un point fort, c'est la condition de l'analyse.
    "réserves sur les données": [
      f.fiabilite.alertesOuvertes
        ? `${f.fiabilite.alertesOuvertes} alerte(s) d'import ouverte(s) sur le mois`
        : null,
      f.fiabilite.comptesNonMappes
        ? `${f.fiabilite.comptesNonMappes} compte(s) non rattaché(s) à une ligne de la Synthèse`
        : null,
      f.fiabilite.analytiquePresente ? null : "pas de détail par chantier pour ce mois",
    ].filter(Boolean),
  };
}

// Consignes revues avec la DAF : ton mesuré (14 octobre 2026), puis lisibilité
// (retours sur les analyses de novembre 2025 et juin 2026, même jour).
const consignes = (entite: string, postesAlertes: string[]) => `Tu rédiges l'analyse mensuelle de performance de ${entite} (BTP) pour la DAF et l'exploitation.

Ton : l'analyse est lue par les dirigeants et les équipes dont elle commente le travail. Elle doit rester claire sur les chiffres, sans jamais être blessante.
- Décris, ne qualifie pas. Donne le chiffre, son sens et sa comparaison ; laisse le lecteur juger. Bannis les adjectifs et les verbes qui jugent ou dramatisent : faible, mauvais, médiocre, décevant, insuffisant, dégradé, très dégradé, critique, alarmant, inquiétant, préoccupant, grave, lourd, dérive, dérapage, s'effondre, plonge, chute, explose, flambe, échec, anomalie, erreur, oubli, redressement.
- Préfère : « s'établit à », « ressort à », « en retrait », « en recul », « en deçà de », « au-dessus de l'objectif de X points », « pèse sur la marge », « à suivre », « mérite un point ».
- Ne mets personne en cause : ni le dirigeant, ni la DAF, ni un conducteur de travaux, ni une équipe. Parle des postes, des chantiers et des chiffres, jamais des personnes ni de leurs choix.
- Les causes restent des hypothèses : « pourrait s'expliquer par », « à rapprocher de ».
- Le ton adoucit la formulation, jamais le classement : un recul reste un point d'attention.

Lisibilité :
- Écris en français courant, en phrases complètes : un sujet, un verbe, des compléments. Pas de style télégraphique.
- Aucun sigle. Écris « chiffre d'affaires » (jamais « CA »), « travaux en cours » (jamais « TEC »), « frais généraux » (jamais « FX »), « le même mois l'an dernier » (jamais « N-1 »), « le mois précédent » (jamais « M-1 »). Seuls « k€ », « M€ » et « % » restent.
- Toute comparaison dit par rapport à quoi et de combien, dans le sens fourni (« hausse » ou « baisse ») : la référence (moyenne des trois mois précédents, même mois l'an dernier, même période l'an dernier, objectif) et l'écart, en euros et en pourcentage. Jamais « forte hausse des frais généraux » sans sa référence ni son écart.
- Une marge dit toujours de quoi elle est la part : « une marge d'exploitation de −41,7 % du chiffre d'affaires du mois ».
- Le chiffre d'affaires se cite facturé, hors travaux en cours, suivi entre parenthèses de la variation des travaux en cours : « 1,5 M€ (hors travaux en cours de −300 k€) ». La parenthèse accompagne chaque mention du chiffre d'affaires du mois, dans l'en bref comme dans les points forts. Ses comparaisons portent sur le facturé. Les marges, elles, se rapportent au chiffre d'affaires total, travaux en cours compris.
- Exemple, chiffres fictifs. À éviter : « CA du mois faible à 1,2 M€. Résultat d'exploitation très dégradé : −450 k€ (marge −37,5 %). » Attendu : « Le chiffre d'affaires facturé du mois s'établit à 1,5 M€ (hors travaux en cours de −300 k€), en retrait de 200 k€, soit 12 %, par rapport à la moyenne des trois mois précédents. Le résultat d'exploitation du mois ressort à −450 k€, soit une marge de −37,5 % du chiffre d'affaires du mois. »

Règles :
- N'utilise QUE les chiffres fournis. N'invente aucun montant, aucun pourcentage, aucune cause certaine ; ne fais aucun calcul toi-même.
- Les montants sont déjà écrits (« 410 k€ », « 1,911 M€ ») : recopie-les tels quels, sans les convertir. Les pourcentages s'écrivent « 5,3 % ».
- Un résultat de chantier négatif qui vient surtout de la reprise de la prévision du mois précédent n'est pas une perte de production : dis-le.
- Ne mentionne jamais la structure des données : pas de nom de champ entre parenthèses, pas de « indicateur fourni ».
- Les travaux en cours (la « prévision ») ne sont ni un budget ni une cible : c'est du chiffre d'affaires réalisé mais pas encore facturé. Ne compare jamais le chiffre d'affaires à la prévision.
- Un objectif est une part maximale du chiffre d'affaires : un réalisé au-dessus de l'objectif est défavorable. Cite le réalisé, l'objectif et l'écart fourni : « Location : 2,6 % du chiffre d'affaires cumulé, 0,6 point sous l'objectif de 3,2 % ». La situation fournie vaut pour le réalisé cumulé.

Contenu :
- « enBref » : 2 à 3 phrases complètes, l'essentiel du mois : le chiffre d'affaires et le résultat d'exploitation, chacun avec sa comparaison en montant et en pourcentage. Ni deux-points, ni énumération.
- « pointsForts » : 0 à 4 puces, chacune une phrase courte avec le chiffre qui la fonde et sa référence. Un point fort est un fait favorable du mois (poste en baisse, marge qui progresse, chiffre d'affaires en hausse, objectif tenu). Une baisse de chiffre d'affaires ou de marge, un retard sur l'an dernier ou un réalisé au-dessus de l'objectif n'en sont jamais un. S'il n'y en a pas, donne moins de puces plutôt que d'en inventer.
- « pointsAttention » : 2 à 5 puces, chacune sur une ligne courte, au format « Sujet : constat chiffré », par exemple « Résultat d'exploitation du mois : −450 k€, soit −37,5 % du chiffre d'affaires du mois ». ${postesAlertes.length ? `Ces postes sont déjà affichés dans l'encadré « Alertes du mois » et n'y figurent donc pas : ${postesAlertes.map((p) => `« ${p} »`).join(", ")}. ` : ""}Porte l'attention sur le résultat et la marge, les objectifs au-dessus de leur cible, les chantiers à regarder, et les frais généraux s'ils ne figurent pas déjà dans cet encadré. S'il y a des réserves sur les données, termine par une puce « Données : … ». Ne cite jamais la validation du mois ni la qualité des données comme point fort.
- « actionsDaf » : 0 à 2 actions pour la DAF (comptabilité, cabinet comptable, données, frais généraux). « actionsExploitation » : 0 à 2 actions pour l'exploitation (chantiers, achats, intérim, sous-traitance, avancement et facturation des travaux). Une ligne de quinze mots au plus : un verbe à l'infinitif puis son objet, sans dire qui s'en charge ni lister de chiffres. Ce sont des pistes de travail, jamais un reproche ni une injonction.`;

// ── Finitions ──
// Trois demandes de la DAF que le modèle ne suit pas à coup sûr, même
// écrites dans les consignes : elles sont garanties après la rédaction.

/** Mots d'un libellé, sans accent, pluriel ni mot vide : « Intérims / Personnel » → interim, personnel. */
function motsCles(t: string) {
  const vides = new Set(["total", "sous", "du", "de", "des", "la", "le", "les", "et", "ce", "mois", "cumule"]);
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => w.replace(/s$/, ""))
    .filter((w) => w.length > 1 && !vides.has(w));
}

/** Un point d'attention qui compare à la moyenne un poste déjà dans l'encadré « Alertes du mois ». */
function repriseDesAlertes(point: string, postes: string[]) {
  const i = point.indexOf(":");
  if (i < 0 || !/moyenne/i.test(point)) return false;
  const sujet = new Set(motsCles(point.slice(0, i)));
  return postes.some((p) => {
    const mots = motsCles(p);
    return mots.length > 0 && mots.every((m) => sujet.has(m));
  });
}

const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** « 1,911 M€ » → « 1,911 M€ (hors travaux en cours de −552 k€) », là où la parenthèse manque. */
function avecTravauxEnCours(t: string, facture: string | null, travaux: string | null) {
  if (!facture || !travaux) return t;
  return t.replace(
    new RegExp(`${echapper(facture)}(?!\\s*\\(hors travaux en cours)`, "g"),
    `${facture} (hors travaux en cours de ${travaux})`
  );
}

/** « 3.3 % » → « 3,3 % » */
const virgule = (t: string) => t.replace(/(\d)\.(\d+)(?=\s?(%|points?\b))/g, "$1,$2");

function finitions(r: Omit<Redaction, "actions">, f: AnalyseFigures): Redaction {
  const x = f.flash;
  const tec = (texte: string) =>
    avecTravauxEnCours(
      avecTravauxEnCours(texte, k(x.factureMois), k(diff(x.caMois, x.factureMois))),
      k(x.factureCumul),
      k(diff(x.caCumul, x.factureCumul))
    );
  const postes = f.variations.map((v) => v.label);
  const net = (t: string) => virgule(tec(t));
  return {
    enBref: net(r.enBref),
    pointsForts: r.pointsForts.map(net),
    pointsAttention: r.pointsAttention.filter((p) => !repriseDesAlertes(p, postes)).map(net),
    actionsDaf: (r.actionsDaf ?? []).map(virgule),
    actionsExploitation: (r.actionsExploitation ?? []).map(virgule),
    actions: [],
  };
}

export async function rediger(figures: AnalyseFigures, entite = "Sodobat") {
  const { output, usage } = await generateText({
    model: openai.chat(ANALYSE_MODEL),
    providerOptions: { openai: { reasoningEffort: "low" } },
    system: consignes(entite, figures.variations.map((v) => v.label)),
    prompt: JSON.stringify(briefing(figures)),
    output: Output.object({ schema: redactionSchema }),
  });
  const redaction = finitions(output, figures);
  return {
    redaction,
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
  };
}

// ── Lecture ──────────────────────────────────────────────────────────────────

type Row = typeof tables.monthlyAnalyses.$inferSelect;

function resume(r: Row, caduque: boolean): AnalyseResume {
  const f = r.figures as AnalyseFigures;
  return {
    period: r.period,
    status: r.status,
    caduque,
    caMois: f.flash.caMois,
    margeCumul: f.flash.margeCumul,
    objectifsMauvais: f.objectifs.mauvais,
    alertes: f.variations.length,
    generatedBy: r.generatedBy,
    generatedAt: dateFr(r.generatedAt) ?? "",
    publishedBy: r.publishedBy,
    publishedAt: dateFr(r.publishedAt),
  };
}

/**
 * Historique des analyses, plus récentes en premier. Les brouillons ne sont
 * visibles que de ceux qui peuvent les publier.
 */
export async function listAnalyses(
  entity: Entity,
  opts: { brouillons: boolean }
): Promise<AnalyseDetail[]> {
  const [rows, validations] = await Promise.all([
    db
      .select()
      .from(tables.monthlyAnalyses)
      .where(eq(tables.monthlyAnalyses.entityId, entity.id))
      .orderBy(desc(tables.monthlyAnalyses.period)),
    db
      .select({ period: tables.monthValidations.period })
      .from(tables.monthValidations)
      .where(eq(tables.monthValidations.entityId, entity.id)),
  ]);
  const valides = new Set(validations.map((v) => v.period));
  const visibles = rows.filter((r) => opts.brouillons || r.status === "published");
  return Promise.all(
    visibles.map(async (r) => {
      // Caduque : le mois a été rouvert, ou sa balance analytique réimportée.
      const imp = await latestValidatedImport(entity.id, "analytique", { atPeriod: r.period });
      const caduque = !valides.has(r.period) || imp?.id !== r.analytiqueImportId;
      return {
        ...resume(r, caduque),
        figures: r.figures as AnalyseFigures,
        redaction: (r.redaction as Redaction | null) ?? null,
        commentaire: r.commentaire,
        model: r.model,
      };
    })
  );
}

// ── Écriture ─────────────────────────────────────────────────────────────────

/**
 * Calcule et rédige l'analyse du mois, puis l'enregistre en brouillon. Une
 * analyse relancée repart en brouillon ; le commentaire de la DAF est gardé.
 * Si la rédaction échoue, les chiffres sont enregistrés sans texte.
 */
export async function genererAnalyse(entity: Entity, period: string, by: string) {
  const { figures, analytiqueImportId, ventileeImportId } = await computeAnalyse(entity, period);
  let redaction: Redaction | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let redactionError: string | null = null;
  try {
    ({ redaction, inputTokens, outputTokens } = await rediger(figures, entity.name));
  } catch (e) {
    console.error("analyse mensuelle: rédaction impossible", e);
    redactionError = "Les chiffres sont prêts, mais le texte n'a pas pu être rédigé. Relancez l'analyse.";
  }
  const values = {
    status: "draft" as const,
    analytiqueImportId,
    ventileeImportId,
    figures,
    redaction,
    model: redaction ? ANALYSE_MODEL : null,
    inputTokens,
    outputTokens,
    generatedBy: by,
    generatedAt: new Date(),
    publishedBy: null,
    publishedAt: null,
  };
  await db
    .insert(tables.monthlyAnalyses)
    .values({ entityId: entity.id, period, ...values })
    .onConflictDoUpdate({
      target: [tables.monthlyAnalyses.entityId, tables.monthlyAnalyses.period],
      set: values,
    });
  return { redactionError };
}
