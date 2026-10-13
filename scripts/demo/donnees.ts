// Jeu de données fictif de l'entité de démonstration (« Demo »).
//
// Une PME de bâtiment imaginaire, tenue dans le format Cegid de Sodobat :
// exercice de novembre à octobre, prévisions de travaux en cours sur le
// 71331000 par chantier, centres de structure FX et DEPOT, chantiers numérotés
// avec la lettre de leur pôle. Tout est tiré d'un générateur pseudo-aléatoire
// à graine fixe : relancer le script redonne exactement les mêmes chiffres.
//
// Les montants sont cohérents entre eux par construction : la balance ventilée
// d'un mois est la somme, compte par compte, de la balance analytique du même
// mois ; la prévision d'un chantier est reprise au débit le mois suivant ; les
// cumuls d'ouverture reprennent ce que les mois antérieurs ont produit.
//
// Seuls des comptes rattachés à la nomenclature Sodobat sont utilisés : rien
// ne remonte en « compte non mappé », et la ligne Ctrl de la Synthèse reste
// égale aux retraitements DAP et VNC.

export type Mois = string; // « AAAA-MM-01 »

export type LigneAnalytique = {
  centre: string;
  centreLabel: string;
  compte: string;
  debit: number;
  credit: number;
};

export type Chantier = {
  code: string;
  label: string;
  pole: string | null;
  /** indice du premier mois de production dans `moisSimules` */
  debut: number;
  duree: number;
  budget: number;
  marge: number;
  tva: "20" | "10" | "LQ";
  marchePublic: boolean;
  profil: Profil;
  /** part de la production du mois facturée dans le mois (1 = pas de prévision) */
  facturationImmediate: number;
  /** mois de charges tardives après la fin (factures fournisseurs de clôture) */
  traine: number;
};

export type JeuDemo = {
  /** tous les mois simulés, période de chauffe comprise */
  moisSimules: Mois[];
  /** mois publiés : du premier exercice historique au mois de la démonstration */
  mois: Mois[];
  chantiers: Chantier[];
  lignes: Map<Mois, LigneAnalytique[]>;
  /** provision en cours à la fin du mois, par chantier (chantiers seulement) */
  provisions: Map<Mois, Map<string, number>>;
  notesChantier: Map<Mois, Map<string, string>>;
  notesEntite: Map<Mois, string>;
  /** objectifs annuels du dirigeant, en % du CA, par clé d'indicateur */
  objectifs: Record<string, number>;
};

export const PREMIER_MOIS_SIMULE: Mois = "2020-11-01";
export const PREMIER_MOIS: Mois = "2021-11-01";
/** Dernier mois généré : celui que la démonstration importe en direct. */
export const DERNIER_MOIS: Mois = "2026-09-01";
/** Dernier mois présent en base avant la démonstration (validé). */
export const DERNIER_MOIS_VALIDE: Mois = "2026-08-01";
/** Mois d'ouverture de l'exercice en cours au moment de la démonstration. */
export const OUVERTURE_EXERCICE_COURANT: Mois = "2025-11-01";

export const CENTRES_STRUCTURE = {
  FX: "FRAIS GENERAUX",
  DEPOT: "DEPOT",
} as const;

