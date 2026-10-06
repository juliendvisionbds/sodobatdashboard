// Mise à niveau ciblée de la maquette et installation des règles d'une entité.
//
// `npm run db:nomenclature` remplace toute la nomenclature et efface les règles
// créées depuis l'écran Mapping : il ne convient plus à une base en service.
// Ce module fait le strict nécessaire, sans rien supprimer :
//   · il aligne les lignes de la maquette (table categories) sur le code —
//     lignes nouvelles ajoutées, libellés, formules, périmètres et ordre mis à
//     jour — sans toucher aux règles existantes ;
//   · il installe les règles propres à une entité, signées « seed:<entité> »,
//     et ne modifie jamais une règle créée par un utilisateur ;
//   · il ouvre l'entité (entities.active) et pose la nature des centres que le
//     code ne permet pas de déduire.
//
// Tout se calcule d'abord sous forme de plan, affichable sans écrire.

import { and, eq, inArray } from "drizzle-orm";
import { db, tables } from "./index";
import { nomenclature } from "../lib/nomenclature/sodobat";
import { auteurReglesEntite, entiteConfig } from "../lib/nomenclature/entites";
import { validateEntite, validateNomenclature } from "../lib/nomenclature/validate";
import type { NomenclatureLine } from "../lib/nomenclature/types";

type CategoryRow = typeof tables.categories.$inferSelect;

