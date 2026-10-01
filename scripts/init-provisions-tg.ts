// Reprise des prévisions de travaux d'un tableau de gestion tenu par chantier
// en colonnes (CovarBat) : une saisie par chantier et par mois.
//
//   npm run init:provisions -- "<Tableau gestion CVB.xlsx>" --entite covarbat            → aperçu
//   npm run init:provisions -- "<Tableau gestion CVB.xlsx>" --entite covarbat --apply    → écrit
//
// Préfixer par DOTENV_CONFIG_PATH=.env.local pour viser la production.
//
// Pour une entité dont la comptabilité ne ventile pas la prévision par chantier
// (mode « saisie », src/lib/nomenclature/entites.ts), la prévision se suit par
// la saisie faite dans la vue Chantiers. L'historique, lui, n'existe que dans
// le tableau de gestion : chaque onglet mensuel porte une ligne « provision »,
// un montant par chantier. Le script les enregistre comme saisies figées, et
// déduit la prévision du mois qui précède le premier onglet de sa ligne
// « annulation » (l'annulation d'un mois est la prévision du mois précédent,
// de signe opposé).
//
// Relançable : chaque exécution remplace les saisies qu'il a lui-même posées
// (signées « init-provisions-tg »). Une prévision saisie par un utilisateur
// n'est jamais écrasée : elle est gardée et signalée.
// N'écrit que dans manual_entries.

import "dotenv/config";
import * as XLSX from "xlsx";
import { and, eq, inArray } from "drizzle-orm";
import { db, tables } from "../src/db";
import { getEntityByCode } from "../src/lib/finance";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const AUTEUR = "init-provisions-tg";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const eur = (x: number) =>
  x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(14);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** « COVARBAT 31 07 2026 » ou « COVARBAT 30 11 25 » → « 2026-07-01 ». */