/** Libellés Cegid des comptes utilisés (majuscules, 30 caractères au plus). */
export const LIBELLES_COMPTES: Record<string, string> = {
  "60100000": "ACH.MATIERES PREMIERES 20",
  "60100920": "ACHATS INTRACOMM",
  "60260001": "EMBALLAGES CONSIGNES",
  "60310000": "VARIATION STOCK MAT 1ERES",
  "60400020": "SOUS TRAITANCE 20%",
  "60400900": "SOUS TRAITANCE INTRACOMM",
  "60412000": "SOUS TRAITANT AUTO LIQUIDATION",
  "60412100": "SOUS TRAITANT PAIEMENT DIRECT",
  "60610000": "EAU CHANTIER",
  "60611000": "EDF SIEGE",
  "60612000": "EAU SIEGE",
  "60612100": "EDF CHANTIER",
  "60614000": "CARBURANT",
  "60630000": "FOURN.ENTRET.& P.EQUIPT",
  "60640000": "FOURNITURES DE BUREAU",
  "60650000": "VETEMENTS DE TRAVAIL",
  "61110000": "REP ECO PARTICIPATION",
  "61200000": "CREDIT BAIL MATERIEL",
  "61258100": "CREDIT BAIL FOURGON 60 M",
  "61323000": "LOCATION IMMO SIEGE",
  "61350500": "LOCATIONS MATERIEL",
  "61350510": "LOCATIONS MATERIEL 0%",
  "61350520": "LOCATIONS EASYMAT",
  "61354000": "LOCATIONS DE BENNES DECHETS",
  "61400000": "CHARG.LOC.& DE COPROPR.",
  "61550000": "ENTRET.REPAR.MATERIEL",
  "61552000": "ENTRET.REPAR.VEHICULES",
  "61560000": "MAINTENANCE",
  "61610000": "ASSURANCE RC LOCAUX",
  "61620000": "ASSURANCE FLOTTE VEHICULES",
  "61630000": "ASSURANCE DECENNALE",
  "61810000": "DOCUMENTATION GENERALE",
  "62110000": "PERSONNEL INTERIMAIRE",
  "62111000": "PERSONNEL INTERIMAIRE ENCADR.",
  "62260000": "HONORAIRES COMPTABLES",
  "62261000": "HONORAIRES CHANTIER",
  "62263000": "HONORAIRES DE MANAGEMENT",
  "62270000": "FRAIS D'ACTES",
  "62280000": "PRESTATIONS INFORMATIQUES",
  "62340000": "CADEAUX CLIENTS",
  "62381000": "SEMINAIRES",
  "62510000": "DEPLACEMENTS PEAGES",
  "62570000": "RECEPTIONS",
  "62600000": "FRAIS TELECOM & POSTAUX",
  "62640000": "GEOLOCALISATION ABONNEMENT",
  "62780000": "FRAIS BANCAIRES",
  "62800000": "DONS",
  "62810000": "COTISATIONS PROFESSIONNELLES",
  "62820000": "GARDIENNAGE",
  "63330000": "PART.FORM.CONTI.-AUT0.ORG",
  "63350000": "TAXE APPRENTISSAGE-AUT.OR",
  "63511100": "TAXE CFE",
  "63512000": "TAXE FONCIERE",
  "63580000": "DROITS D'ENREGISTREMENT",
  "64100000": "SALAIRES-APPOINT.COMMIS.",
  "64140000": "PRIMES EXONEREES",
  "64510000": "COTIS.URSSAF",
  "64515000": "CAISSE CONGES PAYES",
  "64530000": "COTIS.PROBTP",
  "64540000": "COTIS.POLE EMPLOI",
  "64750000": "MEDECINE DU TRAVAIL",
  "65800000": "CHARGES DIVERSES GESTION",
  "66110000": "INTERETS DES EMPRUNTS",
  "67500000": "VNC IMMO CORPORELLES",
  "68112000": "DOT.AMORT.S/IMM.CORP.",
  "69500000": "IMPOT SUR LES BENEFICES",
  "70400010": "PRESTATIONS BATIMENTS 10%",
  "70400020": "PRESTATIONS BATIMENTS 20%",
  "70400029": "PRESTATIONS BATIMENTS AUTOLIQ",
  "70880020": "REFACTURATIONS DIVERSES",
  "71331000": "TRAVAUX ENCOURS",
  "75800000": "PROD.DIV.GESTION COURANTE",
  "75870000": "INDEMNITES D'ASSURANCES",
  "76000000": "PRODUITS FINANCIERS",
  "77520000": "PRODUITS CESSION IMMO",
  "79100000": "TRANSFERTS DE CHARGES EXPLOIT",
};

// ── Outils ───────────────────────────────────────────────────────────────────

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cents = (x: number) => Math.round(x * 100) / 100;
const euros = (x: number) => Math.round(x);

export function moisIndex(m: Mois): number {
  const [y, mm] = m.split("-").map(Number);
  return y * 12 + (mm - 1);
}
export function moisDepuisIndex(i: number): Mois {
  const y = Math.floor(i / 12);
  const mm = (i % 12) + 1;
  return `${y}-${String(mm).padStart(2, "0")}-01`;
}
export function moisPlus(m: Mois, n: number): Mois {
  return moisDepuisIndex(moisIndex(m) + n);
}
/** Exercice (année d'ouverture, novembre) d'un mois. */
export function exerciceDe(m: Mois): number {
  const [y, mm] = m.split("-").map(Number);
  return mm >= 11 ? y : y - 1;
}
/** Les douze mois d'un exercice ouvert en novembre. */
export function moisExercice(exercice: number): Mois[] {
  const out: Mois[] = [];
  for (let i = 0; i < 12; i++) out.push(moisDepuisIndex(exercice * 12 + 10 + i));
  return out;
}

type Profil = "gros-oeuvre" | "second-oeuvre" | "renovation";

type Categorie =
  | "achats"
  | "sousTraitance"
  | "personnel"
  | "interim"
  | "locations"
  | "dechets"
  | "carburant"
  | "edf"
  | "entretien"
  | "honoraires"
  | "deplacements";

