// Constantes de colonnes partagées entre le calcul (serveur) et les tableaux
// (composants clients). Ce module ne doit rien importer : il est chargé dans le
// bundle navigateur, où l'accès à la base n'existe pas.

/** Colonne « Total exercice » de la Synthèse, traitée comme une colonne ordinaire. */
export const TOTAL_COLUMN = "__total";

/** Colonnes de la vue Frais généraux : un exercice par colonne. */
export const FX_COLUMNS = ["n2", "n1", "n"] as const;
export type FxColumn = (typeof FX_COLUMNS)[number];

/**
 * Colonne de travail « mois » de la vue Frais généraux : elle suit les mêmes
 * formules que les colonnes d'exercice, ce qui donne un total mensuel cohérent
 * avec le TOTAL 4 plutôt qu'une somme brute des variations de solde.
 */
export const MOIS_COLUMN = "__mois";