function periodOfSheet(name: string): string | null {
  const m = /(\d{2})\s+(\d{2})\s+(\d{2}|\d{4})\s*$/.exec(name.trim());
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-01`;
}

function moisPrecedent(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

type Ligne = { period: string; centre: string; label: string; value: number };

/** Lignes « provision » et « annulation » d'un onglet mensuel, par chantier. */
function lireOnglet(ws: XLSX.WorkSheet) {
  const g = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const hr = g.findIndex((r) => String(r?.[1] ?? "").trim() === "CHANTIERS");
  if (hr < 1) return null;
  const codes = g[hr];
  const noms = g[hr - 1] ?? [];
  // Les colonnes de chantiers s'arrêtent là où commence le tableau croisé de
  // travail laissé à droite de l'onglet ; la colonne « Total général » est exclue.
  const fin = codes.findIndex((c) => typeof c === "string" && /tiquettes/i.test(c));
  const colonnes: number[] = [];
  for (let c = 2; c < (fin > 0 ? fin : codes.length); c++)
    if (/^\d+$/.test(String(codes[c] ?? "").trim())) colonnes.push(c);
  const ligne = (re: RegExp) =>
    g.findIndex((r, i) => i > hr && re.test(String(r?.[1] ?? "").trim()));
  const rProvision = ligne(/^provision$/i);
  const rAnnulation = ligne(/^annulation$/i);
  if (rProvision < 0 || rAnnulation < 0) return null;
  const lire = (r: number) => {
    const out = new Map<string, { label: string; value: number }>();
    for (const c of colonnes) {
      const v = g[r][c];
      if (typeof v !== "number" || !Number.isFinite(v) || v === 0) continue;
      const code = String(codes[c]).trim();
      const prev = out.get(code);
      out.set(code, { label: String(noms[c] ?? "").trim(), value: round2((prev?.value ?? 0) + v) });
    }
    return out;
  };
  return { provisions: lire(rProvision), annulations: lire(rAnnulation) };
}

async function main() {
  requireEnvTarget();
  const file = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));
  const code = arg("--entite");
  if (!file || !code) {
    console.error('Usage : npm run init:provisions -- "<tableau de gestion.xlsx>" --entite <code> [--apply]');
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const entity = await getEntityByCode(code);
  if (!entity) throw new Error(`entité ${code} absente`);

  const wb = XLSX.readFile(file);
  const onglets = wb.SheetNames.map((name) => ({ name, period: periodOfSheet(name) }))
    .filter((o): o is { name: string; period: string } => !!o.period)
    .sort((a, b) => a.period.localeCompare(b.period));
  if (!onglets.length) throw new Error("aucun onglet mensuel reconnu (attendu : « … JJ MM AAAA »)");

  console.log(`Base    : ${describeTarget()}${apply ? "" : " — aperçu, aucune écriture"}`);
  console.log(`Entité  : ${entity.name}\n`);

  const lignes: Ligne[] = [];
  console.log("mois       chantiers       prévision      annulation");
  for (const [i, o] of onglets.entries()) {
    const lu = lireOnglet(wb.Sheets[o.name]);
    if (!lu) throw new Error(`onglet « ${o.name} » : lignes « provision » / « annulation » introuvables`);
    for (const [centre, v] of lu.provisions)
      lignes.push({ period: o.period, centre, label: v.label, value: v.value });
    // Prévision du mois qui précède le premier onglet : l'opposé de son annulation.
    if (i === 0)
      for (const [centre, v] of lu.annulations)
        lignes.push({ period: moisPrecedent(o.period), centre, label: v.label, value: round2(-v.value) });
    const somme = (m: Map<string, { value: number }>) =>
      round2([...m.values()].reduce((t, v) => t + v.value, 0));
    console.log(
      `${o.period.slice(0, 7)}    ${String(lu.provisions.size).padStart(9)}  ${eur(somme(lu.provisions))}  ${eur(somme(lu.annulations))}`
    );
  }

  // L'annulation de chaque onglet doit être la prévision du mois précédent.
  const parMois = new Map<string, number>();
  for (const l of lignes) parMois.set(l.period, round2((parMois.get(l.period) ?? 0) + l.value));
  for (const o of onglets) {
    const lu = lireOnglet(wb.Sheets[o.name])!;
    const annulation = round2([...lu.annulations.values()].reduce((t, v) => t + v.value, 0));
    const attendue = round2(-(parMois.get(moisPrecedent(o.period)) ?? 0));
    if (Math.abs(annulation - attendue) > 0.01)
      console.log(
        `! ${o.period.slice(0, 7)} : l'annulation du tableau (${eur(annulation).trim()}) n'est pas la prévision du mois précédent (${eur(attendue).trim()})`
      );
  }

  const periods = [...new Set(lignes.map((l) => l.period))];
  const existantes = await db
    .select()
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entity.id),
        eq(tables.manualEntries.field, "tec_provision"),
        inArray(tables.manualEntries.period, periods)
      )
    );
  const utilisateur = new Set(
    existantes.filter((e) => e.updatedBy !== AUTEUR).map((e) => `${e.period}|${e.centreCode}`)
  );
  const aEcrire = lignes.filter((l) => !utilisateur.has(`${l.period}|${l.centre}`));
  console.log(`\n${lignes.length} prévisions lues sur ${periods.length} mois, ${aEcrire.length} à enregistrer.`);
  for (const l of lignes.filter((x) => utilisateur.has(`${x.period}|${x.centre}`)))
    console.log(`! ${l.period.slice(0, 7)} ${l.centre} : une saisie existe déjà, elle est gardée`);

  if (!apply) {
    console.log("\nRelancer avec --apply pour écrire.");
    process.exit(0);
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(tables.manualEntries)
      .where(
        and(
          eq(tables.manualEntries.entityId, entity.id),
          eq(tables.manualEntries.field, "tec_provision"),
          eq(tables.manualEntries.updatedBy, AUTEUR)
        )
      );
    for (let i = 0; i < aEcrire.length; i += 200)
      await tx.insert(tables.manualEntries).values(
        aEcrire.slice(i, i + 200).map((l) => ({
          entityId: entity.id,
          period: l.period,
          centreCode: l.centre,
          field: "tec_provision" as const,
          valueNum: String(l.value),
          status: "final" as const,
          updatedBy: AUTEUR,
        }))
      );
  });
  console.log("\nTerminé.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