/** Répartition des charges d'un chantier selon son profil (parts du total). */
const MIX: Record<Profil, Record<Categorie, number>> = {
  "gros-oeuvre": {
    achats: 0.3,
    sousTraitance: 0.27,
    personnel: 0.13,
    interim: 0.17,
    locations: 0.055,
    dechets: 0.03,
    carburant: 0.015,
    edf: 0.005,
    entretien: 0.01,
    honoraires: 0.01,
    deplacements: 0.005,
  },
  "second-oeuvre": {
    achats: 0.21,
    sousTraitance: 0.45,
    personnel: 0.09,
    interim: 0.14,
    locations: 0.03,
    dechets: 0.02,
    carburant: 0.01,
    edf: 0.005,
    entretien: 0.005,
    honoraires: 0.025,
    deplacements: 0.01,
  },
  renovation: {
    achats: 0.2,
    sousTraitance: 0.33,
    personnel: 0.14,
    interim: 0.21,
    locations: 0.035,
    dechets: 0.04,
    carburant: 0.01,
    edf: 0.005,
    entretien: 0.01,
    honoraires: 0.01,
    deplacements: 0.01,
  },
};

/** Comptes d'une catégorie, avec leur poids et la probabilité d'être absents un mois donné. */
const COMPTES: Record<Exclude<Categorie, "personnel">, [string, number, number][]> = {
  achats: [
    ["60100000", 0.82, 0],
    ["60630000", 0.07, 0.2],
    ["60260001", 0.03, 0.5],
    ["60640000", 0.02, 0.6],
    ["61110000", 0.01, 0.3],
    ["60100920", 0.05, 0.7],
  ],
  sousTraitance: [
    ["60412000", 0.72, 0],
    ["60400020", 0.24, 0.3],
    ["60400900", 0.04, 0.85],
  ],
  interim: [
    ["62110000", 0.8, 0],
    ["62111000", 0.2, 0.6],
  ],
  locations: [
    ["61350500", 0.55, 0.1],
    ["61350520", 0.35, 0.2],
    ["61350510", 0.1, 0.7],
  ],
  dechets: [["61354000", 1, 0]],
  carburant: [["60614000", 1, 0]],
  edf: [
    ["60612100", 0.7, 0.1],
    ["60610000", 0.3, 0.5],
  ],
  entretien: [
    ["61550000", 0.8, 0.2],
    ["61552000", 0.2, 0.6],
  ],
  honoraires: [
    ["62261000", 0.85, 0.1],
    ["62820000", 0.15, 0.75],
  ],
  deplacements: [
    ["62510000", 0.7, 0.1],
    ["62570000", 0.3, 0.6],
  ],
};

/** Décomposition d'une masse salariale : salaires et charges au prorata. */
const PERSONNEL: [string, number][] = [
  ["64100000", 1],
  ["64510000", 0.42],
  ["64515000", 0.19],
  ["64530000", 0.055],
  ["64540000", 0.041],
  ["63330000", 0.012],
  ["63350000", 0.007],
];
const PERSONNEL_TOTAL = PERSONNEL.reduce((t, [, p]) => t + p, 0);

const POLES = ["A", "A", "B", "B", "C", "D", "E"];

/** Intitulés fictifs : type d'ouvrage et lieu inventé, dans le style Cegid. */
const TYPES = [
  "VILLA", "RESIDENCE", "ECOLE", "GYMNASE", "COLLEGE", "CRECHE", "EHPAD", "HOTEL",
  "CLINIQUE", "MAIRIE", "MEDIATHEQUE", "PARKING SILO", "ENTREPOT", "SUPERMARCHE",
  "CONCESSION AUTO", "CAVE COOPERATIVE", "PISCINE", "SALLE DES FETES",
  "MAISON DE SANTE", "GENDARMERIE", "BUREAUX", "LOGEMENTS", "HANGAR AGRICOLE",
  "CINEMA", "LYCEE", "STATION SERVICE", "CENTRE TECHNIQUE", "RESTAURANT",
  "IMMEUBLE", "ATELIER", "STADE", "DOJO", "TENNIS CLUB", "CAMPING", "PHARMACIE",
  "MAISON", "LOCAUX", "CENTRE DE LOISIRS", "CHAI", "GARAGE",
];
const LIEUX = [
  "BELLEVUE", "MONTBRUN", "CASTELMONT", "SAINT ELOI", "LA GARRIGUE", "VAL FLEURI",
  "LES OLIVIERS", "LE GRAND CHENE", "PORT MARIN", "ROCHEBLANCHE", "VILLEBOIS",
  "SAINT AUBAN", "LES RESTANQUES", "LA COLLINE", "MONTCLAR", "LES PINS",
  "BEAUSOLEIL", "LA BASTIDE", "LE PRADEL", "SAINTE CROIX", "LES TERRASSES",
  "VALDEMOURE", "LE CANNET VIEUX", "RIVE DROITE", "LA PLAINE", "LES CIGALES",
  "CAP ROUX", "LE MOULIN", "SAINT JULIEN", "LA SOURCE", "LES AMANDIERS",
  "PIERREFEU HAUT", "LE VALLON", "LA CHAPELLE", "LES MIMOSAS", "SAINT MARTIN",
  "LE CLOS", "LA PINEDE", "LES LAVANDES", "MONTREDON",
];
const CLIENTS = [
  "SCI LES CIGALES", "SCI DU PORT", "SAS BATILOG", "SCI AZUR INVEST", "SCI LE CEDRE",
  "SARL PROVENCE IMMO", "SCI DES ARTS", "SCI MONTVERT", "SAS SUD DISTRIBUTION",
  "SCI LA BASTIDE", "SCI HORIZON", "SAS MEDIPOLE", "SCI DU CHATEAU", "SCI LES PINS",
];

