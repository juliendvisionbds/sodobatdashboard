import { cache } from "react";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { CentreKind, classifyCentre, fiscalMonths, poleOf } from "./parsers";
import { Category, loadMapper, type View } from "./mapping";
import { evaluate, type Vector } from "./nomenclature/evaluate";
import {
  FX_COLUMNS,
  MOIS_COLUMN,
  TOTAL_COLUMN,
  type FxColumn,
} from "./nomenclature/columns";
import {
  CHANTIER_CODES,
  COMPTES_TOUJOURS_FX,
  FX_CODES,
  SYNTHESE_CODES,
} from "./nomenclature/codes";
import { synthese as nomenclatureSynthese } from "./nomenclature/sodobat";
import { structureRouting } from "./nomenclature/validate";
import { OBJECTIFS, statutObjectif, type ObjectifStatut } from "./objectifs";

export { TOTAL_COLUMN, CHANTIER_CODES, FX_CODES, SYNTHESE_CODES };

/**
 * Montant lu depuis une colonne numeric. PostgreSQL admet la valeur spéciale
 * NaN : une seule ligne corrompue suffirait sinon à propager NaN dans tous les
 * totaux qui la traversent. On la neutralise à la lecture.
 */
const num = (v: string | number | null | undefined) => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Mémoïsation par requête ──────────────────────────────────────────────────
// Une même page relit plusieurs fois les mêmes lignes de balance (cumul de
// l'exercice, exercices antérieurs, CA de référence…). `cache` de React garde
// le résultat le temps d'une requête serveur, puis l'oublie ; hors requête
// (scripts), il ne mémorise rien. Les résultats partagés ne sont jamais modifiés
// par leurs lecteurs.
const analyticLinesOf = cache(async (importId: number) => {
  const rows = await db
    .select()
    .from(tables.analyticLines)
    .where(eq(tables.analyticLines.importId, importId));
  if (rows.length === 0) return rows;
  const alias = await loadCentreAliases(rows[0].entityId);
  if (alias.size === 0) return rows;
  // Un centre fantôme (faute de frappe à l'import Cegid) est lu comme son vrai
  // chantier : même code, même intitulé. Les lignes en base ne bougent pas.
  return rows.map((r) => {
    const target = alias.get(r.centreCode);
    return target ? { ...r, centreCode: target.code, centreLabel: target.name } : r;
  });
});
const generalLinesOf = cache(async (importId: number) =>
  db
    .select()
    .from(tables.generalBalanceLines)
    .where(eq(tables.generalBalanceLines.importId, importId))
);

export type Entity = { id: number; code: string; name: string; active: boolean };

export async function getEntityByCode(code: string): Promise<Entity | null> {
  const rows = await db
    .select()
    .from(tables.entities)
    .where(eq(tables.entities.code, code));
  return rows[0] ?? null;
}

// ── Classification des centres analytiques ───────────────────────────────────

/**
 * Chantier ou structure, pour chaque centre de l'entité : la surcharge manuelle
 * (centres.kind) l'emporte sur la déduction faite à partir du code.
 * Un centre absent du référentiel est classé par son code.
 */
export const loadCentreKinds = cache(async function loadCentreKinds(
  entityId: number
): Promise<(centreCode: string) => CentreKind> {
  const rows = await db
    .select({ code: tables.centres.code, kind: tables.centres.kind, aliasOf: tables.centres.aliasOf })
    .from(tables.centres)
    .where(eq(tables.centres.entityId, entityId));
  const overrides = new Map<string, CentreKind>();
  const alias = new Map<string, string>();
  for (const r of rows) {
    if (r.kind) overrides.set(r.code, r.kind as CentreKind);
    if (r.aliasOf) alias.set(r.code, r.aliasOf);
  }
  // Un centre fantôme suit la classification du centre qu'il remplace.
  return (centreCode: string) => {
    const code = alias.get(centreCode) ?? centreCode;
    return overrides.get(code) ?? classifyCentre(code);
  };
});

/**
 * Centres fantômes de l'entité → vrai centre (code et intitulé). Vide dans le
 * cas général : la table ne porte un alias que là où Cegid a créé un centre sur
 * une faute de frappe et où l'on a identifié le chantier visé.
 */
const loadCentreAliases = cache(async function loadCentreAliases(
  entityId: number
): Promise<Map<string, { code: string; name: string }>> {
  const rows = await db
    .select({ code: tables.centres.code, name: tables.centres.name, aliasOf: tables.centres.aliasOf })
    .from(tables.centres)
    .where(eq(tables.centres.entityId, entityId));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const out = new Map<string, { code: string; name: string }>();
  for (const r of rows) {
    if (!r.aliasOf) continue;
    const target = byCode.get(r.aliasOf);
    out.set(r.code, { code: r.aliasOf, name: target?.name ?? r.aliasOf });
  }
  return out;
});

// ── Imports validés ──────────────────────────────────────────────────────────

// Une balance analytique d'exercice clos (import « annuel ») ne fait pas partie
// du cycle mensuel : elle n'est ni un mois affichable, ni un mois précédent, ni
// un terme des cumuls de chantier. Elle ne sert qu'aux exercices N-1 et N-2.
const notAnnual = sql`coalesce(${tables.imports.summary}->>'annual', '') <> 'true'`;

/** Identifiants des imports annuels de l'entité. */
const annualImportIds = cache(async function annualImportIds(entityId: number): Promise<Set<number>> {
  const rows = await db
    .select({ id: tables.imports.id })
    .from(tables.imports)
    .where(
      and(
        eq(tables.imports.entityId, entityId),
        sql`${tables.imports.summary}->>'annual' = 'true'`
      )
    );
  return new Set(rows.map((r) => r.id));
});

export async function latestValidatedImport(
  entityId: number,
  type: "ventilee" | "analytique",
  opts?: { fiscalYearStart?: number; beforePeriod?: string; atPeriod?: string }
) {
  return latestValidatedImportMemo(
    entityId,
    type,
    opts?.fiscalYearStart ?? null,
    opts?.beforePeriod ?? null,
    opts?.atPeriod ?? null
  );
}

// Clé de mémoïsation sur des valeurs simples : un objet d'options serait neuf à chaque appel.
const latestValidatedImportMemo = cache(async function latestValidatedImportMemo(
  entityId: number,
  type: "ventilee" | "analytique",
  fiscalYearStart: number | null,
  beforePeriod: string | null,
  atPeriod: string | null
) {
  const conds = [
    eq(tables.imports.entityId, entityId),
    eq(tables.imports.type, type),
    eq(tables.imports.status, "validated"),
    notAnnual,
  ];
  if (fiscalYearStart != null) conds.push(eq(tables.imports.fiscalYearStart, fiscalYearStart));
  if (beforePeriod) conds.push(lt(tables.imports.period, beforePeriod));
  if (atPeriod) conds.push(eq(tables.imports.period, atPeriod));
  const rows = await db
    .select()
    .from(tables.imports)
    .where(and(...conds))
    .orderBy(desc(tables.imports.period), desc(tables.imports.id))
    .limit(1);
  return rows[0] ?? null;
});

/** Périodes des imports validés d'un type, plus récentes en premier. */
async function listValidatedPeriods(
  entityId: number,
  type: "ventilee" | "analytique"
): Promise<string[]> {
  const rows = await db
    .select({ period: tables.imports.period })
    .from(tables.imports)
    .where(
      and(
        eq(tables.imports.entityId, entityId),
        eq(tables.imports.type, type),
        eq(tables.imports.status, "validated"),
        notAnnual
      )
    )
    .orderBy(desc(tables.imports.period));
  return [...new Set(rows.map((r) => r.period))];
}

/** Périodes (mois de snapshot) des imports analytiques validés, plus récentes en premier. */
export async function listAnalytiquePeriods(entityId: number): Promise<string[]> {
  return listValidatedPeriods(entityId, "analytique");
}

/**
 * Arrêtés mensuels disponibles pour la Synthèse : les mois couverts par la
 * dernière ventilée validée (chaque fichier contient tout l'exercice, les
 * imports précédents sont « remplacés »), plus récents en premier.
 */
export async function listVentileePeriods(entityId: number): Promise<string[]> {
  const imp = await latestValidatedImport(entityId, "ventilee");
  if (!imp) return [];
  const rows = await db
    .selectDistinct({ month: tables.generalBalanceLines.month })
    .from(tables.generalBalanceLines)
    .where(eq(tables.generalBalanceLines.importId, imp.id));
  return rows
    .map((r) => r.month)
    .sort()
    .reverse();
}

// ── Vue Synthèse ─────────────────────────────────────────────────────────────


