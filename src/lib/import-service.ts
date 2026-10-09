import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  PREFIXE_CENTRE_SANS_CODE,
  ParsedAnalytique,
  ParsedVentilee,
  fiscalMonths,
  fiscalYearOf,
  parseBalanceFile,
  periodFromFileName,
  poleOf,
} from "./parsers";
import { loadMapper } from "./mapping";
import { detectAsciiCentres } from "./centres-ascii";
import { COMPTES_TOUJOURS_FX } from "./nomenclature/codes";
import { debutExercice } from "./nomenclature/entites";
import { fiscalYearLabel } from "./format";
import { Entity, loadCentreKinds } from "./finance";

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
  /**
   * Balance analytique cumulée depuis l'ouverture de l'exercice : un exercice
   * clos entier, ou l'exercice en cours arrêté à un mois (`cumulMois`). Elle
   * donne le cumul des frais généraux — colonnes N, N-1 et N-2 — mais pas le
   * mouvement d'un mois : elle reste hors du cycle mensuel, n'apparaît pas
   * dans le choix du mois et n'entre pas dans les cumuls des chantiers.
   */
  annual?: boolean;
  /** nombre de mois couverts par une balance cumulée de l'exercice en cours */
  cumulMois?: number;
  /** export Pennylane : famille d'axes analytiques lue, et celles laissées de côté */
  famille?: { retenue: string; ignorees: string[] };
};

// ── Création (statut preview) ────────────────────────────────────────────────

