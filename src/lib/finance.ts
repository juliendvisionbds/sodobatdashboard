import { and, desc, eq, lt } from "drizzle-orm";
import { db, tables } from "@/db";
import { fiscalMonths, poleOf } from "./parsers";
import { Category, loadMapper } from "./mapping";

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
  monthly: Record<string, number>;
  total: number;
  pctCa: number | null;
  prevTotal: number | null; // N-1
};

export type SyntheseSection = {
  name: string;
  rows: SyntheseRow[];
  subtotal: { monthly: Record<string, number>; total: number };
};

export type SyntheseData = {
  fiscalYearStart: number;
  months: string[]; // les 12 mois de l'exercice
  monthsWithData: string[];
  period: string; // dernier mois importé
  sections: SyntheseSection[];
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

const SECTION_PRODUITS = "PRODUITS / CA";
const SECTION_PERSONNEL = "CHARGES DE PERSONNEL";
const SECTION_EXPLOITATION = "CHARGES D'EXPLOITATION";
const SECTION_FX = "FRAIS GÉNÉRAUX & AUTRES CHARGES";

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

  // agrégation par catégorie × mois (montants bruts : charges +, produits −)
  const rawByCat = new Map<number, Record<string, number>>();
  const unmappedMap = new Map<string, { label: string; total: number }>();
  for (const l of lines) {
    const cat = mapper.resolve(l.account);
    const amount = num(l.amount);
    if (!cat) {
      const prev = unmappedMap.get(l.account);
      unmappedMap.set(l.account, {
        label: l.label,
        total: round2((prev?.total ?? 0) + amount),
      });
      continue;
    }
    const rec = rawByCat.get(cat.id) ?? {};
    rec[l.month] = round2((rec[l.month] ?? 0) + amount);
    rawByCat.set(cat.id, rec);
  }

  // N-1 : totaux par catégorie de l'exercice précédent, si importé
  const prevImp = await latestValidatedImport(entity.id, "ventilee", {
    fiscalYearStart: imp.fiscalYearStart - 1,
  });
  const prevByCat = new Map<number, number>();
  let prevCaRaw = 0;
  if (prevImp) {
    const prevLines = await db
      .select()
      .from(tables.generalBalanceLines)
      .where(eq(tables.generalBalanceLines.importId, prevImp.id));
    for (const l of prevLines) {
      const cat = mapper.resolve(l.account);
      const amount = num(l.amount);
      if (cat) prevByCat.set(cat.id, round2((prevByCat.get(cat.id) ?? 0) + amount));
      if (cat && cat.section === SECTION_PRODUITS) prevCaRaw += amount;
    }
  }

  const zero = () => Object.fromEntries(months.map((m) => [m, 0]));
  const acc = (target: Record<string, number>, src: Record<string, number>, sign = 1) => {
    for (const [m, v] of Object.entries(src)) target[m] = round2((target[m] ?? 0) + sign * v);
  };
  const total = (rec: Record<string, number>) =>
    round2(Object.values(rec).reduce((s, v) => s + v, 0));

  // sous-totaux par section (en "coût net" : produits inversés)
  const sectionNames = [...new Set(mapper.categories.map((c) => c.section))];
  const sections: SyntheseSection[] = [];
  const netBySection = new Map<string, Record<string, number>>();

  for (const name of sectionNames) {
    const cats = mapper.categories.filter((c) => c.section === name);
    const sectionSign = name === SECTION_PRODUITS ? -1 : 1;
    const subtotal = zero();
    const rows: SyntheseRow[] = [];
    for (const cat of cats) {
      const raw = rawByCat.get(cat.id) ?? {};
      const monthly = zero();
      acc(monthly, raw, cat.sign);
      acc(subtotal, raw, sectionSign);
      rows.push({
        category: cat,
        monthly,
        total: total(monthly),
        pctCa: null, // rempli après calcul du CA
        prevTotal: prevImp ? round2((prevByCat.get(cat.id) ?? 0) * cat.sign) : null,
      });
    }
    netBySection.set(name, subtotal);
    sections.push({ name, rows, subtotal: { monthly: subtotal, total: total(subtotal) } });
  }

  const caTotalMonthly = netBySection.get(SECTION_PRODUITS) ?? zero();
  const exploitationMonthly = netBySection.get(SECTION_EXPLOITATION) ?? zero();
  const personnelMonthly = netBySection.get(SECTION_PERSONNEL) ?? zero();
  const fxMonthly = netBySection.get(SECTION_FX) ?? zero();

  const resultatExploitationMonthly = zero();
  acc(resultatExploitationMonthly, caTotalMonthly);
  acc(resultatExploitationMonthly, exploitationMonthly, -1);
  acc(resultatExploitationMonthly, personnelMonthly, -1);

  const resultatNetMonthly = zero();
  acc(resultatNetMonthly, resultatExploitationMonthly);
  acc(resultatNetMonthly, fxMonthly, -1);

  const caTotal = total(caTotalMonthly);
  for (const s of sections) {
    for (const r of s.rows) {
      r.pctCa = caTotal !== 0 ? round2((r.total / caTotal) * 100) : null;
    }
  }

  return {
    fiscalYearStart: imp.fiscalYearStart,
    months,
    monthsWithData,
    period: monthsWithData[monthsWithData.length - 1] ?? imp.period,
    sections,
    caTotal: { monthly: caTotalMonthly, total: caTotal },
    totalChargesExploitation: {
      monthly: exploitationMonthly,
      total: total(exploitationMonthly),
    },
    totalChargesPersonnel: {
      monthly: personnelMonthly,
      total: total(personnelMonthly),
    },
    resultatExploitation: {
      monthly: resultatExploitationMonthly,
      total: total(resultatExploitationMonthly),
    },
    totalFx: { monthly: fxMonthly, total: total(fxMonthly) },
    resultatNet: { monthly: resultatNetMonthly, total: total(resultatNetMonthly) },
    unmapped: [...unmappedMap.entries()].map(([account, v]) => ({
      account,
      label: v.label,
      total: v.total,
    })),
    hasPrevYear: !!prevImp,
    prevCaTotal: prevImp ? round2(-prevCaRaw) : null,
    importId: imp.id,
  };
}

