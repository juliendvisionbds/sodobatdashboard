// Installation de la nomenclature Sodobat.
//
//   npm run db:nomenclature -- --dry-run          → rapport seul, aucune écriture
//   npm run db:nomenclature                       → remplace la nomenclature
//   npm run db:nomenclature -- --only-if-changed  → ne fait rien si elle est à jour
//
// Remplacement intégral : les catégories et les règles de mapping (y compris
// celles créées par les utilisateurs) sont réécrites depuis
// src/lib/nomenclature/sodobat.ts. Aucune donnée importée n'est touchée —
// balances, imports, saisies manuelles et alertes sont conservés, et les vues se
// recalculent à la volée sans réimport.
//
// Le rapport final liste les comptes présents dans les imports validés que la
// nouvelle nomenclature ne couvre pas : ils remonteraient en « compte non mappé ».
//
// --only-if-changed est le mode utilisé au démarrage du conteneur : il compare la
// nomenclature en base à celle du code et s'abstient si elles coïncident, pour ne
// pas effacer à chaque redémarrage les règles créées depuis l'écran Mapping.

import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db, tables } from "./index";
import { nomenclature } from "../lib/nomenclature/sodobat";
import { accountsOfView, validateNomenclature } from "../lib/nomenclature/validate";
import { classifyCentre } from "../lib/parsers";
import { COMPTES_TOUJOURS_FX } from "../lib/nomenclature/codes";
import type { View } from "../lib/nomenclature/types";

const VIEWS: View[] = ["synthese", "chantier", "fx"];

/** Comptes réellement présents dans les imports validés, par vue. */
async function accountsInUse(): Promise<Record<View, Map<string, string>>> {
  const out: Record<View, Map<string, string>> = {
    synthese: new Map(),
    chantier: new Map(),
    fx: new Map(),
  };

  const validated = await db
    .select({ id: tables.imports.id, type: tables.imports.type })
    .from(tables.imports)
    .where(eq(tables.imports.status, "validated"));
  if (validated.length === 0) return out;

  const ventileeIds = validated.filter((i) => i.type === "ventilee").map((i) => i.id);
  const analytiqueIds = validated.filter((i) => i.type === "analytique").map((i) => i.id);

  if (ventileeIds.length) {
    const rows = await db
      .select({
        account: tables.generalBalanceLines.account,
        label: tables.generalBalanceLines.label,
      })
      .from(tables.generalBalanceLines)
      .where(inArray(tables.generalBalanceLines.importId, ventileeIds));
    for (const r of rows) out.synthese.set(r.account, r.label);
  }

  if (analytiqueIds.length) {
    const rows = await db
      .select({
        account: tables.analyticLines.account,
        label: tables.analyticLines.label,
        centreCode: tables.analyticLines.centreCode,
      })
      .from(tables.analyticLines)
      .where(inArray(tables.analyticLines.importId, analytiqueIds));
    for (const r of rows) {
      // Dotations et VNC : rattachées aux frais généraux quel que soit le centre.
      const view: View =
        classifyCentre(r.centreCode) === "structure" || COMPTES_TOUJOURS_FX.has(r.account)
          ? "fx"
          : "chantier";
      out[view].set(r.account, r.label);
    }
  }

  return out;
}

/** Empreinte d'une nomenclature : structure des lignes et comptes rattachés. */
function signature(
  lines: { code: string; label: string; section: string; sortOrder: number; accounts: string[] }[]
): string {
  return lines
    .map((l) => `${l.sortOrder}|${l.code}|${l.section}|${l.label}|${[...l.accounts].sort().join(",")}`)
    .sort()
    .join("\n");
}

