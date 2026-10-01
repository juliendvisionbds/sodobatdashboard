import { cache } from "react";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, tables } from "@/db";

import type { Formula, LineKind } from "@/lib/nomenclature/types";
import { ENTITE_DE_REFERENCE, entiteConfig } from "@/lib/nomenclature/entites";

export type View = "synthese" | "chantier" | "fx";

export type Category = {
  id: number;
  code: string;
  view: View;
  section: string;
  label: string;
  sign: number;
  sortOrder: number;
  entityScope: string;
  notes: string | null;
  kind: LineKind;
  formula: Formula | null;
  cumulative: boolean;
  active: boolean;
  hidden: boolean;
};

export type Rule = {
  categoryId: number;
  pattern: string;
  matchType: "exact" | "prefix";
  entityId: number | null;
};

/** La ligne concerne-t-elle cette entité ? ("all" ou liste de codes) */
export function inEntityScope(entityScope: string, entityCode: string): boolean {
  return (
    entityScope === "all" ||
    entityScope.split(",").map((s) => s.trim()).includes(entityCode)
  );
}

/** Identifiant de l'entité de référence du groupe, dont les règles valent par défaut. */
export const referenceEntityId = cache(async function referenceEntityId(): Promise<number | null> {
  const [row] = await db
    .select({ id: tables.entities.id })
    .from(tables.entities)
    .where(eq(tables.entities.code, ENTITE_DE_REFERENCE));
  return row?.id ?? null;
});

/**
 * Rang d'une règle pour une entité : la sienne d'abord, puis celle de l'entité
 * de référence, puis la règle commune du groupe.
 */
export function ruleRank(
  ruleEntityId: number | null,
  entityId: number,
  referenceId: number | null
): number {
  if (ruleEntityId === entityId) return 3;
  if (ruleEntityId != null && ruleEntityId === referenceId) return 2;
  return 1;
}

/**
 * Poste suggéré pour un compte inconnu : celui du compte déjà affecté qui
 * partage avec lui le plus long début de numéro (au moins la sous-classe à
 * trois chiffres). C'est une proposition à valider, jamais un classement.
 */
export function suggestCategory<R extends { pattern: string; matchType: string; categoryId: number }>(
  account: string,
  rules: R[]
): { rule: R; commun: number } | null {
  let best: { rule: R; commun: number } | null = null;
  for (const rule of rules) {
    if (rule.matchType !== "exact") continue;
    let commun = 0;
    while (commun < account.length && account[commun] === rule.pattern[commun]) commun++;
    if (commun >= 3 && (!best || commun > best.commun)) best = { rule, commun };
  }
  return best;
}

export type Mapper = {
  /** postes alimentés par les comptes, dans l'ordre de la maquette */
  categories: Category[];
  /** toutes les lignes de la vue (postes + totaux + ratios), dans l'ordre */
  lines: Category[];
  /** catégorie d'un compte, ou null si non mappé (exact > préfixe le plus long) */
  resolve: (account: string) => Category | null;
};

// Mémoïsé par requête : chaque vue, et la Synthèse à travers les frais généraux
// et les objectifs, relit la même nomenclature.
export const loadMapper = cache(async function loadMapper(
  view: View,
  entityId: number,
  entityCode: string
): Promise<Mapper> {
  const cats = (await db
    .select()
    .from(tables.categories)
    .where(eq(tables.categories.view, view))) as Category[];

  // La maquette est commune au groupe : une entité n'en retient que les lignes
  // qui la concernent, sous ses propres libellés quand ils diffèrent.
  const { libelles } = entiteConfig(entityCode);
  const inScope = cats
    .filter((c) => c.active && inEntityScope(c.entityScope, entityCode))
    .map((c) => (libelles[c.code] ? { ...c, label: libelles[c.code] } : c));
  inScope.sort((a, b) => a.sortOrder - b.sortOrder);

  // Seuls les postes sont résolvables : les totaux, ratios et lignes saisies
  // n'ont pas de compte et ne doivent jamais capter une écriture.
  const postes = inScope.filter((c) => c.kind === "poste");
  const byId = new Map(postes.map((c) => [c.id, c]));
  const referenceId = await referenceEntityId();

  const rules =
    postes.length === 0
      ? []
      : ((await db
          .select({
            categoryId: tables.accountRules.categoryId,
            pattern: tables.accountRules.pattern,
            matchType: tables.accountRules.matchType,
            entityId: tables.accountRules.entityId,
          })
          .from(tables.accountRules)
          .where(
            and(
              inArray(tables.accountRules.categoryId, [...byId.keys()]),
              eq(tables.accountRules.active, true),
              or(
                isNull(tables.accountRules.entityId),
                eq(tables.accountRules.entityId, entityId),
                ...(referenceId != null ? [eq(tables.accountRules.entityId, referenceId)] : [])
              )
            )
          )) as Rule[]);

  // Précédence : exacte > préfixe le plus long ; à pattern égal, la règle de
  // l'entité l'emporte sur celle de l'entité de référence (Sodobat), qui
  // l'emporte sur la règle commune du groupe.
  const rank = (r: { entityId: number | null }) => ruleRank(r.entityId, entityId, referenceId);
  const exact = new Map<string, { categoryId: number; rank: number }>();
  for (const r of rules) {
    if (r.matchType !== "exact") continue;
    const held = exact.get(r.pattern);
    if (!held || rank(r) > held.rank) exact.set(r.pattern, { categoryId: r.categoryId, rank: rank(r) });
  }
  const prefixes = rules
    .filter((r) => r.matchType === "prefix")
    .map((r) => ({ pattern: r.pattern, categoryId: r.categoryId, rank: rank(r) }));
  prefixes.sort((a, b) => b.pattern.length - a.pattern.length || b.rank - a.rank);

  const cache = new Map<string, Category | null>();
  const resolve = (account: string): Category | null => {
    if (cache.has(account)) return cache.get(account)!;
    let result: Category | null = null;
    const exactHit = exact.get(account);
    if (exactHit != null) {
      result = byId.get(exactHit.categoryId) ?? null;
    } else {
      for (const p of prefixes) {
        if (account.startsWith(p.pattern)) {
          result = byId.get(p.categoryId) ?? null;
          break;
        }
      }
    }
    cache.set(account, result);
    return result;
  };

  return { categories: postes, lines: inScope, resolve };
});
