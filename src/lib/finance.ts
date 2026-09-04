import { and, desc, eq, lt } from "drizzle-orm";
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
import { OBJECTIFS, statutObjectif, type ObjectifStatut } from "./objectifs";

export { TOTAL_COLUMN, CHANTIER_CODES, FX_CODES, SYNTHESE_CODES };

const num = (v: string | number | null | undefined) =>
  v == null ? 0 : typeof v === "number" ? v : parseFloat(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

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
export async function loadCentreKinds(
  entityId: number
): Promise<(centreCode: string) => CentreKind> {
  const rows = await db
    .select({ code: tables.centres.code, kind: tables.centres.kind })
    .from(tables.centres)
    .where(eq(tables.centres.entityId, entityId));
  const overrides = new Map<string, CentreKind>();
  for (const r of rows) if (r.kind) overrides.set(r.code, r.kind as CentreKind);
  return (centreCode: string) =>
    overrides.get(centreCode) ?? classifyCentre(centreCode);
}

// ── Imports validés ──────────────────────────────────────────────────────────

export async function latestValidatedImport(
  entityId: number,
  type: "ventilee" | "analytique",
  opts?: { fiscalYearStart?: number; beforePeriod?: string; atPeriod?: string }
) {
  const conds = [
    eq(tables.imports.entityId, entityId),
    eq(tables.imports.type, type),
    eq(tables.imports.status, "validated"),
  ];
  if (opts?.fiscalYearStart != null)
    conds.push(eq(tables.imports.fiscalYearStart, opts.fiscalYearStart));
  if (opts?.beforePeriod)
    conds.push(lt(tables.imports.period, opts.beforePeriod));
  if (opts?.atPeriod) conds.push(eq(tables.imports.period, opts.atPeriod));
  const rows = await db
    .select()
    .from(tables.imports)
    .where(and(...conds))
    .orderBy(desc(tables.imports.period), desc(tables.imports.id))
    .limit(1);
  return rows[0] ?? null;
}

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
        eq(tables.imports.status, "validated")
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

export async function getSynthese(
  entity: Entity,
  opts?: { fiscalYearStart?: number; period?: string }
): Promise<SyntheseData | null> {
  const imp = await latestValidatedImport(entity.id, "ventilee", {
    fiscalYearStart: opts?.fiscalYearStart,
  });
  if (!imp) return null;

  const mapper = await loadMapper("synthese", entity.id, entity.code);
  let lines = await db
    .select()
    .from(tables.generalBalanceLines)
    .where(eq(tables.generalBalanceLines.importId, imp.id));

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

  // ── N-1 ────────────────────────────────────────────────────────────────────
  // Comparaison à périmètre égal : le cumul N-1 est tronqué au même rang de mois
  // que N (7 mois de N contre 7 mois de N-1), en plus du total annuel complet.
  const prevImp = await latestValidatedImport(entity.id, "ventilee", {
    fiscalYearStart: imp.fiscalYearStart - 1,
  });
  const prevYtd = new Map<string, number>();
  const prevFull = new Map<string, number>();
  if (prevImp) {
    const prevLines = await db
      .select()
      .from(tables.generalBalanceLines)
      .where(eq(tables.generalBalanceLines.importId, prevImp.id));
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
    hasPrevYear: !!prevImp,
    prevCaTotal,
    importId: imp.id,
  };
}

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
// Un chantier = une ligne, les postes de la maquette = les colonnes (disposition
// du tableau de gestion Excel de Sodobat).
//
// La balance analytique est un cumul depuis l'ouverture de l'exercice : le mois
// s'obtient par différence entre deux snapshots consécutifs du même exercice.
// Les quatre lignes « cumuls sur la durée de vie du chantier » ne sont, elles,
// pas bornées à l'exercice : elles additionnent le dernier snapshot de chaque
// exercice antérieur au cumul de l'exercice en cours.

export type ChantierValues = Record<string, number | null>;

export type ChantierRow = {
  centreCode: string;
  centreLabel: string;
  pole: string | null;
  /** valeur de chaque ligne de la nomenclature, par code */
  values: ChantierValues;
  /** provision saisie manuellement, qui se substitue au compte 71331000 */
  previsionManuelle: { value: number; status: "draft" | "final" } | null;
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

/** Cumuls d'un snapshot, par centre chantier × catégorie (signe d'affichage appliqué). */
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

    byCat.set(cat.code, round2((byCat.get(cat.code) ?? 0) + cat.sign * solde));
  }
  return {
    byCentre,
    soldeTotal: round2(soldeTotal),
    soldeMappe: round2(soldeMappe),
    unmapped,
  };
}