export type SyntheseRow = {
  category: Category;
  /** valeur par mois de l'exercice, plus TOTAL_COLUMN */
  cells: Record<string, number | null>;
  /** cumul depuis l'ouverture de l'exercice, arrêté à la fin de chaque mois */
  cumulCells: Record<string, number | null>;
  total: number | null;
  pctCa: number | null;
  /** N-1 tronqué à la même fenêtre YTD que N */
  prevTotal: number | null;
  /** N-1 sur l'exercice complet */
  prevTotalFull: number | null;
  pctPrev: number | null;
  ecart: number | null;
};

export type SyntheseSection = {
  name: string;
  rows: SyntheseRow[];
};

export type SyntheseData = {
  fiscalYearStart: number;
  months: string[]; // les 12 mois de l'exercice
  monthsWithData: string[];
  period: string; // dernier mois importé
  sections: SyntheseSection[];
  /** valeurs indexées par code de ligne, pour les KPI et l'assistant */
  byCode: Record<string, { cells: Record<string, number | null>; total: number | null }>;
  caTotal: { monthly: Record<string, number>; total: number };
  totalChargesExploitation: { monthly: Record<string, number>; total: number };
  totalChargesPersonnel: { monthly: Record<string, number>; total: number };
  resultatExploitation: { monthly: Record<string, number>; total: number };
  totalFx: { monthly: Record<string, number>; total: number };
  resultatNet: { monthly: Record<string, number>; total: number };
  unmapped: { account: string; label: string; total: number }[];
  /**
   * Mois de l'exercice sans balance analytique : leurs charges partagées n'ont
   * pas pu être découpées entre chantiers et structure, et restent donc en
   * totalité sur la ligne d'exploitation.
   */
  moisSansAnalytique: string[];
  hasPrevYear: boolean;
  prevCaTotal: number | null;
  importId: number;
};

/**
 * Agrège les lignes de balance ventilée par catégorie × mois.
 * Les montants restent bruts (charges +, produits −) ; le signe d'affichage est
 * appliqué au moment de construire les vecteurs.
 */
function aggregateByCategory(
  lines: { account: string; label: string; month: string; amount: string | number | null }[],
  mapper: Awaited<ReturnType<typeof loadMapper>>
) {
  const byCat = new Map<string, Record<string, number>>();
  const unmapped = new Map<string, { label: string; total: number }>();
  for (const l of lines) {
    const amount = num(l.amount);
    const cat = mapper.resolve(l.account);
    if (!cat) {
      const prev = unmapped.get(l.account);
      unmapped.set(l.account, {
        label: l.label,
        total: round2((prev?.total ?? 0) + amount),
      });
      continue;
    }
    const rec = byCat.get(cat.code) ?? {};
    rec[l.month] = round2((rec[l.month] ?? 0) + amount);
    byCat.set(cat.code, rec);
  }
  return { byCat, unmapped };
}

/**
 * Part « structure » de chaque poste, mois par mois, lue dans les balances
 * analytiques de l'exercice.
 *
 * La balance ventilée ignore l'axe analytique : le carburant d'un chantier et
 * celui du dépôt y sont un seul montant. La balance analytique du même mois,
 * elle, porte le centre de chaque écriture — c'est donc elle qui dit combien,
 * dans ce montant, relève du siège. Les montants restent bruts (charges
 * positives), comme ceux de la ventilée.
 */
async function structurePartParMois(
  entity: Pick<Entity, "id">,
  fiscalYearStart: number,
  mapper: Awaited<ReturnType<typeof loadMapper>>,
  months: string[],
  upTo?: string
): Promise<{ byCat: Map<string, Record<string, number>>; moisSansAnalytique: string[] }> {
  const kindOf = await loadCentreKinds(entity.id);
  // Un import annuel ne dit pas la part siège de chaque mois : on ne l'utilise
  // pas ici, l'exercice reste sans découpage (signalé par moisSansAnalytique).
  // Copie filtrée : la Map vient d'un cache partagé avec les frais généraux.
  const annual = await annualImportIds(entity.id);
  const imports = new Map(
    [...(await analytiqueImportsOfYear(entity.id, fiscalYearStart, upTo))].filter(([, id]) => !annual.has(id))
  );
  const byCat = new Map<string, Record<string, number>>();
  for (const [month, importId] of imports) {
    for (const [account, v] of await structureSoldes(importId, kindOf)) {
      const cat = mapper.resolve(account);
      if (!cat) continue;
      const rec = byCat.get(cat.code) ?? {};
      rec[month] = round2((rec[month] ?? 0) + v.solde);
      byCat.set(cat.code, rec);
    }
  }
  return {
    byCat,
    moisSansAnalytique: months.filter((m) => (!upTo || m <= upTo) && !imports.has(m)),
  };
}

export async function getSynthese(
  entity: Entity,
  opts?: { fiscalYearStart?: number; period?: string }
): Promise<SyntheseData | null> {
  return syntheseMemo(entity.id, entity.code, opts?.fiscalYearStart ?? null, opts?.period ?? null);
}

