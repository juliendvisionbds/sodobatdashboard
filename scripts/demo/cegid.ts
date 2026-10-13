// Écriture de balances au format des exports Cegid Quadra de Sodobat, tels que
// l'import les lit (src/lib/parsers.ts) :
//   · balance ventilée : « Balance d'Exploitation », en-tête Numéro / Intitulé /
//     un mois par colonne (MM/AAAA) / Solde, lignes « Total classe NNN » après
//     chaque sous-classe, « Total classe 6 », « Total classe 7 » et
//     « TOTAL GENERAL » ; le tableau commence en colonne B, comme l'original ;
//   · balance analytique : un onglet, en-tête Centre / Intitulé du centre /
//     Compte / Intitulé du compte / Débit / Crédit / Solde.

import * as XLSX from "xlsx";
import type { LigneBalanceAnalytique, LigneVentilee, Mois } from "./donnees";

const SOCIETE = "Cegid Quadra Comptabilité - 000777 - DEMO BTP 83000 TOULON";

const enteteMois = (m: Mois) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

const editeLe = (d: Date) =>
  `Edité le ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} à ${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;

/** Un montant nul s'écrit vide, comme dans l'export d'origine. */
const cellule = (centimes: number): number | string => (centimes === 0 ? "" : centimes / 100);

export function ecrireVentilee(lignes: LigneVentilee[], mois: Mois[], date: Date): Buffer {
  const rows: (string | number | null)[][] = [];
  const nbCols = 2 + mois.length + 1;
  const ligneTitre: (string | number | null)[] = Array(nbCols).fill(null);
  ligneTitre[0] = SOCIETE;
  ligneTitre[nbCols - 1] = editeLe(date);
  rows.push(ligneTitre, Array(nbCols).fill(null), ["Balance d'Exploitation"], Array(nbCols).fill(null));
  rows.push(["Numéro", "Intitulé", ...mois.map(enteteMois), "Solde"]);

  // Tout se somme en centimes entiers : les totaux du fichier sont exactement
  // ceux que l'import recalcule.
  const total = (acc: number[], valeurs: number[]) => acc.map((v, i) => v + valeurs[i]);
  const ligneTotal = (libelle: string, valeurs: number[]) => [
    "",
    libelle,
    ...valeurs.map(cellule),
    cellule(valeurs.reduce((a, b) => a + b, 0)),
  ];
  const zero = () => mois.map(() => 0);

  let sousClasse = "";
  let totalSousClasse = zero();
  let classe = "";
  let totalClasse = zero();
  let totalGeneral = zero();
  const flush = (prochaineSousClasse: string, prochaineClasse: string) => {
    if (sousClasse && sousClasse !== prochaineSousClasse) {
      rows.push(ligneTotal(`Total classe ${sousClasse}`, totalSousClasse));
      totalSousClasse = zero();
    }
    if (classe && classe !== prochaineClasse) {
      rows.push(ligneTotal(`Total classe ${classe}`, totalClasse));
      totalClasse = zero();
    }
  };

  for (const l of lignes) {
    flush(l.compte.slice(0, 3), l.compte.slice(0, 1));
    sousClasse = l.compte.slice(0, 3);
    classe = l.compte.slice(0, 1);
    const valeurs = mois.map((m) => Math.round((l.parMois.get(m) ?? 0) * 100));
    if (valeurs.every((v) => v === 0)) continue;
    rows.push([l.compte, l.libelle, ...valeurs.map(cellule), cellule(valeurs.reduce((a, b) => a + b, 0))]);
    totalSousClasse = total(totalSousClasse, valeurs);
    totalClasse = total(totalClasse, valeurs);
    totalGeneral = total(totalGeneral, valeurs);
  }
  flush("", "");
  rows.push(ligneTotal("TOTAL GENERAL", totalGeneral));

  // Le tableau commence en colonne B, comme dans l'export d'origine.
  const ws: XLSX.WorkSheet = {};
  XLSX.utils.sheet_add_aoa(ws, rows, { origin: "B1" });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function ecrireAnalytique(lignes: LigneBalanceAnalytique[]): Buffer {
  const rows: (string | number)[][] = [
    ["Centre", "Intitulé du centre", "Compte", "Intitulé du compte", "Débit", "Crédit", "Solde"],
  ];
  for (const l of lignes)
    rows.push([l.centre, l.centreLabel, Number(l.compte), l.libelle, l.debit, l.credit, l.solde]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
