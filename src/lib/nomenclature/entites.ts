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
   * Exercice comptable : mois d'ouverture (1 à 12). Novembre chez Sodobat et
   * CovarBat (exercice 2025 = nov 2025 → oct 2026), janvier chez VBTP (année
   * civile, exercice 2026 = 2026). Un exercice est repéré par l'année de son
   * ouverture (imports.fiscal_year_start).
   */
  exercice: { debut: number };
  /**
   * Prévisions de travaux en cours.
   *  - "compte" : la balance analytique du mois porte la prévision (crédit) et
   *    la reprise de celle du mois précédent (débit), chantier par chantier.
   *  - "saisie" : la comptabilité ne ventile pas la prévision par chantier.
   *    Seule la saisie faite dans l'application fait foi ; l'annulation d'un
   *    mois est la prévision saisie le mois précédent, et le reste du compte
   *    est une vente.
   */
  provisions: {
    compte: string;
    mode: "compte" | "saisie";
    /**
     * Comptes qui ont porté la prévision avant `compte` dans l'exercice (le
     * cabinet a changé de compte en cours de route) : la provision d'un chantier
     * se suit d'un compte à l'autre, les deux forment un même bloc.
     */
    autresComptes?: string[];
  };
  /** libellés propres à l'entité, par code de ligne */
  libelles: Record<string, string>;
  /** comptes propres à l'entité, par code de poste (un poste = une vue) */
  regles: Record<string, string[]>;
  /**
   * Centres dont la nature (chantier ou structure) ne se lit pas dans le code.
   * `aliasOf` : centre lu comme un autre (centres.alias_of) — un chantier que
   * Pennylane exporte sans code est rattaché au numéro que lui donne le
   * tableau de gestion, et ses écritures suivent ce numéro dans les vues.
   */
  centres: { code: string; name: string; kind: "chantier" | "structure"; aliasOf?: string }[];
  /**
   * Nature des centres quand le code ne la dit pas. Par défaut, un code qui
   * commence par un chiffre est un chantier et tout le reste de la structure
   * (classifyCentre). Une entité dont les affaires portent des codes lettrés
   * énumère ici sa structure : tout centre qui n'y répond pas est un chantier.
   */
  centresStructure?: RegExp[];
};

const SODOBAT: EntiteConfig = {
  exercice: { debut: 11 },
  provisions: { compte: "71331000", mode: "compte" },
  libelles: {},
  regles: {},
  centres: [],
};

// ── CovarBat ─────────────────────────────────────────────────────────────────
// Sources : balances Pennylane 2023/24 à 2025/26, « Tableau gestion CVB
// 2025-2026 » de la DAF, maquette structurelle du groupe (colonne Entités),
// plan comptable CovarBat 2026 (colonne Code) et réponses de la DAF du
// 6 octobre 2026. Quand le plan et une réponse explicite divergent, la réponse
// l'emporte (LLD en crédit-bail, 62870000 en cotisations).
// Les comptes sont écrits sur 8 chiffres, comme l'import les normalise.

const COVARBAT_VENTES_TRAVAUX = [
  "70401000", // ventes de travaux 10 %
  "70402000", // ventes de travaux 20 %
  "70405000", // ventes de travaux 5,5 %
  "70610000", // ventes de prestations de service
  // « Travaux » : ventes en autoliquidation (ligne « TRAVAUX LQ » du TG) et
  // écritures de prévision, que la saisie isole (cf. provisions ci-dessous).
  "70400000",
  // « Travaux en cours » : depuis juillet 2026, le cabinet passe la prévision
  // sur ce compte, comme Sodobat, et non plus dans le 70400000. Les deux
  // comptes forment un même bloc que la saisie décompose : leur somme est
  // inchangée, la Synthèse ne bouge pas.
  "71335000",
];
// Dans la vue Chantiers, les mêmes comptes se lisent par taux de TVA, comme
// les lignes du tableau de gestion de CovarBat. Le 70400000 et le 71335000
// restent ensemble : c'est le bloc que la saisie des prévisions décompose.
const COVARBAT_TRAVAUX_LQ = ["70400000", "71335000"];
const COVARBAT_TRAVAUX_10 = ["70401000"];
const COVARBAT_TRAVAUX_20 = ["70402000", "70610000"];
const COVARBAT_TRAVAUX_55 = ["70405000"];
const COVARBAT_SOUS_TRAITANCE = [
  "60410000", // sous-traitants 0 % (auto-entrepreneurs)
  "60413000", // sous-traitants EXO liquidation
];
// Locations longue durée en crédit-bail : réponse de la DAF du 6 octobre 2026
// (le plan comptable les code B « Location », la réponse l'emporte).
const COVARBAT_CREDIT_BAIL = [
  "61227000", // Renault Master bennes
  "61228000", // Renault Master
  "61350001", // leasing copieur
  "61354000", // LLD Clio (bennes et déchets chez Sodobat)
  "61354001", // LLD Audi Q3
  "61354002", // LLD Ford
  "61354003", // LLD Audi Q3
];
const COVARBAT_ASSURANCES = ["61600000", "61601000", "61602000", "61680000"];
const COVARBAT_ENTRETIEN = ["61551000", "61553000"];
const COVARBAT_SPONSORING = ["62300000", "62331000", "62341000"];
const COVARBAT_TELECOM = ["62610000", "62620000"];
/** Géolocalisation des véhicules : code I du plan comptable, avec les déplacements. */
const COVARBAT_DEPLACEMENTS = ["62630000"];
const COVARBAT_COTISATIONS = ["62811111", "62870000"];
const COVARBAT_IMPOTS = ["63512100"];
/** CSG déductible et non déductible : en masse salariale (réponse du 6 octobre), pas en impôts. */
const COVARBAT_CSG = ["63781000", "63782000"];
/** EDF et eau du siège : code H du plan comptable, et non charges locatives. */
const COVARBAT_EDF_EAU = ["60611100", "60612000"];
const COVARBAT_INTERETS = ["66116000", "66150000"];
/** Rémunération du gérant : 50 % production, 50 % frais généraux. */
const COVARBAT_REMUNERATION_GERANT = ["64111000"];

const COVARBAT: EntiteConfig = {
  exercice: { debut: 11 },
  // Le cabinet passe la prévision du mois en une seule écriture, sans la
  // ventiler par chantier : elle se suit par la saisie, chantier par chantier.
  provisions: { compte: "70400000", mode: "saisie" },
  libelles: {
    syn_sous_traitance_sodobat: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    cha_sous_traitance: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    fx_honoraires_management: "Honoraires de management",
    // Le 62340000 (cadeaux clients) est rattaché aux honoraires chantier, comme
    // la ligne « Honoraires Chantier / Cadeaux » de leur tableau de gestion.
    cha_honoraires: "Honoraires chantier / Cadeaux clients",
    // Ligne « Refac Feraille 70880000 » du TG.
    cha_refacturations: "Refacturation Feraille",
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
    syn_edf_eau_chantier: COVARBAT_EDF_EAU,
    syn_entretien: COVARBAT_ENTRETIEN,
    syn_deplacements: COVARBAT_DEPLACEMENTS,
    syn_interims: ["62100000"],
    syn_honoraires_chantier: ["62261100"],
    // Prime, SAF/BTP et loi Madelin du gérant restent entièrement en frais
    // généraux (réponse du 6 octobre) : seul le 64111000 est partagé.
    syn_masse_salariale: [
      "63120000", "63335000", "63335100", "64110001", "64111200", "64115000",
      "64119000", "64119100", "64700000", ...COVARBAT_CSG,
    ],
    syn_ms_gerant_fx: COVARBAT_REMUNERATION_GERANT,
    syn_fx_location_immo: ["61322000"], // loyer SCI Mathille
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
    cha_produits_travaux_lq: COVARBAT_TRAVAUX_LQ,
    cha_produits_travaux_10: COVARBAT_TRAVAUX_10,
    cha_produits_travaux_20: COVARBAT_TRAVAUX_20,
    cha_produits_travaux_55: COVARBAT_TRAVAUX_55,
    cha_produits_marchandises: ["70700000"],
    cha_sous_traitance: COVARBAT_SOUS_TRAITANCE,
    cha_autres_achats: ["60310000", "60631000"],
    cha_dechets: ["61351000"],
    cha_edf_eau: COVARBAT_EDF_EAU,
    cha_entretien: COVARBAT_ENTRETIEN,
    cha_autres_charges: ["61680000", "68174000"],
    cha_autres_personnel: ["63120000", "63335000", "64115000"],
    cha_interim: ["62100000"],
    cha_deplacements: COVARBAT_DEPLACEMENTS,
    // « Honoraires chantier / Cadeaux » du TG CovarBat
    cha_honoraires: ["62220000", "62261100", "62340000"],

    // ▸ Frais généraux
    fx_honoraires_management: ["62262000"], // prestations de management
    fx_honoraires_divers: ["62261000"],
    fx_ms_structure: [
      "62100000", "63120000", "63335000", "63335100", "64110001", "64111200",
      "64115000", "64700000", ...COVARBAT_CSG,
    ],
    fx_cotisations_exploitant: ["64119000", "64119100"], // SAF/BTP, loi Madelin
    fx_remuneration_gerant: COVARBAT_REMUNERATION_GERANT,
    fx_edf_eau: COVARBAT_EDF_EAU,
    fx_carburant: COVARBAT_DEPLACEMENTS,
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
    // Chantiers que Pennylane exporte sans code : ce sont des chantiers, pas de
    // la structure. Encore présents dans les exports du 6 octobre 2026 :
    // décembre et juillet (« Créé par Import ASCII »), novembre (« LAURENT SA 750 »).
    {
      code: "#CRÉÉ PAR IMPORT ASCII",
      name: "Chantiers sans code dans Pennylane (libellé « Créé par Import ASCII »)",
      kind: "chantier",
    },
    { code: "#LAURENT SA 750", name: "750 · LAURENT SA (sans code dans Pennylane)", kind: "chantier" },
    // Code et libellé inversés dans Pennylane : code « DURANT », libellé « 788 ».
    { code: "DURANT", name: "788 · DURANT", kind: "chantier" },
  ],
};