// Une même page demande plusieurs fois la Synthèse (CA de référence de chaque
// exercice pour les frais généraux, objectifs) : calculée une fois par requête.
const syntheseMemo = cache(async function syntheseMemo(
  entityId: number,
  entityCode: string,
  fiscalYearStart: number | null,
  period: string | null
): Promise<SyntheseData | null> {
  const entity = { id: entityId, code: entityCode };
  const opts = { fiscalYearStart: fiscalYearStart ?? undefined, period: period ?? undefined };
  const [imp, mapper] = await Promise.all([
    latestValidatedImport(entity.id, "ventilee", { fiscalYearStart: opts.fiscalYearStart }),
    loadMapper("synthese", entity.id, entity.code),
  ]);
  if (!imp) return null;

  let lines = await generalLinesOf(imp.id);

  // Arrêté mensuel : on tronque le dernier import au mois demandé (les révisions
  // du cabinet sur les mois passés restent donc prises en compte).
  if (opts?.period && opts.period < imp.period) {
    lines = lines.filter((l) => l.month <= opts.period!);
  }

  const months = fiscalMonths(imp.fiscalYearStart);
  const monthsWithData = [...new Set(lines.map((l) => l.month))].sort();
  const columns = [...months, TOTAL_COLUMN];

  const { byCat, unmapped } = aggregateByCategory(lines, mapper);

  // Vecteurs des postes : signe d'affichage appliqué, colonne total incluse.
  const leaves = new Map<string, Vector>();
  for (const cat of mapper.categories) {
    const raw = byCat.get(cat.code) ?? {};
    const vec: Vector = {};
    let total = 0;
    for (const m of months) {
      const v = round2(cat.sign * (raw[m] ?? 0));
      vec[m] = v;
      total += v;
    }
    vec[TOTAL_COLUMN] = round2(total);
    leaves.set(cat.code, vec);
  }

  // ── Découpage chantier / structure ─────────────────────────────────────────
  // Les postes partagés cèdent aux frais généraux ce que la balance analytique
  // du mois impute au siège. Le transfert est additif : ce qui quitte une ligne
  // arrive intégralement sur l'autre, le résultat net est donc inchangé et Ctrl
  // reste nul. Sans balance analytique pour un mois, rien n'est transféré et la
  // ligne garde le montant global — le mois est alors signalé.
  const routing = structureRouting(nomenclatureSynthese, "synthese");
  const signOf = new Map(mapper.categories.map((c) => [c.code, c.sign]));
  // Seuls les mois déjà couverts par la ventilée peuvent manquer d'analytique :
  // les mois à venir de l'exercice n'ont de données d'aucune sorte.
  const { byCat: structByCat, moisSansAnalytique } = await structurePartParMois(
    entity,
    imp.fiscalYearStart,
    mapper,
    monthsWithData,
    opts?.period && opts.period < imp.period ? opts.period : undefined
  );
  const transfert = (
    src: Map<string, Vector>,
    part: (code: string, month: string) => number,
    cols: string[]
  ) => {
    for (const [source, target] of routing) {
      const from = src.get(source);
      const to = src.get(target);
      if (!from || !to) continue;
      for (const m of cols) {
        const v = round2((signOf.get(source) ?? 1) * part(source, m));
        if (!v) continue;
        from[m] = round2((from[m] ?? 0) - v);
        to[m] = round2((to[m] ?? 0) + v);
      }
      from[TOTAL_COLUMN] = round2(cols.reduce((t, m) => t + ((from[m] as number) ?? 0), 0));
      to[TOTAL_COLUMN] = round2(cols.reduce((t, m) => t + ((to[m] as number) ?? 0), 0));
    }
  };
  transfert(leaves, (code, m) => structByCat.get(code)?.[m] ?? 0, months);

  // ── N-1 ────────────────────────────────────────────────────────────────────
  // Comparaison à périmètre égal : le cumul N-1 est tronqué au même rang de mois
  // que N (7 mois de N contre 7 mois de N-1), en plus du total annuel complet.
  const prevImp = await latestValidatedImport(entity.id, "ventilee", {
    fiscalYearStart: imp.fiscalYearStart - 1,
  });
  const prevYtd = new Map<string, number>();
  const prevFull = new Map<string, number>();
  if (prevImp) {
    const prevLines = await generalLinesOf(prevImp.id);
    const prevMonths = fiscalMonths(prevImp.fiscalYearStart);
    // Même nombre de mois écoulés que sur l'exercice en cours.
    const rank = monthsWithData.length;
    const ytdCutoff = prevMonths[Math.min(rank, prevMonths.length) - 1];
    const { byCat: prevByCat } = aggregateByCategory(prevLines, mapper);
    for (const cat of mapper.categories) {
      const raw = prevByCat.get(cat.code) ?? {};
      let ytd = 0;
      let full = 0;
      for (const [m, v] of Object.entries(raw)) {
        full += v;
        if (ytdCutoff && m <= ytdCutoff) ytd += v;
      }
      prevYtd.set(cat.code, round2(cat.sign * ytd));
      prevFull.set(cat.code, round2(cat.sign * full));
    }

    // Même découpage sur N-1, sans quoi l'écart N–N-1 comparerait une ligne
    // chantier à une ligne chantier + siège. Si l'exercice précédent n'a pas de
    // balance analytique, rien n'est transféré : l'écart reste lisible mais
    // porte des périmètres différents, ce que `moisSansAnalytique` signale.
    const prev = await structurePartParMois(
      entity,
      prevImp.fiscalYearStart,
      mapper,
      prevMonths
    );
    for (const [source, target] of routing) {
      const raw = prev.byCat.get(source);
      if (!raw) continue;
      const sg = signOf.get(source) ?? 1;
      let ytd = 0;
      let full = 0;
      for (const [m, v] of Object.entries(raw)) {
        full += v;
        if (ytdCutoff && m <= ytdCutoff) ytd += v;
      }
      for (const [bucket, v] of [
        [prevYtd, round2(sg * ytd)],
        [prevFull, round2(sg * full)],
      ] as [Map<string, number>, number][]) {
        bucket.set(source, round2((bucket.get(source) ?? 0) - v));
        bucket.set(target, round2((bucket.get(target) ?? 0) + v));
      }
    }
  }

  const evalOn = (values: Map<string, number>) => {
    const l = new Map<string, Vector>();
    for (const cat of mapper.categories) l.set(cat.code, { v: values.get(cat.code) ?? 0 });
    return evaluate(mapper.lines, ["v"], l);
  };
  const prevYtdEval = prevImp ? evalOn(prevYtd) : null;
  const prevFullEval = prevImp ? evalOn(prevFull) : null;

  // ── Évaluation ─────────────────────────────────────────────────────────────
  const provided = new Map<string, Vector>();
  const resultatBg = bgResult(lines, months);
  provided.set(SYNTHESE_CODES.resultatBg, resultatBg);

  const values = evaluate(mapper.lines, columns, leaves, { provided });

  // Lecture cumulée : on cumule les postes puis on rejoue les formules, de sorte
  // qu'un ratio à fin mars soit celui des cinq premiers mois et non une somme de
  // ratios mensuels. Les mois sans données restent vides.
  const lastMonthWithData = monthsWithData[monthsWithData.length - 1];
  const cumulate = (vec: Vector): Vector => {
    const out: Vector = {};
    let running = 0;
    for (const m of months) {
      running = round2(running + (vec[m] ?? 0));
      out[m] = lastMonthWithData && m <= lastMonthWithData ? running : null;
    }
    out[TOTAL_COLUMN] = vec[TOTAL_COLUMN] ?? null;
    return out;
  };
  const cumulLeaves = new Map([...leaves].map(([code, vec]) => [code, cumulate(vec)]));
  const cumulValues = evaluate(mapper.lines, columns, cumulLeaves, {
    provided: new Map([[SYNTHESE_CODES.resultatBg, cumulate(resultatBg)]]),
  });

  const caTotalVec = values.get(SYNTHESE_CODES.caTotal) ?? {};
  const caTotal = caTotalVec[TOTAL_COLUMN] ?? 0;
  const prevCaTotal = prevYtdEval?.get(SYNTHESE_CODES.caTotal)?.v ?? null;

  // ── Lignes de la maquette, groupées par section ────────────────────────────
  const sections: SyntheseSection[] = [];
  for (const line of mapper.lines) {
    if (line.hidden) continue;
    const vec = values.get(line.code) ?? {};
    const total = vec[TOTAL_COLUMN] ?? null;
    const prevTotal = prevYtdEval?.get(line.code)?.v ?? null;
    const prevTotalFull = prevFullEval?.get(line.code)?.v ?? null;
    const isRatio = line.kind === "ratio";

    const row: SyntheseRow = {
      category: line,
      cells: vec,
      cumulCells: cumulValues.get(line.code) ?? {},
      total,
      // Un ratio est déjà un pourcentage : on ne le rapporte pas au CA.
      pctCa: isRatio ? null : caTotal !== 0 && total != null ? round2((total / caTotal) * 100) : null,
      prevTotal,
      prevTotalFull,
      pctPrev:
        isRatio || prevCaTotal == null || prevCaTotal === 0 || prevTotal == null
          ? null
          : round2((prevTotal / prevCaTotal) * 100),
      ecart: total != null && prevTotal != null ? round2(total - prevTotal) : null,
    };

    const last = sections[sections.length - 1];
    if (last && last.name === line.section) last.rows.push(row);
    else sections.push({ name: line.section, rows: [row] });
  }

  // ── Compatibilité : agrégats exposés à plat pour les KPI et l'assistant ────
  const monthlyOf = (code: string) => {
    const vec = values.get(code) ?? {};
    const out: Record<string, number> = {};
    for (const m of months) out[m] = vec[m] ?? 0;
    return { monthly: out, total: vec[TOTAL_COLUMN] ?? 0 };
  };

  const byCode: SyntheseData["byCode"] = {};
  for (const line of mapper.lines) {
    const vec = values.get(line.code) ?? {};
    byCode[line.code] = { cells: vec, total: vec[TOTAL_COLUMN] ?? null };
  }

  return {
    fiscalYearStart: imp.fiscalYearStart,
    months,
    monthsWithData,
    period: monthsWithData[monthsWithData.length - 1] ?? imp.period,
    sections,
    byCode,
    caTotal: monthlyOf(SYNTHESE_CODES.caTotal),
    totalChargesExploitation: monthlyOf(SYNTHESE_CODES.exploitation),
    totalChargesPersonnel: monthlyOf(SYNTHESE_CODES.personnel),
    resultatExploitation: monthlyOf(SYNTHESE_CODES.resultatExploitation),
    totalFx: monthlyOf(SYNTHESE_CODES.fx),
    resultatNet: monthlyOf(SYNTHESE_CODES.resultatNet),
    unmapped: [...unmapped.entries()].map(([account, v]) => ({
      account,
      label: v.label,
      total: v.total,
    })),
    moisSansAnalytique,
    hasPrevYear: !!prevImp,
    prevCaTotal,
    importId: imp.id,
  };
});

/**
 * Résultat de la balance générale : produits (classe 7) − charges (classes 6, 69),
 * calculé directement sur les lignes brutes, hors nomenclature. C'est le point de
 * contrôle croisé de la ligne « Ctrl » de la maquette.
 */
function bgResult(
  lines: { account: string; month: string; amount: string | number | null }[],
  months: string[]
): Vector {
  const vec: Vector = Object.fromEntries(months.map((m) => [m, 0]));
  let total = 0;
  for (const l of lines) {
    if (!/^[67]/.test(l.account)) continue;
    // Charges au débit (+) et produits au crédit (−) : le résultat est l'opposé
    // de la somme des soldes.
    const v = -num(l.amount);
    vec[l.month] = round2(((vec[l.month] as number) ?? 0) + v);
    total += v;
  }
  vec[TOTAL_COLUMN] = round2(total);
  return vec;
}

// ── Vue Chantiers ────────────────────────────────────────────────────────────
//
// Un chantier = une colonne, les postes de la maquette = les lignes (disposition
// demandée par la DAF ; les données sont produites par chantier, l'écran les
// transpose).
//
// Chaque balance analytique porte les mouvements de SON mois : ses totaux de
// classe 6 et 7 recoupent, au centime, la colonne du même mois de la balance
// ventilée. Le mois affiché se lit donc directement dans son fichier, sans
// différence avec le mois précédent.
// Sur le compte de travaux en cours (71331000), le débit du mois est la reprise
// de la provision de M-1 et le crédit la provision de M : ce sont les colonnes
// « Annulation Mois-1 » et « Prévision Mois » du tableau de gestion de la DAF.
// Les quatre lignes « cumuls sur la durée de vie du chantier » additionnent tous
// les mois importés, sans se borner à l'exercice.

