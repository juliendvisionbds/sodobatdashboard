import { cache } from "react";
import { createHash } from "crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { CentreKind, classifyCentre, fiscalMonths, poleOf } from "./parsers";
import { Category, loadMapper, referenceEntityId, type View } from "./mapping";
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
  COMPTE_DOTATIONS,
  FX_CODES,
  PREMIER_EXERCICE_DOTATIONS_MENSUELLES,
  SYNTHESE_CODES,
} from "./nomenclature/codes";
import { fx as nomenclatureFx, synthese as nomenclatureSynthese } from "./nomenclature/sodobat";
import { partageRouting, quoteParts, structureRouting } from "./nomenclature/validate";
import { entiteConfig } from "./nomenclature/entites";
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

// ── Dotations aux amortissements lissées ─────────────────────────────────────
//
// La comptabilité passe les dotations en bloc, une ou deux fois par exercice.
// Le tableau de gestion les lit lissées :
//   · jusqu'au dernier mois où une dotation est comptabilisée, le cumul réel est
//     réparti à parts égales sur les mois écoulés depuis l'ouverture ;
//   · au-delà, chaque mois reçoit un douzième de la dotation de l'exercice
//     précédent, en attendant l'écriture suivante qui recalera le tout.
// Le lissage se lit sur tout ce que la base connaît de l'exercice, même quand
// l'écran est arrêté à un mois passé : un mois déjà recalé ne change plus.
//
// À partir de l'exercice ouvert en novembre 2026, les dotations sont passées
// chaque mois en comptabilité : elles sont lues telles quelles, sans lissage,
// et la ligne perd sa mention « (lissées) ».

/** Les dotations de cet exercice sont-elles comptabilisées chaque mois ? */
const dotationsMensuelles = (fiscalYearStart: number) =>
  fiscalYearStart >= PREMIER_EXERCICE_DOTATIONS_MENSUELLES;

/** La ligne des dotations, sous le libellé qui convient à l'exercice. */
function ligneDotations<T extends { label: string }>(line: T, fiscalYearStart: number): T {
  return dotationsMensuelles(fiscalYearStart)
    ? { ...line, label: line.label.replace(/\s*\(lissées\)/, "") }
    : line;
}

export type DotationsLissees = {
  /** dotation comptabilisée, par mois */
  comptabilisee: Record<string, number>;
  /** dotation lissée, par mois couvert par une balance */
  lissee: Record<string, number>;
  /** dotation de l'exercice précédent, base du douzième */
  reference: number;
};

const dotationsLissees = cache(async function dotationsLissees(
  entityId: number,
  fiscalYearStart: number
): Promise<DotationsLissees> {
  const months = fiscalMonths(fiscalYearStart);
  const comptabilisee: Record<string, number> = {};
  const couverts = new Set<string>();
  const dotationsDe = async (importId: number) => {
    const byMonth: Record<string, number> = {};
    const seen = new Set<string>();
    for (const l of await generalLinesOf(importId)) {
      seen.add(l.month);
      if (l.account !== COMPTE_DOTATIONS) continue;
      byMonth[l.month] = round2((byMonth[l.month] ?? 0) + num(l.amount));
    }
    return { byMonth, seen };
  };

  const [ventilee, prevVentilee, analytiques, annual] = await Promise.all([
    latestValidatedImport(entityId, "ventilee", { fiscalYearStart }),
    latestValidatedImport(entityId, "ventilee", { fiscalYearStart: fiscalYearStart - 1 }),
    analytiqueImportsOfYear(entityId, fiscalYearStart),
    annualImportIds(entityId),
  ]);
  if (ventilee) {
    const { byMonth, seen } = await dotationsDe(ventilee.id);
    for (const m of seen) couverts.add(m);
    Object.assign(comptabilisee, byMonth);
  }
  // Un mois que la ventilée ne couvre pas encore se lit dans sa balance analytique.
  for (const [month, importId] of analytiques) {
    if (annual.has(importId) || couverts.has(month)) continue;
    couverts.add(month);
    let v = 0;
    for (const l of await analyticLinesOf(importId))
      if (l.account === COMPTE_DOTATIONS) v += num(l.solde);
    if (v) comptabilisee[month] = round2(v);
  }

  let reference = 0;
  if (prevVentilee) {
    const { byMonth } = await dotationsDe(prevVentilee.id);
    reference = round2(Object.values(byMonth).reduce((t, v) => t + v, 0));
  }

  const mois = months.filter((m) => couverts.has(m));
  if (dotationsMensuelles(fiscalYearStart)) {
    const lissee: Record<string, number> = {};
    for (const m of mois) lissee[m] = comptabilisee[m] ?? 0;
    return { comptabilisee, lissee, reference };
  }
  const dernier = [...mois].reverse().find((m) => comptabilisee[m]);
  const rang = dernier ? months.indexOf(dernier) + 1 : 0;
  const cumul = round2(mois.reduce((t, m) => t + (comptabilisee[m] ?? 0), 0));
  const part = rang ? round2(cumul / rang) : 0;
  const douzieme = round2(reference / 12);

  const lissee: Record<string, number> = {};
  for (const m of months) {
    const i = months.indexOf(m) + 1;
    if (i < rang) lissee[m] = part;
    // Le dernier mois recalé porte l'arrondi : le cumul lissé est le cumul réel.
    else if (i === rang) lissee[m] = round2(cumul - part * (rang - 1));
    else if (couverts.has(m)) lissee[m] = douzieme;
  }
  return { comptabilisee, lissee, reference };
});