// ── VBTP ─────────────────────────────────────────────────────────────────────
// Sources : plan comptable VBTP 2026 (colonnes Onglet / Libellé / Code = lettre
// de la maquette), balances Pennylane 2026 (ventilée janvier → juin, analytiques
// mensuelles), balances analytiques Quadra des exercices 2021 à 2025, maquette
// structurelle du groupe (colonne Entités) et tableau de gestion « 2026 06_TG
// VBTP » de la DAF, lu comme référence de forme : la comptabilité fait foi.
// Exercice = année civile. Les comptes sont écrits sur 8 chiffres, comme
// l'import les normalise (Pennylane les exporte sur 12 pour ce dossier).
//
// Règle du groupe appliquée : à compte égal et de même nature, le code de
// Sodobat prévaut sur le plan VBTP (61552000 entretien du matériel de
// transport reste en Entretien, le plan le met en matière première ; 65800000
// reste en autres charges, le plan le met en frais bancaires). Les écarts de
// nature sont tranchés par le plan VBTP : 70600010 (prestations 10 %) est du
// CA travaux et non une refacturation, 62261000 (honoraires comptables) est un
// honoraire de structure et non de chantier, 60611000 / 60612000 (EDF, eau)
// suivent le code H comme chez CovarBat.

/** Code K — prestations 10 %, 0 % (autoliquidation), 20 %, sinistres exonérés, situations. */
const VBTP_CA_TRAVAUX = ["70600010", "70603000", "70630000", "70640000", "70650000"];
// Dans la vue Chantiers, les mêmes comptes se lisent par taux de TVA, comme
// les lignes du tableau de gestion de VBTP.
const VBTP_CA_PRESTATIONS_20 = ["70630000"];
const VBTP_CA_PRESTATIONS_0 = ["70603000"];
const VBTP_CA_PRESTATIONS_10 = ["70600010"];
const VBTP_CA_TRAVAUX_SINISTRES = ["70640000", "70650000"];
/** Code M */
const VBTP_CA_MARCHANDISES = ["70720000"];
/** Code N — refacturation de formation (exercice 2024) ; le 70880000 est commun au groupe. */
const VBTP_CA_REFACTURATION = ["70881000"];
/** Code O — « Variation des travaux en cours » : le compte de prévision de VBTP. */
const VBTP_PROVISION = "71345000";
/** Code C */
const VBTP_SOUS_TRAITANCE = ["60400000", "60400020", "60410000", "60412000", "61100000"];
/** Code D — sous-traitance en paiement direct (ligne « SOUS TRAITANT PD LQ » du TG). */
const VBTP_SOUS_TRAITANCE_DIRECT = ["60411009"];
/** Code A — matières, petit équipement (dont étranger), fournitures administratives, vêtements, RRR. */
const VBTP_ACHATS = ["60100000", "60100920", "60630000", "60635000", "60640000", "60650000", "60970000"];
/** Code E — traitement des déchets et location de bennes. */
const VBTP_DECHETS = ["60420000", "61351500"];
/** Code H — électricité, eau, gaz. */
const VBTP_EDF_EAU = ["60611000", "60612000", "60613000"];
/** Code B — locations d'engins et assurance des engins loués. */
const VBTP_LOCATIONS = ["61350500", "61350600"];
/** Code P — loyers (SCI Harmonie, SCI Capitou) et charges locatives. */
const VBTP_LOCATION_IMMO = ["61320000", "61322000", "61323000", "61400000"];
/**
 * Code Q — un compte 6125 par contrat de crédit-bail (engins, camions, véhicules),
 * contrats soldés des exercices 2021 à 2025 compris. Le plan code P (location
 * immobilière) le 61250200 « transport chenille » et numérote 62260000 le
 * « chargeur compact » : deux coquilles, lues ici comme les autres crédits-baux
 * (le chargeur compact est le 61250700 des balances).
 */
const VBTP_CREDIT_BAIL = [
  "61200000", "61247000", "61248000", "61249000", "61250000", "61250100",
  "61250200", "61250300", "61250400", "61250500", "61250700", "61250800",
  "61250900", "61251000", "61251100", "61251200", "61251300", "61251400",
  "61251500", "61251600", "61251700", "61251800", "61251900",
];
/** Code T */
const VBTP_ASSURANCES = [
  "61601000", "61611000", "61612000", "61613000", "61620000", "61622000",
  "61623000", "61624000", "61681000",
];
/** Code G — personnel extérieur (le 62100000 ; Sodobat utilise les 6211x). */
const VBTP_INTERIM = ["62100000"];
/** Code U — honoraires de management SDG (ligne « SDG+Planisfere+Aacem » du TG). */
const VBTP_HONORAIRES_MANAGEMENT = ["62260000"];
/** Code V — honoraires comptables, divers, frais d'actes, intermédiaires. */
const VBTP_HONORAIRES_DIVERS = ["62261000", "62268000", "62270000", "62280000"];
/** Sur un chantier, honoraires divers et frais d'actes sont la ligne « HONORAIRES AVOCATS » du TG. */
const VBTP_HONORAIRES_AVOCATS = ["62268000", "62270000"];
/** Code J */
const VBTP_HONORAIRES_CHANTIER = ["62261100"];
/** Code W */
const VBTP_SPONSORING = ["61850000", "62340000", "62380000", "62381000"];
/** Code AA — téléphone, postaux, internet. */
const VBTP_TELECOM = ["62601000", "62610000", "62620000"];
/** Code X (frais bancaires) — services bancaires, intérêts d'emprunts, agios. */
const VBTP_BANCAIRES = ["62780000", "66110000", "66116000", "66160000"];
/** Code AB — cotisations ; 62870000 « divers » des exercices clos, cotisations comme chez CovarBat. */
const VBTP_COTISATIONS = ["62810000", "62870000"];
/** Code X (impôts) — CVAE, CFE, foncier, TVS, droits, IS et crédit d'impôt. */
const VBTP_IMPOTS = [
  "63511000", "63511100", "63512000", "63514000", "63540000", "63580000",
  "63780000", "69500000", "69590000",
];
/**
 * Code F — masse salariale : taxes assises sur les salaires (dont la taxe CCCA
 * de 2021), salaires, congés payés, primes, chômage partiel, intéressement,
 * cotisations, abondement et cadeaux, médecine du travail, formation,
 * remboursements, participation, transferts de charges.
 * Le plan VBTP nomme 64530000 « Pôle emploi » et 64540000 « PROBTP », à
 * l'inverse de Sodobat : la vue Chantiers suit le plan VBTP.
 */
const VBTP_MASSE_SALARIALE = [
  "63330000", "63330100", "63350000", "64100000", "64110000", "64120000",
  "64130000", "64140000", "64142000", "64143000", "64144000", "64170000",
  "64510000", "64515000", "64530000", "64540000", "64580000", "64700000",
  "64701000", "64712000", "64750000", "64810000", "64900000", "69100000",
  "69101000", "79100000", "79101000",
];
/** Code BB — pertes sur créances irrécouvrables (LQ et 20 %). */
const VBTP_IRR = ["65400000", "65420000"];
/**
 * Code AC — documentation, charges et produits divers de gestion, amendes,
 * charges exceptionnelles des exercices clos ; et les dotations / reprises de
 * provisions d'exploitation (garanties données aux clients, 68150000 /
 * 78150000), que la maquette ne cite pas : rangées ici, elles entrent dans le
 * résultat comme en comptabilité. À confirmer avec la DAF.
 */
const VBTP_AUTRES_CHARGES = [
  "61810000", "65800000", "65820000", "67120000", "67180000", "68150000",
  "77180000", "78150000",
];
/** Code ZW — subventions, indemnités d'assurance, intérêts et revenus financiers. */
const VBTP_PRODUITS_FINANCIERS = ["74000000", "74020000", "75870000", "76300000", "76400000", "79150000"];
/** Code ZX — produits de cession (dont les comptes 775 des exercices clos). */
const VBTP_CESSION_IMMO = ["75700000", "77520000", "77530000"];