// ── Génération ───────────────────────────────────────────────────────────────

export function genererJeu(seed = 20261013): JeuDemo {
  const rand = mulberry32(seed);
  const entre = (a: number, b: number) => a + rand() * (b - a);
  const choix = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const proba = (p: number) => rand() < p;
  const poisson = (lambda: number) => {
    let k = 0;
    let p = Math.exp(-lambda);
    let s = p;
    const u = rand();
    while (u > s) {
      k++;
      p *= lambda / k;
      s += p;
    }
    return k;
  };

  const debutSimule = moisIndex(PREMIER_MOIS_SIMULE);
  const nbMois = moisIndex(DERNIER_MOIS) - debutSimule + 1;
  const moisSimules: Mois[] = [];
  for (let i = 0; i < nbMois; i++) moisSimules.push(moisDepuisIndex(debutSimule + i));
  const mois = moisSimules.filter((m) => m >= PREMIER_MOIS);

  // Croissance lente de l'activité d'un exercice à l'autre.
  const croissance = (t: number) => Math.pow(1.03, (t + 2) / 12);

  // ── Chantiers ──────────────────────────────────────────────────────────────
  const noms = new Set<string>();
  const nomChantier = (): string => {
    for (let essai = 0; essai < 50; essai++) {
      const nom = proba(0.18)
        ? choix(CLIENTS)
        : `${choix(TYPES)} ${choix(LIEUX)}`;
      if (!noms.has(nom) && nom.length <= 30) {
        noms.add(nom);
        return nom;
      }
    }
    return `CHANTIER ${noms.size + 1}`;
  };

  const chantiers: Chantier[] = [];
  let numero = 212;
  for (let t = 0; t < nbMois - 1; t++) {
    const [, mm] = moisSimules[t].split("-").map(Number);
    // Peu de démarrages en août et en décembre, davantage à la rentrée.
    const saison = mm === 8 ? 0.4 : mm === 12 ? 0.7 : mm === 9 || mm === 1 ? 1.35 : 1;
    const n = poisson(2.5 * saison * (t === 0 ? 3.5 : 1));
    for (let k = 0; k < n; k++) {
      const petit = proba(0.18);
      const duree = petit
        ? choix([1, 2, 2, 3])
        : choix([3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 9, 10, 11, 12, 14]);
      const profil: Profil = choix(["gros-oeuvre", "second-oeuvre", "second-oeuvre", "renovation"]);
      const parMois = petit ? entre(6_000, 20_000) : entre(14_000, 60_000);
      const budget = euros(duree * parMois * croissance(t) * (profil === "gros-oeuvre" ? 1.25 : 1));
      // Marge cible : quelques chantiers perdent de l'argent.
      const marge = proba(0.12) ? entre(-0.09, -0.01) : entre(0.08, 0.26);
      chantiers.push({
        code: `${numero}${choix(POLES)}`,
        label: nomChantier(),
        pole: null,
        debut: t,
        duree,
        budget,
        marge,
        tva: choix(["20", "20", "20", "10", "LQ"]),
        marchePublic: proba(0.3),
        profil,
        facturationImmediate: proba(0.45) ? 1 : entre(0.3, 0.9),
        traine: proba(0.4) ? 1 : 0,
      });
      numero++;
    }
  }
  // Petits travaux et dépannages, suivis sur un chantier permanent sans pôle.
  chantiers.push({
    code: "99",
    label: "TRAVAUX DIVERS",
    pole: null,
    debut: 0,
    duree: nbMois,
    budget: 0,
    marge: 0.12,
    tva: "20",
    marchePublic: false,
    profil: "renovation",
    facturationImmediate: 1,
    traine: 0,
  });
  for (const c of chantiers) c.pole = c.code.match(/[A-Z]$/)?.[0] ?? null;

  // ── Production, facturation, charges ───────────────────────────────────────
  type Activite = {
    production: number[]; // par mois depuis debut
    facturation: number[];
    provision: number[]; // en cours à la fin du mois
    charges: Map<number, Map<Categorie, number>>; // par décalage depuis debut
  };
  const activite = new Map<string, Activite>();

  for (const c of chantiers) {
    const D = c.duree;
    const production: number[] = [];
    if (c.code === "99") {
      for (let i = 0; i < D; i++) production.push(euros(entre(5_000, 16_000) * croissance(i)));
    } else {
      const poids: number[] = [];
      for (let i = 0; i < D; i++) poids.push((Math.pow(Math.sin((Math.PI * (i + 0.5)) / D), 0.9) + 0.15) * entre(0.86, 1.14));
      const total = poids.reduce((a, b) => a + b, 0);
      let cumul = 0;
      for (let i = 0; i < D; i++) {
        const p = i === D - 1 ? c.budget - cumul : euros((c.budget * poids[i]) / total);
        production.push(p);
        cumul += p;
      }
    }
    // Facturation : une part dans le mois, le reste le mois suivant ; le solde
    // (DGD) au dernier mois. La prévision est l'écart cumulé, arrondi comme
    // le ferait un conducteur de travaux.
    const facturation: number[] = [];
    const provision: number[] = [];
    let cumulP = 0;
    let cumulF = 0;
    for (let i = 0; i < D; i++) {
      cumulP += production[i];
      let f: number;
      if (i === D - 1 && c.code !== "99") f = cents(cumulP - cumulF);
      else f = cents(c.facturationImmediate * production[i] + (1 - c.facturationImmediate) * (production[i - 1] ?? 0));
      if (f < 0) f = 0;
      cumulF += f;
      facturation.push(f);
      const ecart = cumulP - cumulF;
      const pas = ecart > 50_000 ? 1000 : 500;
      provision.push(i === D - 1 || ecart < 400 ? 0 : Math.round(ecart / pas) * pas);
    }
    // Charges : au prorata de la production, bruitées, recalées en fin de chantier.
    const charges = new Map<number, Map<Categorie, number>>();
    const cible = c.code === "99" ? null : c.budget * (1 - c.marge);
    let cumulC = 0;
    const totalProd = production.reduce((a, b) => a + b, 0);
    for (let i = 0; i < D; i++) {
      let montant: number;
      if (cible == null) montant = production[i] * (1 - c.marge) * entre(0.85, 1.15);
      else if (i === D - 1) montant = Math.max(cible * 0.04, cible * (1 - (c.traine ? 0.045 : 0)) - cumulC);
      else montant = (cible * production[i] / totalProd) * entre(0.8, 1.2);
      cumulC += montant;
      charges.set(i, repartir(montant, c.profil));
    }
    if (c.traine && cible != null) charges.set(D, repartir(Math.max(0, cible - cumulC), c.profil));
    activite.set(c.code, { production, facturation, provision, charges });
  }

  function repartir(montant: number, profil: Profil): Map<Categorie, number> {
    const mix = MIX[profil];
    const brut = new Map<Categorie, number>();
    let total = 0;
    for (const [cat, part] of Object.entries(mix) as [Categorie, number][]) {
      const v = part * entre(0.65, 1.35);
      brut.set(cat, v);
      total += v;
    }
    const out = new Map<Categorie, number>();
    for (const [cat, v] of brut) out.set(cat, (montant * v) / total);
    return out;
  }

  // ── Lignes analytiques, mois par mois ──────────────────────────────────────
  const lignes = new Map<Mois, LigneAnalytique[]>();
  const provisions = new Map<Mois, Map<string, number>>();
  const notesChantier = new Map<Mois, Map<string, string>>();

  // Un solde signé, comme en balance : positif au débit (charges), négatif au
  // crédit (produits, avoirs, transferts de charges).
  const ajouter = (list: LigneAnalytique[], centre: string, centreLabel: string, compte: string, solde: number) => {
    const v = cents(solde);
    if (v === 0) return;
    if (!(compte in LIBELLES_COMPTES)) throw new Error(`compte sans libellé : ${compte}`);
    list.push({ centre, centreLabel, compte, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 });
  };

  for (let t = 0; t < nbMois; t++) {
    const m = moisSimules[t];
    const [annee, mm] = m.split("-").map(Number);
    const list: LigneAnalytique[] = [];
    const prov = new Map<string, number>();
    const notes = new Map<string, string>();

    for (const c of chantiers) {
      const i = t - c.debut;
      const a = activite.get(c.code)!;
      const enCours = i >= 0 && i < c.duree;
      const traine = i === c.duree && c.traine === 1;
      if (!enCours && !traine) continue;

      if (enCours) {
        // Produits
        const compteCa = c.tva === "20" ? "70400020" : c.tva === "10" ? "70400010" : "70400029";
        let f = a.facturation[i];
        if (f > 0 && proba(0.06)) {
          const refac = cents(f * entre(0.01, 0.03));
          ajouter(list, c.code, c.label, "70880020", -refac);
          f = cents(f - refac);
        }
        ajouter(list, c.code, c.label, compteCa, -f);
        if (proba(0.008)) ajouter(list, c.code, c.label, "75870000", -euros(entre(2_000, 9_000)));
        // Travaux en cours : reprise de la provision du mois précédent au
        // débit, nouvelle provision au crédit.
        const avant = i > 0 ? a.provision[i - 1] : 0;
        const apres = a.provision[i];
        if (avant || apres)
          list.push({ centre: c.code, centreLabel: c.label, compte: "71331000", debit: avant, credit: apres });
        prov.set(c.code, apres);
      }

      // Charges
      const parCat = a.charges.get(i);
      if (parCat) {
        for (const [cat, montant] of parCat) {
          if (montant <= 0) continue;
          if (cat === "personnel") {
            const sal = montant / PERSONNEL_TOTAL;
            for (const [compte, part] of PERSONNEL) ajouter(list, c.code, c.label, compte, sal * part);
            if ((mm === 12 || mm === 6) && proba(0.6)) ajouter(list, c.code, c.label, "64140000", sal * entre(0.08, 0.15));
            if (proba(0.08)) ajouter(list, c.code, c.label, "79100000", -sal * entre(0.02, 0.06));
            if (proba(0.1)) ajouter(list, c.code, c.label, "64750000", entre(40, 160));
            continue;
          }
          let restant = montant;
          if (cat === "sousTraitance" && c.marchePublic) {
            const direct = montant * entre(0.25, 0.45);
            ajouter(list, c.code, c.label, "60412100", direct);
            restant -= direct;
          }
          const comptes = COMPTES[cat].filter(([, , absent]) => !proba(absent));
          const retenus = comptes.length ? comptes : [COMPTES[cat][0]];
          const poids = retenus.map(([, p]) => p * entre(0.7, 1.3));
          const total = poids.reduce((x, y) => x + y, 0);
          retenus.forEach(([compte], k) => ajouter(list, c.code, c.label, compte, (restant * poids[k]) / total));
        }
      }

      // Notes de suivi, sur les mois que la démonstration affiche.
      if (m >= OUVERTURE_EXERCICE_COURANT) {
        const resultatMois = enCours
          ? a.facturation[i] + (a.provision[i] - (i > 0 ? a.provision[i - 1] : 0)) - [...(parCat?.values() ?? [])].reduce((x, y) => x + y, 0)
          : 0;
        if (i === 0 && c.code !== "99" && proba(0.5))
          notes.set(c.code, choix([
            "Ordre de service reçu, installation de la base vie.",
            "Démarrage des travaux, terrassement en cours.",
            "Démarrage : première situation prévue le mois prochain.",
          ]));
        else if (enCours && i === c.duree - 1 && proba(0.6))
          notes.set(c.code, choix([
            "Situation finale émise, DGD en cours de signature.",
            "Réception prononcée avec réserves, levée prévue sous 30 jours.",
            "Chantier livré, retenue de garantie à libérer.",
          ]));
        else if (traine)
          notes.set(c.code, "Factures fournisseurs de clôture, chantier terminé.");
        else if (enCours && a.provision[i] >= 60_000 && proba(0.45))
          notes.set(c.code, choix([
            "Situation en attente de validation du maître d'œuvre, facturation décalée.",
            "Avancement supérieur à la facturation : situation à émettre début de mois.",
          ]));
        else if (enCours && resultatMois < -15_000 && proba(0.5))
          notes.set(c.code, choix([
            "Dérive sur le lot plâtrerie, point à faire avec le conducteur de travaux.",
            "Reprise de malfaçons du sous-traitant, recours en cours.",
            "Heures de main-d'œuvre au-dessus du budget, à surveiller.",
          ]));
      }
    }

    // ── Structure : siège (FX) et dépôt ──────────────────────────────────────
    const g = croissance(t);
    const indexation = Math.pow(1.02, exerciceDe(m) - 2021); // loyers et abonnements, revus à chaque exercice
    const hiver = mm >= 11 || mm <= 2 ? 1.4 : mm >= 6 && mm <= 8 ? 0.8 : 1;
    const fx = (compte: string, solde: number) => ajouter(list, "FX", CENTRES_STRUCTURE.FX, compte, solde);
    const depot = (compte: string, montant: number) => ajouter(list, "DEPOT", CENTRES_STRUCTURE.DEPOT, compte, montant);

    // Masse salariale sédentaire (siège) et magasinier (dépôt)
    const salSiege = 14_000 * g * entre(0.985, 1.015);
    for (const [compte, part] of PERSONNEL) fx(compte, salSiege * part);
    if (mm === 12) fx("64140000", salSiege * 0.6);
    if (mm % 3 === 0) fx("64750000", 320);
    const salDepot = 2_400 * g * entre(0.99, 1.01);
    for (const [compte, part] of PERSONNEL) depot(compte, salDepot * part);

    // Locaux, contrats, assurances : des montants fixes, que l'application
    // signale comme tels.
    fx("61323000", euros(4_200 * indexation));
    fx("61400000", 450);
    fx("61200000", 1_180);
    fx("61258100", 620);
    fx("61610000", euros(890 * indexation));
    if (mm % 3 === 1) fx("61620000", euros(4_150 * indexation));
    if (mm === 11) fx("61630000", euros(11_500 * g));
    fx("62263000", 4_000);
    fx("62260000", 1_450);
    fx("62280000", 380);
    if (proba(0.1)) fx("62270000", entre(300, 900));
    fx("62600000", 640 * entre(0.92, 1.08));
    fx("60611000", 900 * hiver * entre(0.9, 1.1));
    if (mm % 3 === 2) fx("60612000", 180 * entre(0.8, 1.2));
    fx("60614000", 2_100 * g * entre(0.88, 1.12));
    fx("62510000", 450 * entre(0.8, 1.2));
    fx("62640000", 240);
    if (proba(0.3)) fx("62570000", entre(150, 600));
    fx("60640000", 350 * entre(0.7, 1.3));
    if (proba(0.7)) fx("61560000", 300 * entre(0.8, 1.2));
    if (mm % 3 === 0) fx("62810000", euros(1_100 * indexation));
    if (mm === 12 && proba(0.7)) fx("62800000", 500);
    fx("62780000", 210 * entre(0.9, 1.1));
    fx("66110000", 1_300 * Math.pow(0.988, t) * entre(0.95, 1.05));
    if (mm === 12) fx("62340000", euros(3_500 * g));
    if (mm === 6) fx("62381000", euros(4_200 * g));
    fx("61810000", 79);
    if (proba(0.1)) fx("65800000", entre(20, 150));
    // Impôts
    if (mm === 12) fx("63511100", euros(7_800 * g));
    if (mm === 10) fx("63512000", euros(4_100 * indexation));
    if (proba(0.05)) fx("63580000", 200);
    if (mm % 3 === 0) fx("69500000", euros(6_500 * g * entre(0.8, 1.2)));
    // Clôture d'exercice : dotations, variation de stock (octobre)
    if (mm === 10 && m < OUVERTURE_EXERCICE_COURANT) {
      fx("68112000", euros(52_000 * g));
      fx("60310000", euros(entre(3_000, 9_000)) * (proba(0.5) ? 1 : -1));
    }
    // Cessions de véhicules : VNC sortie et prix de vente
    if (m === "2025-02-01") {
      fx("67500000", 9_500);
      fx("77520000", -12_000);
    }
    if (m === "2026-03-01") {
      fx("67500000", 6_400);
      fx("77520000", -7_500);
    }
    // Produits du siège
    if (mm % 3 === 0) fx("76000000", -310);
    if (proba(0.08)) fx("75800000", -entre(100, 900));
    // Dépôt
    depot("60630000", 900 * g * entre(0.65, 1.35));
    if (proba(0.35)) depot("60650000", entre(400, 1_400));
    depot("61354000", 1_200 * g * entre(0.7, 1.3));
    depot("61552000", 1_900 * g * entre(0.6, 1.4));
    depot("60614000", 600 * g * entre(0.75, 1.25));

    lignes.set(m, list);
    provisions.set(m, prov);
    if (notes.size) notesChantier.set(m, notes);
    void annee;
  }

  // ── Notes de la Synthèse ───────────────────────────────────────────────────
  const notesEntite = new Map<Mois, string>([
    ["2025-11-01", "Ouverture de l'exercice : trois chantiers livrés en novembre, carnet de commandes à quatorze mois."],
    ["2025-12-01", "Fermeture annuelle du 22 au 31 décembre : facturation concentrée sur les situations de fin d'année."],
    ["2026-01-01", "Intempéries : six jours d'arrêt sur les chantiers du pôle A, facturation décalée sur février."],
    ["2026-03-01", "Cession du fourgon de 2017 : VNC 6,4 k€, prix de vente 7,5 k€ (hors CA)."],
    ["2026-06-01", "Séminaire d'encadrement et primes semestrielles versées en juin."],
    ["2026-08-01", "Mois de congés : activité réduite, deux nouveaux chantiers démarrés fin août."],
  ]);

  // ── Objectifs du dirigeant (% du CA) ───────────────────────────────────────
  const objectifs: Record<string, number> = {
    achats: 19,
    location_materiel: 2.5,
    location_easymat: 1.5,
    salaires_production: 10,
    salaires_sedentaires: 4.5,
    frais_generaux: 9.5,
    honoraires_chantiers: 1.5,
    sous_traitants_1: 3,
    sous_traitants_2: 29,
    dechets: 2.2,
    interim: 13,
    eau_edf: 0.5,
  };

  return { moisSimules, mois, chantiers, lignes, provisions, notesChantier, notesEntite, objectifs };
}