/** Vecteur des dotations lissées sur les mois affichés, total compris. */
function vecteurDotations(lissee: Record<string, number>, months: string[], affiches: string[]): Vector {
  const vec: Vector = {};
  let total = 0;
  for (const m of months) {
    const v = affiches.includes(m) ? (lissee[m] ?? 0) : 0;
    vec[m] = v;
    total += v;
  }
  vec[TOTAL_COLUMN] = round2(total);
  return vec;
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

  // ── Annulation M-1 et Prévision M ──────────────────────────────────────────
  // La balance ventilée ne porte que le mouvement net du compte de prévision
  // (71331000 chez Sodobat) : la prévision du mois moins la reprise de celle du
  // mois précédent. La balance analytique du même mois, elle, distingue le
  // débit (reprise) du crédit (prévision) : quand elle est là, la Synthèse
  // présente les deux lignes, comme le tableau de gestion. La somme reste le
  // net de la ventilée, le CA total ne bouge pas. Sans analytique, tout reste
  // sur la ligne Prévision.
  const { provisions } = entiteConfig(entity.code);
  const annulationVec: Vector = Object.fromEntries(months.map((m) => [m, 0]));
  const prevVec = leaves.get(SYNTHESE_CODES.tecProvision);
  if (prevVec && provisions.mode === "saisie") {
    // La comptabilité ne ventile pas la prévision par chantier : c'est la saisie
    // qui la porte. La prévision d'un mois est la somme des saisies du mois ;
    // l'annulation, celle du mois précédent, de signe opposé. Le compte mêle
    // ces écritures à de vraies ventes : ce qui en reste, une fois la prévision
    // et l'annulation retirées, est du chiffre d'affaires facturé. Le transfert
    // est additif, le CA total reste celui de la balance.
    const saisies = await previsionsSaisiesTotales(entity.id, [moisPrecedent(months[0]), ...months]);
    const poste = mapper.resolve(provisions.compte);
    const ventes = poste ? leaves.get(poste.code) : undefined;
    for (const m of monthsWithData) {
      const prevision = saisies.get(m) ?? 0;
      const annulation = round2(-(saisies.get(moisPrecedent(m)) ?? 0));
      prevVec[m] = prevision;
      annulationVec[m] = annulation;
      if (ventes) ventes[m] = round2((ventes[m] ?? 0) - prevision - annulation);
    }
    const total = (vec: Vector) => round2(months.reduce((t, m) => t + ((vec[m] as number) ?? 0), 0));
    annulationVec[TOTAL_COLUMN] = total(annulationVec);
    prevVec[TOTAL_COLUMN] = total(prevVec);
    if (ventes) ventes[TOTAL_COLUMN] = total(ventes);
  } else if (prevVec) {
    // Lecture par chantier du compte de prévision (voir provisionsLues), tous
    // centres confondus : la somme des deux lignes reste le net de la ventilée.
    const upTo = opts.period && opts.period < imp.period ? opts.period : undefined;
    const lues = await provisionsLues(entity.id, imp.fiscalYearStart, provisions.compte);
    for (const [month, parCentre] of lues) {
      if (!months.includes(month) || (upTo && month > upTo)) continue;
      let prevision = 0;
      let annulation = 0;
      for (const p of parCentre.values()) {
        prevision += p.prevision;
        annulation += p.annulation;
      }
      annulationVec[month] = round2(annulation);
      prevVec[month] = round2(prevision);
    }
    annulationVec[TOTAL_COLUMN] = round2(months.reduce((t, m) => t + (annulationVec[m] as number), 0));
    prevVec[TOTAL_COLUMN] = round2(months.reduce((t, m) => t + ((prevVec[m] as number) ?? 0), 0));
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

  // ── Postes partagés ────────────────────────────────────────────────────────
  // Une part fixe du poste rejoint une autre ligne (rémunération du gérant :
  // moitié production, moitié frais généraux). Additif, comme le découpage.
  const partages = partageRouting(nomenclatureSynthese, "synthese");
  const partager = (valeurs: Map<string, number>) => {
    for (const { from, to, part } of partages) {
      if (!valeurs.has(from)) continue;
      const v = round2((valeurs.get(from) ?? 0) * part);
      valeurs.set(from, round2((valeurs.get(from) ?? 0) - v));
      valeurs.set(to, round2((valeurs.get(to) ?? 0) + v));
    }
  };
  for (const { from, to, part } of partages) {
    const source = leaves.get(from);
    const cible = leaves.get(to);
    if (!source || !cible) continue;
    for (const m of months) {
      const v = round2((source[m] ?? 0) * part);
      if (!v) continue;
      source[m] = round2((source[m] ?? 0) - v);
      cible[m] = round2((cible[m] ?? 0) + v);
    }
    source[TOTAL_COLUMN] = round2(months.reduce((t, m) => t + ((source[m] as number) ?? 0), 0));
    cible[TOTAL_COLUMN] = round2(months.reduce((t, m) => t + ((cible[m] as number) ?? 0), 0));
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
    partager(prevYtd);
    partager(prevFull);
  }

  // Dotations lissées : N sur les mois affichés, N-1 au même rang de mois.
  const dotations = await dotationsLissees(entity.id, imp.fiscalYearStart);
  const dotationsVec = vecteurDotations(dotations.lissee, months, monthsWithData);
  const dotationsPrev = prevImp
    ? (await dotationsLissees(entity.id, prevImp.fiscalYearStart)).lissee
    : {};
  const dotationsPrevMois = prevImp ? fiscalMonths(prevImp.fiscalYearStart) : [];
  const dotationsPrevSur = (n: number) =>
    round2(dotationsPrevMois.slice(0, n).reduce((t, m) => t + (dotationsPrev[m] ?? 0), 0));

  const evalOn = (values: Map<string, number>, dotationsN1: number) => {
    const l = new Map<string, Vector>();
    for (const cat of mapper.categories) l.set(cat.code, { v: values.get(cat.code) ?? 0 });
    return evaluate(mapper.lines, ["v"], l, {
      provided: new Map([[SYNTHESE_CODES.fxDotations, { v: dotationsN1 }]]),
    });
  };
  const prevYtdEval = prevImp ? evalOn(prevYtd, dotationsPrevSur(monthsWithData.length)) : null;
  const prevFullEval = prevImp ? evalOn(prevFull, dotationsPrevSur(12)) : null;

  // ── Évaluation ─────────────────────────────────────────────────────────────
  const provided = new Map<string, Vector>();
  const resultatBg = bgResult(lines, months);
  provided.set(SYNTHESE_CODES.resultatBg, resultatBg);
  // En mode « saisie », les prévisions sont déjà dans le CA : il n'y a pas
  // d'écart avec une prévision comptabilisée par chantier à faire apparaître.
  const previsionsSaisies =
    provisions.mode === "saisie"
      ? (Object.fromEntries([...months, TOTAL_COLUMN].map((m) => [m, 0])) as Vector)
      : await previsionsSaisiesParMois(entity.id, months, provisions.compte);
  provided.set(SYNTHESE_CODES.previsionsSaisies, previsionsSaisies);
  provided.set(SYNTHESE_CODES.annulation, annulationVec);
  provided.set(SYNTHESE_CODES.fxDotations, dotationsVec);

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
    provided: new Map([
      [SYNTHESE_CODES.resultatBg, cumulate(resultatBg)],
      [SYNTHESE_CODES.previsionsSaisies, cumulate(previsionsSaisies)],
      [SYNTHESE_CODES.annulation, cumulate(annulationVec)],
      [SYNTHESE_CODES.fxDotations, cumulate(dotationsVec)],
    ]),
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
      category:
        line.code === SYNTHESE_CODES.fxDotations ? ligneDotations(line, imp.fiscalYearStart) : line,
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

// ── Prévisions saisies, contrôle et validation du mois ───────────────────────
//
// Les entités saisissent leurs prévisions (compte 713, travaux en cours) dans
// la vue Chantiers avant que le cabinet ne les comptabilise. Tant que la balance
// ne les porte pas, la vue Chantiers et la Synthèse ne disent pas le même
// résultat : l'écart, chantier par chantier, est ce que la DAF contrôle avant
// de valider le mois. Il ne porte que sur les chantiers ayant une saisie ; pour
// les autres, la valeur du fichier fait foi des deux côtés.

/** Mois qui précède : « 2025-11-01 » → « 2025-10-01 ». */
function moisPrecedent(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

/** Prévisions saisies dans la vue Chantiers, tous chantiers confondus, par mois. */
const previsionsSaisiesTotales = cache(async function previsionsSaisiesTotales(
  entityId: number,
  months: string[]
): Promise<Map<string, number>> {
  const saisies = await db
    .select({
      period: tables.manualEntries.period,
      centreCode: tables.manualEntries.centreCode,
      valueNum: tables.manualEntries.valueNum,
    })
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entityId),
        eq(tables.manualEntries.field, "tec_provision"),
        inArray(tables.manualEntries.period, months)
      )
    );
  const out = new Map<string, number>();
  for (const s of saisies) {
    if (!s.centreCode || s.valueNum == null) continue;
    out.set(s.period, round2((out.get(s.period) ?? 0) + num(s.valueNum)));
  }
  return out;
});