/**
 * Chantier que Pennylane exporte sans code analytique, rattaché au numéro que
 * lui donne le tableau de gestion de la DAF. Le centre « # + libellé » que
 * l'import crée est lu comme ce numéro ; le numéro lui-même est déclaré pour
 * porter l'intitulé et recevoir les reports d'ouverture du tableau de gestion.
 */
const chantierSansCode = (numero: string, libellePennylane: string, intitule = libellePennylane) =>
  [
    { code: numero, name: intitule, kind: "chantier" as const },
    {
      code: `#${libellePennylane}`,
      name: `${intitule} (sans code dans Pennylane)`,
      kind: "chantier" as const,
      aliasOf: numero,
    },
  ];

const VBTP: EntiteConfig = {
  exercice: { debut: 1 },
  // La prévision de travaux en cours est comptabilisée chantier par chantier
  // sur le 71345000 : à l'ouverture 2026, la reprise de la provision de
  // clôture 2025 au débit ; en cours d'année, la prévision saisie dans
  // l'application se contrôle contre ce compte, comme chez Sodobat.
  provisions: { compte: VBTP_PROVISION, mode: "compte" },
  libelles: {
    syn_sous_traitance_sodobat: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    cha_sous_traitance: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    syn_sous_traitance_direct: "Sous-traitance paiement direct (PD LQ)",
    cha_sous_traitance_direct: "Sous-traitance paiement direct (PD LQ)",
    fx_honoraires_management: "Honoraires de management (SDG)",
    // Ligne « AUTRES CA / REFAC SOFOVAR 70880000 » du TG.
    cha_refacturations: "Autres CA / Refacturation Sofovar",
  },
  regles: {
    // ▸ Synthèse
    syn_ca_travaux: VBTP_CA_TRAVAUX,
    syn_ca_marchandises: VBTP_CA_MARCHANDISES,
    syn_ca_refacturation: VBTP_CA_REFACTURATION,
    syn_tec_provision: [VBTP_PROVISION],
    syn_achats_mp: VBTP_ACHATS,
    syn_sous_traitance_sodobat: VBTP_SOUS_TRAITANCE,
    syn_sous_traitance_direct: VBTP_SOUS_TRAITANCE_DIRECT,
    syn_location_materiel_externe: VBTP_LOCATIONS,
    syn_dechets: VBTP_DECHETS,
    syn_edf_eau_chantier: VBTP_EDF_EAU,
    syn_honoraires_chantier: VBTP_HONORAIRES_CHANTIER,
    syn_masse_salariale: VBTP_MASSE_SALARIALE,
    syn_interims: VBTP_INTERIM,
    syn_cession_immo: VBTP_CESSION_IMMO,
    syn_produits_financiers: VBTP_PRODUITS_FINANCIERS,
    syn_fx_location_immo: VBTP_LOCATION_IMMO,
    syn_fx_credit_bail: VBTP_CREDIT_BAIL,
    syn_fx_assurances: VBTP_ASSURANCES,
    syn_fx_honoraires: [...VBTP_HONORAIRES_MANAGEMENT, ...VBTP_HONORAIRES_DIVERS],
    syn_fx_sponsoring: VBTP_SPONSORING,
    syn_fx_telecom: VBTP_TELECOM,
    syn_fx_cotisations: VBTP_COTISATIONS,
    syn_fx_bancaires: VBTP_BANCAIRES,
    syn_fx_irr: VBTP_IRR,
    syn_autres_charges: VBTP_AUTRES_CHARGES,
    syn_impots_taxes: VBTP_IMPOTS,

    // ▸ Activité chantier
    cha_produits_prestations_20: VBTP_CA_PRESTATIONS_20,
    cha_produits_prestations_0: VBTP_CA_PRESTATIONS_0,
    cha_produits_prestations_10: VBTP_CA_PRESTATIONS_10,
    cha_produits_travaux_sinistres: VBTP_CA_TRAVAUX_SINISTRES,
    cha_produits_marchandises: VBTP_CA_MARCHANDISES,
    cha_refacturations: VBTP_CA_REFACTURATION,
    cha_provision: [VBTP_PROVISION],
    cha_achats_mp: ["60100000", "60100920"],
    cha_petit_materiel: ["60630000", "60635000"],
    cha_autres_achats: ["60640000", "60650000", "60970000"],
    cha_locations: VBTP_LOCATIONS,
    cha_dechets: VBTP_DECHETS,
    cha_sous_traitance: VBTP_SOUS_TRAITANCE,
    cha_sous_traitance_direct: VBTP_SOUS_TRAITANCE_DIRECT,
    cha_edf_eau: VBTP_EDF_EAU,
    // Pénalités et impôts imputés à un chantier, et les charges que les
    // balances des exercices clos imputent ponctuellement à un chantier :
    // variation de stock, assurance décennale, créances irrécouvrables et leur
    // dépréciation (ligne « PROV CLT Douteux » du TG).
    cha_autres_charges: [
      ...VBTP_IMPOTS, "65820000", "67120000", "67180000", "77180000",
      "60310000", "61620000", "65400000", "65420000", "68174000",
    ],
    // Ligne « FRANCHISE SINISTRE 61681000/658 » du TG, propre à VBTP.
    cha_franchise_sinistre: ["61681000", "65800000"],
    cha_formation_continue: ["63330000", "63330100"],
    cha_taxe_apprentissage: ["63350000"],
    cha_salaires: ["64100000", "64110000", "64120000"],
    cha_primes: ["64130000", "64140000", "64142000", "64143000", "64144000"],
    cha_urssaf: ["64510000"],
    cha_conges_payes: ["64515000"],
    cha_pole_emploi: ["64530000"],
    cha_probtp: ["64540000"],
    cha_autres_personnel: [
      "64170000", "64580000", "64700000", "64701000", "64712000", "64750000",
      "64810000", "69100000", "69101000", "79101000",
    ],
    // Ligne « INDEMNITES SUR CHARGES DE PERSONNEL 64900000 » du TG, propre à VBTP.
    cha_indemnites_personnel: ["64900000"],
    cha_interim: VBTP_INTERIM,
    // « HONORAIRES CHANTIER » du TG ; les honoraires divers et frais d'actes vont
    // sur la ligne « HONORAIRES AVOCATS 6227/62268000/7910 », avec les transferts de charges.
    cha_honoraires: [...VBTP_HONORAIRES_MANAGEMENT, "62261000", "62280000", ...VBTP_HONORAIRES_CHANTIER],
    cha_honoraires_avocats: [...VBTP_HONORAIRES_AVOCATS, "79100000"],

    // ▸ Frais généraux
    fx_honoraires_management: VBTP_HONORAIRES_MANAGEMENT,
    fx_honoraires_divers: [...VBTP_HONORAIRES_DIVERS, ...VBTP_HONORAIRES_CHANTIER],
    fx_ms_structure: [...VBTP_MASSE_SALARIALE, ...VBTP_INTERIM],
    fx_edf_eau: VBTP_EDF_EAU,
    fx_achats_fournitures: VBTP_ACHATS,
    fx_location_immo: VBTP_LOCATION_IMMO,
    fx_location_vehicules: VBTP_LOCATIONS,
    fx_dechets: VBTP_DECHETS,
    fx_credit_bail: VBTP_CREDIT_BAIL,
    fx_assurances: VBTP_ASSURANCES,
    fx_sponsoring: VBTP_SPONSORING,
    fx_telecom: VBTP_TELECOM,
    fx_cotisations: VBTP_COTISATIONS,
    fx_impots: VBTP_IMPOTS,
    fx_bancaires: VBTP_BANCAIRES,
    fx_irr: VBTP_IRR,
    // Sous-traitance imputée à un centre de structure : hors maquette FX, gardée en autres charges.
    fx_autres: [...VBTP_AUTRES_CHARGES, ...VBTP_SOUS_TRAITANCE, ...VBTP_SOUS_TRAITANCE_DIRECT],
    fx_produits_structure: [
      ...VBTP_CA_TRAVAUX, ...VBTP_CA_MARCHANDISES, ...VBTP_CA_REFACTURATION, VBTP_PROVISION,
      "74000000", "74020000", "76300000", "76400000", "79150000", "77530000",
    ],
  },
  centres: [
    // Chantiers que Pennylane exporte sans code dans les balances 2026, rattachés
    // au numéro qu'ils portent dans le tableau de gestion de la DAF (lecture à
    // lui confirmer) ; le libellé Pennylane est parfois tronqué.
    ...chantierSansCode("688", "MAS CHASTELAS"),
    ...chantierSansCode("699", "PADEL ROQUEBRUNE SODOBAT"),
    ...chantierSansCode("718", "GYMNASE VALLAURIS SODOBAT"),
    ...chantierSansCode("723", "MAISON DE SANTE PLAN DE LA TOU", "MAISON DE SANTE PLAN DE LA TOUR"),
    ...chantierSansCode("724", "SNC COGO"),
    ...chantierSansCode("728", "PROMOGIM SUVERET"),
    ...chantierSansCode("731", "DIVERS FREJUS RAPH PUG ROQ"),
    ...chantierSansCode("732", "ENTREPOT CUSHMAN"),
    ...chantierSansCode("738", "PLACE LA MARTINE", "PLACE LA MARTINE (ST RAPHAEL)"),
    ...chantierSansCode("740", "LE MAS D'HIVER"),
    ...chantierSansCode("741", "CHOPARD ESTEREL"),
    // « DIV · DIVERS » : petits travaux facturés, avec leurs charges. C'est la
    // colonne « 715 DIVERS » du tableau de gestion (CA et résultat identiques
    // de janvier à mars 2026), un chantier et non de la structure. FX, DEP
    // (dépôt), QUADRA et « Non catégorisé » restent structure.
    { code: "715", name: "DIVERS", kind: "chantier" },
    { code: "DIV", name: "DIVERS (code DIV dans Pennylane)", kind: "chantier", aliasOf: "715" },
  ],
};