export type ChantierValues = Record<string, number | null>;

export type ChantierRow = {
  centreCode: string;
  centreLabel: string;
  pole: string | null;
  /** valeur de chaque ligne de la nomenclature, par code */
  values: ChantierValues;
  /** provision saisie manuellement, qui se substitue au compte 71331000 */
  previsionManuelle: {
    value: number;
    status: "draft" | "final";
    /** qui a saisi, et quand (JJ/MM/AAAA) — pour la relecture par la DAF */
    by: string | null;
    at: string | null;
  } | null;
  note: string | null;
  statut: "draft" | "final";
  /** le chantier a-t-il bougé sur la période ? */
  mouvemente: boolean;
};

export type ChantiersData = {
  period: string;
  prevPeriod: string | null;
  fiscalYearStart: number;
  /** colonnes du tableau : les lignes de la maquette chantier, dans l'ordre */
  lines: Category[];
  rows: ChantierRow[];
  totals: ChantierValues;
  poles: string[];
  /** contrôle de couverture : soldes bruts des centres chantier, mappés ou non */
  controle: { soldeChantier: number; soldeMappe: number };
  unmapped: { account: string; label: string; solde: number }[];
  importId: number;
};

type FoldResult = {
  byCentre: Map<string, Map<string, number>>;
  /** contrôle de couverture : aucun solde ne doit être perdu en route */
  soldeTotal: number;
  soldeMappe: number;
  unmapped: Map<string, { account: string; label: string; solde: number }>;
};

/**
 * Mouvements d'une balance analytique, par centre chantier × catégorie (signe
 * d'affichage appliqué). Le compte de travaux en cours est scindé : son crédit
 * alimente la provision du mois, son débit l'annulation de la provision M-1.
 */
function foldSnapshot(
  lines: {
    centreCode: string;
    account: string;
    label: string;
    debit: string | number | null;
    credit: string | number | null;
    solde: string | number | null;
  }[],
  mapper: Awaited<ReturnType<typeof loadMapper>>,
  kindOf: (code: string) => CentreKind
): FoldResult {
  const byCentre = new Map<string, Map<string, number>>();
  const unmapped = new Map<string, { account: string; label: string; solde: number }>();
  let soldeTotal = 0;
  let soldeMappe = 0;
  for (const l of lines) {
    if (kindOf(l.centreCode) !== "chantier") continue;
    // Dotations et VNC : traitées en frais généraux quel que soit le centre.
    if (COMPTES_TOUJOURS_FX.has(l.account)) continue;
    const solde = num(l.solde);
    soldeTotal += solde;
    const cat = mapper.resolve(l.account);
    if (!cat) {
      const prev = unmapped.get(l.account);
      unmapped.set(l.account, {
        account: l.account,
        label: l.label,
        solde: round2((prev?.solde ?? 0) + solde),
      });
      continue;
    }
    soldeMappe += solde;
    const byCat = byCentre.get(l.centreCode) ?? new Map<string, number>();
    byCentre.set(l.centreCode, byCat);

    if (cat.code === CHANTIER_CODES.provision) {
      const bump = (code: string, v: number) =>
        byCat.set(code, round2((byCat.get(code) ?? 0) + v));
      bump(CHANTIER_CODES.provision, num(l.credit));
      bump(CHANTIER_CODES.annulation, -num(l.debit));
      continue;
    }
    byCat.set(cat.code, round2((byCat.get(cat.code) ?? 0) + cat.sign * solde));
  }
  return {
    byCentre,
    soldeTotal: round2(soldeTotal),
    soldeMappe: round2(soldeMappe),
    unmapped,
  };
}

/**
 * Cumul « durée de vie » : somme de tous les mois importés jusqu'à `upTo`
 * (inclus ou non), tous exercices confondus. Un seul import par mois : le plus
 * récent l'emporte.
 */
async function lifetimeCumul(
  entity: Entity,
  upTo: { period: string; inclusive: boolean },
  mapper: Awaited<ReturnType<typeof loadMapper>>,
  kindOf: (code: string) => CentreKind
): Promise<Map<string, Map<string, number>>> {
  const imports = await db
    .select({ id: tables.imports.id, period: tables.imports.period })
    .from(tables.imports)
    .where(
      and(
        eq(tables.imports.entityId, entity.id),
        eq(tables.imports.type, "analytique"),
        eq(tables.imports.status, "validated"),
        notAnnual
      )
    )
    .orderBy(tables.imports.id);
  const importByMonth = new Map<string, number>();
  for (const i of imports)
    if (i.period < upTo.period || (upTo.inclusive && i.period === upTo.period))
      importByMonth.set(i.period, i.id);

  const acc = new Map<string, Map<string, number>>();
  for (const importId of importByMonth.values()) {
    const rows = await analyticLinesOf(importId);
    for (const [centre, byCat] of foldSnapshot(rows, mapper, kindOf).byCentre) {
      const target = acc.get(centre) ?? new Map<string, number>();
      acc.set(centre, target);
      for (const [code, v] of byCat) target.set(code, round2((target.get(code) ?? 0) + v));
    }
  }
  return acc;
}

