import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  ParsedAnalytique,
  ParsedVentilee,
  fiscalYearOf,
  parseBalanceFile,
  poleOf,
} from "./parsers";
import { loadMapper } from "./mapping";
import { Entity } from "./finance";

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string | number | null | undefined) =>
  v == null ? 0 : typeof v === "number" ? v : parseFloat(v);

export type ImportSummary = {
  type: "ventilee" | "analytique";
  lineCount: number;
  accountCount: number;
  period: string;
  fiscalYearStart: number;
  months?: string[];
  centreCount?: number;
  classChecks?: { class: string; fileTotal: number | null; computedTotal: number; ok: boolean }[];
  unmapped: { account: string; label: string; total: number; views: string[] }[];
  replaces: { id: number; fileName: string; period: string } | null;
};

// ── Création (statut preview) ────────────────────────────────────────────────

export async function createImportPreview(opts: {
  entity: Entity;
  buffer: Buffer;
  fileName: string;
  createdBy: string;
  /** requis pour l'analytique (le fichier ne contient pas sa période) */
  periodOverride?: string;
}): Promise<{ importId: number; summary: ImportSummary }> {
  const { entity, buffer, fileName, createdBy } = opts;
  const parsed = parseBalanceFile(buffer);
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  let period: string;
  let fiscalYearStart: number;
  if (parsed.type === "ventilee") {
    period = parsed.period;
    fiscalYearStart = parsed.fiscalYearStart;
  } else {
    if (!opts.periodOverride) {
      throw new Error(
        "La balance analytique ne contient pas sa période : sélectionnez le mois du snapshot."
      );
    }
    period = opts.periodOverride;
    fiscalYearStart = fiscalYearOf(period);
  }

  // comptes non mappés, par vue concernée
  const unmapped = await computeUnmapped(entity, parsed);

  // import précédent qui serait remplacé à la validation
  const replaced = await findReplaceable(entity.id, parsed.type, period, fiscalYearStart);

  const summary: ImportSummary = {
    type: parsed.type,
    lineCount: parsed.lines.length,
    accountCount: parsed.accounts.length,
    period,
    fiscalYearStart,
    months: parsed.type === "ventilee" ? parsed.months : undefined,
    centreCount: parsed.type === "analytique" ? parsed.centres.length : undefined,
    classChecks: parsed.type === "ventilee" ? parsed.classTotals : undefined,
    unmapped,
    replaces: replaced
      ? { id: replaced.id, fileName: replaced.fileName, period: replaced.period }
      : null,
  };

  const [imp] = await db
    .insert(tables.imports)
    .values({
      entityId: entity.id,
      type: parsed.type,
      period,
      fiscalYearStart,
      fileName,
      fileHash,
      status: "preview",
      summary,
      createdBy,
    })
    .returning({ id: tables.imports.id });

  if (parsed.type === "ventilee") {
    await insertVentileeLines(imp.id, entity.id, parsed);
  } else {
    await insertAnalytiqueLines(imp.id, entity.id, period, parsed);
  }

  return { importId: imp.id, summary };
}

async function insertVentileeLines(
  importId: number,
  entityId: number,
  parsed: ParsedVentilee
) {
  const values = parsed.lines.map((l) => ({
    importId,
    entityId,
    account: l.account,
    label: l.label,
    month: l.month,
    amount: String(l.amount),
  }));
  for (let i = 0; i < values.length; i += 500) {
    await db.insert(tables.generalBalanceLines).values(values.slice(i, i + 500));
  }
}

async function insertAnalytiqueLines(
  importId: number,
  entityId: number,
  period: string,
  parsed: ParsedAnalytique
) {
  const values = parsed.lines.map((l) => ({
    importId,
    entityId,
    period,
    centreCode: l.centreCode,
    centreLabel: l.centreLabel,
    account: l.account,
    label: l.label,
    debit: String(l.debit),
    credit: String(l.credit),
    solde: String(l.solde),
  }));
  for (let i = 0; i < values.length; i += 500) {
    await db.insert(tables.analyticLines).values(values.slice(i, i + 500));
  }
}