// ── Easy Mat ─────────────────────────────────────────────────────────────────
// Sources : plan comptable Easy Mat 2026 (colonnes Onglet / Libellé / Code =
// lettre de la maquette), balances Pennylane 2025/26 (ventilée novembre → juin,
// analytiques mensuelles), balances analytiques Quadra des exercices 2021/22 à
// 2024/25, maquette structurelle du groupe (colonne Entités), tableau de
// gestion « 2026 06_TG EASYMAT » (onglet « EM 2026 ») et classeur « 2026_EASYMAT
// FX » de la DAF, lus comme référence de forme : la comptabilité fait foi.
// Exercice novembre → octobre. Les comptes sont écrits sur 8 chiffres, comme
// l'import les normalise (Pennylane les exporte sur 12 pour ce dossier).
//
// Easy Mat loue du matériel et des modules, aménage et revend des marchandises :
// son chiffre d'affaires a une ligne « CA Location » (code L) que Sodobat n'a
// pas, et ses achats de marchandises (code R) sont suivis à part des matières.
//
// Règle du groupe appliquée : à compte égal et de même nature, le code de
// Sodobat prévaut sur le plan Easy Mat — 62800000 « frais divers don » reste en
// cotisations, où la maquette du groupe et le tableau de gestion le mettent ;
// 70880000 « comptes prorata » reste en refacturation ; 61100000 reste en
// sous-traitance, comme le plan le code, bien que le classeur FX de la DAF
// l'appelle « honoraire informatique (Planiphère) » (point ouvert). Les écarts
// de nature sont tranchés par le plan Easy Mat : 61351000 « location bennes »
// est du déchet (code E), 60611000 « carburant chantier » du carburant (code I),
// 62261000 « honoraires divers » un honoraire de structure (code V), 62262000
// « prestations management » l'honoraire SDG (code U).

// Les produits suivent les lignes du tableau de gestion d'Easy Mat : Locations,
// Presta aménagement, Modules en loc, Ventes M/ses, Assurances. Les comptes de
// travaux et de prestations du plan (7040…, 7060…) n'ont jamais bougé dans les
// balances importées ; ils restent rattachés aux prestations.
/** Code K — prestations d'aménagement et d'agencement, travaux (comptes historiques du plan). */
const EASYMAT_CA_PRESTATIONS = [
  "70400001", "70400002", "70400003", "70400005", "70400051", "70400052",
  "70400053", "70400054", "70400055", "70400500", "70401900", "70455000",
  "70482000", "70492000", "70600000", "70601900", "70602100", "70611000",
  "70611005", "70611007",
];
/** Code K — assurance refacturée au client. */
const EASYMAT_CA_ASSURANCES = ["70410000", "70410005"];
/** Code L — locations de matériel et locations diverses, en France et à l'étranger. */
const EASYMAT_CA_LOCATION = ["70610000", "70610005"];
/** Code L — modules en location, en France et à l'étranger. */
const EASYMAT_CA_MODULES = ["70612000", "70612005"];
/** Code M — ventes de marchandises et de modules ; le 70701900 est commun au groupe. */
const EASYMAT_CA_MARCHANDISES = ["70700000", "70700500", "70703000", "70711000", "70782000"];
/** Code N — assurance / location refacturée (exercice 2021) ; le 70880000 est commun au groupe. */
const EASYMAT_CA_REFACTURATION = ["70890110"];
/**
 * Code O — le compte de prévision : « Travaux en cours » 71331000 depuis
 * février 2026 ; de décembre 2025 à février 2026, le cabinet a passé la
 * prévision et sa reprise sur le 71340000 « Variation de stock en cours ».
 * Les deux comptes forment un même bloc, lu chantier par chantier.
 */