// ── Lecture du compte de prévision (71331000 chez Sodobat) ──────────────────
// La prévision d'un mois est la provision encore en cours à la fin du mois,
// soit le solde créditeur du compte pour le chantier depuis l'ouverture de
// l'exercice ; l'annulation du mois est la prévision du mois précédent, de signe
// opposé (convention de la DAF, réponse du 5 octobre 2026). Dans le cas courant
// — reprise intégrale de M-1 au débit, nouvelle prévision au crédit — c'est
// exactement le débit et le crédit du mois. Quand la reprise diffère de la
// prévision qu'elle reprend (994E en mai 2026 : 64 500 repris pour 43 000
// prévus), l'écart est lu comme une prévision négative, que le mois suivant
// reprend à son tour : chaque montant reste sur sa ligne, le net du compte est
// inchangé.
// Au premier mois importé de l'exercice, la prévision d'octobre n'est pas
// connue : le débit est pris pour la reprise, le crédit pour la prévision.
// Un chantier sans écriture sur le compte dans le mois ne montre rien : sa
// provision reste simplement en cours, reprise le mois où l'on y touche.

type ProvisionLue = { label: string; prevision: number; annulation: number };

const provisionsLues = cache(async function provisionsLues(
  entityId: number,
  fiscalYearStart: number,
  compte: string
): Promise<Map<string, Map<string, ProvisionLue>>> {
  const annual = await annualImportIds(entityId);
  const mensuels = [...(await analytiqueImportsOfYear(entityId, fiscalYearStart))]
    .filter(([, id]) => !annual.has(id))
    .sort(([a], [b]) => a.localeCompare(b));
  const out = new Map<string, Map<string, ProvisionLue>>();
  // Provision en cours par chantier, à la fin du mois précédent.
  const enCours = new Map<string, number>();
  const labels = new Map<string, string>();
  let premier = true;
  for (const [month, importId] of mensuels) {
    const mouvements = new Map<string, { debit: number; credit: number }>();
    for (const l of await analyticLinesOf(importId)) {
      if (l.account !== compte) continue;
      const m = mouvements.get(l.centreCode) ?? { debit: 0, credit: 0 };
      m.debit += num(l.debit);
      m.credit += num(l.credit);
      mouvements.set(l.centreCode, m);
      if (!labels.has(l.centreCode)) labels.set(l.centreCode, l.centreLabel);
    }
    const lu = new Map<string, ProvisionLue>();
    for (const [centre, m] of mouvements) {
      if (!round2(m.debit) && !round2(m.credit)) continue;
      const avant = premier ? m.debit : (enCours.get(centre) ?? 0);
      const prevision = round2(avant + m.credit - m.debit);
      lu.set(centre, { label: labels.get(centre) ?? centre, prevision, annulation: round2(-avant) });
      enCours.set(centre, prevision);
    }
    out.set(month, lu);
    premier = false;
  }
  return out;
});

