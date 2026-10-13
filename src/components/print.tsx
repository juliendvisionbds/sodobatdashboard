"use client";

import { useEffect, type CSSProperties } from "react";

// Impression des écrans (Synthèse, Chantiers, Frais généraux, Objectifs) :
// c'est le navigateur qui imprime la page affichée, filtres compris, en A4
// paysage. La mise en page vient de la section « IMPRESSION » de globals.css,
// qui fixe la largeur des colonnes ; les constantes ci-dessous les reprennent
// pour calculer, dès le rendu, ce que la feuille de style ne sait pas faire :
// réduire un tableau trop large (Synthèse, FX mensuel) et découper les
// chantiers en pages. Les deux doivent rester en phase.
export const PRINT = {
  /** largeur imprimable d'une page A4 paysage, marges de 10 mm déduites (≈ 1047 px) */
  width: 1040,
  /** colonne Intitulé */
  label: 200,
  /** colonne Intitulé des chantiers, plus large : les postes y sont longs et les lignes nombreuses */
  labelChantiers: 230,
  /** colonne d'un mois (Synthèse, FX mensuel) */
  month: 64,
  /** colonne de synthèse en euros (Total exercice, N-1, Écart, Cumul) */
  sum: 72,
  /** colonne de pourcentage */
  pct: 56,
  /** colonne d'un chantier */
  chantier: 70,
  /** colonne Total des chantiers */
  total: 92,
} as const;

/** Chantiers par page imprimée : Intitulé + n chantiers + Total tiennent en largeur. */
export const CHANTIERS_PAR_PAGE = Math.max(
  1,
  Math.floor((PRINT.width - PRINT.labelChantiers - PRINT.total) / PRINT.chantier),
);

/**
 * Réduction d'un tableau plus large que la page : `.table-wrap` lit la
 * variable à l'impression (`zoom: var(--print-zoom)`). À l'écran, sans effet.
 */
export function printVars(naturalWidth: number): CSSProperties {
  const zoom = Math.min(1, PRINT.width / Math.max(1, naturalWidth));
  return { "--print-zoom": zoom.toFixed(3) } as CSSProperties;
}

/** Un groupe de colonnes (un pôle de chantiers) ; `part` = (i, n) quand il est scindé. */
export type ColumnGroup<T> = { key: string; items: T[]; part?: [number, number] };

/**
 * Découpe des groupes de colonnes en pages d'au plus `n` colonnes, dans
 * l'ordre. Un groupe qui tient dans la place restante y est posé entier ; sinon
 * il est coupé pour remplir la page quand il y reste au moins une demi-page,
 * et passe à la page suivante quand il en reste moins. Les parts d'un groupe
 * coupé sont numérotées (i/n).
 */
export function splitColumns<T>(groups: ColumnGroup<T>[], n: number): ColumnGroup<T>[][] {
  const perPage = Math.max(1, n);
  const minFill = Math.ceil(perPage / 2);
  const pages: ColumnGroup<T>[][] = [];
  const parts = new Map<string, ColumnGroup<T>[]>();
  let current: ColumnGroup<T>[] = [];
  let count = 0;
  const flush = () => {
    if (current.length) pages.push(current);
    current = [];
    count = 0;
  };
  const add = (g: ColumnGroup<T>, items: T[]) => {
    const slice = { key: g.key, items };
    current.push(slice);
    count += items.length;
    parts.set(g.key, [...(parts.get(g.key) ?? []), slice]);
  };
  for (const g of groups) {
    let rest = g.items;
    while (rest.length) {
      const room = perPage - count;
      if (rest.length <= room) {
        add(g, rest);
        break;
      }
      if (room >= minFill) {
        add(g, rest.slice(0, room));
        rest = rest.slice(room);
      }
      flush();
    }
  }
  flush();
  for (const slices of parts.values()) {
    if (slices.length > 1) slices.forEach((s, i) => (s.part = [i + 1, slices.length]));
  }
  return pages;
}

/**
 * Bouton « Imprimer » d'un écran. Il ouvre la fenêtre d'impression du
 * navigateur (qui propose aussi l'enregistrement en PDF) ; Cmd+P fait la même
 * chose. Pendant l'impression, le titre du document prend le nom de l'écran,
 * de l'entité et du mois : c'est lui que le navigateur imprime en en-tête et
 * propose comme nom de fichier PDF.
 */
export default function PrintButton({ title }: { title: string }) {
  useEffect(() => {
    let previous: string | null = null;
    const before = () => {
      if (previous == null) previous = document.title;
      document.title = title;
    };
    const after = () => {
      if (previous != null) document.title = previous;
      previous = null;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [title]);

  return (
    <button
      type="button"
      className="btn secondary"
      onClick={() => window.print()}
      title="Imprimer ou enregistrer en PDF, en A4 paysage (sous Safari, choisir Paysage dans la fenêtre)"
    >
      Imprimer
    </button>
  );
}