const EASYMAT_PROVISION = "71331000";
const EASYMAT_PROVISION_ANCIEN = "71340000";
/** Code A — matières (dont UE), consommables, fournitures magasin, équipement, frais accessoires, RRR, transports. */
const EASYMAT_ACHATS = [
  "60100500", "60110000", "60210000", "60224000", "60224900", "60500000",
  "60631000", "60680000", "60810000", "60910000", "60920000", "60940000",
  "60950000", "60960000", "60980000", "62419000",
];
/** Code R — marchandises revendues en l'état : modules, bungalows, licences, achats UE, RRR. */
const EASYMAT_MARCHANDISES = [
  "60700500", "60700900", "60700950", "60701900", "60702000", "60710000",
  "60710005", "60710900", "60720000", "60970000",
];
/** Code Z — variation des stocks de petit outillage et de marchandises. */
const EASYMAT_VARIATION_STOCK = ["60320000", "60370000"];
/** Code C — sous-traitance 0 %, agencement, étranger, compte prorata ; 60400000, 60412000 et 61100000 sont communs. */
const EASYMAT_SOUS_TRAITANCE = ["60410000", "60419600", "60430000", "60440000"];
/** Code E — traitement des déchets et location de bennes (location de transport chez Sodobat). */
const EASYMAT_DECHETS = ["60420000", "61351000"];
/** Code B — location de matériel (le cœur du métier, 287 k€ sur huit mois) et location Jaguar (2021). */
const EASYMAT_LOCATIONS = ["61351100", "61351120"];
/** Code H — EDF de chantier ; 60610000 (eau) et 60612100 (EDF) sont communs au groupe. */
const EASYMAT_EDF_EAU_CHANTIER = ["60610100"];
/** Code P — eau du siège, lue comme l'EDF du siège de Sodobat (60611000). */
const EASYMAT_EAU_SIEGE = ["60610010"];
/** Code I — carburant de chantier (compte « fournitures non stockées »), fuel, carburants véhicules. */
const EASYMAT_CARBURANT = ["60611000", "60611100", "60611200", "60614100", "60614150"];
/** Code S */
const EASYMAT_ENTRETIEN = [
  "61550007", "61550009", "61550200", "61550300", "61550400", "61551000", "61570000",
];
/** Code Q — un compte par contrat de crédit-bail ou de leasing (modules, climatisations, véhicules, chariot). */
// Un compte par contrat. Dans la vue Frais généraux, les contrats forment le
// bloc « Total 3 — Crédit-bail » de leur tableau de gestion, véhicules d'un
// côté, matériel, modules et équipements de l'autre. Le classement suit le
// libellé du compte dans la balance ; cinq contrats au libellé muet (MSX2,
// « achat groupe », Sogelease 1854 et 717, Mobika) sont rangés en matériel.
const EASYMAT_CB_VEHICULES = [
  "61200034", // Peugeot Partner
  "61210002", // Nissan (2)
  "61210003", // Nissan (3)
  "61210004", // Hyundai (4)
  "61210015", // Citroën C3
  "61210021", // Audi Q3
  "61210023", // Jumpy
];
const EASYMAT_CB_MATERIEL = [
  "61200025", "61200026", "61200027", "61200028", "61200029", "61200030",
  "61200031", "61200032", "61200033", "61200035", "61200036", "61200037",
  "61210001", "61210005", "61210006", "61210012", "61210013", "61210017",
  "61210018", "61210019", "61210020", "61210022", "61222000", "61222100",
  "61254271",
  // Coffrets SACEM et Sogelease 2871 : comptes communs au groupe, présents dans
  // les balances des exercices clos d'Easy Mat, à garder dans son bloc.
  "61200000", "61220000",
];
/** Code Q — tous les contrats, pour la Synthèse où le crédit-bail reste une ligne. */
const EASYMAT_CREDIT_BAIL = [...EASYMAT_CB_VEHICULES, ...EASYMAT_CB_MATERIEL];
/** Code P — SCI Easy Invest, SCI Grégoriou, SCI Le Bouisset, SDG ; 61323000 et 61400000 sont communs. */
const EASYMAT_LOCATION_IMMO = ["61324000", "61325000", "61326000", "61327000"];
/** Code T */
const EASYMAT_ASSURANCES = [
  "61600000", "61631000", "61632000", "61633000", "61634000", "61635000",
  "61636000", "61637000", "61638000", "61640000", "61650000", "61668888",
  "61680000", "61682000",
];
/** Code U — prestations de management SDG (ligne « Honoraires SDG » du classeur FX). */
const EASYMAT_HONORAIRES_MANAGEMENT = ["62262000"];
/** Code V — honoraires divers (chantier chez Sodobat) et commissions sur ventes (2024). */
const EASYMAT_HONORAIRES_DIVERS = ["62261000", "62220000"];
/** Code W — publicité, annonces, sponsoring, dons et mécénat, décoration. */
const EASYMAT_SPONSORING = ["62300000", "62310000", "62331000", "62380000", "62380100"];
/** Code AA — téléphone (dont de chantier), internet. */
const EASYMAT_TELECOM = ["62610000", "62611000", "62620000", "62630000"];
/** Code X (frais bancaires) */
const EASYMAT_BANCAIRES = ["62750000", "62780020", "62780200"];
/** Code X (impôts) — impôts divers et indirects, cartes grises, crédit d'impôt. */
const EASYMAT_IMPOTS = ["63520000", "63530000", "63580100", "69900000"];
/** Code F — masse salariale propre à Easy Mat, par nature pour la vue Chantiers. */
const EASYMAT_MS_SALAIRES = ["64115000", "64120000"];
const EASYMAT_MS_PRIMES = ["64141000", "64142000", "64145000", "64146000", "64149000"];
const EASYMAT_MS_PREVOYANCE = ["64520000", "64525000", "64531000", "64532000", "64535000"];
const EASYMAT_MS_AUTRES = [
  "64111000", "64112000", "64113000", "64114000", "64119000", "64400000",
  "64580000", "64581000", "64610000", "64620000", "64630000", "64690000",
  "64700000", "64712000", "64751000", "64780000", "64820000", "64910000",
  "64920000", "69100000",
];
const EASYMAT_MASSE_SALARIALE = [
  ...EASYMAT_MS_SALAIRES, ...EASYMAT_MS_PRIMES, ...EASYMAT_MS_PREVOYANCE, ...EASYMAT_MS_AUTRES,
];
/** Code G — intérim imputé à la structure : en masse salariale sédentaire, comme chez VBTP. */
const EASYMAT_INTERIM = ["62110000"];
/** Code BB */
const EASYMAT_IRR = ["65400000", "65400099", "65410000", "65411000", "65440000"];
/** Code AD — valeur comptable des immobilisations cédées, ancien compte des exercices 2021 à 2023. */
const EASYMAT_VNC = ["65820000"];
/** Code AC */
const EASYMAT_AUTRES_CHARGES = ["61830000", "65830000"];
/** Code AC (produits) — loyers, profits antérieurs, rétrocession de matériel, produits exceptionnels. */
const EASYMAT_PRODUITS_GESTION = ["75200000", "77200000", "77510000", "77800000"];
/** Code ZX — produits de cession des exercices 2021 à 2023 ; le 75700000 est commun au groupe. */
const EASYMAT_CESSION_IMMO = ["75820000", "75830000"];
/** Code ZW — subvention formation, revenus de créances ; les autres comptes sont communs. */
const EASYMAT_PRODUITS_FINANCIERS = ["74020000", "76300000"];
/** Code ZY — amortissement des logiciels, lissé avec les corporels (COMPTES_DOTATIONS). */
const EASYMAT_DOTATIONS = ["68111000"];
/** Dotations financières (compte vide de l'exercice 2023/24), en autres charges. */
const EASYMAT_DOTATIONS_FINANCIERES = ["68600000"];
/**
 * Charges de structure imputées à une affaire dans les balances Quadra ou
 * Pennylane (loyer, crédit-bail, assurance, téléphone, frais bancaires,
 * cotisations, créances irrécouvrables, VNC) : hors maquette chantier, elles
 * restent sur l'affaire en « autres charges » plutôt que de disparaître.
 */
const EASYMAT_CHA_AUTRES_CHARGES = [
  ...EASYMAT_IMPOTS, ...EASYMAT_AUTRES_CHARGES, ...EASYMAT_DOTATIONS_FINANCIERES,
  ...EASYMAT_TELECOM, "62600000",
  ...EASYMAT_BANCAIRES, "62780000", "66110000", "66160100",
  ...EASYMAT_LOCATION_IMMO, ...EASYMAT_EAU_SIEGE, "61323000", "61400000",
  ...EASYMAT_CREDIT_BAIL,
  ...EASYMAT_ASSURANCES, "61610000", "61612000", "61620000", "61630000", "61681000",
  ...EASYMAT_SPONSORING, "62340000", "62381000", "61850000",
  "62800000", "62810000",
  ...EASYMAT_IRR, "65420000", "65800000", ...EASYMAT_VNC,
];
/** Produits hors CA imputés à une affaire : cessions de modules, subventions, produits financiers. */
const EASYMAT_CHA_PRODUITS_DIVERS = [
  ...EASYMAT_PRODUITS_GESTION, "75700000", ...EASYMAT_CESSION_IMMO,
  "74000000", "76000000", "76400000", ...EASYMAT_PRODUITS_FINANCIERS,
];

/**
 * Centres de structure d'Easy Mat. Ses affaires portent des codes lettrés
 * (MFR191, AO250428, VI156, ECL101…) que la règle commune — un chiffre en tête
 * = chantier — prendrait pour de la structure : la structure est donc énumérée,
 * tout autre centre est une affaire. Sont de la structure : FX (frais généraux),
 * QUADRA (« Créé par QuadraCOMPTA » : crédits-baux, dotations, VNC), les dépôts
 * (DEPOT MP, DEPOT MP2, DEPOT PISAN), SDG, DIVERS (charges non affectées :
 * loyers, intérim, créances irrécouvrables dans les exercices Quadra), les
 * véhicules suivis comme des centres (Audi Q3, Nemo, camion benne, Jaguar), le
 * centre « ? » des écritures Quadra sans code, et les écritures que Pennylane
 * exporte sans code (« Non catégorisé » — tout le chiffre d'affaires 2025/26 —
 * et « Créé par Import ASCII »). Lecture à confirmer avec la DAF pour DIVERS et
 * EXTERIEUR (locations et prestations hors affaire, lu ici comme une affaire).
 */
const EASYMAT_STRUCTURE = [
  /^FX$/, /^QUADRA$/, /^DEPOT\b/, /^SDG$/, /^DIVERS$/,
  /^GM683ER$/, /^615[ A-Z]/, /^417ET$/, /^\?$/, /^#/,
];