/** Prévision et annulation lues en comptabilité, par chantier, pour le mois d'un import. */
async function previsionsComptabilisees(
  imp: { entityId: number; fiscalYearStart: number; period: string },
  kindOf: (code: string) => CentreKind,
  compte: string
): Promise<Map<string, ProvisionLue>> {
  const lu = (await provisionsLues(imp.entityId, imp.fiscalYearStart, compte)).get(imp.period);
  const out = new Map<string, ProvisionLue>();
  for (const [centre, p] of lu ?? []) if (kindOf(centre) === "chantier") out.set(centre, p);
  return out;
}

/** Écart prévisions saisies − comptabilisées, mois par mois, pour la Synthèse. */
const previsionsSaisiesParMois = cache(async function previsionsSaisiesParMois(
  entityId: number,
  months: string[],
  compte: string
): Promise<Vector> {
  const vec: Vector = Object.fromEntries(months.map((m) => [m, 0]));
  const saisies = await db
    .select()
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entityId),
        eq(tables.manualEntries.field, "tec_provision"),
        inArray(tables.manualEntries.period, months)
      )
    );
  const kindOf = await loadCentreKinds(entityId);
  let total = 0;
  for (const month of new Set(saisies.map((s) => s.period))) {
    const imp = await latestValidatedImport(entityId, "analytique", { atPeriod: month });
    const compta = imp
      ? await previsionsComptabilisees(imp, kindOf, compte)
      : new Map<string, ProvisionLue>();
    let ecart = 0;
    for (const s of saisies) {
      if (s.period !== month || !s.centreCode || s.valueNum == null) continue;
      ecart += num(s.valueNum) - (compta.get(s.centreCode)?.prevision ?? 0);
    }
    vec[month] = round2(ecart);
    total += ecart;
  }
  vec[TOTAL_COLUMN] = round2(total);
  return vec;
});