export async function getChantiers(
  entity: Entity,
  opts?: { period?: string }
): Promise<ChantiersData | null> {
  const imp = await latestValidatedImport(entity.id, "analytique", {
    atPeriod: opts?.period,
  });
  if (!imp) return null;
  // Mois précédent importé : il ne sert plus au calcul du mois, seulement à dire
  // jusqu'où remontent les reports de cumul.
  const [prevImp, mapper, kindOf, currentLines] = await Promise.all([
    latestValidatedImport(entity.id, "analytique", { beforePeriod: imp.period }),
    loadMapper("chantier", entity.id, entity.code),
    loadCentreKinds(entity.id),
    analyticLinesOf(imp.id),
  ]);

  const currentFold = foldSnapshot(currentLines, mapper, kindOf);
  const currentMonth = currentFold.byCentre;
  // Reports : tout ce qui a été importé avant le mois affiché.
  const [lifeBefore, lifeNow] = await Promise.all([
    lifetimeCumul(entity, { period: imp.period, inclusive: false }, mapper, kindOf),
    lifetimeCumul(entity, { period: imp.period, inclusive: true }, mapper, kindOf),
  ]);

  const labels = new Map<string, string>();
  for (const l of currentLines) if (!labels.has(l.centreCode)) labels.set(l.centreCode, l.centreLabel);
  // Chantier sans mouvement ce mois-ci : son intitulé vient du référentiel.
  const referentiel = await db
    .select({ code: tables.centres.code, name: tables.centres.name })
    .from(tables.centres)
    .where(eq(tables.centres.entityId, entity.id));
  for (const c of referentiel) if (!labels.has(c.code)) labels.set(c.code, c.name);

  // ── Saisies manuelles du mois ──────────────────────────────────────────────
  const manual = await db
    .select()
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entity.id),
        eq(tables.manualEntries.period, imp.period)
      )
    );
  const provisions = new Map<string, ChantierRow["previsionManuelle"] & object>();
  const annulations = new Map<string, number>();
  const notes = new Map<string, string>();
  const statuts = new Map<string, "draft" | "final">();
  for (const m of manual) {
    if (!m.centreCode) continue;
    if (m.field === "tec_provision" && m.valueNum != null)
      provisions.set(m.centreCode, {
        value: num(m.valueNum),
        status: m.status as "draft" | "final",
        by: m.updatedBy,
        at: m.updatedAt ? new Date(m.updatedAt).toLocaleDateString("fr-FR") : null,
      });
    if (m.field === "annulation_m1" && m.valueNum != null)
      annulations.set(m.centreCode, num(m.valueNum));
    if (m.field === "note" && m.valueText) notes.set(m.centreCode, m.valueText);
    if (m.field === "statut") statuts.set(m.centreCode, m.status as "draft" | "final");
  }



  // ── Reports d'ouverture ────────────────────────────────────────────────────
  // Les balances importées ne remontent pas avant le premier mois : le cumul
  // antérieur d'un chantier (facturation et résultat) est repris du tableau de
  // gestion, et s'ajoute aux mois importés. Les charges s'en déduisent.
  const ouvertures = new Map<string, { facturation: number; resultat: number }>();
  const ouvertureRows = await db
    .select()
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entity.id),
        eq(tables.manualEntries.field, "report_ouverture")
      )
    );
  for (const m of ouvertureRows) {
    if (!m.centreCode || m.valueNum == null || m.period > imp.period) continue;
    if (kindOf(m.centreCode) !== "chantier") continue;
    const o = ouvertures.get(m.centreCode) ?? { facturation: 0, resultat: 0 };
    if (m.subKey === "facturation") o.facturation = round2(o.facturation + num(m.valueNum));
    if (m.subKey === "resultat") o.resultat = round2(o.resultat + num(m.valueNum));
    ouvertures.set(m.centreCode, o);
    // Chantier clos avant le premier mois importé : ni balance ni référentiel ne
    // le connaissent, son intitulé est celui du tableau de gestion.
    if (m.valueText && !labels.has(m.centreCode)) labels.set(m.centreCode, m.valueText);
  }

  // ── Colonnes = centres retenus ─────────────────────────────────────────────
  // Un chantier sans mouvement ce mois-ci reste listé : ses cumuls continuent de
  // compter dans le suivi, comme dans le tableau de gestion.
  // Par pôle, puis par numéro de chantier croissant — c'est l'ordre chronologique
  // d'ouverture (872A avant 1003A), qu'un tri alphabétique inverserait.
  const numero = (code: string) => Number(code.match(/^\d+/)?.[0] ?? Infinity);
  const centres = [
    ...new Set([...currentMonth.keys(), ...lifeBefore.keys(), ...ouvertures.keys()]),
  ].sort(
    (a, b) =>
      (poleOf(a) ?? "ZZ").localeCompare(poleOf(b) ?? "ZZ") ||
      numero(a) - numero(b) ||
      a.localeCompare(b)
  );
  const TOTAL = TOTAL_COLUMN;
  const columns = [...centres, TOTAL];

  // ── Valeurs du mois : les mouvements du fichier, poste par poste ───────────
  const monthlyLeaves = new Map<string, Vector>();
  for (const cat of mapper.categories) {
    const vec: Vector = {};
    let total = 0;
    for (const centre of centres) {
      const v = round2(currentMonth.get(centre)?.get(cat.code) ?? 0);
      vec[centre] = v;
      total += v;
    }
    vec[TOTAL] = round2(total);
    monthlyLeaves.set(cat.code, vec);
  }

  // La provision saisie se substitue au compte 71331000 pour le centre concerné.
  if (provisions.size) {
    const vec = { ...(monthlyLeaves.get(CHANTIER_CODES.provision) ?? {}) };
    for (const [centre, p] of provisions) if (centre in vec) vec[centre] = p.value;
    vec[TOTAL] = round2(
      centres.reduce((s, c) => s + ((vec[c] as number) ?? 0), 0)
    );
    monthlyLeaves.set(CHANTIER_CODES.provision, vec);
  }

  // Annulation M-1 : reprise de la provision de M-1, passée au débit du compte de
  // travaux en cours dans le mois. La saisie de la DAF prime (mécanisme
  // brouillon → figé de la maquette).
  const annulationVec: Vector = {};
  let annulationTotal = 0;
  for (const centre of centres) {
    const repriseM1 = round2(currentMonth.get(centre)?.get(CHANTIER_CODES.annulation) ?? 0);
    const v = annulations.has(centre) ? annulations.get(centre)! : repriseM1;
    annulationVec[centre] = v;
    annulationTotal += v;
  }
  annulationVec[TOTAL] = round2(annulationTotal);

  // ── Cumuls sur la durée de vie du chantier ─────────────────────────────────
  const evalCumul = (snapshot: Map<string, Map<string, number>>) => {
    const leaves = new Map<string, Vector>();
    for (const cat of mapper.categories) {
      const vec: Vector = {};
      let total = 0;
      for (const centre of centres) {
        const byCat = snapshot.get(centre);
        // En cumul, provisions et reprises se compensent : il ne reste que la
        // provision encore ouverte à la fin du dernier mois.
        const v =
          cat.code === CHANTIER_CODES.provision
            ? round2(
                (byCat?.get(CHANTIER_CODES.provision) ?? 0) +
                  (byCat?.get(CHANTIER_CODES.annulation) ?? 0)
              )
            : (byCat?.get(cat.code) ?? 0);
        vec[centre] = v;
        total += v;
      }
      vec[TOTAL] = round2(total);
      leaves.set(cat.code, vec);
    }
    return evaluate(mapper.lines, columns, leaves);
  };
  const cumulNow = evalCumul(lifeNow);
  const cumulBefore = evalCumul(lifeBefore);

  const ouvertureVec = (pick: (o: { facturation: number; resultat: number }) => number): Vector => {
    const vec: Vector = {};
    let total = 0;
    for (const centre of centres) {
      const o = ouvertures.get(centre);
      const v = o ? round2(pick(o)) : 0;
      vec[centre] = v;
      total += v;
    }
    vec[TOTAL] = round2(total);
    return vec;
  };

  const provided = new Map<string, Vector>([
    [CHANTIER_CODES.annulation, annulationVec],
    [
      CHANTIER_CODES.reportResultat,
      sumVectors(columns, [
        cumulBefore.get(CHANTIER_CODES.resultat),
        ouvertureVec((o) => o.resultat),
      ]),
    ],
    [
      CHANTIER_CODES.reportFacturation,
      sumVectors(columns, [
        cumulBefore.get(CHANTIER_CODES.caTotal),
        ouvertureVec((o) => o.facturation),
      ]),
    ],
    [
      CHANTIER_CODES.cumulCharges,
      sumVectors(columns, [
        cumulNow.get(CHANTIER_CODES.totalExploitation),
        cumulNow.get(CHANTIER_CODES.totalPersonnel),
        // Résultat = facturation − charges : les charges d'avant l'ouverture.
        ouvertureVec((o) => o.facturation - o.resultat),
      ]),
    ],
  ]);

  const values = evaluate(mapper.lines, columns, monthlyLeaves, { provided });

  // ── Lignes du tableau ──────────────────────────────────────────────────────
  const visibleLines = mapper.lines.filter((l) => !l.hidden);
  const rows: ChantierRow[] = centres.map((centre) => {
    const rowValues: ChantierValues = {};
    let mouvemente = false;
    for (const line of visibleLines) {
      const v = values.get(line.code)?.[centre] ?? null;
      rowValues[line.code] = v;
      if (line.kind === "poste" && v) mouvemente = true;
    }
    return {
      centreCode: centre,
      centreLabel: labels.get(centre) ?? centre,
      pole: poleOf(centre),
      values: rowValues,
      previsionManuelle: provisions.get(centre) ?? null,
      note: notes.get(centre) ?? null,
      statut: statuts.get(centre) ?? "draft",
      mouvemente,
    };
  });

  const totals: ChantierValues = {};
  for (const line of visibleLines) totals[line.code] = values.get(line.code)?.[TOTAL] ?? null;

  return {
    period: imp.period,
    prevPeriod: prevImp?.period ?? null,
    fiscalYearStart: imp.fiscalYearStart,
    lines: visibleLines,
    rows,
    totals,
    poles: [...new Set(rows.map((r) => r.pole).filter((p): p is string => !!p))].sort(),
    controle: {
      soldeChantier: currentFold.soldeTotal,
      soldeMappe: currentFold.soldeMappe,
    },
    unmapped: [...currentFold.unmapped.values()].sort(
      (a, b) => Math.abs(b.solde) - Math.abs(a.solde)
    ),
    importId: imp.id,
  };
}

function sumVectors(columns: string[], vectors: (Vector | undefined)[]): Vector {
  const out: Vector = {};
  for (const c of columns) {
    let acc = 0;
    for (const v of vectors) acc += v?.[c] ?? 0;
    out[c] = round2(acc);
  }
  return out;
}

// ── Vue Frais généraux ───────────────────────────────────────────────────────
//
// Trois colonnes de montants : N-2, N-1 et N YTD, chacune rapportée au CA de son
// propre exercice — le « % / CA » d'une colonne ne se recopie jamais d'une
// colonne à l'autre. L'exercice en cours est lu dans la balance analytique
// (centres de structure) ; les exercices antérieurs le sont aussi lorsqu'un
// snapshot analytique existe, sinon la balance ventilée sert de repli.

export type FxRow = {
  category: Category;
  /** montants par exercice : n2 / n1 / n */
  cells: Record<FxColumn, number | null>;
  /** % du CA de l'exercice de la colonne */
  pct: Record<FxColumn, number | null>;
  ecart: number | null; // N − N-1 en euros
  ecartPct: number | null; // variation relative N / N-1
  accounts: { account: string; label: string; ytd: number }[];
};

export type FxSection = { name: string; rows: FxRow[] };