export async function createImportPreview(opts: {
  entity: Entity;
  buffer: Buffer;
  fileName: string;
  createdBy: string;
  /** requis pour l'analytique (le fichier ne contient pas sa période) */
  periodOverride?: string;
  /** balance analytique d'un exercice clos entier (voir ImportSummary.annual) */
  annual?: boolean;
  /**
   * Accepte une ventilée qui s'arrête avant celle déjà validée : la DAF a
   * réédité les mois corrigés sans le dernier, qui sortira donc de la Synthèse
   * jusqu'à l'export suivant. Réservé à la ligne de commande.
   */
  allowOlder?: boolean;
}): Promise<{ importId: number; summary: ImportSummary }> {
  const { entity, buffer, fileName, createdBy } = opts;
  // L'exercice de l'entité situe chaque mois : ouvert en novembre chez Sodobat
  // et CovarBat, en janvier chez VBTP.
  const debut = debutExercice(entity.code);
  // Une balance annuelle (Quadra, sans colonne de mois) prend le mois indiqué
  // pour dernier mois de son exercice.
  const parsed = parseBalanceFile(buffer, { debutExercice: debut, periode: opts.periodOverride });
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // Un export de chiffre d'affaires par chantier a les mêmes colonnes qu'une
  // balance analytique et passe donc le parseur. Mais sans aucune charge, ce
  // n'est pas un instantané mensuel : l'importer comme un mois ferait exploser
  // les écarts M − M-1 de la vue Chantiers.
  if (parsed.type === "analytique" && !parsed.accounts.some((a) => a.account.startsWith("6"))) {
    throw new Error(
      "Ce fichier ne contient que des comptes de produits (classe 7) : ce n'est pas une " +
        "balance analytique mensuelle, mais un export de chiffre d'affaires par chantier. " +
        "L'importer comme un mois fausserait toute la vue Chantiers."
    );
  }

  let period: string;
  let fiscalYearStart: number;
  let annual = !!opts.annual;
  let cumulMois: number | undefined;
  if (parsed.type === "ventilee") {
    period = parsed.period;
    fiscalYearStart = parsed.fiscalYearStart;
    // Une balance annuelle est l'exercice clos entier : elle donne le total de
    // l'exercice (N-1 de la Synthèse, CA de référence des frais généraux) mais
    // aucun mois, et reste hors du cycle mensuel comme une analytique annuelle.
    annual = !!parsed.annuelle;
  } else {
    // Un export Pennylane porte sa période dans son nom, et il est cumulé sur
    // toute cette période. L'application lit une balance analytique comme le
    // mouvement d'UN mois ; un export de plusieurs mois n'entre que s'il part de
    // l'ouverture de l'exercice : c'est alors une balance cumulée, qui donne le
    // cumul des frais généraux mais pas le détail d'un mois.
    const lu = parsed.famille ? periodFromFileName(fileName) : null;
    if (lu && lu.months > 1) {
      const exercice = fiscalMonths(fiscalYearOf(lu.start, debut), debut);
      if (lu.start !== exercice[0] || !exercice.includes(lu.end))
        throw new Error(
          `Cet export couvre ${lu.months} mois (de ${lu.start.slice(0, 7)} à ${lu.end.slice(0, 7)}) ` +
            "sans partir de l'ouverture de l'exercice : ses montants cumulés ne correspondent ni à " +
            "un mois ni à un exercice. Exportez la balance analytique du mois seul (du 1er au " +
            "dernier jour), ou depuis l'ouverture de l'exercice."
        );
      annual = true;
      if (lu.months < 12) cumulMois = lu.months;
    }
    if (lu && opts.periodOverride && opts.periodOverride !== lu.end)
      throw new Error(
        `Le mois indiqué (${opts.periodOverride.slice(0, 7)}) n'est pas celui du fichier, ` +
          `exporté jusqu'à ${lu.end.slice(0, 7)}.`
      );
    const choisi = opts.periodOverride ?? lu?.end;
    if (!choisi) {
      throw new Error(
        "La balance analytique ne contient pas sa période : sélectionnez le mois de la balance."
      );
    }
    period = choisi;
    fiscalYearStart = fiscalYearOf(period, debut);
  }

  // Une balance cumulée et des balances mensuelles ne se mélangent pas : là où
  // les mois sont importés, ils font foi, et la cumulée prendrait la place du
  // mois sur lequel elle est arrêtée.
  if (parsed.type === "analytique" && annual) {
    const mensuelles = await db
      .select({ period: tables.imports.period, summary: tables.imports.summary })
      .from(tables.imports)
      .where(
        and(
          eq(tables.imports.entityId, entity.id),
          eq(tables.imports.type, "analytique"),
          eq(tables.imports.status, "validated"),
          eq(tables.imports.fiscalYearStart, fiscalYearStart)
        )
      );
    if (mensuelles.some((i) => !(i.summary as ImportSummary | null)?.annual))
      throw new Error(
        `Des balances analytiques mensuelles sont déjà validées pour l'exercice ` +
          `${fiscalYearLabel(fiscalYearStart, debut)} : une balance cumulée n'apporterait rien et ` +
          `remplacerait le mois de ${period.slice(0, 7)}. Importez plutôt la balance du mois seul.`
      );
  }

  // comptes non mappés, par vue concernée
  const unmapped = await computeUnmapped(entity, parsed);

  // import précédent qui serait remplacé à la validation
  const replaced = await findReplaceable(entity.id, parsed.type, period, fiscalYearStart);

  // Une ventilée remplace tout import validé du même exercice. Importer un export
  // plus ancien que celui déjà en place effacerait donc les mois les plus récents
  // (cas typique : la ventilée de mai importée après celle de juin).
  if (parsed.type === "ventilee" && replaced && replaced.period > period && !opts.allowOlder) {
    throw new Error(
      `Cet export s'arrête en ${period.slice(0, 7)}, alors qu'un export plus récent du même ` +
        `exercice est déjà validé (${replaced.fileName}, jusqu'à ${replaced.period.slice(0, 7)}). ` +
        `Le valider effacerait les mois les plus récents. Inutile de l'importer : l'export le ` +
        `plus récent contient déjà tout l'exercice.`
    );
  }

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
    ...(annual ? { annual: true } : {}),
    ...(cumulMois ? { cumulMois } : {}),
    ...(parsed.type === "analytique" && parsed.famille ? { famille: parsed.famille } : {}),
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
    // le mapping chantier s'applique aux centres chantiers, le mapping fx aux
    // centres de structure (FX, DEPOT, QUADRA…)
    const chantier = await loadMapper("chantier", entity.id, entity.code);
    const fx = await loadMapper("fx", entity.id, entity.code);
    const kindOf = await loadCentreKinds(entity.id);
    for (const l of parsed.lines) {
      // Dotations et VNC vont en frais généraux quel que soit le centre : le
      // contrôle doit suivre la même règle que les vues, sinon il signalerait
      // comme non mappé un compte parfaitement rattaché.
      if (kindOf(l.centreCode) === "structure" || COMPTES_TOUJOURS_FX.has(l.account)) {
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
      // Le libellé et le pôle suivent la dernière balance ; la classification
      // manuelle (kind) posée par un admin n'est jamais écrasée.
      await db
        .insert(tables.centres)
        .values({ entityId: imp.entityId, code, name, pole: poleOf(code) })
        .onConflictDoUpdate({
          target: [tables.centres.entityId, tables.centres.code],
          set: { name, pole: poleOf(code) },
        });
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
    case "centre_import_ascii":
      // Une alerte par centre fantôme et par mois : un réimport du même mois ne
      // la duplique pas, mais elle revient chaque mois tant que le centre subsiste
      // dans la balance — il faut qu'il soit corrigé dans Cegid pour disparaître.
      return `centre_import_ascii|${a.account}|${a.period}`;
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

  // 1) comptes non mappés, jamais de classement par défaut
  for (const u of summary.unmapped) {
    alerts.push({
      entityId: imp.entityId,
      importId,
      type: "compte_non_mappe",
      severity: "warn",
      title: `Compte non mappé : ${u.account} · ${u.label}`,
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

  // Un exercice complet (12 mois) n'est plus dans le cycle mensuel : « mois sans
  // données » et « montant constant » y seraient du bruit — un loyer fixe en 2022
  // n'appelle aucune action. Les contrôles d'intégrité, eux, valent pour tout
  // exercice. On se fie au contenu du fichier plutôt qu'à la date du jour, pour
  // que le résultat ne dépende pas du moment où l'import est fait.
  const exerciceClos = (summary.months?.length ?? 0) >= 12 || !!summary.annual;

  if (imp.type === "ventilee" && !exerciceClos) {
    const lines = await db
      .select()
      .from(tables.generalBalanceLines)
      .where(eq(tables.generalBalanceLines.importId, importId));

    // 3) mois sans données dans l'exercice écoulé
    const monthsWithData = new Set(lines.map((l) => l.month));
    for (const m of summary.months ?? []) monthsWithData.add(m);
    const [entite] = await db
      .select({ code: tables.entities.code })
      .from(tables.entities)
      .where(eq(tables.entities.id, imp.entityId));
    const expected = fiscalMonths(imp.fiscalYearStart, debutExercice(entite?.code ?? "")).filter(
      (m) => m <= imp.period
    );
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
            title: `${account} · ${rec.label} : montant fixe sur ${run}+ mois`,
            description: `${fmt(cur!)} € identiques plusieurs mois consécutifs : à vérifier (abonnement, forfait ou erreur de saisie).`,
            account,
            amount: String(round2(cur!)),
            period: imp.period,
          });
          break;
        }
      }
    }
  }

  // 5) centres créés à la volée par un import ASCII : faute de saisie du code
  //    chantier, les montants sont rangés sur un centre fantôme
  if (imp.type === "analytique") {
    const anaLines = await db
      .select()
      .from(tables.analyticLines)
      .where(eq(tables.analyticLines.importId, importId));
    // Référentiel complet : le vrai chantier peut ne pas avoir bougé ce mois-ci.
    const connus = await db
      .select({ code: tables.centres.code, name: tables.centres.name, aliasOf: tables.centres.aliasOf })
      .from(tables.centres)
      .where(eq(tables.centres.entityId, imp.entityId));
    const aliasOf = new Map(connus.filter((c) => c.aliasOf).map((c) => [c.code, c.aliasOf!]));

    // 5 bis) centres que l'export Pennylane ne numérote pas : écritures sans axe
    //    analytique, ou plusieurs chantiers confondus sous un même libellé
    const sansCode = new Map<string, { label: string; lignes: number; produits: number; charges: number }>();
    for (const l of anaLines) {
      if (!l.centreCode.startsWith(PREFIXE_CENTRE_SANS_CODE)) continue;
      const e = sansCode.get(l.centreCode) ?? { label: l.centreLabel, lignes: 0, produits: 0, charges: 0 };
      e.lignes++;
      if (l.account.startsWith("7")) e.produits -= num(l.solde);
      else if (l.account.startsWith("6")) e.charges += num(l.solde);
      sansCode.set(l.centreCode, e);
    }
    for (const [code, e] of sansCode) {
      if (!round2(e.produits) && !round2(e.charges)) continue;
      // Rattaché par l'application (centres.alias_of) au numéro de chantier que
      // lui donne le tableau de gestion : les écrans sont justes, le code reste
      // à poser dans Pennylane.
      const rattache = aliasOf.get(code);
      alerts.push({
        entityId: imp.entityId,
        importId,
        type: "centre_import_ascii",
        severity: rattache ? "info" : "warn",
        title: rattache
          ? `Centre sans code analytique : « ${e.label} », lu comme ${rattache} par l'application`
          : `Centre sans code analytique : « ${e.label} »`,
        description:
          `${fmt(e.produits)} € de produits et ${fmt(e.charges)} € de charges (${e.lignes} ligne${e.lignes > 1 ? "s" : ""}) ` +
          `sont exportés par Pennylane sans code analytique` +
          (rattache
            ? `. L'application les rattache au chantier ${rattache} : les écrans sont justes. ` +
              `Donner ce code au chantier dans Pennylane pour que la comptabilité le porte elle-même.`
            : ` : écritures non affectées, ou chantiers confondus sous un même libellé. ` +
              `L'application ne peut pas les répartir : affecter ces écritures, ou donner à chaque ` +
              `chantier un code et un libellé qui lui sont propres dans Pennylane.`),
        account: code,
        amount: String(round2(Math.abs(e.produits) + Math.abs(e.charges))),
        period: imp.period,
      });
    }

    const fantomes = detectAsciiCentres(
      anaLines
        .filter((l) => !l.centreCode.startsWith(PREFIXE_CENTRE_SANS_CODE))
        .map((l) => ({
          centreCode: l.centreCode,
          centreLabel: l.centreLabel,
          account: l.account,
          solde: num(l.solde),
        })),
      connus
    );
    for (const f of fantomes) {
      const montants = [
        f.produits ? `${fmt(f.produits)} € de produits` : null,
        f.charges ? `${fmt(f.charges)} € de charges` : null,
      ]
        .filter(Boolean)
        .join(" et ");
      const unique = f.jumeaux.length === 1 ? f.jumeaux[0] : null;
      const jumeau =
        f.jumeaux.length === 0
          ? "Aucun chantier connu ne porte ce numéro : à identifier avec le cabinet."
          : unique
            ? `Chantier probable : ${unique.code} · ${unique.name}.`
            : `Chantiers possibles : ${f.jumeaux.map((j) => `${j.code} · ${j.name}`).join(", ")}.`;
      // Rattaché par l'application (centres.alias_of) : les écrans sont justes,
      // la correction dans Cegid reste souhaitable pour la comptabilité elle-même.
      const rattache = aliasOf.get(f.code);
      alerts.push({
        entityId: imp.entityId,
        importId,
        type: "centre_import_ascii",
        severity: rattache ? "info" : "warn",
        title: rattache
          ? `Centre créé par import ASCII : ${f.code}, lu comme ${rattache} par l'application`
          : `Centre créé par import ASCII : ${f.code}${unique ? ` → probablement ${unique.code}` : ""}`,
        description:
          `${montants || "Aucun montant"} imputé(s) à un centre que Cegid a créé à la volée ` +
          `(${f.lignes} ligne${f.lignes > 1 ? "s" : ""}). ` +
          (rattache
            ? `L'application rattache ces montants au chantier ${rattache} : les écrans sont justes. ` +
              `La correction du code centre dans Cegid reste à faire pour la comptabilité.`
            : `${jumeau} Faire corriger le code centre dans Cegid : tant qu'il subsiste, ces montants manquent au bon chantier.`),
        // La colonne « account » porte ici le code du centre fantôme : c'est la
        // clé de déduplication de ce type d'alerte.
        account: f.code,
        amount: String(round2(Math.abs(f.produits) + Math.abs(f.charges))),
        period: imp.period,
      });
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
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n).replace(/\u202f/g, "\u00a0");
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