export type PrevisionControl = {
  period: string;
  analytiqueImportId: number | null;
  ventileeImportId: number | null;
  /** la balance ventilée reçue couvre-t-elle ce mois ? */
  ventileeCovers: boolean;
  /** empreinte de la colonne du mois dans cette balance ventilée (null si non couverte) */
  ventileeEmpreinte: string | null;
  /** chantiers ayant une prévision saisie */
  rows: {
    centreCode: string;
    centreLabel: string;
    saisie: number;
    comptabilisee: number;
    ecart: number;
    status: "draft" | "final";
    by: string | null;
  }[];
  /** total du 713 comptabilisé sur les chantiers, tous chantiers */
  totalComptabilise: number;
  totalSaisi: number;
  ecart: number;
  resultatComptable: number | null;
  resultatGestion: number | null;
};

/**
 * Empreinte de la colonne d'un mois dans une balance ventilée : elle ne change
 * que si un montant de ce mois change. Sert à dire si un nouvel export, qui
 * couvre tout l'exercice, a touché un mois déjà validé.
 */
async function empreinteVentilee(importId: number, period: string): Promise<string | null> {
  const parCompte = new Map<string, number>();
  for (const l of await generalLinesOf(importId)) {
    if (l.month !== period) continue;
    parCompte.set(l.account, round2((parCompte.get(l.account) ?? 0) + num(l.amount)));
  }
  if (parCompte.size === 0) return null;
  const texte = [...parCompte]
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([compte, v]) => `${compte}:${v.toFixed(2)}`)
    .join("|");
  return createHash("sha256").update(texte).digest("hex").slice(0, 16);
}

