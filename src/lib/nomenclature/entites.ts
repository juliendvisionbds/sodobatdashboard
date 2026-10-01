// Ce qu'une entité du groupe a en propre par rapport à la maquette commune.
//
// Règle posée par la DAF dans la maquette structurelle du groupe (onglet
// « Nomenclature ») : si deux sociétés codifient différemment un même compte,
// c'est le code de Sodobat qui prévaut ; un compte nouveau pour une société,
// déjà affecté dans une autre, prend automatiquement le code existant.
// Les comptes de src/lib/nomenclature/sodobat.ts valent donc pour tout le
// groupe. Une entité ne déclare ici que :
//   · les comptes que Sodobat n'a pas ;
//   · les rares comptes de même numéro mais de nature différente (exception) ;
//   · ses libellés et la façon dont ses prévisions de travaux sont tenues.
//
// Ces règles sont installées en base avec l'identifiant de l'entité : à compte
// égal, elles l'emportent sur la règle commune (cf. loadMapper).
//
// Ce module ne lit pas la base : il est partagé par le calcul et les scripts.

export type EntiteConfig = {
  /**
   * Prévisions de travaux en cours.
   *  - "compte" : la balance analytique du mois porte la prévision (crédit) et
   *    la reprise de celle du mois précédent (débit), chantier par chantier.
   *  - "saisie" : la comptabilité ne ventile pas la prévision par chantier.
   *    Seule la saisie faite dans l'application fait foi ; l'annulation d'un
   *    mois est la prévision saisie le mois précédent, et le reste du compte
   *    est une vente.
   */
  provisions: { compte: string; mode: "compte" | "saisie" };
  /** libellés propres à l'entité, par code de ligne */
  libelles: Record<string, string>;
  /** comptes propres à l'entité, par code de poste (un poste = une vue) */
  regles: Record<string, string[]>;
  /** centres dont la nature (chantier ou structure) ne se lit pas dans le code */
  centres: { code: string; name: string; kind: "chantier" | "structure" }[];
};

const SODOBAT: EntiteConfig = {
  provisions: { compte: "71331000", mode: "compte" },
  libelles: {},
  regles: {},
  centres: [],
};

// ── CovarBat ─────────────────────────────────────────────────────────────────
// Sources : balances Pennylane 2023/24 à 2025/26, « Tableau gestion CVB
// 2025-2026 » de la DAF et maquette structurelle du groupe (colonne Entités).
// Les comptes sont écrits sur 8 chiffres, comme l'import les normalise.

const COVARBAT_VENTES_TRAVAUX = [
  "70401000", // ventes de travaux 10 %
  "70402000", // ventes de travaux 20 %
  "70405000", // ventes de travaux 5,5 %
  "70610000", // ventes de prestations de service
  // « Travaux » : ventes en autoliquidation (ligne « TRAVAUX LQ » du TG) et
  // écritures de prévision, que la saisie isole (cf. provisions ci-dessous).
  "70400000",
];
const COVARBAT_SOUS_TRAITANCE = [
  "60410000", // sous-traitants 0 % (auto-entrepreneurs)
  "60413000", // sous-traitants EXO liquidation
];
const COVARBAT_CREDIT_BAIL = [
  "61227000", // Renault Master bennes
  "61228000", // Renault Master
  "61350001", // leasing copieur
  "61354001", // LLD Audi Q3
  "61354002", // LLD Ford
  "61354003", // LLD Audi Q3
];
const COVARBAT_ASSURANCES = ["61600000", "61601000", "61602000", "61680000"];
const COVARBAT_ENTRETIEN = ["61551000", "61553000"];
const COVARBAT_SPONSORING = ["62300000", "62331000", "62341000"];
const COVARBAT_TELECOM = ["62610000", "62620000", "62630000"];
const COVARBAT_COTISATIONS = ["62811111", "62870000"];
const COVARBAT_IMPOTS = ["63512100", "63781000", "63782000"];
const COVARBAT_INTERETS = ["66116000", "66150000"];
/** Rémunération du gérant : 50 % production, 50 % frais généraux. */
const COVARBAT_REMUNERATION_GERANT = ["64111000"];