// ── Agrégations ──────────────────────────────────────────────────────────────

export type LigneVentilee = { compte: string; libelle: string; parMois: Map<Mois, number> };

/** Balance ventilée : solde (débit − crédit) par compte et par mois, tous centres confondus. */
export function balanceVentilee(jeu: JeuDemo, mois: Mois[]): LigneVentilee[] {
  const parCompte = new Map<string, Map<Mois, number>>();
  for (const m of mois) {
    for (const l of jeu.lignes.get(m) ?? []) {
      const rec = parCompte.get(l.compte) ?? new Map<Mois, number>();
      rec.set(m, Math.round(((rec.get(m) ?? 0) + l.debit - l.credit) * 100) / 100);
      parCompte.set(l.compte, rec);
    }
  }
  return [...parCompte.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([compte, parMois]) => ({ compte, libelle: LIBELLES_COMPTES[compte], parMois }));
}

export type LigneBalanceAnalytique = LigneAnalytique & { libelle: string; solde: number };

/** Balance analytique cumulée sur des mois : débits et crédits par centre × compte. */
export function balanceAnalytique(jeu: JeuDemo, mois: Mois[]): LigneBalanceAnalytique[] {
  const acc = new Map<string, LigneBalanceAnalytique>();
  for (const m of mois) {
    for (const l of jeu.lignes.get(m) ?? []) {
      const key = `${l.centre}|${l.compte}`;
      const rec = acc.get(key) ?? { ...l, debit: 0, credit: 0, libelle: LIBELLES_COMPTES[l.compte], solde: 0 };
      rec.debit = cents(rec.debit + l.debit);
      rec.credit = cents(rec.credit + l.credit);
      rec.solde = cents(rec.debit - rec.credit);
      acc.set(key, rec);
    }
  }
  const numero = (code: string) => Number(code.match(/^\d+/)?.[0] ?? Infinity);
  return [...acc.values()]
    .filter((l) => l.debit !== 0 || l.credit !== 0)
    .sort(
      (a, b) =>
        numero(a.centre) - numero(b.centre) || a.centre.localeCompare(b.centre) || a.compte.localeCompare(b.compte)
    );
}