export async function getPrevisionControl(entity: Entity, period: string): Promise<PrevisionControl> {
  const [imp, ventilee, kindOf, saisies, synthese] = await Promise.all([
    latestValidatedImport(entity.id, "analytique", { atPeriod: period }),
    latestValidatedImport(entity.id, "ventilee"),
    loadCentreKinds(entity.id),
    db
      .select()
      .from(tables.manualEntries)
      .where(
        and(
          eq(tables.manualEntries.entityId, entity.id),
          eq(tables.manualEntries.period, period),
          eq(tables.manualEntries.field, "tec_provision")
        )
      ),
    getSynthese(entity),
  ]);
  const { provisions } = entiteConfig(entity.code);
  // En mode « saisie », la comptabilité ne porte pas la prévision par chantier :
  // il n'y a rien à lui comparer, la saisie est la référence.
  const compta =
    imp && provisions.mode === "compte"
      ? await previsionsComptabilisees(imp, kindOf, provisions.compte)
      : new Map<string, ProvisionLue>();
  const referentiel = await db
    .select({ code: tables.centres.code, name: tables.centres.name })
    .from(tables.centres)
    .where(eq(tables.centres.entityId, entity.id));
  const names = new Map(referentiel.map((c) => [c.code, c.name]));

  const rows: PrevisionControl["rows"] = [];
  for (const s of saisies) {
    if (!s.centreCode || s.valueNum == null) continue;
    const c = compta.get(s.centreCode);
    const saisie = num(s.valueNum);
    const comptabilisee = provisions.mode === "saisie" ? saisie : (c?.prevision ?? 0);
    rows.push({
      centreCode: s.centreCode,
      centreLabel: c?.label ?? names.get(s.centreCode) ?? s.centreCode,
      saisie,
      comptabilisee,
      ecart: round2(saisie - comptabilisee),
      status: s.status as "draft" | "final",
      by: s.updatedBy,
    });
  }
  rows.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart) || a.centreCode.localeCompare(b.centreCode));
  const ecart = round2(rows.reduce((t, r) => t + r.ecart, 0));
  const ventileeCovers = !!ventilee && ventilee.period >= period;
  const resultatComptable = ventileeCovers
    ? (synthese?.byCode[SYNTHESE_CODES.resultatNet]?.cells[period] ?? null)
    : null;
  return {
    period,
    analytiqueImportId: imp?.id ?? null,
    ventileeImportId: ventileeCovers ? ventilee!.id : null,
    ventileeCovers,
    ventileeEmpreinte: ventileeCovers ? await empreinteVentilee(ventilee!.id, period) : null,
    rows,
    totalComptabilise: round2([...compta.values()].reduce((t, c) => t + c.prevision, 0)),
    totalSaisi: round2(rows.reduce((t, r) => t + r.saisie, 0)),
    ecart,
    resultatComptable,
    resultatGestion: resultatComptable == null ? null : round2(resultatComptable + ecart),
  };
}

export type MonthValidation = {
  validatedBy: string;
  validatedAt: string;
  ecart: number;
  /** encore valable : les imports sur lesquels elle a porté sont toujours ceux du mois */
  current: boolean;
  /** pourquoi elle ne l'est plus */
  staleReason: string | null;
};

