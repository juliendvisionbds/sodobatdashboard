// Évaluateur des lignes calculées de la nomenclature.
//
// Une ligne vaut un vecteur de colonnes : les 12 mois + le total pour la
// Synthèse, les trois exercices (N-2 / N-1 / N) pour les frais généraux, un
// centre par colonne pour les chantiers. Les formules s'appliquent colonne par
// colonne, ce qui fait tomber naturellement l'exigence de la maquette FX :
// chaque « % / CA » est calculé contre le CA de son propre exercice.
//
// Le total de la Synthèse est une colonne comme une autre : les postes le
// fournissent déjà cumulé, donc sommes, écarts et ratios y sont justes sans
// traitement particulier (un ratio ne se somme pas, il se recalcule).

import type { Category } from "@/lib/mapping";
import type { Formula } from "./types";

/** Valeurs d'une ligne, indexées par clé de colonne. null = non calculable. */
export type Vector = Record<string, number | null>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type EvaluateOptions = {
  /** valeurs des lignes kind = "manual" ou "computed" alimentées hors nomenclature */
  provided?: Map<string, Vector>;
};

/**
 * Calcule le vecteur de chaque ligne d'une vue.
 *
 * @param lines  lignes de la vue, dans l'ordre de la maquette
 * @param leaves vecteurs des postes (issus des balances), par code de catégorie
 */
export function evaluate(
  lines: Category[],
  columns: string[],
  leaves: Map<string, Vector>,
  opts?: EvaluateOptions
): Map<string, Vector> {
  const byCode = new Map(lines.map((l) => [l.code, l]));
  const out = new Map<string, Vector>();
  const state = new Map<string, "visiting" | "done">();

  const zero = (): Vector => Object.fromEntries(columns.map((c) => [c, 0]));
  const empty = (): Vector => Object.fromEntries(columns.map((c) => [c, null]));

  const resolve = (code: string): Vector => {
    const done = out.get(code);
    if (done) return done;

    // Cycle : la nomenclature est validée au seed, mais une base modifiée à la
    // main pourrait en introduire un. On rend un vecteur vide plutôt que boucler.
    if (state.get(code) === "visiting") return empty();
    state.set(code, "visiting");

    const line = byCode.get(code);
    let value: Vector;

    if (!line) {
      value = empty();
    } else if (line.kind === "poste") {
      value = leaves.get(code) ?? zero();
    } else if (!line.formula || line.formula.op === "manual") {
      // Saisies et lignes alimentées hors nomenclature (résultat BG, reports de
      // cumul) : toujours fournies par le caller, sous le code de la ligne.
      value = opts?.provided?.get(code) ?? empty();
    } else {
      value = apply(line.formula, resolve, columns);
    }

    state.set(code, "done");
    out.set(code, value);
    return value;
  };

  for (const line of lines) resolve(line.code);
  return out;
}

function apply(
  formula: Formula,
  resolve: (code: string) => Vector,
  columns: string[]
): Vector {
  const result: Vector = {};

  switch (formula.op) {
    case "sum": {
      const parts = formula.operands.map((o) => ({ v: resolve(o.code), sign: o.sign }));
      for (const c of columns) {
        let acc = 0;
        for (const p of parts) acc += p.sign * (p.v[c] ?? 0);
        result[c] = round2(acc);
      }
      return result;
    }
    case "diff": {
      const a = resolve(formula.a);
      const b = resolve(formula.b);
      for (const c of columns) result[c] = round2((a[c] ?? 0) - (b[c] ?? 0));
      return result;
    }
    case "ratio":
    case "div": {
      const num = resolve(formula.num);
      const den = resolve(formula.den);
      const scale = formula.op === "ratio" ? 100 : 1;
      for (const c of columns) {
        const d = den[c];
        const n = num[c];
        result[c] = d == null || d === 0 || n == null ? null : round2((n / d) * scale);
      }
      return result;
    }
    case "manual":
      // Traité en amont dans resolve() : la valeur vient du caller.
      return Object.fromEntries(columns.map((c) => [c, null]));
  }
}
