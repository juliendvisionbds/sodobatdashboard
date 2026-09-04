// Comparaison du mapping de l'application avec la classification manuelle de la DAF.
//
//   npm run recette:daf -- "/chemin/vers/BA 06.2026.xlsx"
//
// Certains exports de balance analytique contiennent, en plus de l'onglet brut,
// les feuilles de travail de la DAF (« Production », « FX », « Produits ») avec
// une colonne Code : sa classification de chaque ligne (centre × compte).
//
// Le script confronte deux choses :
//  1. le ROUTAGE — chantier / frais généraux / produits — qui doit coïncider ;
//  2. les REGROUPEMENTS — pour chaque code DAF, les comptes qu'il rassemble
//     sont-ils bien réunis sur un même poste chez nous, et lequel.
//
// Un désaccord n'est pas forcément une erreur : la DAF et la maquette n'ont pas
// toujours la même granularité. Le script chiffre chaque écart pour arbitrage.

import "dotenv/config";
import * as XLSX from "xlsx";
import { getEntityByCode } from "@/lib/finance";
import { loadMapper, type Mapper } from "@/lib/mapping";
import { classifyCentre } from "@/lib/parsers";

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DafLine = { centre: string; account: string; code: string; solde: number };

/** Lit une feuille de travail : en-tête « Centre », colonne H = code DAF. */
function readSheet(wb: XLSX.WorkBook, name: string): DafLine[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const hi = rows.findIndex((r) => String(r[0]).trim() === "Centre");
  if (hi < 0) return [];
  const out: DafLine[] = [];
  for (const r of rows.slice(hi + 1)) {
    const account = String(r[2]).trim();
    if (!/^\d{3,}$/.test(account)) continue;
    out.push({
      centre: String(r[0]).trim().toUpperCase(),
      account,
      code: String(r[7]).trim(),
      solde: Number(r[6]) || 0,
    });
  }
  return out;
}

async function main() {
  const file = process.argv.find((a) => a.endsWith(".xlsx"));
  if (!file) {
    console.error('Usage : npm run recette:daf -- "/chemin/vers/BA 06.2026.xlsx"');
    process.exit(1);
  }
  const wb = XLSX.readFile(file);
  const present = ["Production", "FX", "Produits"].filter((s) => wb.SheetNames.includes(s));
  if (present.length === 0) {
    console.error(
      `Ce fichier ne contient pas les feuilles de travail de la DAF.\n` +
        `Feuilles trouvées : ${wb.SheetNames.join(", ")}`
    );
    process.exit(1);
  }

  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité sodobat absente");
  const mappers: Record<string, Mapper> = {
    chantier: await loadMapper("chantier", entity.id, entity.code),
    fx: await loadMapper("fx", entity.id, entity.code),
  };

  console.log(`Fichier : ${file.split("/").pop()}`);
  console.log(`Feuilles de travail DAF : ${present.join(", ")}\n`);

  // ── 1. Routage : la DAF met-elle la ligne là où nous la mettons ? ──────────
  // La feuille où elle range une ligne est sa décision ; la nôtre découle du
  // centre analytique. Les lignes « Produits » sont hors périmètre de charge.
  const attendu: Record<string, "chantier" | "fx"> = { Production: "chantier", FX: "fx" };
  let accord = 0;
  const desaccords: { feuille: string; centre: string; account: string; nous: string; solde: number }[] = [];

  for (const sheet of present) {
    const cible = attendu[sheet];
    if (!cible) continue;
    for (const l of readSheet(wb, sheet)) {
      // Dans ses feuilles, la colonne Centre porte parfois sa décision de
      // routage plutôt que le centre d'origine : on se fie à la feuille.
      const nous = classifyCentre(l.centre) === "structure" ? "fx" : "chantier";
      if (nous === cible) accord++;
      else desaccords.push({ feuille: sheet, centre: l.centre, account: l.account, nous, solde: l.solde });
    }
  }
  console.log("1) ROUTAGE CHANTIER / FRAIS GÉNÉRAUX");
  console.log(`   ${accord} ligne(s) routée(s) comme la DAF`);
  if (desaccords.length === 0) console.log("   ✓ aucun désaccord");
  else {
    const parCompte = new Map<string, { n: number; solde: number; nous: string; feuille: string }>();
    for (const d of desaccords) {
      const e = parCompte.get(d.account) ?? { n: 0, solde: 0, nous: d.nous, feuille: d.feuille };
      e.n++; e.solde += d.solde; parCompte.set(d.account, e);
    }
    console.log(`   ✗ ${desaccords.length} ligne(s) en désaccord :`);
    for (const [acc, e] of [...parCompte].sort((a, b) => Math.abs(b[1].solde) - Math.abs(a[1].solde)))
      console.log(
        `      ${acc}  ${String(e.n).padStart(3)} ligne(s)  ${eur(e.solde).padStart(14)}` +
          `  · DAF → ${e.feuille}, nous → ${e.nous}`
      );
  }

  // ── 2. Regroupements : un code DAF doit tomber sur un seul poste chez nous ─
  console.log("\n2) REGROUPEMENTS — un code DAF = un poste chez nous ?");
  for (const sheet of present) {
    const cible = attendu[sheet];
    if (!cible) continue;
    const mapper = mappers[cible];
    const parCode = new Map<string, Map<string, { n: number; solde: number }>>();
    for (const l of readSheet(wb, sheet)) {
      const cat = mapper.resolve(l.account);
      const poste = cat ? cat.label : "⚠ NON MAPPÉ";
      const m = parCode.get(l.code || "(vide)") ?? new Map();
      parCode.set(l.code || "(vide)", m);
      const e = m.get(poste) ?? { n: 0, solde: 0 };
      e.n++; e.solde += l.solde; m.set(poste, e);
    }
    console.log(`\n   ── ${sheet} (${cible}) ──`);
    for (const [code, postes] of [...parCode].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true })
    )) {
      const list = [...postes].sort((a, b) => Math.abs(b[1].solde) - Math.abs(a[1].solde));
      const total = list.reduce((s, [, e]) => s + e.solde, 0);
      const marque = list.length === 1 ? "✓" : "·";
      console.log(`   ${marque} code ${code.padEnd(4)} ${eur(total).padStart(14)}`);
      for (const [poste, e] of list)
        console.log(`        ${String(e.n).padStart(3)} l. ${eur(e.solde).padStart(14)}  → ${poste}`);
    }
  }

  console.log(
    "\nUn code éclaté sur plusieurs postes n'est pas forcément une erreur : la\n" +
      "maquette est plus fine que le classement de la DAF sur certains regroupements.\n" +
      "Ce qui doit alerter : un poste « ⚠ NON MAPPÉ », ou un désaccord de routage."
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