export async function getMonthValidation(
  entity: Entity,
  control: PrevisionControl
): Promise<MonthValidation | null> {
  const [v] = await db
    .select()
    .from(tables.monthValidations)
    .where(
      and(eq(tables.monthValidations.entityId, entity.id), eq(tables.monthValidations.period, control.period))
    );
  if (!v) return null;
  const reasons: string[] = [];
  if (v.analytiqueImportId !== control.analytiqueImportId)
    reasons.push("la balance analytique du mois a été réimportée");
  // La balance ventilée couvre tout l'exercice : chaque envoi la remplace en
  // entier. Le mois n'est à revalider que si sa propre colonne a changé — pas
  // parce qu'un mois suivant est arrivé. Une validation antérieure à l'empreinte
  // se compare à l'export sur lequel elle a porté, tant qu'il est conservé.
  if (v.ventileeImportId !== control.ventileeImportId) {
    const avant =
      (v.snapshot as { ventileeEmpreinte?: string | null } | null)?.ventileeEmpreinte ??
      (v.ventileeImportId ? await empreinteVentilee(v.ventileeImportId, control.period) : null);
    if (!control.ventileeCovers) reasons.push("la balance ventilée ne couvre plus ce mois");
    else if (!avant || avant !== control.ventileeEmpreinte)
      reasons.push("les montants du mois ont changé dans la balance ventilée");
  }
  return {
    validatedBy: v.validatedBy,
    validatedAt: new Date(v.validatedAt).toLocaleDateString("fr-FR"),
    ecart: num(v.ecart),
    current: reasons.length === 0,
    staleReason: reasons.length ? reasons.join(" et ") : null,
  };
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
// Sur le compte de travaux en cours (71331000), la prévision du mois est la
// provision en cours à la fin du mois et l'annulation celle du mois précédent
// (voir provisionsLues) : ce sont les colonnes « Annulation Mois-1 » et
// « Prévision Mois » du tableau de gestion de la DAF.
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
 * alimente la provision du mois, son débit l'annulation de la provision M-1 —
 * lecture brute, que getChantiers affine pour le mois affiché (provisionsLues) ;
 * en cumul, seule leur somme compte.
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
  // Prévision et annulation du mois lues sur l'exercice, chantier par chantier
  // (voir provisionsLues) : elles remplacent le crédit et le débit bruts du mois.
  const lecture = entiteConfig(entity.code).provisions;
  if (lecture.mode === "compte") {
    for (const [centre, p] of await previsionsComptabilisees(imp, kindOf, lecture.compte)) {
      const byCat = currentMonth.get(centre) ?? new Map<string, number>();
      byCat.set(CHANTIER_CODES.provision, p.prevision);
      byCat.set(CHANTIER_CODES.annulation, p.annulation);
      currentMonth.set(centre, byCat);
    }
  }
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
    // Prévision encore ouverte à la fin du mois : ce qui reste des prévisions
    // posées après leurs reprises, mois passés compris, saisie du mois incluse.
    [
      CHANTIER_CODES.cumulDontPrevisions,
      sumVectors(columns, [
        cumulBefore.get(CHANTIER_CODES.provision),
        monthlyLeaves.get(CHANTIER_CODES.provision),
        annulationVec,
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
    // Un chantier dont la prévision du mois précédent est reprise ce mois-ci,
    // ou qui portait encore une prévision ouverte à la fin du mois précédent,
    // reste visible même sans autre mouvement : c'est là qu'on ajuste sa
    // prévision (demande de la DAF, 25 septembre 2026).
    if (
      (annulationVec[centre] as number) ||
      (cumulBefore.get(CHANTIER_CODES.provision)?.[centre] as number)
    )
      mouvemente = true;
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
  /**
   * L'exercice en cours n'est connu que par une balance cumulée : le cumul est
   * juste, mais le mouvement du mois affiché n'est pas disponible.
   */
  cumulSeul: boolean;
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

/**
 * Imports à additionner pour le cumul d'un exercice arrêté à `upTo`. Là où des
 * balances mensuelles existent, elles font foi ; à défaut, la balance cumulée
 * la plus récente (exercice clos entier, ou exercice en cours arrêté à un mois)
 * porte le cumul à elle seule. Les deux ne s'additionnent jamais.
 */
async function importsDuCumul(
  entityId: number,
  fiscalYearStart: number,
  upTo?: string
): Promise<number[]> {
  const [parMois, annual] = await Promise.all([
    analytiqueImportsOfYear(entityId, fiscalYearStart, upTo),
    annualImportIds(entityId),
  ]);
  const mensuels = [...parMois].filter(([, id]) => !annual.has(id));
  if (mensuels.length) return mensuels.map(([, id]) => id);
  const cumules = [...parMois].sort(([a], [b]) => a.localeCompare(b));
  return cumules.length ? [cumules[cumules.length - 1][1]] : [];
}

/**
 * Balance cumulée de l'exercice que montre la Synthèse (celui de la dernière
 * balance ventilée), quand aucune balance mensuelle n'existe : elle permet de
 * lire le cumul des frais généraux en attendant les balances de chaque mois.
 */
async function balanceCumulee(entityId: number, period?: string) {
  const ventilee = await latestValidatedImport(entityId, "ventilee");
  if (!ventilee) return null;
  const rows = await db
    .select()
    .from(tables.imports)
    .where(
      and(
        eq(tables.imports.entityId, entityId),
        eq(tables.imports.type, "analytique"),
        eq(tables.imports.status, "validated"),
        eq(tables.imports.fiscalYearStart, ventilee.fiscalYearStart),
        sql`${tables.imports.summary}->>'annual' = 'true'`
      )
    )
    .orderBy(desc(tables.imports.period), desc(tables.imports.id));
  return rows.find((r) => !period || r.period === period) ?? null;
}

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
  const analytiques = await importsDuCumul(entity.id, fiscalYearStart);
  if (analytiques.length) {
    const cumuls = await structureCumul(analytiques, kindOf);
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
  const mensuelle = await latestValidatedImport(entity.id, "analytique", {
    atPeriod: opts?.period,
  });
  const imp = mensuelle ?? (await balanceCumulee(entity.id, opts?.period));
  if (!imp) return null;
  const cumulSeul = !mensuelle;
  const referenceId = await referenceEntityId();
  const [kindOf, mapper, ruleRows] = await Promise.all([
    loadCentreKinds(entity.id),
    loadMapper("fx", entity.id, entity.code),
    // On reconstitue le jeu de comptes de la vue à partir des règles actives.
    db
      .select({ pattern: tables.accountRules.pattern, categoryId: tables.accountRules.categoryId })
      .from(tables.accountRules)
      .where(
        and(
          eq(tables.accountRules.active, true),
          or(
            isNull(tables.accountRules.entityId),
            eq(tables.accountRules.entityId, entity.id),
            ...(referenceId != null ? [eq(tables.accountRules.entityId, referenceId)] : [])
          )
        )
      ),
  ]);
  const quotes = quoteParts(nomenclatureFx, "fx");

  const fxAccounts = new Set<string>();
  const fxCategoryIds = new Set(mapper.categories.map((c) => c.id));
  for (const r of ruleRows) if (fxCategoryIds.has(r.categoryId)) fxAccounts.add(r.pattern);

  // ── Exercice en cours ──────────────────────────────────────────────────────
  // N = somme des mois importés de l'exercice, jusqu'au mois affiché ; la colonne
  // de travail « mois » reprend le seul fichier du mois.
  // Les trois exercices et le CA de référence de chacun se lisent indépendamment.
  const [current, moisSoldes, n1, n2, caN] = await Promise.all([
    importsDuCumul(entity.id, imp.fiscalYearStart, imp.period).then((imports) =>
      structureCumul(imports, kindOf)
    ),
    // Une balance cumulée ne dit rien du seul mois affiché.
    cumulSeul ? new Map<string, { label: string; solde: number }>() : structureSoldes(imp.id, kindOf),
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
    // Un poste à quote-part ne retient que sa fraction du compte.
    const quote = quotes.get(cat.code) ?? 1;
    const signed = round2(cat.sign * solde * quote);
    bump(cat.code, "n", signed);
    bump(cat.code, MOIS_COLUMN, round2(cat.sign * quote * (moisSoldes.get(account)?.solde ?? 0)));
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
      if (cat) bump(cat.code, col, round2(cat.sign * solde * (quotes.get(cat.code) ?? 1)));
    }
  }

  // Dotations de l'exercice en cours : lissées, comme dans la Synthèse. N-1 et
  // N-2 portent la dotation de l'exercice entier, que le lissage ne change pas.
  const dotations = await dotationsLissees(entity.id, imp.fiscalYearStart);
  const dotationsVec = leaves.get(FX_CODES.dotations);
  if (dotationsVec) {
    dotationsVec.n = round2(
      fiscalMonths(imp.fiscalYearStart)
        .filter((m) => m <= imp.period)
        .reduce((t, m) => t + (dotations.lissee[m] ?? 0), 0)
    );
    dotationsVec[MOIS_COLUMN] = cumulSeul ? 0 : (dotations.lissee[imp.period] ?? 0);
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
      category: line.code === FX_CODES.dotations ? ligneDotations(line, imp.fiscalYearStart) : line,
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
    cumulSeul,
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
  const quotes = quoteParts(nomenclatureFx, "fx");

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
      const signed = cat.sign * solde * (quotes.get(cat.code) ?? 1);
      vec[month] = round2((vec[month] ?? 0) + signed);
      vec[TOTAL_COLUMN] = round2((vec[TOTAL_COLUMN] ?? 0) + signed);
      leaves.set(cat.code, vec);
      const set = accountsByCat.get(cat.code) ?? new Set<string>();
      set.add(account);
      accountsByCat.set(cat.code, set);
    }
  }

  // Dotations lissées, mois par mois, comme dans la Synthèse.
  const dotations = await dotationsLissees(entity.id, last.fiscalYearStart);
  const dotationsVec = leaves.get(FX_CODES.dotations);
  if (dotationsVec) {
    let cumul = 0;
    for (const m of months) {
      if (missing.includes(m)) continue;
      dotationsVec[m] = dotations.lissee[m] ?? 0;
      cumul += dotationsVec[m] as number;
    }
    dotationsVec[TOTAL_COLUMN] = round2(cumul);
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
      category: line.code === FX_CODES.dotations ? ligneDotations(line, last.fiscalYearStart) : line,
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
