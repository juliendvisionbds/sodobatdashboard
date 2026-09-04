// Nomenclature Sodobat — source de vérité des trois vues.
//
// Source : "Doc de travail-Maquette_Structurelle_Sodobat.xlsx" (maquette validée)
// croisée avec "2026_PLAN COMPTABLE SODOBAT.xlsx" (167 comptes, colonnes Onglet /
// Libellé / Code). Chaque poste porte les numéros de comptes EXACTS à 8 chiffres :
// plus aucun mapping par préfixe, qui était la source des mauvais regroupements.
//
// Règle d'or : dans une vue donnée, un compte n'appartient qu'à un seul poste.
// Le même compte peut en revanche exister dans la vue chantier ET dans la vue
// frais généraux (25 comptes sont dans ce cas) — c'est l'axe analytique de
// l'écriture qui tranche, cf. classifyCentre() dans src/lib/parsers.ts.
//
// Les lignes "hidden" captent des comptes que la maquette d'une vue ne détaille
// pas (elle renvoie vers une autre vue) : elles alimentent les totaux sans
// ajouter de ligne hors maquette.

import type { NomenclatureLine } from "./types";

// ── Sections ─────────────────────────────────────────────────────────────────

const SYN = {
  produits: "PRODUITS / CA",
  exploitation: "CHARGES D'EXPLOITATION",
  personnel: "CHARGES DE PERSONNEL",
  fx: "FRAIS GÉNÉRAUX & AUTRES CHARGES",
  resultat: "RÉSULTAT FINAL & CONTRÔLES",
} as const;

const CHA = {
  produits: "PRODUITS / CA",
  exploitation: "CHARGES D'EXPLOITATION",
  personnel: "CHARGES DE PERSONNEL",
  resultat: "RÉSULTATS CHANTIER",
  cumuls: "CUMULS SUR LA DURÉE DE VIE DU CHANTIER",
  gestion: "GESTION & ALERTES",
} as const;

const FX = {
  reference: "RÉFÉRENCE",
  honoraires: "HONORAIRES",
  generaux: "FRAIS GÉNÉRAUX (hors MS et Crédit-bail)",
  totaux: "TOTAUX GÉNÉRAUX",
} as const;

// ── Groupes de comptes réutilisés entre vues ─────────────────────────────────
// Un compte partagé entre la vue chantier et la vue FX est routé par l'axe
// analytique ; le partage est donc explicite ici plutôt que dupliqué à la main.

/** Code I — Carburant / GNR / Déplacements / Réception */
const CARBURANT_DEPLACEMENTS = [
  "60614000", "60615000", "60616000", "62510000", "62510010", "62510100",
  "62510200", "62560000", "62570000", "62570002", "62570005", "62570010",
  "62640000",
];

/** Code B — Locations matériels / engins, éclaté pour les objectifs dirigeant. */
const LOCATION_MATERIEL_EXTERNE = ["61350500", "61350510"];
const LOCATION_EASYMAT = ["61350520"];
const LOCATION_AUTRES = ["61350550", "61351000", "61351700"];
const LOCATIONS = [
  ...LOCATION_MATERIEL_EXTERNE,
  ...LOCATION_EASYMAT,
  ...LOCATION_AUTRES,
];

/** Code S — Entretien / Réparation / Maintenance */
const ENTRETIEN = [
  "61520000", "61550000", "61550100", "61552000", "61552001", "61560000",
];

/** Code A — Fournitures, petit outillage, vêtements de travail */
const FOURNITURES = [
  "60630000", "60630001", "60630100", "60640000", "60640100", "60650000",
];

/** Code X — Impôts et taxes */
const IMPOTS_TAXES = [
  "63511000", "63511100", "63512000", "63513000", "63514000", "63540000",
  "63580000", "63710000", "63780000", "69500000", "69910000",
];

/** Code F — Masse salariale (hors cotisations exploitant/RSI) */
const MASSE_SALARIALE = [
  "63330000", "63350000", "64100000", "64110000", "64130000", "64140000",
  "64143000", "64144000", "64170000", "64180000", "64181000", "64510000",
  "64515000", "64530000", "64540000", "64582000", "64720000", "64750000",
  "64800000", "64810000", "64900000", "69101000",
];

/** Code C + D — Sous-traitance (toutes natures) */
const SOUS_TRAITANCE = [
  "60400000", "60400020", "60400900", "60412000", "61100000", "60412100",
];

/** Code H — EDF / Eau de chantier */
const EDF_EAU_CHANTIER = [
  "60610000", "60610005", "60610006", "60610007", "60612100",
];

// ─────────────────────────────────────────────────────────────────────────────
// 1 — SYNTHÈSE  (source : balance ventilée, un montant par compte × mois)
// ─────────────────────────────────────────────────────────────────────────────
//
// La maquette Synthèse ne cite que 97 des 167 comptes du plan comptable : les 70
// autres (sous-traitance, déchets, EDF/eau chantier, carburant, honoraires
// chantier, entretien, et tout le détail des frais généraux) sont rattachés ici
// à des lignes "hidden", sans quoi ils remonteraient tous en « compte non mappé »
// et les totaux seraient faux.

