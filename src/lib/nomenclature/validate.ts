// Contrôles de cohérence de la nomenclature déclarative.
//
// Ces règles sont vérifiées au seed (et en recette) : une nomenclature
// incohérente doit échouer bruyamment plutôt que produire des totaux faux.

import { formulaOperandCodes, type NomenclatureLine, type View } from "./types";

export type ValidationIssue = { severity: "error" | "warn"; message: string };

export function validateNomenclature(lines: NomenclatureLine[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (message: string) => issues.push({ severity: "error", message });
  const warn = (message: string) => issues.push({ severity: "warn", message });

  // 1 — unicité des codes
  const byCode = new Map<string, NomenclatureLine>();
  for (const l of lines) {
    if (byCode.has(l.code)) err(`Code dupliqué : ${l.code}`);
    byCode.set(l.code, l);
  }

  // 2 — un compte n'appartient qu'à un seul poste par vue
  // Les lignes qui reçoivent une part « structure » n'ont pas de compte en
  // propre : elles sont alimentées par transfert depuis un autre poste.
  const receveurs = new Set(lines.map((l) => l.structureTo).filter(Boolean) as string[]);
  const perView = new Map<View, Map<string, string>>();
  for (const l of lines) {
    if (l.kind !== "poste") {
      if (l.accounts?.length)
        err(`${l.code} : des comptes sont rattachés à une ligne ${l.kind}`);
      continue;
    }
    if (!l.accounts?.length) {
      if (!receveurs.has(l.code)) warn(`${l.code} : poste sans aucun compte`);
      continue;
    }
    const seen = perView.get(l.view) ?? new Map<string, string>();
    perView.set(l.view, seen);
    for (const a of l.accounts) {
      if (!/^\d{8}$/.test(a))
        err(`${l.code} : « ${a} » n'est pas un numéro de compte à 8 chiffres`);
      const other = seen.get(a);
      if (other) err(`Compte ${a} rattaché deux fois dans la vue ${l.view} : ${other} et ${l.code}`);
      else seen.set(a, l.code);
    }
  }

  // 2 bis — une part « structure » ne part que vers une ligne de la même vue,
  // qui doit exister et ne capter aucun compte (sinon double comptage).
  for (const l of lines) {
    if (!l.structureTo) continue;
    const target = byCode.get(l.structureTo);
    if (!target) {
      err(`${l.code} : structureTo pointe vers un code inconnu (${l.structureTo})`);
      continue;
    }
    if (target.view !== l.view)
      err(`${l.code} : structureTo pointe vers ${target.code}, de la vue ${target.view}`);
    if (target.kind !== "poste")
      err(`${l.code} : structureTo pointe vers ${target.code}, qui est une ligne ${target.kind}`);
    if (target.accounts?.length)
      err(
        `${l.code} : structureTo pointe vers ${target.code}, qui capte déjà des comptes` +
          ` — la part structure y serait comptée deux fois`
      );
  }

  // 3 — les formules ne référencent que des codes existants de la même vue
  for (const l of lines) {
    if (!l.formula) {
      if (l.kind === "subtotal" || l.kind === "total" || l.kind === "ratio")
        err(`${l.code} : ligne ${l.kind} sans formule`);
      continue;
    }
    for (const code of formulaOperandCodes(l.formula)) {
      const target = byCode.get(code);
      if (!target) err(`${l.code} : la formule référence un code inconnu (${code})`);
      else if (target.view !== l.view)
        err(`${l.code} : la formule référence ${code}, qui appartient à la vue ${target.view}`);
    }
  }

  // 4 — pas de cycle dans les formules
  const state = new Map<string, "visiting" | "done">();
  const visit = (code: string, path: string[]): void => {
    const s = state.get(code);
    if (s === "done") return;
    if (s === "visiting") {
      err(`Cycle de formules : ${[...path, code].join(" → ")}`);
      return;
    }
    state.set(code, "visiting");
    const line = byCode.get(code);
    if (line?.formula)
      for (const dep of formulaOperandCodes(line.formula)) visit(dep, [...path, code]);
    state.set(code, "done");
  };
  for (const l of lines) visit(l.code, []);

  return issues;
}

/** Comptes couverts par une vue, tous postes confondus. */
export function accountsOfView(lines: NomenclatureLine[], view: View): Set<string> {
  const out = new Set<string>();
  for (const l of lines)
    if (l.view === view && l.kind === "poste")
      for (const a of l.accounts ?? []) out.add(a);
  return out;
}

/**
 * Postes dont la part imputée aux centres de structure part en frais généraux,
 * sous la forme { code du poste → code de la ligne FX qui la reçoit }.
 *
 * La balance ventilée ne porte pas l'axe analytique : un compte de carburant y
 * est un montant unique, chantiers et siège confondus. Le découpage est retrouvé
 * dans la balance analytique du mois, où chaque écriture porte son centre.
 */
export function structureRouting(lines: NomenclatureLine[], view: View) {
  const out = new Map<string, string>();
  for (const l of lines)
    if (l.view === view && l.structureTo) out.set(l.code, l.structureTo);
  return out;
}