async function computeUnmapped(
  entity: Entity,
  parsed: ParsedVentilee | ParsedAnalytique
) {
  const out = new Map<string, { label: string; total: number; views: Set<string> }>();
  const add = (account: string, label: string, amount: number, view: string) => {
    const rec = out.get(account) ?? { label, total: 0, views: new Set<string>() };
    rec.total = round2(rec.total + amount);
    rec.views.add(view);
    out.set(account, rec);
  };

  if (parsed.type === "ventilee") {
    const mapper = await loadMapper("synthese", entity.id, entity.code);
    for (const a of parsed.accounts) {
      if (mapper.resolve(a.account) == null) add(a.account, a.label, a.total, "synthese");
    }
  } else {
    // le mapping chantier s'applique aux centres chantiers, le mapping fx au centre FX
    const chantier = await loadMapper("chantier", entity.id, entity.code);
    const fx = await loadMapper("fx", entity.id, entity.code);
    for (const l of parsed.lines) {
      if (l.centreCode === "FX") {
        if (fx.resolve(l.account) == null) add(l.account, l.label, l.solde, "fx");
      } else {
        if (chantier.resolve(l.account) == null) add(l.account, l.label, l.solde, "chantier");
      }
    }
  }

  return [...out.entries()]
    .map(([account, v]) => ({
      account,
      label: v.label,
      total: v.total,
      views: [...v.views],
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

async function findReplaceable(
  entityId: number,
  type: "ventilee" | "analytique",
  period: string,
  fiscalYearStart: number
) {
  // ventilée : un nouvel export contient tout l'exercice → il remplace tout
  // import validé du même exercice. Analytique : remplace le même mois seulement.
  const conds = [
    eq(tables.imports.entityId, entityId),
    eq(tables.imports.type, type),
    eq(tables.imports.status, "validated"),
    type === "ventilee"
      ? eq(tables.imports.fiscalYearStart, fiscalYearStart)
      : eq(tables.imports.period, period),
  ];
  const rows = await db
    .select()
    .from(tables.imports)
    .where(and(...conds));
  return rows[0] ?? null;
}

// ── Validation ───────────────────────────────────────────────────────────────

export async function validateImport(importId: number) {
  const [imp] = await db
    .select()
    .from(tables.imports)
    .where(eq(tables.imports.id, importId));
  if (!imp || imp.status !== "preview") {
    throw new Error("Import introuvable ou déjà traité.");
  }

  // remplace la version précédente (idempotence des 2 mises à jour mensuelles)
  const replaced = await findReplaceable(
    imp.entityId,
    imp.type,
    imp.period,
    imp.fiscalYearStart
  );
  if (replaced) {
    await db
      .update(tables.imports)
      .set({ status: "replaced" })
      .where(eq(tables.imports.id, replaced.id));
    // les alertes de l'import remplacé sont regénérées par le nouveau
    await db
      .delete(tables.alerts)
      .where(
        and(eq(tables.alerts.importId, replaced.id), eq(tables.alerts.status, "open"))
      );
  }

  await db
    .update(tables.imports)
    .set({ status: "validated", validatedAt: new Date() })
    .where(eq(tables.imports.id, importId));

  // référentiel chantiers
  if (imp.type === "analytique") {
    const lines = await db
      .select()
      .from(tables.analyticLines)
      .where(eq(tables.analyticLines.importId, importId));
    const centres = new Map<string, string>();
    for (const l of lines) centres.set(l.centreCode, l.centreLabel);
    for (const [code, name] of centres) {
      await db
        .insert(tables.centres)
        .values({ entityId: imp.entityId, code, name, pole: poleOf(code) })
        .onConflictDoNothing();
    }
  }

  await generateAlerts(importId);
  return imp;
}

export async function rejectImport(importId: number) {
  // suppression pure : les lignes suivent par cascade
  await db.delete(tables.alerts).where(eq(tables.alerts.importId, importId));
  await db.delete(tables.imports).where(eq(tables.imports.id, importId));
}

// ── Alertes de cohérence ─────────────────────────────────────────────────────

/**
 * Clé de déduplication d'une alerte traitée : une alerte marquée « resolved »
 * ne renaît pas à l'import suivant tant que sa clé ne change pas.
 *  - compte_non_mappe → le compte (un compte explicitement ignoré reste ignoré ;
 *    il reste de toute façon listé à part dans les vues, rien n'est silencieux)
 *  - montant_constant → compte + montant (si le montant fixe change, nouvelle alerte)
 *  - mois_sans_donnees → le mois concerné
 *  - ecart_controle → jamais dédupliquée (erreur d'intégrité, toujours re-signalée)
 */
function alertDedupKey(a: {
  type: string;
  account?: string | null;
  amount?: string | null;
  period?: string | null;
}): string | null {
  switch (a.type) {
    case "compte_non_mappe":
      return `compte_non_mappe|${a.account}`;
    case "montant_constant":
      return `montant_constant|${a.account}|${a.amount}`;
    case "mois_sans_donnees":
      return `mois_sans_donnees|${a.period}`;
    default:
      return null;
  }
}

async function generateAlerts(importId: number) {
  const [imp] = await db
    .select()
    .from(tables.imports)
    .where(eq(tables.imports.id, importId));
  const summary = imp.summary as ImportSummary;
  const alerts: (typeof tables.alerts.$inferInsert)[] = [];

  // 1) comptes non mappés — jamais de classement par défaut
  for (const u of summary.unmapped) {
    alerts.push({
      entityId: imp.entityId,
      importId,
      type: "compte_non_mappe",
      severity: "warn",
      title: `Compte non mappé : ${u.account} — ${u.label}`,
      description: `Montant ${fmt(u.total)} € non affecté (vues : ${u.views.join(", ")}). À affecter dans l'écran Mapping.`,
      account: u.account,
      amount: String(round2(u.total)),
      period: imp.period,
    });
  }

  // 2) contrôles de classes (ventilée)
  for (const c of summary.classChecks ?? []) {
    if (!c.ok) {
      alerts.push({
        entityId: imp.entityId,
        importId,
        type: "ecart_controle",
        severity: "error",
        title: `Écart contrôle classe ${c.class}`,
        description: `Total fichier ${fmt(c.fileTotal ?? 0)} € vs recalculé ${fmt(c.computedTotal)} €.`,
        period: imp.period,
      });
    }
  }

  if (imp.type === "ventilee") {
    const lines = await db
      .select()
      .from(tables.generalBalanceLines)
      .where(eq(tables.generalBalanceLines.importId, importId));

    // 3) mois sans données dans l'exercice écoulé
    const monthsWithData = new Set(lines.map((l) => l.month));
    for (const m of summary.months ?? []) monthsWithData.add(m);
    const expected: string[] = [];
    for (let d = new Date(`${imp.fiscalYearStart}-11-01`); ; ) {
      const iso = d.toISOString().slice(0, 8) + "01";
      if (iso > imp.period) break;
      expected.push(iso);
      d.setMonth(d.getMonth() + 1);
    }
    for (const m of expected) {
      if (!monthsWithData.has(m)) {
        alerts.push({
          entityId: imp.entityId,
          importId,
          type: "mois_sans_donnees",
          severity: "warn",
          title: `Mois sans données : ${m.slice(0, 7)}`,
          description: "Aucune écriture dans la balance pour ce mois de l'exercice.",
          period: m,
        });
      }
    }

    // 4) montant strictement identique ≥ 3 mois consécutifs (cas Honoraires NJW)
    const byAccount = new Map<string, { label: string; months: Map<string, number> }>();
    for (const l of lines) {
      const rec = byAccount.get(l.account) ?? { label: l.label, months: new Map() };
      rec.months.set(l.month, num(l.amount));
      byAccount.set(l.account, rec);
    }
    const sortedMonths = [...new Set(lines.map((l) => l.month))].sort();
    for (const [account, rec] of byAccount) {
      let run = 1;
      for (let i = 1; i < sortedMonths.length; i++) {
        const cur = rec.months.get(sortedMonths[i]);
        const prev = rec.months.get(sortedMonths[i - 1]);
        if (cur != null && prev != null && cur === prev && cur !== 0) run++;
        else run = 1;
        if (run === 3) {
          alerts.push({
            entityId: imp.entityId,
            importId,
            type: "montant_constant",
            severity: "warn",
            title: `${account} — ${rec.label} : montant fixe sur ${run}+ mois`,
            description: `${fmt(cur!)} € identiques plusieurs mois consécutifs — à vérifier (abonnement, forfait ou erreur de saisie).`,
            account,
            amount: String(round2(cur!)),
            period: imp.period,
          });
          break;
        }
      }
    }
  }

  // Dédup : ne pas recréer une alerte déjà traitée (une décision « c'est normal »
  // persiste d'un mois sur l'autre), ni dupliquer une alerte encore ouverte
  // levée par un import précédent (ex. snapshots analytiques successifs).
  const existing = await db
    .select({
      id: tables.alerts.id,
      status: tables.alerts.status,
      type: tables.alerts.type,
      account: tables.alerts.account,
      amount: tables.alerts.amount,
      period: tables.alerts.period,
    })
    .from(tables.alerts)
    .where(eq(tables.alerts.entityId, imp.entityId));
  const existingByKey = new Map(
    existing
      .map((a) => [alertDedupKey(a), a] as const)
      .filter((e): e is [string, (typeof existing)[number]] => e[0] != null)
  );

  const toInsert: typeof alerts = [];
  for (const a of alerts) {
    const key = alertDedupKey(a);
    const match = key ? existingByKey.get(key) : undefined;
    if (!match) {
      toInsert.push(a);
    } else if (match.status === "open" && a.type === "compte_non_mappe") {
      // l'alerte reste ouverte : on rafraîchit le montant cumulé et la période
      await db
        .update(tables.alerts)
        .set({ description: a.description, amount: a.amount, period: a.period })
        .where(eq(tables.alerts.id, match.id));
    }
  }

  if (toInsert.length > 0) {
    await db.insert(tables.alerts).values(toInsert);
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
}

// ── Résolution d'un compte non mappé (écran admin) ──────────────────────────

export async function assignAccountToCategory(opts: {
  entity: Entity;
  account: string;
  categoryId: number;
  matchType: "exact" | "prefix";
  createdBy: string;
}) {
  await db.insert(tables.accountRules).values({
    categoryId: opts.categoryId,
    entityId: opts.entity.id,
    pattern: opts.account,
    matchType: opts.matchType,
    createdBy: opts.createdBy,
  });
  // clore les alertes ouvertes de ce compte
  await db
    .update(tables.alerts)
    .set({ status: "resolved", resolvedBy: opts.createdBy, resolvedAt: new Date() })
    .where(
      and(
        eq(tables.alerts.entityId, opts.entity.id),
        eq(tables.alerts.type, "compte_non_mappe"),
        eq(tables.alerts.account, opts.account),
        eq(tables.alerts.status, "open")
      )
    );
}