const EASYMAT: EntiteConfig = {
  exercice: { debut: 11 },
  // Réponse de la DAF du 6 octobre 2026 : prévision sur le 71331 « en une seule
  // écriture ». Les balances analytiques Pennylane la ventilent pourtant
  // chantier par chantier (SPL101, AMI100, AO250428… : chaque prévision reprise
  // le mois suivant), comme chez Sodobat : elle se lit donc dans le compte, et
  // la Synthèse retrouve à l'euro les lignes « Travaux en cours mois » et
  // « Reprise travaux en cours » de son tableau de gestion.
  provisions: { compte: EASYMAT_PROVISION, mode: "compte", autresComptes: [EASYMAT_PROVISION_ANCIEN] },
  centresStructure: EASYMAT_STRUCTURE,
  libelles: {
    syn_sous_traitance_sodobat: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    cha_sous_traitance: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    fx_honoraires_management: "Honoraires de management (SDG)",
    fx_location_vehicules: "Location de matériel et de véhicules",
    // Le crédit-bail forme un « Total 3 » : le total général devient le quatrième.
    fx_total_general: "TOTAL 4 — Honoraires + Frais généraux + Crédit-bail (Total 1 + Total 2 + Total 3)",
    // Easy Mat impute ses achats de stock et de marchandises aux centres FX et
    // dépôts : la part « structure » des achats dépasse le petit outillage.
    syn_fx_achats_structure: "Achats et marchandises imputés à la structure (FX, dépôts)",
  },
  regles: {
    // ▸ Synthèse
    syn_ca_location: EASYMAT_CA_LOCATION,
    syn_ca_prestations: EASYMAT_CA_PRESTATIONS,
    syn_ca_modules: EASYMAT_CA_MODULES,
    syn_ca_assurances: EASYMAT_CA_ASSURANCES,
    syn_ca_marchandises: EASYMAT_CA_MARCHANDISES,
    syn_ca_refacturation: EASYMAT_CA_REFACTURATION,
    syn_tec_provision: [EASYMAT_PROVISION_ANCIEN],
    syn_achats_mp: EASYMAT_ACHATS,
    syn_achats_marchandises: EASYMAT_MARCHANDISES,
    syn_variation_stock: EASYMAT_VARIATION_STOCK,
    syn_sous_traitance_sodobat: EASYMAT_SOUS_TRAITANCE,
    syn_location_materiel_externe: EASYMAT_LOCATIONS,
    syn_dechets: EASYMAT_DECHETS,
    syn_entretien: EASYMAT_ENTRETIEN,
    syn_edf_eau_chantier: EASYMAT_EDF_EAU_CHANTIER,
    syn_carburant: EASYMAT_CARBURANT,
    syn_masse_salariale: EASYMAT_MASSE_SALARIALE,
    syn_cession_immo: EASYMAT_CESSION_IMMO,
    syn_produits_financiers: EASYMAT_PRODUITS_FINANCIERS,
    syn_produits_gestion: EASYMAT_PRODUITS_GESTION,
    syn_fx_location_immo: [...EASYMAT_LOCATION_IMMO, ...EASYMAT_EAU_SIEGE],
    syn_fx_credit_bail: EASYMAT_CREDIT_BAIL,
    syn_fx_assurances: EASYMAT_ASSURANCES,
    syn_fx_honoraires: EASYMAT_HONORAIRES_DIVERS,
    syn_fx_sponsoring: EASYMAT_SPONSORING,
    syn_fx_telecom: EASYMAT_TELECOM,
    syn_fx_bancaires: EASYMAT_BANCAIRES,
    syn_fx_irr: EASYMAT_IRR,
    syn_autres_charges: [...EASYMAT_AUTRES_CHARGES, ...EASYMAT_DOTATIONS_FINANCIERES],
    syn_impots_taxes: EASYMAT_IMPOTS,
    syn_dap_comptabilisee: EASYMAT_DOTATIONS,
    syn_retraitement_vnc: EASYMAT_VNC,

    // ▸ Activité chantier
    cha_produits_location: EASYMAT_CA_LOCATION,
    cha_produits_prestations: EASYMAT_CA_PRESTATIONS,
    cha_produits_modules: EASYMAT_CA_MODULES,
    cha_produits_assurances: EASYMAT_CA_ASSURANCES,
    cha_produits_marchandises: EASYMAT_CA_MARCHANDISES,
    cha_refacturations: EASYMAT_CA_REFACTURATION,
    cha_provision: [EASYMAT_PROVISION_ANCIEN],
    cha_produits_divers: EASYMAT_CHA_PRODUITS_DIVERS,
    cha_achats_mp: ["60100500", "60110000", "60210000", "60224000", "60224900", "60500000"],
    cha_achats_marchandises: EASYMAT_MARCHANDISES,
    cha_autres_achats: [
      "60631000", "60680000", "60810000", "60910000", "60920000", "60940000",
      "60950000", "60960000", "60980000", "62419000",
    ],
    cha_locations: EASYMAT_LOCATIONS,
    cha_dechets: EASYMAT_DECHETS,
    cha_sous_traitance: EASYMAT_SOUS_TRAITANCE,
    cha_edf_eau: EASYMAT_EDF_EAU_CHANTIER,
    cha_carburant: EASYMAT_CARBURANT,
    cha_entretien: EASYMAT_ENTRETIEN,
    cha_autres_charges: EASYMAT_CHA_AUTRES_CHARGES,
    cha_salaires: EASYMAT_MS_SALAIRES,
    cha_primes: EASYMAT_MS_PRIMES,
    cha_probtp: EASYMAT_MS_PREVOYANCE,
    cha_autres_personnel: EASYMAT_MS_AUTRES,
    cha_honoraires: EASYMAT_HONORAIRES_DIVERS,

    // ▸ Frais généraux
    fx_honoraires_management: EASYMAT_HONORAIRES_MANAGEMENT,
    // Gardiennage (code J chez Sodobat) imputé à la structure : honoraires divers.
    fx_honoraires_divers: [...EASYMAT_HONORAIRES_DIVERS, "62820000"],
    fx_ms_structure: [...EASYMAT_MASSE_SALARIALE, ...EASYMAT_INTERIM],
    fx_carburant: EASYMAT_CARBURANT,
    // Eau et EDF de chantier imputées à la structure (60610000, 60612100 : communs au groupe, sans ligne FX chez Sodobat).
    fx_edf_eau: [...EASYMAT_EDF_EAU_CHANTIER, ...EASYMAT_EAU_SIEGE, "60610000", "60612100"],
    fx_achats_fournitures: EASYMAT_ACHATS,
    fx_achats_marchandises: EASYMAT_MARCHANDISES,
    fx_variation_stock: EASYMAT_VARIATION_STOCK,
    fx_location_immo: EASYMAT_LOCATION_IMMO,
    fx_location_vehicules: EASYMAT_LOCATIONS,
    fx_dechets: EASYMAT_DECHETS,
    fx_entretien: EASYMAT_ENTRETIEN,
    fx_cb_vehicules: EASYMAT_CB_VEHICULES,
    fx_cb_materiel: EASYMAT_CB_MATERIEL,
    fx_assurances: EASYMAT_ASSURANCES,
    fx_sponsoring: EASYMAT_SPONSORING,
    fx_telecom: EASYMAT_TELECOM,
    fx_bancaires: EASYMAT_BANCAIRES,
    fx_impots: EASYMAT_IMPOTS,
    fx_irr: EASYMAT_IRR,
    fx_dotations: EASYMAT_DOTATIONS,
    fx_vnc: EASYMAT_VNC,
    // Sous-traitance imputée à un centre de structure : hors maquette FX, gardée en autres charges.
    fx_autres: [
      ...EASYMAT_AUTRES_CHARGES, ...EASYMAT_DOTATIONS_FINANCIERES,
      ...EASYMAT_SOUS_TRAITANCE, "60400000", "60412000", "61100000",
    ],
    fx_produits_structure: [
      ...EASYMAT_CA_PRESTATIONS, ...EASYMAT_CA_ASSURANCES, ...EASYMAT_CA_LOCATION,
      ...EASYMAT_CA_MODULES, ...EASYMAT_CA_MARCHANDISES,
      ...EASYMAT_CA_REFACTURATION, EASYMAT_PROVISION_ANCIEN, ...EASYMAT_PRODUITS_GESTION,
      ...EASYMAT_CESSION_IMMO, ...EASYMAT_PRODUITS_FINANCIERS,
    ],
  },
  // La nature des centres se lit dans la règle ci-dessus (centresStructure) :
  // aucune exception à poser en base.
  centres: [],
};

// ── Easy Home ────────────────────────────────────────────────────────────────
// Sources : plan comptable Easy Home 2026 (colonnes Onglet / Libellé / Code =
// lettre de la maquette), balances analytiques Pennylane 2025/26 (mensuelles,
// novembre → juin), balances analytiques Quadra des exercices 2022/23 à 2024/25
// (« BALANCE ARCHIVE »), maquette structurelle du groupe, tableau de gestion
// « 2026 06_TG EASYHOME » (onglet « EH 2026 ») et classeur « 2026_EASYHOME FX »
// de la DAF, lus comme référence de forme : la comptabilité fait foi. Exercice
// novembre → octobre, comptes Pennylane sur 12 chiffres ramenés à 8.
//
// Même métier qu'Easy Mat (aménagement, location de modules, revente de
// marchandises), mêmes lignes propres : « CA Location » (code L) et « Achats de
// marchandises » (code R). Règle de la DAF appliquée quand les deux plans se
// contredisent : un compte déjà affecté chez Easy Mat garde son code —
// 70612000 « modules en location » reste en location (le plan Easy Home le
// code K), 70410000 « assurance / location » reste en travaux (plan L),
// 62310000 « annonces » reste en sponsoring (plan V). À compte égal et de même
// nature, le code de Sodobat prévaut : 62800000 « frais divers » reste en
// cotisations (plan AC), ligne « 628 Cotisations, dons salariés » du tableau
// de gestion. Le 60412000 « sous-traitant PD » est du paiement direct (code D),
// comme son libellé et le plan le disent : la ligne est ouverte à Easy Home.