/** Provenance d'une colonne d'exercice antérieur. */
export type FxColumnSource = "analytique" | "ventilee" | "absent";

export type FxData = {
  period: string;
  fiscalYearStart: number;
  sections: FxSection[];
  byCode: Record<string, Record<FxColumn, number | null>>;
  /** nombre de mois écoulés sur l'exercice en cours */
  nbMois: number;
  totalYtd: number;
  totalMois: number;
  caReference: Record<FxColumn, number | null>;
  /** contrôle de couverture : soldes bruts des centres de structure, mappés ou non */
  controle: { soldeStructure: number; soldeMappe: number };
  /** d'où viennent N-1 et N-2, pour l'avertissement affiché sous le tableau */
  sources: Record<"n1" | "n2", FxColumnSource>;
  unmapped: { account: string; label: string; ytd: number }[];
  importId: number;
};

/** Mouvements du mois par compte, sur les centres de structure d'une balance analytique. */
const structureSoldes = cache(async function structureSoldes(
  importId: number,
  kindOf: (code: string) => CentreKind
): Promise<Map<string, { label: string; solde: number }>> {
  const rows = await analyticLinesOf(importId);
  const out = new Map<string, { label: string; solde: number }>();
  for (const l of rows) {
    // Les dotations et la VNC remontent en FX même depuis un centre chantier.
    if (kindOf(l.centreCode) !== "structure" && !COMPTES_TOUJOURS_FX.has(l.account))
      continue;
    const prev = out.get(l.account);
    out.set(l.account, {
      label: prev?.label ?? l.label,
      solde: round2((prev?.solde ?? 0) + num(l.solde)),
    });
  }
  return out;
});

/**
 * Imports analytiques validés d'un exercice, un par mois (le plus récent
 * l'emporte), jusqu'à `upTo` inclus.
 */
const analytiqueImportsOfYear = cache(async function analytiqueImportsOfYear(
  entityId: number,
  fiscalYearStart: number,
  upTo?: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: tables.imports.id, period: tables.imports.period })
    .from(tables.imports)
    .where(
      and(
        eq(tables.imports.entityId, entityId),
        eq(tables.imports.type, "analytique"),
        eq(tables.imports.status, "validated"),
        eq(tables.imports.fiscalYearStart, fiscalYearStart)
      )
    )
    .orderBy(tables.imports.id);
  const byMonth = new Map<string, number>();
  for (const r of rows) if (!upTo || r.period <= upTo) byMonth.set(r.period, r.id);
  return byMonth;
});

/** Cumul des centres de structure sur plusieurs mois : la somme des fichiers mensuels. */
async function structureCumul(
  importIds: Iterable<number>,
  kindOf: (code: string) => CentreKind
): Promise<Map<string, { label: string; solde: number }>> {
  const out = new Map<string, { label: string; solde: number }>();
  for (const id of importIds) {
    for (const [account, v] of await structureSoldes(id, kindOf)) {
      const prev = out.get(account);
      out.set(account, {
        label: prev?.label ?? v.label,
        solde: round2((prev?.solde ?? 0) + v.solde),
      });
    }
  }
  return out;
}

/**
 * Exercice antérieur : on privilégie les balances analytiques de l'exercice,
 * additionnées (le périmètre « structure » y est exact). À défaut on retombe sur
 * la balance ventilée, restreinte aux comptes de la nomenclature FX — approximation
 * signalée à l'utilisateur, car la ventilée ne porte pas l'axe analytique et
 * inclut donc aussi la part imputée aux chantiers.
 */
async function priorYear(
  entity: Entity,
  fiscalYearStart: number,
  kindOf: (code: string) => CentreKind,
  fxAccounts: Set<string>
): Promise<{ soldes: Map<string, number>; source: FxColumnSource }> {
  const analytiques = await analytiqueImportsOfYear(entity.id, fiscalYearStart);
  if (analytiques.size) {
    const cumuls = await structureCumul(analytiques.values(), kindOf);
    return {
      soldes: new Map([...cumuls].map(([a, v]) => [a, v.solde])),
      source: "analytique",
    };
  }

  const ventilee = await latestValidatedImport(entity.id, "ventilee", { fiscalYearStart });
  if (!ventilee) return { soldes: new Map(), source: "absent" };

  const lines = await generalLinesOf(ventilee.id);
  const soldes = new Map<string, number>();
  for (const l of lines) {
    if (!fxAccounts.has(l.account)) continue;
    soldes.set(l.account, round2((soldes.get(l.account) ?? 0) + num(l.amount)));
  }
  return { soldes, source: "ventilee" };
}

/**
 * CA de référence d'un exercice : la ligne CA TOTAL de la Synthèse, arrêtée à
 * `period` quand on consulte un mois passé — des frais à fin mars se rapportent
 * au CA à fin mars, pas à celui de tout l'exercice importé.
 */
async function caOfYear(
  entity: Entity,
  fiscalYearStart: number,
  period?: string
): Promise<number | null> {
  const synthese = await getSynthese(entity, { fiscalYearStart, period });
  return synthese?.byCode[SYNTHESE_CODES.caTotal]?.total ?? null;
}