/** Cumul « durée de vie » : exercices clos + snapshot de l'exercice en cours. */
async function lifetimeSnapshot(
  entity: Entity,
  upToImportId: number | null,
  fiscalYearStart: number,
  mapper: Awaited<ReturnType<typeof loadMapper>>,
  kindOf: (code: string) => CentreKind
): Promise<Map<string, Map<string, number>>> {
  const acc = new Map<string, Map<string, number>>();
  const add = (src: Map<string, Map<string, number>>) => {
    for (const [centre, byCat] of src) {
      const target = acc.get(centre) ?? new Map<string, number>();
      acc.set(centre, target);
      for (const [code, v] of byCat) target.set(code, round2((target.get(code) ?? 0) + v));
    }
  };

  // Exercices antérieurs : dernier snapshot de chacun (le cumul y est complet).
  const priorYears = await db
    .selectDistinct({ fiscalYearStart: tables.imports.fiscalYearStart })
    .from(tables.imports)
    .where(
      and(
        eq(tables.imports.entityId, entity.id),
        eq(tables.imports.type, "analytique"),
        eq(tables.imports.status, "validated"),
        lt(tables.imports.fiscalYearStart, fiscalYearStart)
      )
    );
  for (const y of priorYears) {
    const last = await latestValidatedImport(entity.id, "analytique", {
      fiscalYearStart: y.fiscalYearStart,
    });
    if (!last) continue;
    const rows = await db
      .select()
      .from(tables.analyticLines)
      .where(eq(tables.analyticLines.importId, last.id));
    add(foldSnapshot(rows, mapper, kindOf).byCentre);
  }

  if (upToImportId != null) {
    const rows = await db
      .select()
      .from(tables.analyticLines)
      .where(eq(tables.analyticLines.importId, upToImportId));
    add(foldSnapshot(rows, mapper, kindOf).byCentre);
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
  // Le comparatif M-1 reste dans le même exercice : sinon le snapshot de
  // novembre serait différencié contre le cumul d'octobre de l'exercice
  // précédent, qui ne s'est pas remis à zéro dans la même série.
  const prevImp = await latestValidatedImport(entity.id, "analytique", {
    beforePeriod: imp.period,
    fiscalYearStart: imp.fiscalYearStart,
  });

  const mapper = await loadMapper("chantier", entity.id, entity.code);
  const kindOf = await loadCentreKinds(entity.id);

  const currentLines = await db
    .select()
    .from(tables.analyticLines)
    .where(eq(tables.analyticLines.importId, imp.id));
  const previousLines = prevImp
    ? await db
        .select()
        .from(tables.analyticLines)
        .where(eq(tables.analyticLines.importId, prevImp.id))
    : [];

  const currentFold = foldSnapshot(currentLines, mapper, kindOf);
  const previousFold = foldSnapshot(previousLines, mapper, kindOf);
  const currentCumul = currentFold.byCentre;
  const prevCumul = previousFold.byCentre;

  const labels = new Map<string, string>();
  for (const l of currentLines) if (!labels.has(l.centreCode)) labels.set(l.centreCode, l.centreLabel);

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
  const provisions = new Map<string, { value: number; status: "draft" | "final" }>();
  const annulations = new Map<string, number>();
  const notes = new Map<string, string>();
  const statuts = new Map<string, "draft" | "final">();
  for (const m of manual) {
    if (!m.centreCode) continue;
    if (m.field === "tec_provision" && m.valueNum != null)
      provisions.set(m.centreCode, {
        value: num(m.valueNum),
        status: m.status as "draft" | "final",
      });
    if (m.field === "annulation_m1" && m.valueNum != null)
      annulations.set(m.centreCode, num(m.valueNum));
    if (m.field === "note" && m.valueText) notes.set(m.centreCode, m.valueText);
    if (m.field === "statut") statuts.set(m.centreCode, m.status as "draft" | "final");
  }



  // ── Colonnes = centres retenus ─────────────────────────────────────────────
  const centres = [...new Set([...currentCumul.keys(), ...prevCumul.keys()])].sort(
    (a, b) => (poleOf(a) ?? "ZZ").localeCompare(poleOf(b) ?? "ZZ") || a.localeCompare(b)
  );
  const TOTAL = TOTAL_COLUMN;
  const columns = [...centres, TOTAL];

  // ── Valeurs du mois : delta de cumul, poste par poste ──────────────────────
  const monthlyLeaves = new Map<string, Vector>();
  for (const cat of mapper.categories) {
    const vec: Vector = {};
    let total = 0;
    for (const centre of centres) {
      const now = currentCumul.get(centre)?.get(cat.code) ?? 0;
      const before = prevCumul.get(centre)?.get(cat.code) ?? 0;
      // Les travaux en cours ne sont pas un flux mais une position : le solde du
      // snapshot est la provision ouverte à la date d'arrêté, pas sa variation.
      const v =
        cat.code === CHANTIER_CODES.provision ? round2(now) : round2(now - before);
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

  // Annulation M-1 : reprise de la provision ouverte au snapshot précédent.
  // La saisie de la DAF prime (mécanisme brouillon → figé de la maquette).
  const annulationVec: Vector = {};
  let annulationTotal = 0;
  for (const centre of centres) {
    const repriseM1 = round2(-(prevCumul.get(centre)?.get(CHANTIER_CODES.provision) ?? 0));
    const v = annulations.has(centre) ? annulations.get(centre)! : repriseM1;
    annulationVec[centre] = v;
    annulationTotal += v;
  }
  annulationVec[TOTAL] = round2(annulationTotal);

  // ── Cumuls sur la durée de vie du chantier ─────────────────────────────────
  const lifeNow = await lifetimeSnapshot(entity, imp.id, imp.fiscalYearStart, mapper, kindOf);
  const lifeBefore = await lifetimeSnapshot(
    entity,
    prevImp?.id ?? null,
    imp.fiscalYearStart,
    mapper,
    kindOf
  );

  const evalCumul = (snapshot: Map<string, Map<string, number>>) => {
    const leaves = new Map<string, Vector>();
    for (const cat of mapper.categories) {
      const vec: Vector = {};
      let total = 0;
      for (const centre of centres) {
        const v = snapshot.get(centre)?.get(cat.code) ?? 0;
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

  const provided = new Map<string, Vector>([
    [CHANTIER_CODES.annulation, annulationVec],
    [
      CHANTIER_CODES.reportResultat,
      cumulBefore.get(CHANTIER_CODES.resultat) ?? {},
    ],
    [
      CHANTIER_CODES.reportFacturation,
      cumulBefore.get(CHANTIER_CODES.caTotal) ?? {},
    ],
    [
      CHANTIER_CODES.cumulCharges,
      sumVectors(columns, [
        cumulNow.get(CHANTIER_CODES.totalExploitation),
        cumulNow.get(CHANTIER_CODES.totalPersonnel),
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

/** Cumul par compte des centres de structure d'un snapshot analytique. */
async function structureSoldes(
  importId: number,
  kindOf: (code: string) => CentreKind
): Promise<Map<string, { label: string; solde: number }>> {
  const rows = await db
    .select()
    .from(tables.analyticLines)
    .where(eq(tables.analyticLines.importId, importId));
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
}

/**
 * Exercice antérieur : on privilégie le dernier snapshot analytique de
 * l'exercice (le périmètre « structure » y est exact). À défaut on retombe sur
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
  const analytique = await latestValidatedImport(entity.id, "analytique", { fiscalYearStart });
  if (analytique) {
    const cumuls = await structureSoldes(analytique.id, kindOf);
    return {
      soldes: new Map([...cumuls].map(([a, v]) => [a, v.solde])),
      source: "analytique",
    };
  }

  const ventilee = await latestValidatedImport(entity.id, "ventilee", { fiscalYearStart });
  if (!ventilee) return { soldes: new Map(), source: "absent" };

  const lines = await db
    .select()
    .from(tables.generalBalanceLines)
    .where(eq(tables.generalBalanceLines.importId, ventilee.id));
  const soldes = new Map<string, number>();
  for (const l of lines) {
    if (!fxAccounts.has(l.account)) continue;
    soldes.set(l.account, round2((soldes.get(l.account) ?? 0) + num(l.amount)));
  }
  return { soldes, source: "ventilee" };
}

/** CA de référence d'un exercice : la ligne CA TOTAL de la Synthèse. */
async function caOfYear(entity: Entity, fiscalYearStart: number): Promise<number | null> {
  const synthese = await getSynthese(entity, { fiscalYearStart });
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
  // Le cumul analytique se compare toujours à l'intérieur du même exercice.
  const prevImp = await latestValidatedImport(entity.id, "analytique", {
    beforePeriod: imp.period,
    fiscalYearStart: imp.fiscalYearStart,
  });

  const kindOf = await loadCentreKinds(entity.id);
  const mapper = await loadMapper("fx", entity.id, entity.code);

  const fxAccounts = new Set<string>();
  for (const cat of mapper.categories) {
    // On reconstitue le jeu de comptes de la vue à partir des règles actives.
    void cat;
  }
  const ruleRows = await db
    .select({ pattern: tables.accountRules.pattern, categoryId: tables.accountRules.categoryId })
    .from(tables.accountRules)
    .where(eq(tables.accountRules.active, true));
  const fxCategoryIds = new Set(mapper.categories.map((c) => c.id));
  for (const r of ruleRows) if (fxCategoryIds.has(r.categoryId)) fxAccounts.add(r.pattern);

  // ── Exercice en cours ──────────────────────────────────────────────────────
  const current = await structureSoldes(imp.id, kindOf);
  const prevSnapshot = prevImp
    ? await structureSoldes(prevImp.id, kindOf)
    : new Map<string, { label: string; solde: number }>();

  const { soldes: n1Soldes, source: n1Source } = await priorYear(
    entity,
    imp.fiscalYearStart - 1,
    kindOf,
    fxAccounts
  );
  const { soldes: n2Soldes, source: n2Source } = await priorYear(
    entity,
    imp.fiscalYearStart - 2,
    kindOf,
    fxAccounts
  );

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
    bump(cat.code, MOIS_COLUMN, round2(cat.sign * (solde - (prevSnapshot.get(account)?.solde ?? 0))));
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
  const caReference: Record<FxColumn, number | null> = {
    n: await caOfYear(entity, imp.fiscalYearStart),
    n1: n1Source === "absent" ? null : await caOfYear(entity, imp.fiscalYearStart - 1),
    n2: n2Source === "absent" ? null : await caOfYear(entity, imp.fiscalYearStart - 2),
  };
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

// ── Section Objectifs Dirigeant ──────────────────────────────────────────────
//
// Réutilise les ratios déjà calculés par les vues Synthèse et Frais généraux :
// aucun mapping comptable n'est dupliqué. Seuls l'objectif annuel et la valeur
// GEN sont saisis, par indicateur et par exercice.

export type ObjectifRow = {
  key: string;
  label: string;
  notes?: string;
  /** montant cumulé de l'exercice, null si l'indicateur n'est pas automatisable */
  montant: number | null;
  /** réalisé en % du CA */
  realise: number | null;
  objectif: number | null;
  gen: number | null;
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
  const synthese = await getSynthese(entity, { period: opts?.period });
  if (!synthese) return null;
  const fx = await getFx(entity, { period: opts?.period });

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
  const gens = new Map<string, number>();
  for (const m of saisies) {
    if (!m.subKey || m.valueNum == null) continue;
    if (m.field === "objectif_annuel") objectifs.set(m.subKey, num(m.valueNum));
    if (m.field === "gen") gens.set(m.subKey, num(m.valueNum));
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
    const gen = gens.get(def.key) ?? null;
    const ecart = realise != null && objectif != null ? round2(realise - objectif) : null;
    return {
      key: def.key,
      label: def.label,
      notes: def.notes,
      montant,
      realise,
      objectif,
      gen,
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
  const rows = await db
    .select()
    .from(tables.generalBalanceLines)
    .where(eq(tables.generalBalanceLines.importId, imp.id));
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

  const lines = (
    await db
      .select()
      .from(tables.generalBalanceLines)
      .where(eq(tables.generalBalanceLines.importId, imp.id))
  ).filter((l) => l.account === account);

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

  // Ventilation analytique au dernier snapshot, avec la variation du mois.
  const ana = await latestValidatedImport(entity.id, "analytique");
  const anaPrev = ana
    ? await latestValidatedImport(entity.id, "analytique", {
        beforePeriod: ana.period,
        fiscalYearStart: ana.fiscalYearStart,
      })
    : null;
  const kindOf = await loadCentreKinds(entity.id);
  const ventilation: AccountDetail["ventilation"] = [];
  if (ana) {
    const rows = (
      await db
        .select()
        .from(tables.analyticLines)
        .where(eq(tables.analyticLines.importId, ana.id))
    ).filter((l) => l.account === account);
    const prevByCentre = new Map<string, number>();
    if (anaPrev) {
      const prevRows = (
        await db
          .select()
          .from(tables.analyticLines)
          .where(eq(tables.analyticLines.importId, anaPrev.id))
      ).filter((l) => l.account === account);
      for (const p of prevRows)
        prevByCentre.set(p.centreCode, round2((prevByCentre.get(p.centreCode) ?? 0) + num(p.solde)));
    }
    for (const r of rows) {
      const solde = num(r.solde);
      ventilation.push({
        centreCode: r.centreCode,
        centreLabel: r.centreLabel,
        kind: kindOf(r.centreCode),
        pole: poleOf(r.centreCode),
        debit: num(r.debit),
        credit: num(r.credit),
        solde,
        mois: anaPrev ? round2(solde - (prevByCentre.get(r.centreCode) ?? 0)) : null,
      });
    }
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
    prevAnalytiquePeriod: anaPrev?.period ?? null,
  };
}