// Les produits suivent les lignes du tableau de gestion d'Easy Home : Locations,
// Presta aménagement, Modules en loc, Presta administratives, Ventes M/ses, Assurances.
/** Code K — prestations d'aménagement et d'agencement. */
const EASYHOME_CA_PRESTATIONS = ["70611000", "70611010"];
/** Code K — prestations administratives, services au pourcentage. */
const EASYHOME_CA_PRESTATIONS_ADMIN = ["70680000", "70681000"];
/** Code K — assurance et location refacturées au client. */
const EASYHOME_CA_ASSURANCES = ["70410000"];
/** Code L — locations diverses, location Jaguar (2022). */
const EASYHOME_CA_LOCATION = ["70610000", "70610999"];
/** Code L — modules en location. */
const EASYHOME_CA_MODULES = ["70612000"];
/** Code M — bungalows et marchandises ; le 70701900 est commun au groupe. */
const EASYHOME_CA_MARCHANDISES = ["70720000", "70792000"];
/** Code O — « Travaux en cours » : le compte de prévision d'Easy Home. */
const EASYHOME_PROVISION = "71350000";
/** Code A — matières UE, fournitures magasin et UE, petite fourniture, remises. */
const EASYHOME_ACHATS = ["60100900", "60224000", "60224900", "60630900", "60900900"];
/** Code R */
const EASYHOME_MARCHANDISES = ["60700900", "60710000"];
/** Code Z — variation de stock de marchandises ; le 60310000 est commun au groupe. */
const EASYHOME_VARIATION_STOCK = ["60370000"];
/** Code C — sous-traitance non assujettie, LQ, TVA 0 ; 60400000 est commun au groupe. */
const EASYHOME_SOUS_TRAITANCE = ["60410000", "60412001", "60430000"];
/** Code D — sous-traitant en paiement direct (155 k€ sur trois exercices). */
const EASYHOME_SOUS_TRAITANCE_DIRECT = ["60412000"];
/** Code E — location de bennes et déchets (location de transport chez Sodobat). */
const EASYHOME_DECHETS = ["61351000"];
/** Code B — location de matériel (le cœur du métier). */
const EASYHOME_LOCATION_MATERIEL = ["61351100"];
/** Code B — locations longue durée de véhicules (Volkswagen, Toyota), location de véhicule, location UE. */
const EASYHOME_LOCATION_VEHICULES = ["61325000", "61325100", "61325200", "61326000", "61350700", "61350900"];
/** Code H — eau et EDF de chantier. */
const EASYHOME_EDF_EAU_CHANTIER = ["60610010", "60610100"];
/** Code P — eau du siège (eau de chantier chez Sodobat), lue comme l'EDF du siège. */
const EASYHOME_EAU_SIEGE = ["60610000"];
/** Code I */
const EASYHOME_CARBURANT = ["60614111", "60614222"];
const EASYHOME_DEPLACEMENTS = ["62510009"];
/** Code S */
const EASYHOME_ENTRETIEN = ["61550009", "61550099"];
/** Code Q — leasings de modules (comptes des balances Quadra) et pont roulant CIC. */
// Un compte par contrat ; dans la vue Frais généraux, bloc « Total 3 — Crédit-bail ».
const EASYHOME_CB_VEHICULES = ["61210003"]; // reprise camion Nissan
const EASYHOME_CB_MATERIEL = ["61210001", "61210002", "61210004", "61325300"]; // modules, ensemble modulaire, pont roulant
/** Code Q — tous les contrats, pour la Synthèse où le crédit-bail reste une ligne. */
const EASYHOME_CREDIT_BAIL = [...EASYHOME_CB_VEHICULES, ...EASYHOME_CB_MATERIEL];
/** Code P — SDG, SCI Easy Invest ; 61323000 et 61400000 sont communs au groupe. */
const EASYHOME_LOCATION_IMMO = ["61322000", "61324000"];
/** Code T */
const EASYHOME_ASSURANCES = ["61600000", "61611000", "61640000", "61650000", "61680000", "61682000"];
/** Code U */
const EASYHOME_HONORAIRES_MANAGEMENT = ["62262000"];
/** Code V — honoraire informatique (chantier chez Sodobat), commissions, intermédiaires. */
const EASYHOME_HONORAIRES_DIVERS = ["62220000", "62222222", "62261000"];
/** Code W — publicité, annonces, catalogues (2023), sponsoring. */
const EASYHOME_SPONSORING = ["62300000", "62310000", "62310007", "62360000", "62380000"];
/** Code AA */
const EASYHOME_TELECOM = ["62610000"];
/** Code X (frais bancaires) */
const EASYHOME_BANCAIRES = ["62780020", "66150000"];
/** Code X (impôts) — crédit d'impôt. */
const EASYHOME_IMPOTS = ["69900000"];
/** Code F — masse salariale propre à Easy Home, par nature pour la vue Chantiers. */
const EASYHOME_MS_TAXE_APPRENTISSAGE = ["63120000"];
const EASYHOME_MS_SALAIRES = ["64115000", "64120000"];
const EASYHOME_MS_PRIMES = ["64142000"];
const EASYHOME_MS_PREVOYANCE = ["64520000", "64531000", "64532000"];
const EASYHOME_MS_AUTRES = ["63581000", "64121000", "64580000", "64712000", "64820000", "64910000", "69100000"];
const EASYHOME_MASSE_SALARIALE = [
  ...EASYHOME_MS_TAXE_APPRENTISSAGE, ...EASYHOME_MS_SALAIRES, ...EASYHOME_MS_PRIMES,
  ...EASYHOME_MS_PREVOYANCE, ...EASYHOME_MS_AUTRES,
];
/** Code G — intérim imputé à la structure : en masse salariale sédentaire. */
const EASYHOME_INTERIM = ["62110000"];
/** Code BB */
const EASYHOME_IRR = ["65410000"];
/** Code AD — valeur comptable des immobilisations cédées (compte de l'exercice 2022/23). */
const EASYHOME_VNC = ["65820000"];
/** Code AC (produits) — profits sur exercices antérieurs. */
const EASYHOME_PRODUITS_GESTION = ["77200000"];
/** Code ZX — produits de cession ; le 75700000 est commun au groupe. */
const EASYHOME_CESSION_IMMO = ["75820000", "75821000"];
/** Code ZW — subvention formation, revenus des prêts, intérêts des comptes à terme. */
const EASYHOME_PRODUITS_FINANCIERS = ["74020000", "76260000", "76300000"];
/** Code ZY — amortissement des incorporels, lissé avec les corporels. */
const EASYHOME_DOTATIONS = ["68111000"];
/** Charges de structure imputées à une affaire : gardées sur l'affaire en « autres charges ». */
const EASYHOME_CHA_AUTRES_CHARGES = [
  ...EASYHOME_IMPOTS, ...EASYHOME_TELECOM, ...EASYHOME_BANCAIRES, "62780000", "66110000", "66160100",
  ...EASYHOME_LOCATION_IMMO, ...EASYHOME_EAU_SIEGE, "61323000", "61400000", "60612000",
  ...EASYHOME_CREDIT_BAIL, "61200000",
  ...EASYHOME_ASSURANCES, "61610000", "61620000", "61630000", "61681000",
  ...EASYHOME_SPONSORING, "61850000", "62340000",
  "62800000", ...EASYHOME_IRR, "65800000", ...EASYHOME_VNC,
];
/** Produits hors CA imputés à une affaire : cessions, subventions, intérêts, produits divers. */
const EASYHOME_CHA_PRODUITS_DIVERS = [
  ...EASYHOME_PRODUITS_GESTION, "75700000", ...EASYHOME_CESSION_IMMO, ...EASYHOME_PRODUITS_FINANCIERS,
];

/**
 * Centres de structure d'Easy Home. Comme chez Easy Mat, les affaires portent
 * des codes lettrés (PR364, STRA125, AI115, MSR115…) : la structure est
 * énumérée, tout autre centre est une affaire. Structure : FX, QUADRA
 * (crédits-baux, dotations, VNC), les dépôts (DEPOT, DEPOT NEW), le centre
 * « 601 » (achats de matières non affectés), DIVERS (frais de déplacement,
 * honoraires, taxe sur les véhicules dans les exercices Quadra), SDG, BUREAU,
 * STOCKAGE, EASYHOME, les véhicules suivis comme des centres (615…, GB067JC),
 * le centre « (Aucun) » des écritures Quadra sans code et les écritures que
 * Pennylane exporte sans code (« Non catégorisé » : tout le chiffre d'affaires
 * et toute la paie en 2025/26). EXT (ventes et locations hors affaire) et DIV
 * (clients divers) sont lus comme des affaires. Lecture à confirmer avec la DAF.
 */
const EASYHOME_STRUCTURE = [
  /^FX$/, /^QUADRA$/, /^DEPOT\b/, /^601$/, /^DIVERS$/, /^SDG$/, /^BUREAU$/, /^STOCKAGE$/,
  /^EASYHOME$/, /^615[ A-Z]/, /^GB067JC$/, /^\(AUCUN\)$/i, /^#/,
];