/**
 * Cumuls d'ouverture des chantiers encore ouverts au premier mois importé :
 * facturation (travaux en cours compris) et résultat des mois antérieurs.
 */
export function reportsOuverture(
  jeu: JeuDemo,
  ouverture: Mois
): { centre: string; label: string; facturation: number; resultat: number }[] {
  const avant = jeu.mois.filter((m) => m < ouverture);
  const apres = jeu.mois.filter((m) => m >= ouverture);
  const ouverts = new Set<string>();
  for (const m of apres) for (const l of jeu.lignes.get(m) ?? []) ouverts.add(l.centre);
  const acc = new Map<string, { label: string; facturation: number; resultat: number }>();
  for (const m of avant) {
    for (const l of jeu.lignes.get(m) ?? []) {
      if (!/^\d/.test(l.centre) || !ouverts.has(l.centre)) continue;
      const rec = acc.get(l.centre) ?? { label: l.centreLabel, facturation: 0, resultat: 0 };
      const solde = l.debit - l.credit;
      if (l.compte.startsWith("7")) {
        rec.resultat -= solde;
        if (l.compte.startsWith("70") || l.compte === "71331000") rec.facturation -= solde;
      } else rec.resultat -= solde;
      acc.set(l.centre, rec);
    }
  }
  return [...acc.entries()]
    .filter(([, r]) => cents(r.facturation) !== 0 || cents(r.resultat) !== 0)
    .map(([centre, r]) => ({ centre, label: r.label, facturation: cents(r.facturation), resultat: cents(r.resultat) }))
    .sort((a, b) => a.centre.localeCompare(b.centre));
}