export const synthese: NomenclatureLine[] = [
  // ▸ PRODUITS / CA
  {
    code: "syn_ca_travaux",
    view: "synthese",
    section: SYN.produits,
    label: "Produits travaux et prestations",
    kind: "poste",
    sign: -1,
    hidden: true,
    accounts: [
      "70400010", "70400020", "70400029", "70400200", "70400290", "70400300",
      "70880020",
    ],
    notes: "Code K — détail agrégé dans « CA Facturation mois »",
  },
  {
    code: "syn_ca_marchandises",
    view: "synthese",
    section: SYN.produits,
    label: "Ventes marchandises",
    kind: "poste",
    sign: -1,
    accounts: ["70700200", "70701900"],
    notes: "Code M",
  },
  {
    code: "syn_ca_refacturation",
    view: "synthese",
    section: SYN.produits,
    label: "Refacturations diverses",
    kind: "poste",
    sign: -1,
    hidden: true,
    accounts: ["70600010", "70600020", "70800000", "70880000"],
    notes: "Code N — détail agrégé dans « CA Facturation mois »",
  },
  {
    code: "syn_ca_facturation",
    view: "synthese",
    section: SYN.produits,
    label: "CA Facturation mois (travaux et prestations)",
    kind: "subtotal",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_ca_travaux", sign: 1 },
        { code: "syn_ca_marchandises", sign: 1 },
        { code: "syn_ca_refacturation", sign: 1 },
      ],
    },
    notes: "Codes K + M + N. Le code L (CA Location) n'existe pas chez Sodobat.",
  },
  {
    code: "syn_annulation_m1",
    view: "synthese",
    section: SYN.produits,
    label: "Annulation M-1",
    kind: "manual",
    sign: -1,
    formula: { op: "manual", field: "annulation_m1" },
    notes: "Reprise de la provision du mois précédent — brouillon → figé",
  },
  {
    code: "syn_tec_provision",
    view: "synthese",
    section: SYN.produits,
    label: "Provision M",
    kind: "poste",
    sign: -1,
    accounts: ["71331000"],
    notes: "Code O — Travaux en cours. Brouillon → figé en fin de mois.",
  },
  {
    code: "syn_cession_immo",
    view: "synthese",
    section: SYN.produits,
    label: "Cession Immo",
    kind: "poste",
    sign: -1,
    accounts: ["75700000"],
    notes: "Code ZX",
  },
  {
    code: "syn_produits_financiers",
    view: "synthese",
    section: SYN.produits,
    label: "Produits financiers et assurance",
    kind: "poste",
    sign: -1,
    accounts: ["74000000", "75870000", "76000000", "76310000", "76400000", "79150000"],
    notes: "Code ZW (part « produits financiers et assurance »)",
  },
  {
    code: "syn_produits_gestion",
    view: "synthese",
    section: SYN.produits,
    label: "Produits de gestion courante",
    kind: "poste",
    sign: -1,
    accounts: ["75800000"],
    notes: "Code ZW (part « produits de gestion courante »)",
  },
  {
    code: "syn_ca_total",
    view: "synthese",
    section: SYN.produits,
    label: "CA TOTAL",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_ca_facturation", sign: 1 },
        { code: "syn_annulation_m1", sign: 1 },
        { code: "syn_tec_provision", sign: 1 },
        { code: "syn_cession_immo", sign: 1 },
        { code: "syn_produits_financiers", sign: 1 },
        { code: "syn_produits_gestion", sign: 1 },
      ],
    },
    notes: "Base de référence de tous les ratios % des trois vues",
  },

  // ▸ CHARGES D'EXPLOITATION
  {
    code: "syn_achats_mp",
    view: "synthese",
    section: SYN.exploitation,
    label: "Achats matières premières et fournitures",
    kind: "poste",
    accounts: [
      "60100000", "60100001", "60100920", "60260000", "60260001", "60260002",
      "60260003", "60260004", "60260005", "60260006", "60630000", "60630001",
      "60630100", "60630400", "60640000", "60640100", "60650000", "61110000",
      "61120000", "62410000", "62480000", "66500000",
    ],
    notes: "Code A",
  },
  {
    code: "syn_variation_stock",
    view: "synthese",
    section: SYN.exploitation,
    label: "Variation de stock",
    kind: "poste",
    accounts: ["60310000"],
    notes: "Code Z",
  },
  {
    code: "syn_st_achats",
    view: "synthese",
    section: SYN.exploitation,
    label: "Sous-total Achats",
    kind: "subtotal",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_achats_mp", sign: 1 },
        { code: "syn_variation_stock", sign: 1 },
      ],
    },
  },
  {
    code: "syn_sous_traitance",
    view: "synthese",
    section: SYN.exploitation,
    label: "Sous-traitance (TVA 20% / 0% / EXO LQ / Paiement direct)",
    kind: "poste",
    accounts: SOUS_TRAITANCE,
    notes: "Codes C et D — absent de la maquette, requis par le sous-total",
  },
  {
    code: "syn_st_sous_traitance",
    view: "synthese",
    section: SYN.exploitation,
    label: "Sous-total Sous-traitance",
    kind: "subtotal",
    formula: { op: "sum", operands: [{ code: "syn_sous_traitance", sign: 1 }] },
  },
  // La maquette n'affiche qu'une ligne de locations ; les objectifs dirigeant
  // suivent en revanche « Location matériel externe » et « Location EasyMat »
  // séparément, d'où trois postes de rattachement et un sous-total affiché.
  {
    code: "syn_location_materiel_externe",
    view: "synthese",
    section: SYN.exploitation,
    label: "Location matériel externe",
    kind: "poste",
    hidden: true,
    accounts: LOCATION_MATERIEL_EXTERNE,
    notes: "Code B — 61350500 / 61350510, suivi par l'objectif dirigeant",
  },
  {
    code: "syn_location_easymat",
    view: "synthese",
    section: SYN.exploitation,
    label: "Location EasyMat",
    kind: "poste",
    hidden: true,
    accounts: LOCATION_EASYMAT,
    notes: "Code B — 61350520, suivi par l'objectif dirigeant",
  },
  {
    code: "syn_location_autres",
    view: "synthese",
    section: SYN.exploitation,
    label: "Autres locations (matériel 0%, transport, véhicules)",
    kind: "poste",
    hidden: true,
    accounts: LOCATION_AUTRES,
    notes: "Code B",
  },
  {
    code: "syn_locations",
    view: "synthese",
    section: SYN.exploitation,
    label: "Locations matériels / bennes / transport",
    kind: "subtotal",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_location_materiel_externe", sign: 1 },
        { code: "syn_location_easymat", sign: 1 },
        { code: "syn_location_autres", sign: 1 },
      ],
    },
    notes: "Code B",
  },
  {
    code: "syn_dechets",
    view: "synthese",
    section: SYN.exploitation,
    label: "Déchets — locations de bennes",
    kind: "poste",
    accounts: ["61354000"],
    notes: "Code E — absent de la maquette, requis par le sous-total",
  },
  {
    code: "syn_entretien",
    view: "synthese",
    section: SYN.exploitation,
    label: "Entretien / Réparation / Maintenance",
    kind: "poste",
    accounts: ENTRETIEN,
    notes: "Code S — absent de la maquette, requis par le sous-total",
  },
  {
    code: "syn_st_location_entretien",
    view: "synthese",
    section: SYN.exploitation,
    label: "Sous-total Location-Entretien",
    kind: "subtotal",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_locations", sign: 1 },
        { code: "syn_dechets", sign: 1 },
        { code: "syn_entretien", sign: 1 },
      ],
    },
  },
  {
    code: "syn_edf_eau_chantier",
    view: "synthese",
    section: SYN.exploitation,
    label: "EDF / Eau chantier",
    kind: "poste",
    accounts: EDF_EAU_CHANTIER,
    notes: "Code H — absent de la maquette Synthèse",
  },
  {
    code: "syn_carburant",
    view: "synthese",
    section: SYN.exploitation,
    label: "Carburant / GNR / Déplacements / Réception",
    kind: "poste",
    accounts: CARBURANT_DEPLACEMENTS,
    notes: "Code I — absent de la maquette Synthèse",
  },
  {
    code: "syn_honoraires_chantier",
    view: "synthese",
    section: SYN.exploitation,
    label: "Honoraires chantier / Gardiennage",
    kind: "poste",
    accounts: ["62261000", "62820000"],
    notes: "Code J — absent de la maquette Synthèse",
  },
  {
    code: "syn_total_exploitation",
    view: "synthese",
    section: SYN.exploitation,
    label: "TOTAL CHARGES EXPLOITATION",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_st_achats", sign: 1 },
        { code: "syn_st_sous_traitance", sign: 1 },
        { code: "syn_st_location_entretien", sign: 1 },
        { code: "syn_edf_eau_chantier", sign: 1 },
        { code: "syn_carburant", sign: 1 },
        { code: "syn_honoraires_chantier", sign: 1 },
      ],
    },
  },
  {
    code: "syn_ratio_exploitation",
    view: "synthese",
    section: SYN.exploitation,
    label: "Ratio Charges exploitation / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "syn_total_exploitation", den: "syn_ca_total" },
  },

  // ▸ CHARGES DE PERSONNEL
  {
    code: "syn_masse_salariale",
    view: "synthese",
    section: SYN.personnel,
    label: "Masse salariale production (salaires + charges)",
    kind: "poste",
    accounts: [...MASSE_SALARIALE, "64600000", "64601000"],
    notes: "Code F, cotisations exploitant/RSI incluses",
  },
  {
    code: "syn_interims",
    view: "synthese",
    section: SYN.personnel,
    label: "Intérims / Personnel extérieur",
    kind: "poste",
    accounts: ["62110000", "62111000", "62112000"],
    notes: "Code G",
  },
  {
    code: "syn_total_personnel",
    view: "synthese",
    section: SYN.personnel,
    label: "TOTAL CHARGES PERSONNEL",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_masse_salariale", sign: 1 },
        { code: "syn_interims", sign: 1 },
      ],
    },
  },
  {
    code: "syn_ratio_personnel",
    view: "synthese",
    section: SYN.personnel,
    label: "Ratio Charges personnel / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "syn_total_personnel", den: "syn_ca_total" },
  },
  {
    code: "syn_resultat_exploitation",
    view: "synthese",
    section: SYN.personnel,
    label: "RÉSULTAT D'EXPLOITATION",
    kind: "computed",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_ca_total", sign: 1 },
        { code: "syn_total_exploitation", sign: -1 },
        { code: "syn_total_personnel", sign: -1 },
      ],
    },
  },

  // ▸ FRAIS GÉNÉRAUX & AUTRES CHARGES
  // Le détail complet est dans l'onglet Frais généraux : ici les postes de
  // rattachement sont masqués et n'alimentent que le total.
  {
    code: "syn_fx_location_immo",
    view: "synthese",
    section: SYN.fx,
    label: "Locations immobilières et charges locatives",
    kind: "poste",
    hidden: true,
    accounts: ["60611000", "60612000", "61323000", "61400000"],
    notes: "Code P",
  },
  {
    code: "syn_fx_credit_bail",
    view: "synthese",
    section: SYN.fx,
    label: "Crédit-bail / LLD",
    kind: "poste",
    hidden: true,
    accounts: [
      "61200000", "61210000", "61254290", "61258100", "61258200", "61258301",
      "61258400", "61284000",
    ],
    notes: "Code Q",
  },
  {
    code: "syn_fx_assurances",
    view: "synthese",
    section: SYN.fx,
    label: "Assurances",
    kind: "poste",
    hidden: true,
    accounts: ["61610000", "61612000", "61620000", "61630000", "61681000"],
    notes: "Code T",
  },
  {
    code: "syn_fx_honoraires",
    view: "synthese",
    section: SYN.fx,
    label: "Honoraires (management, comptabilité, juridique, informatique)",
    kind: "poste",
    hidden: true,
    accounts: [
      "62263000", "62260000", "62262000", "62270000", "62280000", "62280100",
    ],
    notes: "Codes U et V",
  },
  {
    code: "syn_fx_sponsoring",
    view: "synthese",
    section: SYN.fx,
    label: "Sponsoring / Cadeaux clients / Séminaires",
    kind: "poste",
    hidden: true,
    accounts: [
      "61850000", "62302000", "62340000", "62340020", "62381000", "62381001",
    ],
    notes: "Code W",
  },
  {
    code: "syn_fx_telecom",
    view: "synthese",
    section: SYN.fx,
    label: "Frais télécom / Postaux",
    kind: "poste",
    hidden: true,
    accounts: ["62600000"],
    notes: "Code AA",
  },
  {
    code: "syn_fx_cotisations",
    view: "synthese",
    section: SYN.fx,
    label: "Cotisations / Dons salariés",
    kind: "poste",
    hidden: true,
    accounts: ["62800000", "62810000"],
    notes: "Code AB",
  },
  {
    code: "syn_fx_bancaires",
    view: "synthese",
    section: SYN.fx,
    label: "Intérêts / Agios / Frais bancaires",
    kind: "poste",
    hidden: true,
    accounts: ["62780000", "62781000", "66110000", "66160100"],
    notes: "Code X (part frais bancaires)",
  },
  {
    code: "syn_fx_irr",
    view: "synthese",
    section: SYN.fx,
    label: "Créances irrécouvrables / douteuses",
    kind: "poste",
    hidden: true,
    accounts: ["65420000"],
    notes: "Code BB",
  },
  {
    code: "syn_autres_charges",
    view: "synthese",
    section: SYN.fx,
    label: "Autres charges / Produits divers",
    kind: "poste",
    accounts: ["61810000", "65800000", "67110000"],
    notes: "Code AC — 67110000 (pénalités sur marchés) rattaché ici, hors plan comptable 2026",
  },
  {
    code: "syn_resultat_sep",
    view: "synthese",
    section: SYN.fx,
    label: "Résultat SEP",
    kind: "poste",
    accounts: ["65550000", "75550000"],
    notes: "Code ZZ — Sodobat : SEP Bougé, Bouverie, Chausse, Théoule",
  },
  {
    code: "syn_total_fx",
    view: "synthese",
    section: SYN.fx,
    label: "TOTAL FRAIS GÉNÉRAUX",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_fx_location_immo", sign: 1 },
        { code: "syn_fx_credit_bail", sign: 1 },
        { code: "syn_fx_assurances", sign: 1 },
        { code: "syn_fx_honoraires", sign: 1 },
        { code: "syn_fx_sponsoring", sign: 1 },
        { code: "syn_fx_telecom", sign: 1 },
        { code: "syn_fx_cotisations", sign: 1 },
        { code: "syn_fx_bancaires", sign: 1 },
        { code: "syn_fx_irr", sign: 1 },
        { code: "syn_autres_charges", sign: 1 },
        { code: "syn_resultat_sep", sign: 1 },
      ],
    },
    notes: "Détail complet dans l'onglet Frais généraux",
  },
  {
    code: "syn_impots_taxes",
    view: "synthese",
    section: SYN.fx,
    label: "Impôts et taxes",
    kind: "poste",
    accounts: IMPOTS_TAXES,
    notes: "Code X (part impôts et taxes)",
  },

  // ▸ RÉSULTAT FINAL & CONTRÔLES
  {
    code: "syn_resultat_net",
    view: "synthese",
    section: SYN.resultat,
    label: "RÉSULTAT NET",
    kind: "computed",
    formula: {
      op: "sum",
      operands: [
        { code: "syn_resultat_exploitation", sign: 1 },
        { code: "syn_total_fx", sign: -1 },
        { code: "syn_impots_taxes", sign: -1 },
      ],
    },
  },
  {
    code: "syn_ratio_resultat_net",
    view: "synthese",
    section: SYN.resultat,
    label: "Ratio Résultat net / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "syn_resultat_net", den: "syn_ca_total" },
  },
  {
    code: "syn_resultat_bg",
    view: "synthese",
    section: SYN.resultat,
    label: "Résultat BG Comptable",
    kind: "computed",
    formula: { op: "manual", field: "note" },
    notes:
      "Résultat issu directement de la balance générale (produits − charges), calculé hors nomenclature — validation croisée",
  },
  {
    code: "syn_retraitement_dap",
    view: "synthese",
    section: SYN.resultat,
    label: "Retraitement DAP",
    kind: "poste",
    accounts: ["68112000", "68174000"],
    cumulative: true,
    notes: "Code ZY — cumul depuis l'ouverture, valeur mensuelle par différence",
  },
  {
    code: "syn_retraitement_vnc",
    view: "synthese",
    section: SYN.resultat,
    label: "Retraitement VNC",
    kind: "poste",
    accounts: ["65700000", "67500000"],
    cumulative: true,
    notes: "Code AD — cumul depuis l'ouverture, valeur mensuelle par différence",
  },
  {
    code: "syn_ctrl",
    view: "synthese",
    section: SYN.resultat,
    label: "Ctrl (écart de contrôle)",
    kind: "computed",
    formula: { op: "diff", a: "syn_resultat_net", b: "syn_resultat_bg" },
    notes:
      "Le résultat du TG exclut les dotations et la VNC : cet écart doit donc être nul ou exactement égal à Retraitement DAP + Retraitement VNC. Toute autre valeur est une anomalie.",
  },
  {
    code: "syn_notes",
    view: "synthese",
    section: SYN.resultat,
    label: "Notes / Commentaires",
    kind: "manual",
    formula: { op: "manual", field: "note" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2 — ACTIVITÉ CHANTIER  (source : balance analytique, centres « chantier »)
// ─────────────────────────────────────────────────────────────────────────────

export const chantier: NomenclatureLine[] = [
  // ▸ PRODUITS / CA
  {
    code: "cha_produits_travaux",
    view: "chantier",
    section: CHA.produits,
    label: "Produits Travaux",
    kind: "poste",
    sign: -1,
    accounts: [
      "70400010", "70400020", "70400029", "70400200", "70400290", "70400300",
      "70880020",
    ],
    notes: "Code K",
  },
  {
    code: "cha_produits_marchandises",
    view: "chantier",
    section: CHA.produits,
    label: "Produits vente de marchandise",
    kind: "poste",
    sign: -1,
    accounts: ["70700200", "70701900"],
    notes: "Code M",
  },
  {
    code: "cha_refacturations",
    view: "chantier",
    section: CHA.produits,
    label: "Refacturations diverses (Feraille, Sofovar, formations)",
    kind: "poste",
    sign: -1,
    accounts: ["70600010", "70600020", "70800000", "70880000"],
    notes: "Code N",
  },
  {
    code: "cha_provision",
    view: "chantier",
    section: CHA.produits,
    label: "Provision M (travaux en cours à facturer)",
    kind: "poste",
    // Sur l'axe analytique, la provision ouverte est un solde DÉBITEUR par
    // chantier (la contrepartie créditrice est portée par le centre de structure).
    sign: 1,
    accounts: ["71331000"],
    notes:
      "Code O — position ouverte à la date d'arrêté, et non variation du mois. Champ modifiable, brouillon puis figé en fin de mois.",
  },
  {
    code: "cha_annulation_m1",
    view: "chantier",
    section: CHA.produits,
    label: "Annulation M-1 (reprise provision)",
    kind: "manual",
    sign: -1,
    formula: { op: "manual", field: "annulation_m1" },
  },
  {
    code: "cha_ca_total",
    view: "chantier",
    section: CHA.produits,
    label: "CA HT TOTAL",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "cha_produits_travaux", sign: 1 },
        { code: "cha_produits_marchandises", sign: 1 },
        { code: "cha_refacturations", sign: 1 },
        { code: "cha_provision", sign: 1 },
        { code: "cha_annulation_m1", sign: 1 },
      ],
    },
  },

  // ▸ CHARGES D'EXPLOITATION
  {
    code: "cha_achats_mp",
    view: "chantier",
    section: CHA.exploitation,
    label: "Achat matières premières",
    kind: "poste",
    accounts: ["60100000", "60100001", "60100920"],
    notes: "Code A",
  },
  {
    code: "cha_rep",
    view: "chantier",
    section: CHA.exploitation,
    label: "REP éco-participation",
    kind: "poste",
    accounts: ["61110000"],
    notes: "Code A",
  },
  {
    code: "cha_emballages",
    view: "chantier",
    section: CHA.exploitation,
    label: "Emballages",
    kind: "poste",
    accounts: [
      "60260000", "60260001", "60260002", "60260003", "60260004", "60260005",
      "60260006", "60630400",
    ],
    notes: "Code A",
  },
  {
    code: "cha_petit_materiel",
    view: "chantier",
    section: CHA.exploitation,
    label: "Petit matériel / outillage",
    kind: "poste",
    accounts: ["60630000", "60630001", "60630100"],
    notes: "Code A",
  },
  {
    code: "cha_autres_achats",
    view: "chantier",
    section: CHA.exploitation,
    label: "Autres achats matières / fournitures",
    kind: "poste",
    accounts: [
      "60640000", "60640100", "60650000", "61120000", "62410000", "62480000",
      "66500000",
    ],
    notes: "Code A — RRR, fournitures administratives, vêtements, transports sur achats",
  },
  {
    code: "cha_st_achats",
    view: "chantier",
    section: CHA.exploitation,
    label: "SOUS TOTAL Achat Matière première / Fourniture",
    kind: "subtotal",
    formula: {
      op: "sum",
      operands: [
        { code: "cha_achats_mp", sign: 1 },
        { code: "cha_rep", sign: 1 },
        { code: "cha_emballages", sign: 1 },
        { code: "cha_petit_materiel", sign: 1 },
        { code: "cha_autres_achats", sign: 1 },
      ],
    },
  },
  {
    code: "cha_locations",
    view: "chantier",
    section: CHA.exploitation,
    label: "Locations matériels / engins et assurances engins",
    kind: "poste",
    accounts: LOCATIONS,
    notes: "Code B",
  },
  {
    code: "cha_dechets",
    view: "chantier",
    section: CHA.exploitation,
    label: "Locations bennes / Déchets - Traitement des déchets",
    kind: "poste",
    accounts: ["61354000"],
    notes: "Code E",
  },
  {
    code: "cha_sous_traitance",
    view: "chantier",
    section: CHA.exploitation,
    label: "Sous-traitance TVA 20% / TVA 0% / EXO LQ / Paiement Direct",
    kind: "poste",
    accounts: SOUS_TRAITANCE,
    notes: "Codes C et D",
  },
  {
    code: "cha_carburant",
    view: "chantier",
    section: CHA.exploitation,
    label: "Carburant / GNR / Déplacements / Réception",
    kind: "poste",
    accounts: CARBURANT_DEPLACEMENTS,
    notes: "Code I — présent aussi en frais généraux, arbitré par l'axe analytique",
  },
  {
    code: "cha_edf_eau",
    view: "chantier",
    section: CHA.exploitation,
    label: "EDF / Eau chantier",
    kind: "poste",
    accounts: EDF_EAU_CHANTIER,
    notes: "Code H",
  },
  {
    code: "cha_entretien",
    view: "chantier",
    section: CHA.exploitation,
    label: "Entretien / Réparation / Maintenance",
    kind: "poste",
    accounts: ENTRETIEN,
    notes:
      "Code S — l'entretien du matériel roulant imputé à un chantier va en charges d'exploitation du chantier (règle analytique de la maquette FX)",
  },
  {
    code: "cha_dotations",
    view: "chantier",
    section: CHA.exploitation,
    label: "Dotations aux amortissements affectées",
    kind: "poste",
    accounts: ["68112000"],
    cumulative: true,
    notes:
      "Code ZY — présent sur les centres chantier de la balance réelle ; cumul depuis l'ouverture, valeur mensuelle par différence",
  },
  {
    code: "cha_autres_charges",
    view: "chantier",
    section: CHA.exploitation,
    label: "Autres charges affectées (impôts, taxes, pénalités)",
    kind: "poste",
    hidden: true,
    accounts: [...IMPOTS_TAXES, "67110000"],
    notes:
      "Codes X et AC — la maquette chantier ne les détaille pas, mais la balance analytique réelle les impute à des chantiers (ex. 63580000 sur 1024A)",
  },
  {
    code: "cha_total_exploitation",
    view: "chantier",
    section: CHA.exploitation,
    label: "TOTAL CHARGES EXPLOITATION",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "cha_st_achats", sign: 1 },
        { code: "cha_locations", sign: 1 },
        { code: "cha_dechets", sign: 1 },
        { code: "cha_sous_traitance", sign: 1 },
        { code: "cha_carburant", sign: 1 },
        { code: "cha_edf_eau", sign: 1 },
        { code: "cha_entretien", sign: 1 },
        { code: "cha_dotations", sign: 1 },
        { code: "cha_autres_charges", sign: 1 },
      ],
    },
  },
  {
    code: "cha_ratio_exploitation",
    view: "chantier",
    section: CHA.exploitation,
    label: "Ratio charges exploitation / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "cha_total_exploitation", den: "cha_ca_total" },
  },

  // ▸ CHARGES DE PERSONNEL
  {
    code: "cha_formation_continue",
    view: "chantier",
    section: CHA.personnel,
    label: "Participation Formation Continue (organismes)",
    kind: "poste",
    accounts: ["63330000"],
    notes: "Code F",
  },
  {
    code: "cha_taxe_apprentissage",
    view: "chantier",
    section: CHA.personnel,
    label: "Versement libératoire Taxe Apprentissage",
    kind: "poste",
    accounts: ["63350000"],
    notes: "Code F",
  },
  {
    code: "cha_salaires",
    view: "chantier",
    section: CHA.personnel,
    label: "Salaires / Appointements / Commissions",
    kind: "poste",
    accounts: ["64100000", "64110000"],
    notes: "Code F",
  },
  {
    code: "cha_primes",
    view: "chantier",
    section: CHA.personnel,
    label: "Primes et gratifications",
    kind: "poste",
    accounts: ["64130000", "64140000", "64143000", "64144000"],
    notes: "Code F",
  },
  {
    code: "cha_urssaf",
    view: "chantier",
    section: CHA.personnel,
    label: "Cotisations URSSAF",
    kind: "poste",
    accounts: ["64510000"],
    notes: "Code F",
  },
  {
    code: "cha_conges_payes",
    view: "chantier",
    section: CHA.personnel,
    label: "Caisse Congés Payés (PROBTP / CCB)",
    kind: "poste",
    accounts: ["64515000"],
    notes: "Code F",
  },
  {
    code: "cha_pole_emploi",
    view: "chantier",
    section: CHA.personnel,
    label: "Pôle Emploi",
    kind: "poste",
    accounts: ["64540000"],
    notes: "Code F",
  },
  {
    code: "cha_probtp",
    view: "chantier",
    section: CHA.personnel,
    label: "PROBTP (prévoyance BTP)",
    kind: "poste",
    accounts: ["64530000"],
    notes: "Code F",
  },
  {
    code: "cha_autres_personnel",
    view: "chantier",
    section: CHA.personnel,
    label: "Autres charges de personnel",
    kind: "poste",
    accounts: [
      "64170000", "64180000", "64181000", "64582000", "64720000", "64750000",
      "64800000", "64810000", "64900000", "69101000", "64600000", "64601000",
    ],
    notes:
      "Code F — intéressement, IJ SS, intempéries, médecine du travail, formation, remboursements de charges, cotisations exploitant",
  },
  {
    code: "cha_interim",
    view: "chantier",
    section: CHA.personnel,
    label: "Personnel extérieur à l'entreprise (intérims)",
    kind: "poste",
    accounts: ["62110000", "62111000", "62112000"],
    notes: "Code G",
  },
  {
    code: "cha_honoraires",
    view: "chantier",
    section: CHA.personnel,
    label: "Honoraire chantier / Gardiennage",
    kind: "poste",
    accounts: [
      "62261000", "62820000", "62260000", "62262000", "62263000", "62270000",
      "62280000", "62280100",
    ],
    notes:
      "Code J — les honoraires divers (V) et de management (U) imputés à un chantier sont rattachés ici",
  },
  {
    code: "cha_total_personnel",
    view: "chantier",
    section: CHA.personnel,
    label: "CHARGES DE PERSONNEL TOTAL",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "cha_formation_continue", sign: 1 },
        { code: "cha_taxe_apprentissage", sign: 1 },
        { code: "cha_salaires", sign: 1 },
        { code: "cha_primes", sign: 1 },
        { code: "cha_urssaf", sign: 1 },
        { code: "cha_conges_payes", sign: 1 },
        { code: "cha_pole_emploi", sign: 1 },
        { code: "cha_probtp", sign: 1 },
        { code: "cha_autres_personnel", sign: 1 },
        { code: "cha_interim", sign: 1 },
        { code: "cha_honoraires", sign: 1 },
      ],
    },
  },
  {
    code: "cha_ratio_personnel",
    view: "chantier",
    section: CHA.personnel,
    label: "Ratio charges personnel / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "cha_total_personnel", den: "cha_ca_total" },
  },

  // ▸ RÉSULTATS CHANTIER
  {
    code: "cha_resultat",
    view: "chantier",
    section: CHA.resultat,
    label: "RÉSULTAT CHANTIER (mensuel)",
    kind: "computed",
    formula: {
      op: "sum",
      operands: [
        { code: "cha_ca_total", sign: 1 },
        { code: "cha_total_exploitation", sign: -1 },
        { code: "cha_total_personnel", sign: -1 },
      ],
    },
  },
  {
    code: "cha_coef",
    view: "chantier",
    section: CHA.resultat,
    label: "Coef. (Cumul fact / Cumul charges)",
    kind: "computed",
    formula: { op: "div", num: "cha_cumul_facturation", den: "cha_cumul_charges" },
  },
  {
    code: "cha_marge",
    view: "chantier",
    section: CHA.resultat,
    label: "Marge — Résultat / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "cha_resultat", den: "cha_ca_total" },
  },

  // ▸ CUMULS SUR LA DURÉE DE VIE DU CHANTIER (non bornés à l'exercice)
  {
    code: "cha_report_resultat",
    view: "chantier",
    section: CHA.cumuls,
    label: "Report Cumul Résultat M-1",
    kind: "computed",
    notes: "Cumul depuis l'ouverture du chantier, arrêté au mois précédent",
  },
  {
    code: "cha_cumul_resultat",
    view: "chantier",
    section: CHA.cumuls,
    label: "Cumul Résultat fin de mois",
    kind: "computed",
    formula: {
      op: "sum",
      operands: [
        { code: "cha_report_resultat", sign: 1 },
        { code: "cha_resultat", sign: 1 },
      ],
    },
  },
  {
    code: "cha_report_facturation",
    view: "chantier",
    section: CHA.cumuls,
    label: "Report Cumul Facturation M-1",
    kind: "computed",
    notes: "Cumul depuis l'ouverture du chantier, arrêté au mois précédent",
  },
  {
    code: "cha_cumul_facturation",
    view: "chantier",
    section: CHA.cumuls,
    label: "Cumul Facturation fin de mois",
    kind: "computed",
    formula: {
      op: "sum",
      operands: [
        { code: "cha_report_facturation", sign: 1 },
        { code: "cha_ca_total", sign: 1 },
      ],
    },
  },
  {
    code: "cha_cumul_charges",
    view: "chantier",
    section: CHA.cumuls,
    label: "Cumul Charges fin de mois",
    kind: "computed",
    hidden: true,
    notes: "Dénominateur du coefficient — cumul depuis l'ouverture du chantier",
  },

  // ▸ GESTION & ALERTES
  {
    code: "cha_note",
    view: "chantier",
    section: CHA.gestion,
    label: "Notes / Commentaires (alertes, avancement, décalages)",
    kind: "manual",
    formula: { op: "manual", field: "note" },
  },
  {
    code: "cha_statut",
    view: "chantier",
    section: CHA.gestion,
    label: "Statut enregistrement : Brouillon / Figé",
    kind: "manual",
    formula: { op: "manual", field: "statut" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3 — FRAIS GÉNÉRAUX  (source : balance analytique, centres de structure)
// ─────────────────────────────────────────────────────────────────────────────
//
// La maquette FX ne cite que 87 comptes ; les comptes réellement portés par les
// centres FX / DEPOT / QUADRA de la balance analytique (masse salariale
// sédentaire, achats du dépôt, produits imputés au siège) sont rattachés ici.

export const fx: NomenclatureLine[] = [
  // ▸ RÉFÉRENCE
  {
    code: "fx_ca_reference",
    view: "fx",
    section: FX.reference,
    label: "CA de référence (dont travaux en cours et ventes immo)",
    kind: "computed",
    notes:
      "Même définition que le CA TOTAL de la Synthèse (syn_ca_total), lu dans la balance ventilée de l'exercice de la colonne",
  },

  // ▸ HONORAIRES
  {
    code: "fx_honoraires_management",
    view: "fx",
    section: FX.honoraires,
    label: "Honoraires management (SDG + NJW)",
    kind: "poste",
    hidden: true,
    accounts: ["62263000"],
    notes:
      "Code U — un seul compte Sodobat pour deux natures ; ventilé manuellement entre SDG et NJW",
  },
  {
    code: "fx_honoraires_njw",
    view: "fx",
    section: FX.honoraires,
    label: "Honoraires NJW",
    kind: "manual",
    formula: { op: "manual", field: "ventilation", subKey: "NJW" },
    notes: "Part NJW saisie par la DAF (brouillon → figé) ; le solde va en SDG",
  },
  {
    code: "fx_honoraires_sdg",
    view: "fx",
    section: FX.honoraires,
    label: "Honoraires SDG (holding)",
    kind: "computed",
    formula: { op: "diff", a: "fx_honoraires_management", b: "fx_honoraires_njw" },
  },
  {
    code: "fx_honoraires_divers",
    view: "fx",
    section: FX.honoraires,
    label: "Honoraires divers / Commissions",
    kind: "poste",
    accounts: ["62260000", "62262000", "62270000", "62280000", "62280100"],
    notes: "Code V",
  },
  {
    code: "fx_total_honoraires",
    view: "fx",
    section: FX.honoraires,
    label: "TOTAL 1 — Honoraires",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "fx_honoraires_management", sign: 1 },
        { code: "fx_honoraires_divers", sign: 1 },
      ],
    },
  },
  {
    code: "fx_ratio_honoraires",
    view: "fx",
    section: FX.honoraires,
    label: "Ratio Honoraires / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "fx_total_honoraires", den: "fx_ca_reference" },
  },

  // ▸ FRAIS GÉNÉRAUX
  {
    code: "fx_ms_structure",
    view: "fx",
    section: FX.generaux,
    label: "Masse salariale sédentaire (salaires + charges)",
    kind: "poste",
    accounts: MASSE_SALARIALE,
    notes:
      "Code F — absent de la maquette FX mais porté par les centres FX / DEPOT de la balance réelle",
  },
  {
    code: "fx_cotisations_exploitant",
    view: "fx",
    section: FX.generaux,
    label: "Cotisations exploitant / RSI",
    kind: "poste",
    accounts: ["64600000", "64601000"],
    notes: "Code F",
  },
  {
    code: "fx_carburant",
    view: "fx",
    section: FX.generaux,
    label: "Carburant / GNR / Déplacements / Réception",
    kind: "poste",
    accounts: CARBURANT_DEPLACEMENTS,
    notes: "Code I — présent aussi en chantier, arbitré par l'axe analytique",
  },
  {
    code: "fx_edf_eau",
    view: "fx",
    section: FX.generaux,
    label: "EDF / Eau (locaux administratifs)",
    kind: "poste",
    accounts: ["60611000", "60612000"],
    notes: "Code P",
  },
  {
    code: "fx_achats_fournitures",
    view: "fx",
    section: FX.generaux,
    label: "Achats / Fournitures / Petit outillage / Vêtements de travail",
    kind: "poste",
    accounts: [
      ...FOURNITURES,
      "60100000", "60100001", "60100920", "60260000", "60260001", "60260002",
      "60260003", "60260004", "60260005", "60260006", "60630400", "61110000",
      "61120000", "62410000", "62480000", "66500000",
    ],
    notes:
      "Code A — la maquette ne cite que les fournitures ; les achats du dépôt (601, 6026, REP) sont rattachés ici",
  },
  {
    code: "fx_variation_stock",
    view: "fx",
    section: FX.generaux,
    label: "Variation de stock",
    kind: "poste",
    accounts: ["60310000"],
    notes: "Code Z — porté par le centre FX de la balance réelle",
  },
  {
    code: "fx_location_immo",
    view: "fx",
    section: FX.generaux,
    label: "Locations immobilières (bureaux, dépôts…)",
    kind: "poste",
    accounts: ["61323000", "61400000"],
    notes: "Code P",
  },
  {
    code: "fx_location_vehicules",
    view: "fx",
    section: FX.generaux,
    label: "Location véhicules",
    kind: "poste",
    accounts: LOCATIONS,
    notes: "Code B — présent aussi en chantier, arbitré par l'axe analytique",
  },
  {
    code: "fx_dechets",
    view: "fx",
    section: FX.generaux,
    label: "Déchets — locations de bennes",
    kind: "poste",
    accounts: ["61354000"],
    notes: "Code E — porté par le centre DEPOT de la balance réelle",
  },
  {
    code: "fx_entretien",
    view: "fx",
    section: FX.generaux,
    label: "Entretien / Réparation / Maintenance",
    kind: "poste",
    accounts: ENTRETIEN,
    notes:
      "Code S — dissocié de la matière première ; bascule en charges d'exploitation chantier quand l'analytique est un chantier",
  },
  {
    code: "fx_credit_bail",
    view: "fx",
    section: FX.generaux,
    label: "Crédit-bail / LLD (ligne globale)",
    kind: "poste",
    accounts: [
      "61200000", "61210000", "61254290", "61258100", "61258200", "61258301",
      "61258400", "61284000",
    ],
    notes: "Code Q",
  },
  {
    code: "fx_assurances",
    view: "fx",
    section: FX.generaux,
    label: "Assurances (indemnités sinistres incluses)",
    kind: "poste",
    accounts: ["61610000", "61612000", "61620000", "61630000", "61681000"],
    notes: "Code T",
  },
  {
    code: "fx_exception",
    view: "fx",
    section: FX.generaux,
    label: "Ligne d'exception (STC, annulation dettes, indemnité sinistre, var. TEC/FAE/PCA)",
    kind: "poste",
    accounts: ["75870000"],
    sign: -1,
    notes:
      "Seul 75870000 (indemnité sinistre, code ZW) existe au plan comptable Sodobat ; STC, annulation de dettes et var. TEC/FAE/PCA sont hors nomenclature, à traiter au cas par cas",
  },
  {
    code: "fx_sponsoring",
    view: "fx",
    section: FX.generaux,
    label: "Sponsoring / Cadeaux clients / Séminaires",
    kind: "poste",
    accounts: [
      "61850000", "62302000", "62340000", "62340020", "62381000", "62381001",
    ],
    notes: "Code W",
  },
  {
    code: "fx_telecom",
    view: "fx",
    section: FX.generaux,
    label: "Frais télécom / Postaux",
    kind: "poste",
    accounts: ["62600000"],
    notes: "Code AA",
  },
  {
    code: "fx_cotisations",
    view: "fx",
    section: FX.generaux,
    label: "Cotisations / Dons salariés",
    kind: "poste",
    accounts: ["62800000", "62810000"],
    notes: "Code AB",
  },
  {
    code: "fx_impots",
    view: "fx",
    section: FX.generaux,
    label: "Impôts et taxes (CFE, taxe foncière…)",
    kind: "poste",
    accounts: IMPOTS_TAXES,
    notes: "Code X (part impôts et taxes)",
  },
  {
    code: "fx_bancaires",
    view: "fx",
    section: FX.generaux,
    label: "Intérêts / Agios / Frais bancaires",
    kind: "poste",
    accounts: ["62780000", "62781000", "66110000", "66160100"],
    notes: "Code X (part frais bancaires)",
  },
  {
    code: "fx_irr",
    view: "fx",
    section: FX.generaux,
    label: "Provisions créances douteuses + Pertes sur créances irrécouvrables",
    kind: "poste",
    accounts: ["65420000", "68174000"],
    notes:
      "Code BB — 68174000 (provision dépréciation actif circulant) rattaché ici plutôt qu'aux dotations, pour éviter le doublon",
  },
  {
    code: "fx_dotations",
    view: "fx",
    section: FX.generaux,
    label: "Dotations aux amortissements",
    kind: "poste",
    accounts: ["68112000"],
    cumulative: true,
    notes: "Code ZY — cumul depuis l'ouverture, valeur mensuelle par différence",
  },
  {
    code: "fx_vnc",
    view: "fx",
    section: FX.generaux,
    label: "VNC — sortie d'immobilisation cédée",
    kind: "poste",
    accounts: ["65700000", "67500000"],
    cumulative: true,
    notes: "Code AD — cumul depuis l'ouverture, valeur mensuelle par différence",
  },
  {
    code: "fx_autres",
    view: "fx",
    section: FX.generaux,
    label: "Autres Charges & Produits divers",
    kind: "poste",
    accounts: ["61810000", "65800000", "67110000"],
    notes: "Code AC — 67110000 (pénalités sur marchés) rattaché ici, hors plan comptable 2026",
  },
  {
    code: "fx_resultat_sep",
    view: "fx",
    section: FX.generaux,
    label: "Résultat SEP",
    kind: "poste",
    accounts: ["65550000", "75550000"],
    notes: "Code ZZ",
  },
  {
    code: "fx_produits_structure",
    view: "fx",
    section: FX.generaux,
    label: "Produits imputés à la structure",
    kind: "poste",
    sign: -1,
    hidden: true,
    accounts: [
      "71331000", "75800000", "75700000", "74000000", "76000000", "76310000",
      "76400000", "79150000", "70400010", "70400020", "70400029", "70400200",
      "70400290", "70400300", "70880020", "70700200", "70701900", "70600010",
      "70600020", "70800000", "70880000",
    ],
    notes:
      "Produits portés par un centre de structure (travaux en cours du siège, produits divers) : rattachés pour ne pas remonter en non-mappé, exclus du TOTAL 2",
  },
  {
    code: "fx_total_generaux",
    view: "fx",
    section: FX.generaux,
    label: "TOTAL 2 — Frais généraux",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "fx_ms_structure", sign: 1 },
        { code: "fx_cotisations_exploitant", sign: 1 },
        { code: "fx_carburant", sign: 1 },
        { code: "fx_edf_eau", sign: 1 },
        { code: "fx_achats_fournitures", sign: 1 },
        { code: "fx_variation_stock", sign: 1 },
        { code: "fx_location_immo", sign: 1 },
        { code: "fx_location_vehicules", sign: 1 },
        { code: "fx_dechets", sign: 1 },
        { code: "fx_entretien", sign: 1 },
        { code: "fx_credit_bail", sign: 1 },
        { code: "fx_assurances", sign: 1 },
        { code: "fx_exception", sign: 1 },
        { code: "fx_sponsoring", sign: 1 },
        { code: "fx_telecom", sign: 1 },
        { code: "fx_cotisations", sign: 1 },
        { code: "fx_impots", sign: 1 },
        { code: "fx_bancaires", sign: 1 },
        { code: "fx_irr", sign: 1 },
        { code: "fx_dotations", sign: 1 },
        { code: "fx_vnc", sign: 1 },
        { code: "fx_autres", sign: 1 },
        { code: "fx_resultat_sep", sign: 1 },
      ],
    },
  },
  {
    code: "fx_ratio_generaux",
    view: "fx",
    section: FX.generaux,
    label: "Ratio FX / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "fx_total_generaux", den: "fx_ca_reference" },
  },

  // ▸ TOTAUX GÉNÉRAUX
  {
    code: "fx_total_general",
    view: "fx",
    section: FX.totaux,
    label: "TOTAL 4 — MS + FX (Total 1 + Total 2)",
    kind: "total",
    formula: {
      op: "sum",
      operands: [
        { code: "fx_total_honoraires", sign: 1 },
        { code: "fx_total_generaux", sign: 1 },
      ],
    },
  },
  {
    code: "fx_ratio_general",
    view: "fx",
    section: FX.totaux,
    label: "Ratio (MS + FX) / CA (%)",
    kind: "ratio",
    formula: { op: "ratio", num: "fx_total_general", den: "fx_ca_reference" },
  },
];

export const nomenclature: NomenclatureLine[] = [...synthese, ...chantier, ...fx];