/** JSON à clés triées : PostgreSQL réordonne les clés d'un jsonb. */
function canonical(v: unknown): string {
  if (v == null) return "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/** Valeurs attendues en base pour une ligne de la maquette, à son rang dans le code. */
function expected(line: NomenclatureLine, sortOrder: number) {
  return {
    view: line.view,
    section: line.section,
    label: line.label,
    sortOrder,
    sign: line.sign ?? 1,
    entityScope: line.entityScope ?? "all",
    notes: line.notes ?? null,
    kind: line.kind,
    formula: line.formula ?? null,
    cumulative: line.cumulative ?? false,
    hidden: line.hidden ?? false,
  };
}

export type PlanLignes = {
  ajouts: { line: NomenclatureLine; sortOrder: number }[];
  /** lignes existantes dont un champ autre que le rang diffère du code */
  modifs: { cat: CategoryRow; sortOrder: number; line: NomenclatureLine; champs: string[] }[];
  /** lignes à renuméroter seulement */
  rangs: { cat: CategoryRow; sortOrder: number }[];
  /** lignes en base absentes du code : laissées telles quelles */
  horsCode: string[];
};

export async function planLignes(): Promise<PlanLignes> {
  const issues = validateNomenclature(nomenclature).filter((i) => i.severity === "error");
  if (issues.length) throw new Error(`nomenclature incohérente : ${issues[0].message}`);

  const cats = await db.select().from(tables.categories);
  const byCode = new Map(cats.map((c) => [c.code, c]));
  const plan: PlanLignes = { ajouts: [], modifs: [], rangs: [], horsCode: [] };

  nomenclature.forEach((line, i) => {
    const cat = byCode.get(line.code);
    if (!cat) {
      plan.ajouts.push({ line, sortOrder: i });
      return;
    }
    const want = expected(line, i);
    const champs = (Object.keys(want) as (keyof typeof want)[]).filter(
      (k) => k !== "sortOrder" && canonical(cat[k]) !== canonical(want[k])
    );
    if (champs.length) plan.modifs.push({ cat, sortOrder: i, line, champs });
    else if (cat.sortOrder !== i) plan.rangs.push({ cat, sortOrder: i });
  });
  plan.horsCode = cats
    .filter((c) => !nomenclature.some((l) => l.code === c.code))
    .map((c) => c.code);
  return plan;
}

export async function appliquerLignes(plan: PlanLignes) {
  await db.transaction(async (tx) => {
    for (const { line, sortOrder } of plan.ajouts) {
      const [inserted] = await tx
        .insert(tables.categories)
        .values({ code: line.code, active: true, ...expected(line, sortOrder) })
        .returning({ id: tables.categories.id });
      // Une ligne nouvelle arrive avec ses comptes communs au groupe.
      if (line.accounts?.length)
        await tx.insert(tables.accountRules).values(
          line.accounts.map((account) => ({
            categoryId: inserted.id,
            entityId: null,
            pattern: account,
            matchType: "exact" as const,
            createdBy: "seed",
          }))
        );
    }
    for (const { cat, sortOrder, line } of plan.modifs)
      await tx.update(tables.categories).set(expected(line, sortOrder)).where(eq(tables.categories.id, cat.id));
    for (const { cat, sortOrder } of plan.rangs)
      await tx.update(tables.categories).set({ sortOrder }).where(eq(tables.categories.id, cat.id));
  });
}

export type PlanEntite = {
  entity: typeof tables.entities.$inferSelect;
  /** règles à créer */
  ajouts: { code: string; categoryId: number; account: string }[];
  /** règles « seed:<entité> » à rattacher à un autre poste de la même vue */
  deplacees: { ruleId: number; account: string; from: string; to: string; categoryId: number }[];
  /** règles « seed:<entité> » que le code ne déclare plus */
  retirees: { ruleId: number; account: string; code: string }[];
  /** comptes qu'un utilisateur a déjà affectés autrement dans la même vue : sa règle est gardée */
  conflits: { account: string; code: string; existing: string; by: string | null }[];
  centres: { code: string; name: string; kind: "chantier" | "structure"; aliasOf?: string }[];
  activer: boolean;
};

export async function planEntite(entityCode: string): Promise<PlanEntite> {
  const config = entiteConfig(entityCode);
  const issues = validateEntite(entityCode, config, nomenclature);
  if (issues.length) throw new Error(issues[0].message);

  const [entity] = await db.select().from(tables.entities).where(eq(tables.entities.code, entityCode));
  if (!entity) throw new Error(`entité « ${entityCode} » absente de la base`);

  const cats = await db.select().from(tables.categories);
  const byCode = new Map(cats.map((c) => [c.code, c]));
  const byId = new Map(cats.map((c) => [c.id, c]));
  const rules = await db
    .select()
    .from(tables.accountRules)
    .where(and(eq(tables.accountRules.entityId, entity.id), eq(tables.accountRules.active, true)));
  const auteur = auteurReglesEntite(entityCode);

  const plan: PlanEntite = {
    entity,
    ajouts: [],
    deplacees: [],
    retirees: [],
    conflits: [],
    centres: [],
    activer: !entity.active,
  };
  const voulues = new Set<string>(); // « vue|compte » déclarés dans le code

  for (const [code, accounts] of Object.entries(config.regles)) {
    const cat = byCode.get(code);
    if (!cat) throw new Error(`ligne ${code} absente de la base : aligner la maquette d'abord`);
    for (const account of accounts) {
      voulues.add(`${cat.view}|${account}`);
      // Règle exacte de l'entité sur ce compte, dans la même vue.
      const existing = rules.find(
        (r) =>
          r.pattern === account &&
          r.matchType === "exact" &&
          byId.get(r.categoryId)?.view === cat.view
      );
      if (!existing) plan.ajouts.push({ code, categoryId: cat.id, account });
      else if (existing.categoryId === cat.id) continue;
      else if (existing.createdBy === auteur)
        plan.deplacees.push({
          ruleId: existing.id,
          account,
          from: byId.get(existing.categoryId)?.code ?? "?",
          to: code,
          categoryId: cat.id,
        });
      else
        plan.conflits.push({
          account,
          code,
          existing: byId.get(existing.categoryId)?.code ?? "?",
          by: existing.createdBy,
        });
    }
  }
  for (const r of rules) {
    if (r.createdBy !== auteur) continue;
    const cat = byId.get(r.categoryId);
    if (cat && !voulues.has(`${cat.view}|${r.pattern}`))
      plan.retirees.push({ ruleId: r.id, account: r.pattern, code: cat.code });
  }

  // Un centre déclaré est à poser s'il manque, ou si sa nature ou son
  // rattachement à un autre centre diffèrent de ce que porte la base.
  const centres = await db
    .select({ code: tables.centres.code, kind: tables.centres.kind, aliasOf: tables.centres.aliasOf })
    .from(tables.centres)
    .where(eq(tables.centres.entityId, entity.id));
  plan.centres = config.centres.filter((c) => {
    const x = centres.find((x) => x.code === c.code);
    return !x || x.kind !== c.kind || (x.aliasOf ?? null) !== (c.aliasOf ?? null);
  });
  return plan;
}

export async function appliquerEntite(plan: PlanEntite, entityCode: string) {
  const auteur = auteurReglesEntite(entityCode);
  await db.transaction(async (tx) => {
    if (plan.ajouts.length)
      await tx.insert(tables.accountRules).values(
        plan.ajouts.map((a) => ({
          categoryId: a.categoryId,
          entityId: plan.entity.id,
          pattern: a.account,
          matchType: "exact" as const,
          createdBy: auteur,
        }))
      );
    for (const d of plan.deplacees)
      await tx
        .update(tables.accountRules)
        .set({ categoryId: d.categoryId })
        .where(eq(tables.accountRules.id, d.ruleId));
    if (plan.retirees.length)
      await tx
        .delete(tables.accountRules)
        .where(inArray(tables.accountRules.id, plan.retirees.map((r) => r.ruleId)));
    // Le nom d'un centre déjà connu reste celui de la dernière balance importée ;
    // seuls sa nature et son rattachement viennent du code.
    for (const c of plan.centres)
      await tx
        .insert(tables.centres)
        .values({
          entityId: plan.entity.id,
          code: c.code,
          name: c.name,
          kind: c.kind,
          aliasOf: c.aliasOf ?? null,
        })
        .onConflictDoUpdate({
          target: [tables.centres.entityId, tables.centres.code],
          set: { kind: c.kind, aliasOf: c.aliasOf ?? null },
        });
    if (plan.activer)
      await tx.update(tables.entities).set({ active: true }).where(eq(tables.entities.id, plan.entity.id));
  });
}
