// Localise un NaN dans la vue Chantiers.
//
//   npm run diag:chantiers
//   DOTENV_CONFIG_PATH=.env.prod.local npm run diag:chantiers
//
// Strictement en lecture seule : aucune écriture, aucun import. Le script
// remonte la chaîne de calcul jusqu'à la première valeur non finie — saisie
// manuelle, ligne de balance, poste, puis ligne calculée — et s'arrête là.

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, tables } from "../src/db";
import { getChantiers, getEntityByCode, latestValidatedImport } from "../src/lib/finance";
import { loadMapper } from "../src/lib/mapping";

const bad = (v: unknown) => typeof v === "number" && !Number.isFinite(v);
const show = (v: number | null | undefined) =>
  v == null ? "—" : Number.isFinite(v) ? v.toFixed(2) : `⚠ ${String(v)}`;

async function main() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité sodobat absente");
  console.log(
    `Base : ${process.env.DATABASE_URL ? "DISTANTE (" + (process.env.DATABASE_URL.split("@").pop() ?? "?") + ")" : "PGlite locale"}\n`
  );

  // ── 1. Saisies manuelles : la source la plus probable ──────────────────────
  const imp = await latestValidatedImport(entity.id, "analytique");
  if (!imp) throw new Error("aucun import analytique validé");
  const manual = await db
    .select()
    .from(tables.manualEntries)
    .where(eq(tables.manualEntries.entityId, entity.id));
  console.log(`1) SAISIES MANUELLES (${manual.length} au total, période affichée ${imp.period})`);
  for (const m of manual) {
    const parsed = m.valueNum == null ? null : parseFloat(m.valueNum);
    const flag = m.valueNum != null && !Number.isFinite(parsed as number) ? "  ⚠ NON NUMÉRIQUE" : "";
    console.log(
      `   ${m.period} · ${(m.centreCode ?? "(entité)").padEnd(10)} · ${m.field.padEnd(16)}` +
        ` · brut=${JSON.stringify(m.valueNum)} → ${show(parsed)}${flag}` +
        (m.period === imp.period ? "   ← période courante" : "")
    );
  }
  if (manual.length === 0) console.log("   aucune");

  // ── 2. Lignes de balance : un solde illisible contaminerait tout ──────────
  const lines = await db
    .select()
    .from(tables.analyticLines)
    .where(eq(tables.analyticLines.importId, imp.id));
  const suspectes = lines.filter(
    (l) =>
      !Number.isFinite(parseFloat(l.solde)) ||
      !Number.isFinite(parseFloat(l.debit)) ||
      !Number.isFinite(parseFloat(l.credit))
  );
  console.log(`\n2) LIGNES DE BALANCE (${lines.length} lignes, import ${imp.id})`);
  if (suspectes.length === 0) console.log("   ✓ tous les montants sont numériques");
  else
    for (const l of suspectes.slice(0, 10))
      console.log(
        `   ⚠ ${l.centreCode} · ${l.account} · débit=${JSON.stringify(l.debit)}` +
          ` crédit=${JSON.stringify(l.credit)} solde=${JSON.stringify(l.solde)}`
      );

  // ── 3. Nomenclature : signes et formules ──────────────────────────────────
  const mapper = await loadMapper("chantier", entity.id, entity.code);
  console.log(`\n3) NOMENCLATURE CHANTIER (${mapper.lines.length} lignes)`);
  const codes = new Set(mapper.lines.map((l) => l.code));
  let soucis = 0;
  for (const l of mapper.lines) {
    if (!Number.isFinite(l.sign)) {
      console.log(`   ⚠ ${l.code} : sign = ${JSON.stringify(l.sign)}`);
      soucis++;
    }
    const f = l.formula;
    if (!f) continue;
    if (typeof f !== "object") {
      console.log(`   ⚠ ${l.code} : formula n'est pas un objet (${typeof f})`);
      soucis++;
      continue;
    }
    if (f.op === "sum")
      for (const o of f.operands) {
        if (!codes.has(o.code)) {
          console.log(`   ⚠ ${l.code} : opérande inconnue « ${o.code} »`);
          soucis++;
        }
        if (!Number.isFinite(o.sign)) {
          console.log(`   ⚠ ${l.code} : signe d'opérande invalide sur « ${o.code} »`);
          soucis++;
        }
      }
  }
  if (soucis === 0) console.log("   ✓ signes et formules cohérents");

  // ── 4. Résultat calculé : où le NaN apparaît-il ? ─────────────────────────
  const data = await getChantiers(entity);
  if (!data) throw new Error("getChantiers ne renvoie rien");
  console.log(
    `\n4) VUE CALCULÉE · ${data.period} (M-1 : ${data.prevPeriod ?? "aucun"}) · ${data.rows.length} centres`
  );
  const lignesNaN = data.lines.filter((l) => bad(data.totals[l.code]));
  if (lignesNaN.length === 0) {
    console.log("   ✓ aucun total non fini — le problème ne se reproduit pas sur cette base");
  } else {
    console.log(`   ⚠ ${lignesNaN.length} ligne(s) au total non fini :`);
    for (const l of lignesNaN) {
      const centresNaN = data.rows.filter((r) => bad(r.values[l.code])).map((r) => r.centreCode);
      console.log(
        `      ${l.code.padEnd(26)} ${l.kind.padEnd(9)} — ` +
          (centresNaN.length
            ? `${centresNaN.length} centre(s) en cause : ${centresNaN.slice(0, 8).join(", ")}`
            : "aucun centre en cause : le NaN naît dans la colonne Total elle-même")
      );
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