// ── Vue Chantiers ────────────────────────────────────────────────────────────

export type ChantierRow = {
  centreCode: string;
  centreLabel: string;
  pole: string | null;
  annulation: number; // reprise TEC M-1 (négatif)
  prevision: number; // TEC provision M
  previsionManuelle: { value: number; status: "draft" | "final" } | null;
  facture: number; // facturation réelle du mois
  totalProduits: number;
  achatsMp: number;
  sousTraitance: number;
  autresCharges: number; // dont intérim et personnel affecté
  resultat: number;
  note: string | null;
};

export type ChantiersData = {
  period: string;
  prevPeriod: string | null; // snapshot précédent (delta) ; null = cumul depuis le début
  rows: ChantierRow[];
  totals: Omit<ChantierRow, "centreCode" | "centreLabel" | "pole" | "note" | "previsionManuelle">;
  poles: string[];
  importId: number;
};

export async function getChantiers(
  entity: Entity,
  opts?: { period?: string }
): Promise<ChantiersData | null> {
  const imp = await latestValidatedImport(entity.id, "analytique", {
    atPeriod: opts?.period,
  });
  if (!imp) return null;
  const prevImp = await latestValidatedImport(entity.id, "analytique", {
    beforePeriod: imp.period,
  });

  const current = await db
    .select()
    .from(tables.analyticLines)
    .where(eq(tables.analyticLines.importId, imp.id));
  const previous = prevImp
    ? await db
        .select()
        .from(tables.analyticLines)
        .where(eq(tables.analyticLines.importId, prevImp.id))
    : [];

  // delta M = snapshot M − snapshot M-1, par centre × compte
  const key = (c: string, a: string) => `${c}|${a}`;
  const prevMap = new Map<string, { debit: number; credit: number; solde: number }>();
  for (const l of previous) {
    prevMap.set(key(l.centreCode, l.account), {
      debit: num(l.debit),
      credit: num(l.credit),
      solde: num(l.solde),
    });
  }

  const mapper = await loadMapper("chantier", entity.id, entity.code);

  const rowsMap = new Map<string, ChantierRow>();
  const blank = (code: string, label: string): ChantierRow => ({
    centreCode: code,
    centreLabel: label,
    pole: poleOf(code),
    annulation: 0,
    prevision: 0,
    previsionManuelle: null,
    facture: 0,
    totalProduits: 0,
    achatsMp: 0,
    sousTraitance: 0,
    autresCharges: 0,
    resultat: 0,
    note: null,
  });

  for (const l of current) {
    if (l.centreCode === "FX") continue; // frais généraux : vue dédiée
    const prev = prevMap.get(key(l.centreCode, l.account));
    const dDebit = round2(num(l.debit) - (prev?.debit ?? 0));
    const dCredit = round2(num(l.credit) - (prev?.credit ?? 0));
    const dSolde = round2(num(l.solde) - (prev?.solde ?? 0));
    if (dDebit === 0 && dCredit === 0 && dSolde === 0) continue;

    const row = rowsMap.get(l.centreCode) ?? blank(l.centreCode, l.centreLabel);
    rowsMap.set(l.centreCode, row);

    if (l.account.startsWith("713")) {
      // travaux en cours : débit = annulation de la provision M-1, crédit = provision M
      row.annulation = round2(row.annulation - dDebit);
      row.prevision = round2(row.prevision + dCredit);
    } else if (l.account.startsWith("7")) {
      row.facture = round2(row.facture - dSolde); // solde créditeur → positif
    } else {
      const cat = mapper.resolve(l.account);
      const code = cat?.code ?? "cha_autres_charges";
      if (code === "cha_achats_mp") row.achatsMp = round2(row.achatsMp + dSolde);
      else if (code === "cha_sous_traitance")
        row.sousTraitance = round2(row.sousTraitance + dSolde);
      else row.autresCharges = round2(row.autresCharges + dSolde);
    }
  }

  // saisies manuelles du mois (provision brouillon/figé + notes)
  const manual = await db
    .select()
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entity.id),
        eq(tables.manualEntries.period, imp.period)
      )
    );
  for (const m of manual) {
    if (!m.centreCode) continue;
    const row = rowsMap.get(m.centreCode);
    if (!row) continue;
    if (m.field === "tec_provision" && m.valueNum != null) {
      row.previsionManuelle = {
        value: num(m.valueNum),
        status: m.status as "draft" | "final",
      };
    }
    if (m.field === "note") row.note = m.valueText;
  }

  for (const row of rowsMap.values()) {
    const prevision = row.previsionManuelle?.value ?? row.prevision;
    row.totalProduits = round2(row.facture + prevision + row.annulation);
    row.resultat = round2(
      row.totalProduits - row.achatsMp - row.sousTraitance - row.autresCharges
    );
  }

  const rows = [...rowsMap.values()].sort((a, b) =>
    (a.pole ?? "Z").localeCompare(b.pole ?? "Z") || a.centreCode.localeCompare(b.centreCode)
  );

  const totals = rows.reduce(
    (t, r) => ({
      annulation: round2(t.annulation + r.annulation),
      prevision: round2(t.prevision + (r.previsionManuelle?.value ?? r.prevision)),
      facture: round2(t.facture + r.facture),
      totalProduits: round2(t.totalProduits + r.totalProduits),
      achatsMp: round2(t.achatsMp + r.achatsMp),
      sousTraitance: round2(t.sousTraitance + r.sousTraitance),
      autresCharges: round2(t.autresCharges + r.autresCharges),
      resultat: round2(t.resultat + r.resultat),
    }),
    {
      annulation: 0,
      prevision: 0,
      facture: 0,
      totalProduits: 0,
      achatsMp: 0,
      sousTraitance: 0,
      autresCharges: 0,
      resultat: 0,
    }
  );

  return {
    period: imp.period,
    prevPeriod: prevImp?.period ?? null,
    rows,
    totals,
    poles: [...new Set(rows.map((r) => r.pole).filter((p): p is string => !!p))].sort(),
    importId: imp.id,
  };
}

