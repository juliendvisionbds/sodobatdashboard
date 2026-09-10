// Types de la nomenclature déclarative.
//
// Une vue (Synthèse / Chantiers / Frais généraux) est une liste ordonnée de
// lignes. Les lignes "poste" sont alimentées par des comptes comptables ; toutes
// les autres sont calculées à partir d'une formule qui référence d'autres lignes
// par leur `code`. Les totaux, sous-totaux, ratios et résultats sont donc de la
// donnée, pas du code : renommer une section n'a plus d'effet sur les calculs.

export type View = "synthese" | "chantier" | "fx";

export type LineKind =
  | "poste" // alimenté par les comptes comptables
  | "subtotal" // sous-total d'un groupe de postes
  | "total" // total de section
  | "ratio" // pourcentage (numérateur / dénominateur)
  | "computed" // résultat, retraitement, écart de contrôle
  | "manual" // valeur saisie (provision, objectif, note…)
  | "separator"; // ligne de séparation visuelle, sans valeur

/** Champs de saisie manuelle, alignés sur manual_entries.field. */
export type ManualField =
  | "tec_provision"
  | "note"
  | "annulation_m1"
  | "objectif_annuel"
  | "ventilation"
  | "statut";

export type Operand = {
  /** code d'une autre ligne de la même vue */
  code: string;
  sign: 1 | -1;
};

export type Formula =
  /** somme signée d'autres lignes : sous-totaux, totaux, résultats */
  | { op: "sum"; operands: Operand[] }
  /** pourcentage, évalué colonne par colonne (chaque exercice contre son propre CA) */
  | { op: "ratio"; num: string; den: string }
  /** écart entre deux lignes : Ctrl, retraitements, écart N–N-1 */
  | { op: "diff"; a: string; b: string }
  /** rapport de deux lignes sans mise en pourcentage : coefficient chantier */
  | { op: "div"; num: string; den: string }
  /** valeur saisie manuellement */
  | { op: "manual"; field: ManualField; subKey?: string };

/** Une ligne de la maquette, telle que déclarée dans src/lib/nomenclature/sodobat.ts. */
export type NomenclatureLine = {
  /** slug stable, unique toutes vues confondues */
  code: string;
  view: View;
  section: string;
  label: string;
  kind: LineKind;
  /** produits : -1 (solde créditeur affiché positif) ; charges : 1 */
  sign?: 1 | -1;
  /** comptes exacts à 8 chiffres alimentant le poste */
  accounts?: string[];
  formula?: Formula;
  /** compte redescendant en cumul depuis le début d'exercice (DOT, VNC) */
  cumulative?: boolean;
  /** "all" ou codes d'entités séparés par des virgules */
  entityScope?: string;
  /**
   * Ligne de rattachement : elle capte des comptes et alimente les totaux, mais
   * n'est pas affichée par défaut. Sert aux comptes que la maquette d'une vue ne
   * détaille pas et renvoie vers une autre vue.
   */
  hidden?: boolean;
  notes?: string;
};

/** Garde-fou : une formule ne doit référencer que des codes existants. */
export function formulaOperandCodes(formula: Formula): string[] {
  switch (formula.op) {
    case "sum":
      return formula.operands.map((o) => o.code);
    case "ratio":
      return [formula.num, formula.den];
    case "div":
      return [formula.num, formula.den];
    case "diff":
      return [formula.a, formula.b];
    case "manual":
      return [];
  }
}
