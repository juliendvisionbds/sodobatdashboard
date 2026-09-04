// Section « Objectifs Dirigeant » : réalisé vs objectif, en % du CA.
//
// Aucun mapping comptable n'est dupliqué ici : chaque indicateur pointe vers une
// ligne déjà calculée de la Synthèse ou des Frais généraux, et son « réalisé »
// est le ratio de cette ligne sur le CA total. Seuls l'objectif annuel et la
// valeur GEN sont saisis, par indicateur et par exercice.

export type ObjectifSource =
  | { view: "synthese"; code: string }
  | { view: "fx"; code: string }
  /** Indicateur suivi manuellement : le plan comptable ne permet pas de l'isoler. */
  | { view: "manuel" };

export type ObjectifDef = {
  key: string;
  label: string;
  source: ObjectifSource;
  /** Compte dans le total de contrôle (≈ 100 % du CA) */
  controle: boolean;
  notes?: string;
};

/**
 * Les 12 indicateurs suivis par le dirigeant, dans l'ordre du tableau de gestion.
 * Les codes référencent la nomenclature (src/lib/nomenclature/sodobat.ts).
 */
export const OBJECTIFS: ObjectifDef[] = [
  {
    key: "achats",
    label: "Total Achats",
    source: { view: "synthese", code: "syn_st_achats" },
    controle: true,
  },
  {
    key: "location_materiel",
    label: "Location matériel externe",
    source: { view: "synthese", code: "syn_location_materiel_externe" },
    controle: true,
    notes: "Comptes 61350500 et 61350510",
  },
  {
    key: "location_easymat",
    label: "Location EasyMat",
    source: { view: "synthese", code: "syn_location_easymat" },
    controle: true,
    notes: "Compte 61350520",
  },
  {
    key: "salaires_production",
    label: "Salaires + charges Production",
    source: { view: "synthese", code: "syn_masse_salariale" },
    controle: true,
  },
  {
    key: "salaires_sedentaires",
    label: "Salaires + charges Sédentaires",
    source: { view: "fx", code: "fx_ms_structure" },
    controle: true,
    notes: "Masse salariale imputée aux centres de structure (siège, dépôt)",
  },
  {
    key: "frais_generaux",
    label: "Frais généraux",
    source: { view: "synthese", code: "syn_total_fx" },
    controle: true,
  },
  {
    key: "honoraires_chantiers",
    label: "Honoraires chantiers",
    source: { view: "synthese", code: "syn_honoraires_chantier" },
    controle: true,
  },
  {
    key: "sous_traitants_1",
    label: "Sous-traitants 1",
    source: { view: "manuel" },
    controle: false,
    notes:
      "Le plan comptable Sodobat ne distingue pas les deux familles de sous-traitance : à ventiler manuellement ou à obtenir par un sous-compte dédié.",
  },
  {
    key: "sous_traitants_2",
    label: "Sous-traitants 2 (hors gros œuvre / exceptionnel)",
    source: { view: "synthese", code: "syn_sous_traitance" },
    controle: true,
    notes: "Toute la sous-traitance, faute de sous-compte distinguant les deux familles",
  },
  {
    key: "dechets",
    label: "Déchets (Pizzorno + Sofovar)",
    source: { view: "synthese", code: "syn_dechets" },
    controle: true,
  },
  {
    key: "interim",
    label: "Intérim",
    source: { view: "synthese", code: "syn_interims" },
    controle: true,
  },
  {
    key: "eau_edf",
    label: "Eau / EDF",
    source: { view: "synthese", code: "syn_edf_eau_chantier" },
    controle: true,
  },
];

export type ObjectifStatut = "BON" | "BIEN" | "À SURVEILLER" | "MAUVAIS" | null;

/**
 * Statut d'un indicateur de charge, à partir de l'écart en points de %.
 *
 * L'écart est « réalisé − objectif » : positif = on dépense plus que prévu.
 *   BON            écart favorable d'au moins 0,2 point
 *   BIEN           entre −0,2 et +0,2 point
 *   À SURVEILLER   dépassement compris entre 0,2 et 2 points
 *   MAUVAIS        dépassement supérieur à 2 points
 */
export function statutObjectif(ecart: number | null): ObjectifStatut {
  if (ecart == null) return null;
  if (ecart <= -0.2) return "BON";
  if (ecart <= 0.2) return "BIEN";
  if (ecart <= 2) return "À SURVEILLER";
  return "MAUVAIS";
}

export const STATUT_CLASS: Record<Exclude<ObjectifStatut, null>, string> = {
  BON: "green",
  BIEN: "blue",
  "À SURVEILLER": "amber",
  MAUVAIS: "red",
};