const EASYHOME: EntiteConfig = {
  exercice: { debut: 11 },
  // Réponse de la DAF du 6 octobre 2026 : prévision sur le 71331 « en une seule
  // écriture ». Le compte est en fait le 71350000, et les balances analytiques
  // Pennylane la portent affaire par affaire (CAV107, AB100, PR363, AI115,
  // PR364, PR368, PR361…), reprise le mois suivant ; en décembre et janvier
  // 2025/26 elle est passée sur le centre FX. Lue dans le compte, comme chez
  // Sodobat : la Synthèse retrouve les lignes « Travaux en cours mois » et
  // « Reprise travaux en cours » du tableau de gestion.
  provisions: { compte: EASYHOME_PROVISION, mode: "compte" },
  centresStructure: EASYHOME_STRUCTURE,
  libelles: {
    syn_sous_traitance_sodobat: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    cha_sous_traitance: "Sous-traitance (TVA 20 % / 0 % / EXO LQ)",
    fx_honoraires_management: "Honoraires de management (SDG)",
    fx_location_vehicules: "Location de matériel et de véhicules",
    syn_fx_achats_structure: "Achats et marchandises imputés à la structure (FX, dépôts)",
    // Ligne « 612 CB Modules+Pont roulant » de leur tableau de gestion.
    fx_cb_materiel: "Crédit-bail modules et pont roulant",
    // Le crédit-bail forme un « Total 3 » : le total général devient le quatrième.
    fx_total_general: "TOTAL 4 — Honoraires + Frais généraux + Crédit-bail (Total 1 + Total 2 + Total 3)",
  },
  regles: {
    // ▸ Synthèse
    syn_ca_location: EASYHOME_CA_LOCATION,
    syn_ca_prestations: EASYHOME_CA_PRESTATIONS,
    syn_ca_modules: EASYHOME_CA_MODULES,
    syn_ca_prestations_admin: EASYHOME_CA_PRESTATIONS_ADMIN,
    syn_ca_assurances: EASYHOME_CA_ASSURANCES,
    syn_ca_marchandises: EASYHOME_CA_MARCHANDISES,
    syn_tec_provision: [EASYHOME_PROVISION],
    syn_achats_mp: EASYHOME_ACHATS,
    syn_achats_marchandises: EASYHOME_MARCHANDISES,
    syn_variation_stock: EASYHOME_VARIATION_STOCK,
    syn_sous_traitance_sodobat: EASYHOME_SOUS_TRAITANCE,
    syn_sous_traitance_direct: EASYHOME_SOUS_TRAITANCE_DIRECT,
    syn_location_materiel_externe: EASYHOME_LOCATION_MATERIEL,
    syn_location_autres: EASYHOME_LOCATION_VEHICULES,
    syn_dechets: EASYHOME_DECHETS,
    syn_entretien: EASYHOME_ENTRETIEN,
    syn_edf_eau_chantier: EASYHOME_EDF_EAU_CHANTIER,
    syn_carburant: EASYHOME_CARBURANT,
    syn_deplacements: EASYHOME_DEPLACEMENTS,
    syn_masse_salariale: EASYHOME_MASSE_SALARIALE,
    syn_cession_immo: EASYHOME_CESSION_IMMO,
    syn_produits_financiers: EASYHOME_PRODUITS_FINANCIERS,
    syn_produits_gestion: EASYHOME_PRODUITS_GESTION,
    syn_fx_location_immo: [...EASYHOME_LOCATION_IMMO, ...EASYHOME_EAU_SIEGE],
    syn_fx_credit_bail: EASYHOME_CREDIT_BAIL,
    syn_fx_assurances: EASYHOME_ASSURANCES,
    syn_fx_honoraires: EASYHOME_HONORAIRES_DIVERS,
    syn_fx_sponsoring: EASYHOME_SPONSORING,
    syn_fx_telecom: EASYHOME_TELECOM,
    syn_fx_bancaires: EASYHOME_BANCAIRES,
    syn_fx_irr: EASYHOME_IRR,
    syn_impots_taxes: EASYHOME_IMPOTS,
    syn_dap_comptabilisee: EASYHOME_DOTATIONS,
    syn_retraitement_vnc: EASYHOME_VNC,

    // ▸ Activité chantier
    cha_produits_location: EASYHOME_CA_LOCATION,
    cha_produits_prestations: EASYHOME_CA_PRESTATIONS,
    cha_produits_modules: EASYHOME_CA_MODULES,
    cha_produits_prestations_admin: EASYHOME_CA_PRESTATIONS_ADMIN,
    cha_produits_assurances: EASYHOME_CA_ASSURANCES,
    cha_produits_marchandises: EASYHOME_CA_MARCHANDISES,
    cha_provision: [EASYHOME_PROVISION],
    cha_produits_divers: EASYHOME_CHA_PRODUITS_DIVERS,
    cha_achats_mp: ["60100900", "60224000", "60224900"],
    cha_achats_marchandises: EASYHOME_MARCHANDISES,
    cha_petit_materiel: ["60630900"],
    cha_autres_achats: ["60900900"],
    cha_locations: [...EASYHOME_LOCATION_MATERIEL, ...EASYHOME_LOCATION_VEHICULES],
    cha_dechets: EASYHOME_DECHETS,
    cha_sous_traitance: EASYHOME_SOUS_TRAITANCE,
    cha_sous_traitance_direct: EASYHOME_SOUS_TRAITANCE_DIRECT,
    cha_edf_eau: EASYHOME_EDF_EAU_CHANTIER,
    cha_carburant: EASYHOME_CARBURANT,
    cha_deplacements: EASYHOME_DEPLACEMENTS,
    cha_entretien: EASYHOME_ENTRETIEN,
    cha_autres_charges: EASYHOME_CHA_AUTRES_CHARGES,
    cha_taxe_apprentissage: EASYHOME_MS_TAXE_APPRENTISSAGE,
    cha_salaires: EASYHOME_MS_SALAIRES,
    cha_primes: EASYHOME_MS_PRIMES,
    cha_probtp: EASYHOME_MS_PREVOYANCE,
    cha_autres_personnel: EASYHOME_MS_AUTRES,
    cha_honoraires: EASYHOME_HONORAIRES_DIVERS,

    // ▸ Frais généraux
    fx_honoraires_management: EASYHOME_HONORAIRES_MANAGEMENT,
    fx_honoraires_divers: EASYHOME_HONORAIRES_DIVERS,
    fx_ms_structure: [...EASYHOME_MASSE_SALARIALE, ...EASYHOME_INTERIM],
    fx_carburant: [...EASYHOME_CARBURANT, ...EASYHOME_DEPLACEMENTS],
    fx_edf_eau: [...EASYHOME_EDF_EAU_CHANTIER, ...EASYHOME_EAU_SIEGE],
    fx_achats_fournitures: EASYHOME_ACHATS,
    fx_achats_marchandises: EASYHOME_MARCHANDISES,
    fx_variation_stock: EASYHOME_VARIATION_STOCK,
    fx_location_immo: EASYHOME_LOCATION_IMMO,
    fx_location_vehicules: [...EASYHOME_LOCATION_MATERIEL, ...EASYHOME_LOCATION_VEHICULES],
    fx_dechets: EASYHOME_DECHETS,
    fx_entretien: EASYHOME_ENTRETIEN,
    fx_cb_vehicules: EASYHOME_CB_VEHICULES,
    fx_cb_materiel: EASYHOME_CB_MATERIEL,
    fx_assurances: EASYHOME_ASSURANCES,
    fx_sponsoring: EASYHOME_SPONSORING,
    fx_telecom: EASYHOME_TELECOM,
    fx_bancaires: EASYHOME_BANCAIRES,
    fx_impots: EASYHOME_IMPOTS,
    fx_irr: EASYHOME_IRR,
    fx_dotations: EASYHOME_DOTATIONS,
    fx_vnc: EASYHOME_VNC,
    // Sous-traitance imputée à un centre de structure : hors maquette FX, gardée en autres charges.
    fx_autres: [...EASYHOME_SOUS_TRAITANCE, ...EASYHOME_SOUS_TRAITANCE_DIRECT, "60400000"],
    fx_produits_structure: [
      ...EASYHOME_CA_PRESTATIONS, ...EASYHOME_CA_PRESTATIONS_ADMIN, ...EASYHOME_CA_ASSURANCES,
      ...EASYHOME_CA_LOCATION, ...EASYHOME_CA_MODULES, ...EASYHOME_CA_MARCHANDISES, EASYHOME_PROVISION,
      ...EASYHOME_PRODUITS_GESTION, ...EASYHOME_CESSION_IMMO, ...EASYHOME_PRODUITS_FINANCIERS,
    ],
  },
  centres: [],
};

const ENTITES: Record<string, EntiteConfig> = {
  sodobat: SODOBAT,
  covarbat: COVARBAT,
  vbtp: VBTP,
  easymat: EASYMAT,
  easyhome: EASYHOME,
};

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

/** Mois d'ouverture de l'exercice d'une entité (1 à 12). */
export function debutExercice(entityCode: string): number {
  return entiteConfig(entityCode).exercice.debut;
}

/** Comptes qui portent la prévision de travaux de l'entité, le compte courant en tête. */
export function comptesPrevision(entityCode: string): string[] {
  const { compte, autresComptes = [] } = entiteConfig(entityCode).provisions;
  return [compte, ...autresComptes];
}

/**
 * Nature d'un centre selon la règle propre à l'entité, ou null quand l'entité
 * n'en a pas et que la règle commune (classifyCentre) s'applique.
 */
export function natureCentreEntite(entityCode: string, centreCode: string): "chantier" | "structure" | null {
  const structure = entiteConfig(entityCode).centresStructure;
  if (!structure) return null;
  const code = centreCode.trim();
  return structure.some((re) => re.test(code)) ? "structure" : "chantier";
}
