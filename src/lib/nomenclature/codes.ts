// Codes des lignes structurantes de la nomenclature, référencés par le calcul et
// par les tableaux. Ce module ne doit rien importer : il est chargé dans le
// bundle navigateur, où l'accès à la base n'existe pas.

export const SYNTHESE_CODES = {
  caTotal: "syn_ca_total",
  annulation: "syn_annulation_m1",
  tecProvision: "syn_tec_provision",
  exploitation: "syn_total_exploitation",
  personnel: "syn_total_personnel",
  resultatExploitation: "syn_resultat_exploitation",
  fx: "syn_total_fx",
  fxDotations: "syn_fx_dotations",
  impots: "syn_impots_taxes",
  resultatNet: "syn_resultat_net",
  resultatBg: "syn_resultat_bg",
  previsionsSaisies: "syn_previsions_saisies",
  resultatGestion: "syn_resultat_gestion",
  ctrl: "syn_ctrl",
  notes: "syn_notes",
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
  cumulDontPrevisions: "cha_cumul_dont_previsions",
  note: "cha_note",
  statut: "cha_statut",
} as const;

/**
 * Comptes qui vont toujours en frais généraux, même imputés à un chantier.
 *
 * Les dotations et la VNC ne sont pas des charges de chantier : la DAF les
 * bascule systématiquement en FX dans ses feuilles de travail (code 16 et 22),
 * et la maquette ne les cite que dans l'onglet Frais généraux. Ils échappent
 * donc à la règle de routage par centre analytique.
 */
export const COMPTES_TOUJOURS_FX = new Set(["68111000", "68112000", "65700000", "67500000"]);

/**
 * Comptes des dotations aux amortissements, lissés sur l'exercice : immobilisations
 * corporelles (68112000, le seul chez Sodobat) et incorporelles (68111000, logiciels
 * chez Easy Mat et CovarBat). Le tableau de gestion de la DAF lisse les deux.
 */
export const COMPTES_DOTATIONS = new Set(["68111000", "68112000"]);

/**
 * Premier exercice dont les dotations sont comptabilisées chaque mois, donc
 * lues telles quelles : celui ouvert en novembre 2026, à l'arrivée de Sodobat
 * sur Pennylane (décision de la DAF du 1er octobre 2026). Les exercices
 * antérieurs, comptabilisés en bloc, restent lissés.
 */
export const PREMIER_EXERCICE_DOTATIONS_MENSUELLES = 2026;

export const FX_CODES = {
  dotations: "fx_dotations",
  caReference: "fx_ca_reference",
  totalHonoraires: "fx_total_honoraires",
  totalGeneraux: "fx_total_generaux",
  totalGeneral: "fx_total_general",
} as const;

// ── Lecture des signes ───────────────────────────────────────────────────────
// Les tableaux colorent ce qui va mal, pas ce qui est négatif : une charge qui
// baisse est une bonne nouvelle. Ces fonctions donnent le sens d'une ligne et
// le seuil d'alerte d'un ratio ; elles sont partagées par les trois vues.

/**
 * Ratios dont une valeur négative est le mauvais signe : un résultat ou une
 * marge rapportés au CA. Tous les autres rapportent des charges au CA et
 * passent en alerte au-dessus de 100 %, quand les charges dépassent le CA.
 */
export const RATIOS_DE_RESULTAT = new Set([
  "syn_ratio_resultat_exploitation",
  "syn_ratio_resultat_net",
  "cha_marge",
]);

export function ratioEnAlerte(code: string, value: number | null): boolean {
  if (value == null) return false;
  return RATIOS_DE_RESULTAT.has(code) ? value < 0 : value > 100;
}

/** Résultats : une hausse est une bonne nouvelle, comme pour un produit. */
const LIGNES_DE_RESULTAT = new Set([
  "syn_resultat_exploitation",
  "syn_resultat_net",
  "syn_resultat_gestion",
  "cha_resultat",
]);

type LigneLue = { code: string; section: string; kind: string };

/**
 * Sens d'une ligne : un produit ou un résultat qui monte est bon, une charge
 * qui monte est mauvaise. Les lignes de contrôle, de cumul et de saisie n'ont
 * pas de sens et ne se colorent pas.
 */
export function sensLigne(line: LigneLue): "produit" | "charge" | "neutre" {
  if (line.kind === "ratio") return RATIOS_DE_RESULTAT.has(line.code) ? "produit" : "charge";
  if (line.kind === "manual" || line.kind === "separator") return "neutre";
  if (LIGNES_DE_RESULTAT.has(line.code)) return "produit";
  if (/^(PRODUITS|AUTRES PRODUITS|RÉFÉRENCE)/.test(line.section)) return "produit";
  if (/^(RÉSULTAT|CUMULS|GESTION)/.test(line.section)) return "neutre";
  return "charge";
}

/** Classe CSS d'un écart N–N-1 : vert quand il va dans le bon sens, rouge sinon. */
export function classeEcart(line: LigneLue, ecart: number | null): "pos" | "neg" | "muted" | "" {
  // Moins de 50 centimes s'affiche « 0 € » : ce n'est pas un écart.
  if (ecart == null || Math.abs(ecart) < 0.5) return "muted";
  const sens = sensLigne(line);
  if (sens === "neutre") return "";
  return (sens === "produit" ? ecart > 0 : ecart < 0) ? "pos" : "neg";
}

/** Un « % / CA » au-dessus de 100 % sur une ligne de charge : les charges dépassent le CA. */
export function pourcentageEnAlerte(line: LigneLue, pct: number | null): boolean {
  return pct != null && pct > 100 && sensLigne(line) === "charge";
}