export async function getFx(
  entity: Entity,
  opts?: { period?: string }
): Promise<FxData | null> {
  const imp = await latestValidatedImport(entity.id, "analytique", {
    atPeriod: opts?.period,
  });
  if (!imp) return null;
  const [kindOf, mapper, ruleRows] = await Promise.all([
    loadCentreKinds(entity.id),
    loadMapper("fx", entity.id, entity.code),
    // On reconstitue le jeu de comptes de la vue à partir des règles actives.
    db
      .select({ pattern: tables.accountRules.pattern, categoryId: tables.accountRules.categoryId })
      .from(tables.accountRules)
      .where(eq(tables.accountRules.active, true)),
  ]);

  const fxAccounts = new Set<string>();
  const fxCategoryIds = new Set(mapper.categories.map((c) => c.id));
  for (const r of ruleRows) if (fxCategoryIds.has(r.categoryId)) fxAccounts.add(r.pattern);

  // ── Exercice en cours ──────────────────────────────────────────────────────
  // N = somme des mois importés de l'exercice, jusqu'au mois affiché ; la colonne
  // de travail « mois » reprend le seul fichier du mois.
  // Les trois exercices et le CA de référence de chacun se lisent indépendamment.
  const [current, moisSoldes, n1, n2, caN] = await Promise.all([
    analytiqueImportsOfYear(entity.id, imp.fiscalYearStart, imp.period).then((imports) =>
      structureCumul(imports.values(), kindOf)
    ),
    structureSoldes(imp.id, kindOf),
    priorYear(entity, imp.fiscalYearStart - 1, kindOf, fxAccounts),
    priorYear(entity, imp.fiscalYearStart - 2, kindOf, fxAccounts),
    caOfYear(entity, imp.fiscalYearStart, imp.period),
  ]);
  const { soldes: n1Soldes, source: n1Source } = n1;
  const { soldes: n2Soldes, source: n2Source } = n2;
  const [caN1, caN2] = await Promise.all([
    n1Source === "absent" ? null : caOfYear(entity, imp.fiscalYearStart - 1),
    n2Source === "absent" ? null : caOfYear(entity, imp.fiscalYearStart - 2),
  ]);

  // ── Agrégation par poste ───────────────────────────────────────────────────
  const leaves = new Map<string, Vector>();
  const accountsByCat = new Map<string, { account: string; label: string; ytd: number }[]>();
  const unmapped = new Map<string, { account: string; label: string; ytd: number }>();
  let totalMois = 0;
  const blankFxVector = (): Vector => ({ n2: 0, n1: 0, n: 0, [MOIS_COLUMN]: 0 });

  // « mois » est une colonne de travail : elle suit les mêmes formules que les
  // colonnes d'exercice, ce qui donne un total mensuel cohérent avec le TOTAL 4
  // (et non une somme brute où les produits du siège viendraient s'ajouter).
  const columns: string[] = [...FX_COLUMNS, MOIS_COLUMN];
  const bump = (code: string, col: string, v: number) => {
    const vec = leaves.get(code) ?? blankFxVector();
    vec[col] = round2(((vec[col] as number) ?? 0) + v);
    leaves.set(code, vec);
  };
  for (const cat of mapper.categories) leaves.set(cat.code, blankFxVector());

  let soldeStructure = 0;
  let soldeMappe = 0;
  for (const [account, { label, solde }] of current) {
    soldeStructure += solde;
    const cat = mapper.resolve(account);
    if (!cat) {
      unmapped.set(account, { account, label, ytd: solde });
      continue;
    }
    soldeMappe += solde;
    const signed = round2(cat.sign * solde);
    bump(cat.code, "n", signed);
    bump(cat.code, MOIS_COLUMN, round2(cat.sign * (moisSoldes.get(account)?.solde ?? 0)));
    const list = accountsByCat.get(cat.code) ?? [];
    list.push({ account, label, ytd: signed });
    accountsByCat.set(cat.code, list);
  }
  for (const [col, soldes] of [
    ["n1", n1Soldes],
    ["n2", n2Soldes],
  ] as const) {
    for (const [account, solde] of soldes) {
      const cat = mapper.resolve(account);
      if (cat) bump(cat.code, col, round2(cat.sign * solde));
    }
  }

  // ── CA de référence, un par exercice ───────────────────────────────────────
  const caReference: Record<FxColumn, number | null> = { n: caN, n1: caN1, n2: caN2 };
  const provided = new Map<string, Vector>([
    [FX_CODES.caReference, { ...caReference, [MOIS_COLUMN]: null }],
  ]);

  const values = evaluate(mapper.lines, columns, leaves, { provided });
  totalMois = values.get(FX_CODES.totalGeneral)?.[MOIS_COLUMN] ?? 0;

  // ── Lignes ─────────────────────────────────────────────────────────────────
  const sections: FxSection[] = [];
  const byCode: FxData["byCode"] = {};
  for (const line of mapper.lines) {
    const vec = values.get(line.code) ?? {};
    const cells: Record<FxColumn, number | null> = {
      n2: vec.n2 ?? null,
      n1: vec.n1 ?? null,
      n: vec.n ?? null,
    };
    byCode[line.code] = cells;
    if (line.hidden) continue;

    const isRatio = line.kind === "ratio";
    const pct: Record<FxColumn, number | null> = { n2: null, n1: null, n: null };
    if (!isRatio) {
      for (const col of FX_COLUMNS) {
        const ca = caReference[col];
        const v = cells[col];
        pct[col] = ca && v != null ? round2((v / ca) * 100) : null;
      }
    }

    const ecart = cells.n != null && cells.n1 != null ? round2(cells.n - cells.n1) : null;
    const rows: FxRow = {
      category: line,
      cells,
      pct,
      ecart,
      ecartPct:
        cells.n1 != null && cells.n1 !== 0 && cells.n != null
          ? round2(((cells.n - cells.n1) / Math.abs(cells.n1)) * 100)
          : null,
      accounts: (accountsByCat.get(line.code) ?? []).sort(
        (a, b) => Math.abs(b.ytd) - Math.abs(a.ytd)
      ),
    };

    // Une ligne vide sur les trois exercices n'apporte rien, sauf si elle
    // structure le tableau (total, ratio, sous-total).
    if (line.kind === "poste" && !cells.n && !cells.n1 && !cells.n2) continue;

    const last = sections[sections.length - 1];
    if (last && last.name === line.section) last.rows.push(rows);
    else sections.push({ name: line.section, rows: [rows] });
  }

  const fiscalMonthsOfYear = fiscalMonths(imp.fiscalYearStart);
  const nbMois = fiscalMonthsOfYear.filter((m) => m <= imp.period).length;

  return {
    period: imp.period,
    fiscalYearStart: imp.fiscalYearStart,
    sections,
    byCode,
    nbMois,
    totalYtd: byCode[FX_CODES.totalGeneral]?.n ?? 0,
    totalMois: round2(totalMois),
    caReference,
    controle: { soldeStructure: round2(soldeStructure), soldeMappe: round2(soldeMappe) },
    sources: { n1: n1Source, n2: n2Source },
    unmapped: [...unmapped.values()].sort((a, b) => Math.abs(b.ytd) - Math.abs(a.ytd)),
    importId: imp.id,
  };
}

// ── Frais généraux, vue mensuelle ────────────────────────────────────────────
//
// Une colonne par mois de l'exercice, plus le cumul. Chaque balance analytique
// importée est lue comme le mouvement de son mois — ses totaux de classe 6 et 7
// recoupent la colonne du même mois de la balance ventilée — et le cumul est la
// somme des mois affichés. Un mois sans import reste vide et est signalé.

export type FxMensuelRow = {
  category: Category;
  /** une valeur par mois, plus TOTAL_COLUMN pour le cumul */
  cells: Record<string, number | null>;
  /** poids du cumul dans le CA cumulé des mêmes mois */
  pctCumul: number | null;
  accounts: string[];
};

export type FxMensuelData = {
  period: string;
  fiscalYearStart: number;
  /** mois de l'exercice jusqu'au mois affiché */
  months: string[];
  /** mois sans balance analytique validée */
  missing: string[];
  sections: { name: string; rows: FxMensuelRow[] }[];
  byCode: Record<string, Record<string, number | null>>;
  /** CA de la Synthèse, par mois et cumulé sur les mois affichés */
  caReference: Record<string, number | null>;
  unmapped: { account: string; label: string; cumul: number }[];
};

export async function getFxMensuel(
  entity: Entity,
  opts?: { period?: string }
): Promise<FxMensuelData | null> {
  const last = await latestValidatedImport(entity.id, "analytique", {
    atPeriod: opts?.period,
  });
  if (!last) return null;

  const months = fiscalMonths(last.fiscalYearStart).filter((m) => m <= last.period);
  const imports = await db
    .select()
    .from(tables.imports)
    .where(
      and(
        eq(tables.imports.entityId, entity.id),
        eq(tables.imports.type, "analytique"),
        eq(tables.imports.status, "validated"),
        eq(tables.imports.fiscalYearStart, last.fiscalYearStart)
      )
    )
    .orderBy(tables.imports.id);
  // Un seul import par mois : le plus récent l'emporte.
  const importByMonth = new Map<string, number>();
  for (const i of imports) if (months.includes(i.period)) importByMonth.set(i.period, i.id);
  const missing = months.filter((m) => !importByMonth.has(m));

  const [kindOf, mapper] = await Promise.all([
    loadCentreKinds(entity.id),
    loadMapper("fx", entity.id, entity.code),
  ]);
  const columns = [...months, TOTAL_COLUMN];

  const blank = (): Vector =>
    Object.fromEntries(columns.map((c) => [c, missing.includes(c) ? null : 0]));
  const leaves = new Map<string, Vector>();
  for (const cat of mapper.categories) leaves.set(cat.code, blank());
  const accountsByCat = new Map<string, Set<string>>();
  const unmapped = new Map<string, { account: string; label: string; cumul: number }>();

  for (const [month, importId] of importByMonth) {
    for (const [account, { label, solde }] of await structureSoldes(importId, kindOf)) {
      const cat = mapper.resolve(account);
      if (!cat) {
        const prev = unmapped.get(account);
        unmapped.set(account, { account, label, cumul: round2((prev?.cumul ?? 0) + solde) });
        continue;
      }
      const vec = leaves.get(cat.code) ?? blank();
      const signed = cat.sign * solde;
      vec[month] = round2((vec[month] ?? 0) + signed);
      vec[TOTAL_COLUMN] = round2((vec[TOTAL_COLUMN] ?? 0) + signed);
      leaves.set(cat.code, vec);
      const set = accountsByCat.get(cat.code) ?? new Set<string>();
      set.add(account);
      accountsByCat.set(cat.code, set);
    }
  }

  // CA de référence : celui de la Synthèse, mois par mois. Le cumul ne retient
  // que les mois effectivement couverts, pour rester comparable aux charges.
  const synthese = await getSynthese(entity, { fiscalYearStart: last.fiscalYearStart });
  const caCells = synthese?.byCode[SYNTHESE_CODES.caTotal]?.cells ?? {};
  const caReference: Record<string, number | null> = {};
  let caCumul = 0;
  for (const m of months) {
    const v = missing.includes(m) ? null : (caCells[m] ?? null);
    caReference[m] = v;
    caCumul += v ?? 0;
  }
  caReference[TOTAL_COLUMN] = synthese ? round2(caCumul) : null;

  const values = evaluate(mapper.lines, columns, leaves, {
    provided: new Map([[FX_CODES.caReference, caReference]]),
  });

  const sections: FxMensuelData["sections"] = [];
  const byCode: FxMensuelData["byCode"] = {};
  for (const line of mapper.lines) {
    const cells = values.get(line.code) ?? {};
    byCode[line.code] = cells;
    if (line.hidden) continue;
    if (line.kind === "poste" && !columns.some((c) => cells[c])) continue;

    const cumul = cells[TOTAL_COLUMN];
    const ca = caReference[TOTAL_COLUMN];
    const row: FxMensuelRow = {
      category: line,
      cells,
      pctCumul: line.kind !== "ratio" && ca && cumul != null ? round2((cumul / ca) * 100) : null,
      accounts: [...(accountsByCat.get(line.code) ?? [])].sort(),
    };
    const lastSection = sections[sections.length - 1];
    if (lastSection && lastSection.name === line.section) lastSection.rows.push(row);
    else sections.push({ name: line.section, rows: [row] });
  }

  return {
    period: last.period,
    fiscalYearStart: last.fiscalYearStart,
    months,
    missing,
    sections,
    byCode,
    caReference,
    unmapped: [...unmapped.values()].sort((a, b) => Math.abs(b.cumul) - Math.abs(a.cumul)),
  };
}