/** Empreinte de la nomenclature actuellement en base. */
async function dbSignature(): Promise<string> {
  const cats = await db.select().from(tables.categories);
  if (cats.length === 0) return "";
  const rules = await db
    .select({
      categoryId: tables.accountRules.categoryId,
      pattern: tables.accountRules.pattern,
      createdBy: tables.accountRules.createdBy,
    })
    .from(tables.accountRules)
    .where(eq(tables.accountRules.active, true));
  const byCat = new Map<number, string[]>();
  for (const r of rules) {
    if (r.createdBy !== "seed") continue; // les règles utilisateur ne comptent pas
    byCat.set(r.categoryId, [...(byCat.get(r.categoryId) ?? []), r.pattern]);
  }
  return signature(
    cats.map((c) => ({
      code: c.code,
      label: c.label,
      section: c.section,
      sortOrder: c.sortOrder,
      accounts: byCat.get(c.id) ?? [],
    }))
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const onlyIfChanged = process.argv.includes("--only-if-changed");

  // 1 — cohérence de la nomenclature déclarative
  const issues = validateNomenclature(nomenclature);
  for (const i of issues) console.log(`${i.severity === "error" ? "✗" : "!"} ${i.message}`);
  if (issues.some((i) => i.severity === "error")) {
    console.error("\nNomenclature incohérente : rien n'a été écrit.");
    process.exit(1);
  }

  const counts = Object.fromEntries(
    VIEWS.map((v) => [v, nomenclature.filter((l) => l.view === v).length])
  );
  const postes = nomenclature.filter((l) => l.kind === "poste");
  const ruleCount = postes.reduce((s, l) => s + (l.accounts?.length ?? 0), 0);

  console.log("Nomenclature Sodobat");
  for (const v of VIEWS) console.log(`  ${v.padEnd(9)} ${counts[v]} lignes`);
  console.log(`  ${postes.length} postes · ${ruleCount} règles sur comptes exacts`);

  // 2 — au démarrage, on ne réécrit que si la nomenclature du code a bougé,
  //     pour préserver les règles créées depuis l'écran Mapping.
  if (onlyIfChanged) {
    const expected = signature(
      nomenclature.map((l, i) => ({
        code: l.code,
        label: l.label,
        section: l.section,
        sortOrder: i,
        accounts: l.accounts ?? [],
      }))
    );
    if ((await dbSignature()) === expected) {
      console.log("\nNomenclature déjà à jour : aucune écriture.");
      process.exit(0);
    }
    console.log("\nNomenclature modifiée depuis le dernier démarrage : réinstallation.");
  }

  // 3 — couverture des comptes réellement importés
  const inUse = await accountsInUse();
  let uncovered = 0;
  for (const v of VIEWS) {
    const covered = accountsOfView(nomenclature, v);
    const missing = [...inUse[v]].filter(([a]) => !covered.has(a));
    if (inUse[v].size === 0) {
      console.log(`\n${v} : aucun import validé, couverture non vérifiable.`);
      continue;
    }
    if (missing.length === 0) {
      console.log(`\n${v} : ${inUse[v].size} comptes importés, tous couverts.`);
    } else {
      uncovered += missing.length;
      console.log(
        `\n${v} : ${missing.length} compte(s) importé(s) NON couvert(s) — ils remonteront en alerte :`
      );
      for (const [a, label] of missing) console.log(`    ${a}  ${label}`);
    }
  }

  if (dryRun) {
    console.log("\n--dry-run : aucune écriture en base.");
    process.exit(uncovered > 0 ? 2 : 0);
  }

  // 4 — remplacement (les FK règles → catégories imposent l'ordre)
  const previous = await db.select({ id: tables.categories.id }).from(tables.categories);
  await db.delete(tables.accountRules);
  await db.delete(tables.categories);
  console.log(`\n${previous.length} anciennes catégories supprimées.`);

  for (const [i, line] of nomenclature.entries()) {
    const [inserted] = await db
      .insert(tables.categories)
      .values({
        code: line.code,
        view: line.view,
        section: line.section,
        label: line.label,
        sortOrder: i,
        sign: line.sign ?? 1,
        entityScope: line.entityScope ?? "all",
        notes: line.notes ?? null,
        kind: line.kind,
        formula: line.formula ?? null,
        cumulative: line.cumulative ?? false,
        active: true,
        hidden: line.hidden ?? false,
      })
      .returning({ id: tables.categories.id });

    const accounts = line.accounts ?? [];
    if (accounts.length === 0) continue;
    await db.insert(tables.accountRules).values(
      accounts.map((account) => ({
        categoryId: inserted.id,
        entityId: null,
        pattern: account,
        matchType: "exact" as const,
        createdBy: "seed",
      }))
    );
  }

  console.log(
    `Nomenclature installée : ${nomenclature.length} lignes, ${ruleCount} règles.`
  );
  console.log("Les vues se recalculent à la volée — aucun réimport nécessaire.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
