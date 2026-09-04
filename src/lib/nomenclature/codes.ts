// Codes des lignes structurantes de la nomenclature, référencés par le calcul et
// par les tableaux. Ce module ne doit rien importer : il est chargé dans le
// bundle navigateur, où l'accès à la base n'existe pas.

export const SYNTHESE_CODES = {
  caTotal: "syn_ca_total",
  exploitation: "syn_total_exploitation",
  personnel: "syn_total_personnel",
  resultatExploitation: "syn_resultat_exploitation",
  fx: "syn_total_fx",
  impots: "syn_impots_taxes",
  resultatNet: "syn_resultat_net",
  resultatBg: "syn_resultat_bg",
  ctrl: "syn_ctrl",
} as const;

export const CHANTIER_CODES = {
  caTotal: "cha_ca_total",
  provision: "cha_provision",
  annulation: "cha_annulation_m1",
  totalExploitation: "cha_total_exploitation",
  totalPersonnel: "cha_total_personnel",
  resultat: "cha_resultat",
  reportResultat: "cha_report_resultat",
  reportFacturation: "cha_report_facturation",
  cumulResultat: "cha_cumul_resultat",
  cumulFacturation: "cha_cumul_facturation",
  cumulCharges: "cha_cumul_charges",
  note: "cha_note",
  statut: "cha_statut",
} as const;

export const FX_CODES = {
  caReference: "fx_ca_reference",
  totalHonoraires: "fx_total_honoraires",
  totalGeneraux: "fx_total_generaux",
  totalGeneral: "fx_total_general",
} as const;