// ── Section Objectifs Dirigeant ──────────────────────────────────────────────
//
// Réutilise les ratios déjà calculés par les vues Synthèse et Frais généraux :
// aucun mapping comptable n'est dupliqué. Seul l'objectif annuel est saisi, par
// indicateur et par exercice.

export type ObjectifRow = {
  key: string;
  label: string;
  notes?: string;
  /** montant cumulé de l'exercice, null si l'indicateur n'est pas automatisable */
  montant: number | null;
  /** réalisé en % du CA */
  realise: number | null;
  objectif: number | null;
  /** réalisé − objectif, en points de % */
  ecart: number | null;
  statut: ObjectifStatut;
  controle: boolean;
};

export type ObjectifsData = {
  fiscalYearStart: number;
  period: string;
  caTotal: number;
  rows: ObjectifRow[];
  /** somme des ratios suivis — doit avoisiner 100 % du CA */
  totalControle: number | null;
  chargesDirectes: number | null;
  margeExploitation: number | null;
  /** période portant les saisies : le 1er mois de l'exercice */
  saisiePeriod: string;
};

export async function getObjectifs(
  entity: Entity,
  opts?: { period?: string }
): Promise<ObjectifsData | null> {
  const [synthese, fx] = await Promise.all([
    getSynthese(entity, { period: opts?.period }),
    getFx(entity, { period: opts?.period }),
  ]);
  if (!synthese) return null;

  // Les objectifs sont annuels : ils sont rangés sur le premier mois de
  // l'exercice, ce qui les rend indépendants du mois consulté.
  const saisiePeriod = fiscalMonths(synthese.fiscalYearStart)[0];
  const saisies = await db
    .select()
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entity.id),
        eq(tables.manualEntries.period, saisiePeriod)
      )
    );
  const objectifs = new Map<string, number>();
  for (const m of saisies) {
    if (!m.subKey || m.valueNum == null) continue;
    if (m.field === "objectif_annuel") objectifs.set(m.subKey, num(m.valueNum));
  }

  const caTotal = synthese.byCode[SYNTHESE_CODES.caTotal]?.total ?? 0;
  const rows: ObjectifRow[] = OBJECTIFS.map((def) => {
    let montant: number | null = null;
    if (def.source.view === "synthese")
      montant = synthese.byCode[def.source.code]?.total ?? null;
    else if (def.source.view === "fx") montant = fx?.byCode[def.source.code]?.n ?? null;

    const realise =
      montant != null && caTotal !== 0 ? round2((montant / caTotal) * 100) : null;
    const objectif = objectifs.get(def.key) ?? null;
    const ecart = realise != null && objectif != null ? round2(realise - objectif) : null;
    return {
      key: def.key,
      label: def.label,
      notes: def.notes,
      montant,
      realise,
      objectif,
      ecart,
      statut: statutObjectif(ecart),
      controle: def.controle,
    };
  });

  const suivis = rows.filter((r) => r.controle && r.realise != null);
  const totalControle = suivis.length
    ? round2(suivis.reduce((s, r) => s + (r.realise ?? 0), 0))
    : null;

  const chargesDirectes =
    caTotal !== 0
      ? round2(
          (((synthese.byCode[SYNTHESE_CODES.exploitation]?.total ?? 0) +
            (synthese.byCode[SYNTHESE_CODES.personnel]?.total ?? 0)) /
            caTotal) *
            100
        )
      : null;
  const margeExploitation =
    caTotal !== 0
      ? round2(
          ((synthese.byCode[SYNTHESE_CODES.resultatExploitation]?.total ?? 0) / caTotal) * 100
        )
      : null;

  return {
    fiscalYearStart: synthese.fiscalYearStart,
    period: synthese.period,
    caTotal,
    rows,
    totalControle,
    chargesDirectes,
    margeExploitation,
    saisiePeriod,
  };
}

// ── Consultation d'un compte ─────────────────────────────────────────────────
//
// Drill-down demandé par le cahier des charges : pouvoir interroger n'importe
// quel compte comptable, y compris ventilé par chantier, en dehors des lignes
// agrégées de la nomenclature.

export type AccountDetail = {
  account: string;
  label: string;
  /** poste de rattachement dans chaque vue, null si non mappé */
  postes: { view: View; label: string | null; section: string | null }[];
  fiscalYearStart: number;
  months: string[];
  /** montants mensuels issus de la balance ventilée */
  monthly: Record<string, number>;
  total: number;
  /** ventilation par centre analytique, au dernier snapshot */
  ventilation: {
    centreCode: string;
    centreLabel: string;
    kind: CentreKind;
    pole: string | null;
    debit: number;
    credit: number;
    solde: number;
    /** variation depuis le snapshot précédent du même exercice */
    mois: number | null;
  }[];
  analytiquePeriod: string | null;
  prevAnalytiquePeriod: string | null;
};

/** Comptes présents dans les imports validés, pour l'écran de recherche. */
export async function listAccounts(
  entity: Entity
): Promise<{ account: string; label: string; total: number }[]> {
  const imp = await latestValidatedImport(entity.id, "ventilee");
  if (!imp) return [];
  const rows = await generalLinesOf(imp.id);
  const out = new Map<string, { account: string; label: string; total: number }>();
  for (const r of rows) {
    const prev = out.get(r.account);
    out.set(r.account, {
      account: r.account,
      label: prev?.label ?? r.label,
      total: round2((prev?.total ?? 0) + num(r.amount)),
    });
  }
  return [...out.values()].sort((a, b) => a.account.localeCompare(b.account));
}

export async function getAccountDetail(
  entity: Entity,
  account: string
): Promise<AccountDetail | null> {
  const imp = await latestValidatedImport(entity.id, "ventilee");
  if (!imp) return null;

  const lines = (await generalLinesOf(imp.id)).filter((l) => l.account === account);

  const months = fiscalMonths(imp.fiscalYearStart);
  const monthly: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  let total = 0;
  let label = "";
  for (const l of lines) {
    label = label || l.label;
    const v = num(l.amount);
    monthly[l.month] = round2((monthly[l.month] ?? 0) + v);
    total += v;
  }

  // Poste de rattachement dans chacune des trois vues.
  const postes: AccountDetail["postes"] = [];
  for (const view of ["synthese", "chantier", "fx"] as const) {
    const mapper = await loadMapper(view, entity.id, entity.code);
    const cat = mapper.resolve(account);
    postes.push({ view, label: cat?.label ?? null, section: cat?.section ?? null });
  }

  // Ventilation analytique : cumul des balances mensuelles de l'exercice, et
  // mouvement du dernier mois importé.
  const ana = await latestValidatedImport(entity.id, "analytique");
  const kindOf = await loadCentreKinds(entity.id);
  const ventilation: AccountDetail["ventilation"] = [];
  if (ana) {
    const byCentre = new Map<string, AccountDetail["ventilation"][number]>();
    const monthsOfYear = await analytiqueImportsOfYear(entity.id, ana.fiscalYearStart, ana.period);
    for (const [month, importId] of monthsOfYear) {
      const rows = (await analyticLinesOf(importId)).filter((l) => l.account === account);
      for (const r of rows) {
        const v = byCentre.get(r.centreCode) ?? {
          centreCode: r.centreCode,
          centreLabel: r.centreLabel,
          kind: kindOf(r.centreCode),
          pole: poleOf(r.centreCode),
          debit: 0,
          credit: 0,
          solde: 0,
          mois: 0,
        };
        v.debit = round2(v.debit + num(r.debit));
        v.credit = round2(v.credit + num(r.credit));
        v.solde = round2(v.solde + num(r.solde));
        if (month === ana.period) v.mois = round2((v.mois ?? 0) + num(r.solde));
        byCentre.set(r.centreCode, v);
      }
    }
    ventilation.push(...byCentre.values());
    ventilation.sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
  }

  if (lines.length === 0 && ventilation.length === 0) return null;

  return {
    account,
    label,
    postes,
    fiscalYearStart: imp.fiscalYearStart,
    months,
    monthly,
    total: round2(total),
    ventilation,
    analytiquePeriod: ana?.period ?? null,
    prevAnalytiquePeriod: null,
  };
}
