// Contrôles de cohérence de la nomenclature déclarative.
//
// Ces règles sont vérifiées au seed (et en recette) : une nomenclature
// incohérente doit échouer bruyamment plutôt que produire des totaux faux.

import { formulaOperandCodes, type NomenclatureLine, type View } from "./types";
import type { EntiteConfig } from "./entites";

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
  const receveurs = new Set(
    lines.flatMap((l) => [l.structureTo, l.partage?.vers]).filter(Boolean) as string[]
  );
  const perView = new Map<View, Map<string, string>>();
  for (const l of lines) {
    if (l.kind !== "poste") {
      if (l.accounts?.length)
        err(`${l.code} : des comptes sont rattachés à une ligne ${l.kind}`);
      continue;
    }
    if (!l.accounts?.length) {
      // Un poste propre à une entité n'a pas de compte commun : ses comptes
      // viennent des règles de cette entité (src/lib/nomenclature/entites.ts).
      if (!receveurs.has(l.code) && (l.entityScope ?? "all") === "all")
        warn(`${l.code} : poste sans aucun compte`);
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

  // 2 ter — un partage part vers un poste de la même vue, sans compte en propre
  for (const l of lines) {
    if (!l.partage) continue;
    const target = byCode.get(l.partage.vers);
    if (!target || target.view !== l.view || target.kind !== "poste" || target.accounts?.length)
      err(`${l.code} : partage vers ${l.partage.vers}, qui n'est pas un poste sans compte de la vue ${l.view}`);
    if (!(l.partage.part > 0 && l.partage.part < 1))
      err(`${l.code} : la part partagée doit être strictement entre 0 et 1`);
  }
  for (const l of lines)
    if (l.quotePart != null && !(l.quotePart > 0 && l.quotePart <= 1))
      err(`${l.code} : quote-part hors de l'intervalle ]0 ; 1]`);

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

/** Postes partagés d'une vue : { code du poste, ligne qui reçoit la part, part }. */
export function partageRouting(lines: NomenclatureLine[], view: View) {
  return lines
    .filter((l) => l.view === view && l.partage)
    .map((l) => ({ from: l.code, to: l.partage!.vers, part: l.partage!.part }));
}

/** Quote-part retenue par poste, pour les lignes qui n'en comptent qu'une fraction. */
export function quoteParts(lines: NomenclatureLine[], view: View) {
  const out = new Map<string, number>();
  for (const l of lines)
    if (l.view === view && l.quotePart != null) out.set(l.code, l.quotePart);
  return out;
}

/**
 * Contrôle des règles propres à une entité : chaque code désigne un poste de
 * la maquette qui la concerne, et un compte n'y figure qu'une fois par vue.
 */
export function validateEntite(
  entityCode: string,
  config: EntiteConfig,
  lines: NomenclatureLine[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (message: string) => issues.push({ severity: "error", message });
  const byCode = new Map(lines.map((l) => [l.code, l]));
  const perView = new Map<View, Map<string, string>>();
  for (const [code, accounts] of Object.entries(config.regles)) {
    const line = byCode.get(code);
    if (!line) {
      err(`${entityCode} : règles déclarées sur un code inconnu (${code})`);
      continue;
    }
    if (line.kind !== "poste") err(`${entityCode} : ${code} est une ligne ${line.kind}, pas un poste`);
    const scope = line.entityScope ?? "all";
    if (scope !== "all" && !scope.split(",").map((s) => s.trim()).includes(entityCode))
      err(`${entityCode} : ${code} ne concerne pas cette entité (${scope})`);
    const seen = perView.get(line.view) ?? new Map<string, string>();
    perView.set(line.view, seen);
    for (const a of accounts) {
      if (!/^\d{8}$/.test(a)) err(`${entityCode} / ${code} : « ${a} » n'est pas un compte à 8 chiffres`);
      const other = seen.get(a);
      if (other) err(`${entityCode} : compte ${a} rattaché deux fois dans la vue ${line.view} (${other}, ${code})`);
      else seen.set(a, code);
    }
  }
  for (const code of Object.keys(config.libelles))
    if (!byCode.has(code)) err(`${entityCode} : libellé déclaré sur un code inconnu (${code})`);
  for (const compte of [config.provisions.compte, ...(config.provisions.autresComptes ?? [])])
    if (!lines.some((l) => l.kind === "poste" && accountsOfLine(l, config).includes(compte)))
      err(`${entityCode} : le compte de prévision ${compte} n'est rattaché à aucun poste`);
  if (!Number.isInteger(config.exercice.debut) || config.exercice.debut < 1 || config.exercice.debut > 12)
    err(`${entityCode} : mois d'ouverture de l'exercice invalide (${config.exercice.debut})`);
  // Un centre rattaché à un autre pointe vers un centre déclaré ici, ou vers un
  // numéro de chantier que le code classe de lui-même.
  const declares = new Set(config.centres.map((c) => c.code));
  for (const c of config.centres)
    if (c.aliasOf && !declares.has(c.aliasOf) && !/^\d/.test(c.aliasOf))
      err(`${entityCode} : le centre ${c.code} est rattaché à ${c.aliasOf}, qui n'est ni déclaré ni un chantier`);
  return issues;
}

const accountsOfLine = (l: NomenclatureLine, config: EntiteConfig) => [
  ...(l.accounts ?? []),
  ...(config.regles[l.code] ?? []),
];