// ── Vue Frais généraux ───────────────────────────────────────────────────────

export type FxRow = {
  category: Category;
  ytd: number; // cumul exercice (snapshot analytique, centre FX)
  mois: number; // delta M vs M-1
  pctCa: number | null;
  accounts: { account: string; label: string; ytd: number }[];
};

export type FxData = {
  period: string;
  prevPeriod: string | null;
  sections: { name: string; rows: FxRow[]; subtotal: { ytd: number; mois: number } }[];
  totalYtd: number;
  totalMois: number;
  caReference: number | null; // CA YTD depuis la ventilée, base des ratios
  unmapped: { account: string; label: string; ytd: number }[];
  importId: number;
};

export async function getFx(
  entity: Entity,
  opts?: { period?: string }
): Promise<FxData | null> {
  const imp = await latestValidatedImport(entity.id, "analytique", {
    atPeriod: opts?.period,
  });
  if (!imp) return null;
  const prevImp = await latestValidatedImport(entity.id, "analytique", {
    beforePeriod: imp.period,
  });

  const load = async (importId: number) =>
    (
      await db
        .select()
        .from(tables.analyticLines)
        .where(eq(tables.analyticLines.importId, importId))
    ).filter((l) => l.centreCode === "FX");

  const current = await load(imp.id);
  const prevMap = new Map<string, number>();
  if (prevImp) {
    for (const l of await load(prevImp.id)) prevMap.set(l.account, num(l.solde));
  }

  const mapper = await loadMapper("fx", entity.id, entity.code);
  const byCat = new Map<
    number,
    { ytd: number; mois: number; accounts: Map<string, { label: string; ytd: number }> }
  >();
  const unmapped = new Map<string, { label: string; ytd: number }>();

  for (const l of current) {
    const solde = num(l.solde);
    const mois = round2(solde - (prevMap.get(l.account) ?? 0));
    const cat = mapper.resolve(l.account);
    if (!cat) {
      const prev = unmapped.get(l.account);
      unmapped.set(l.account, { label: l.label, ytd: round2((prev?.ytd ?? 0) + solde) });
      continue;
    }
    const rec =
      byCat.get(cat.id) ?? { ytd: 0, mois: 0, accounts: new Map() };
    rec.ytd = round2(rec.ytd + solde);
    rec.mois = round2(rec.mois + mois);
    const accPrev = rec.accounts.get(l.account);
    rec.accounts.set(l.account, { label: l.label, ytd: round2((accPrev?.ytd ?? 0) + solde) });
    byCat.set(cat.id, rec);
  }

  // CA de référence pour les ratios : ventilée du même exercice, produits (70/71/75),
  // cumulés jusqu'au mois affiché (pour que %/CA reste cohérent sur un mois passé)
  const ventilee = await latestValidatedImport(entity.id, "ventilee", {
    fiscalYearStart: imp.fiscalYearStart,
  });
  let caReference: number | null = null;
  if (ventilee) {
    const lines = await db
      .select()
      .from(tables.generalBalanceLines)
      .where(eq(tables.generalBalanceLines.importId, ventilee.id));
    caReference = round2(
      -lines
        .filter((l) => /^7(0|1|5)/.test(l.account) && l.month <= imp.period)
        .reduce((s, l) => s + num(l.amount), 0)
    );
  }

  const sectionNames = [...new Set(mapper.categories.map((c) => c.section))];
  const sections = sectionNames.map((name) => {
    const rows: FxRow[] = mapper.categories
      .filter((c) => c.section === name)
      .map((cat) => {
        const rec = byCat.get(cat.id);
        const ytd = rec?.ytd ?? 0;
        return {
          category: cat,
          ytd,
          mois: rec?.mois ?? 0,
          pctCa: caReference ? round2((ytd / caReference) * 100) : null,
          accounts: rec
            ? [...rec.accounts.entries()].map(([account, v]) => ({ account, ...v }))
            : [],
        };
      })
      .filter((r) => r.ytd !== 0 || r.mois !== 0);
    return {
      name,
      rows,
      subtotal: {
        ytd: round2(rows.reduce((s, r) => s + r.ytd, 0)),
        mois: round2(rows.reduce((s, r) => s + r.mois, 0)),
      },
    };
  });

  return {
    period: imp.period,
    prevPeriod: prevImp?.period ?? null,
    sections,
    totalYtd: round2(sections.reduce((s, x) => s + x.subtotal.ytd, 0)),
    totalMois: round2(sections.reduce((s, x) => s + x.subtotal.mois, 0)),
    caReference,
    unmapped: [...unmapped.entries()].map(([account, v]) => ({ account, ...v })),
    importId: imp.id,
  };
}
