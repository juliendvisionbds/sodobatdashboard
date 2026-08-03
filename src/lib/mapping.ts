import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, tables } from "@/db";

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
};

export type Rule = {
  categoryId: number;
  pattern: string;
  matchType: "exact" | "prefix";
};

export type Mapper = {
  categories: Category[];
  /** catégorie d'un compte, ou null si non mappé (exact > préfixe le plus long) */
  resolve: (account: string) => Category | null;
};

export async function loadMapper(
  view: View,
  entityId: number,
  entityCode: string
): Promise<Mapper> {
  const cats = (await db
    .select()
    .from(tables.categories)
    .where(eq(tables.categories.view, view))) as Category[];

  const inScope = cats.filter(
    (c) =>
      c.entityScope === "all" ||
      c.entityScope.split(",").map((s) => s.trim()).includes(entityCode)
  );
  inScope.sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(inScope.map((c) => [c.id, c]));

  const rules =
    inScope.length === 0
      ? []
      : ((await db
          .select({
            categoryId: tables.accountRules.categoryId,
            pattern: tables.accountRules.pattern,
            matchType: tables.accountRules.matchType,
          })
          .from(tables.accountRules)
          .where(
            and(
              inArray(tables.accountRules.categoryId, [...byId.keys()]),
              or(
                isNull(tables.accountRules.entityId),
                eq(tables.accountRules.entityId, entityId)
              )
            )
          )) as Rule[]);

  const exact = new Map<string, number>();
  const prefixes: { pattern: string; categoryId: number }[] = [];
  for (const r of rules) {
    if (r.matchType === "exact") exact.set(r.pattern, r.categoryId);
    else prefixes.push({ pattern: r.pattern, categoryId: r.categoryId });
  }
  // préfixe le plus long en premier
  prefixes.sort((a, b) => b.pattern.length - a.pattern.length);

  const cache = new Map<string, Category | null>();
  const resolve = (account: string): Category | null => {
    if (cache.has(account)) return cache.get(account)!;
    let result: Category | null = null;
    const exactHit = exact.get(account);
    if (exactHit != null) {
      result = byId.get(exactHit) ?? null;
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

  return { categories: inScope, resolve };
}