const COVARBAT: EntiteConfig = {
  // Le cabinet passe la prévision du mois en une seule écriture, sans la
  // ventiler par chantier : elle se suit par la saisie, chantier par chantier.
  provisions: { compte: "70400000", mode: "saisie" },
  libelles: {
    syn_sous_traitance_sodobat: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    cha_sous_traitance: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    fx_honoraires_management: "Honoraires de management",
  },
  regles: {
    // ▸ Synthèse
    syn_ca_travaux: COVARBAT_VENTES_TRAVAUX,
    syn_ca_marchandises: ["70700000"],
    syn_sous_traitance_sodobat: COVARBAT_SOUS_TRAITANCE,
    syn_achats_mp: ["60631000"], // vêtements de travail
    // Exception : bennes et déchets chez CovarBat (code E de la maquette),
    // location de matériel de transport chez Sodobat (code B).
    syn_dechets: ["61351000"],
    syn_entretien: COVARBAT_ENTRETIEN,
    syn_interims: ["62100000"],
    syn_honoraires_chantier: ["62261100"],
    syn_masse_salariale: [
      "63120000", "63335000", "63335100", "64110001", "64111200", "64115000",
      "64119000", "64119100", "64700000",
    ],
    syn_ms_gerant_fx: COVARBAT_REMUNERATION_GERANT,
    syn_fx_location_immo: ["60611100", "61322000"], // EDF, loyer SCI Mathille
    syn_fx_credit_bail: COVARBAT_CREDIT_BAIL,
    syn_fx_assurances: COVARBAT_ASSURANCES,
    // Exception : honoraires divers chez CovarBat, honoraires chantiers chez Sodobat.
    syn_fx_honoraires: ["62261000"],
    syn_fx_sponsoring: COVARBAT_SPONSORING,
    syn_fx_telecom: COVARBAT_TELECOM,
    syn_fx_cotisations: COVARBAT_COTISATIONS,
    syn_fx_bancaires: COVARBAT_INTERETS,
    syn_impots_taxes: COVARBAT_IMPOTS,
    syn_produits_financiers: ["76300000"],

    // ▸ Activité chantier
    cha_produits_travaux: COVARBAT_VENTES_TRAVAUX,
    cha_produits_marchandises: ["70700000"],
    cha_sous_traitance: COVARBAT_SOUS_TRAITANCE,
    cha_autres_achats: ["60310000", "60631000"],
    cha_dechets: ["61351000"],
    cha_edf_eau: ["60612000"],
    cha_entretien: COVARBAT_ENTRETIEN,
    cha_autres_charges: ["61680000", "68174000"],
    cha_autres_personnel: ["63120000", "63335000", "64115000"],
    cha_interim: ["62100000"],
    // « Honoraires chantier / Cadeaux » du TG CovarBat
    cha_honoraires: ["62220000", "62261100", "62340000"],

    // ▸ Frais généraux
    fx_honoraires_management: ["62262000"], // prestations de management
    fx_honoraires_divers: ["62261000"],
    fx_ms_structure: [
      "62100000", "63120000", "63335000", "63335100", "64110001", "64111200",
      "64115000", "64700000",
    ],
    fx_cotisations_exploitant: ["64119000", "64119100"], // SAF/BTP, loi Madelin
    fx_remuneration_gerant: COVARBAT_REMUNERATION_GERANT,
    fx_edf_eau: ["60611100"],
    fx_achats_fournitures: ["60631000"],
    fx_location_immo: ["61322000"],
    fx_dechets: ["61351000"],
    fx_entretien: COVARBAT_ENTRETIEN,
    fx_credit_bail: COVARBAT_CREDIT_BAIL,
    fx_assurances: COVARBAT_ASSURANCES,
    fx_sponsoring: COVARBAT_SPONSORING,
    fx_telecom: COVARBAT_TELECOM,
    fx_cotisations: COVARBAT_COTISATIONS,
    fx_impots: COVARBAT_IMPOTS,
    fx_bancaires: COVARBAT_INTERETS,
    fx_dotations: ["68111000"],
    fx_autres: ["60400000", "60413000", "61100000", "77200000"],
    fx_produits_structure: [...COVARBAT_VENTES_TRAVAUX, "76300000"],
  },
  centres: [
    // Chantiers que Pennylane exporte sans code (785 et 788 du TG en 2025/26) :
    // ce sont des chantiers, pas de la structure.
    {
      code: "#CRÉÉ PAR IMPORT ASCII",
      name: "Chantiers sans code dans Pennylane (libellé « Créé par Import ASCII »)",
      kind: "chantier",
    },
  ],
};

const ENTITES: Record<string, EntiteConfig> = { sodobat: SODOBAT, covarbat: COVARBAT };

/**
 * Entité dont le plan de comptes fait référence pour le groupe : ses règles,
 * y compris celles que la DAF crée depuis l'écran Mapping, valent par défaut
 * pour les autres entités (« c'est le code de Sodobat qui prévaut »).
 */
export const ENTITE_DE_REFERENCE = "sodobat";

/** Auteur des règles installées depuis ce fichier pour une entité. */
export const auteurReglesEntite = (entityCode: string) => `seed:${entityCode}`;

/** Codes des entités qui déclarent des règles en propre. */
export const ENTITES_DECLAREES = Object.keys(ENTITES);

/** Configuration d'une entité ; à défaut, celle de Sodobat, base du groupe. */
export function entiteConfig(entityCode: string): EntiteConfig {
  return ENTITES[entityCode] ?? SODOBAT;
}
