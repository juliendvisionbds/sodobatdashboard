import * as XLSX from "xlsx";

// ── Types normalisés ─────────────────────────────────────────────────────────

export type VentileeLine = {
  account: string;
  label: string;
  month: string; // "YYYY-MM-01"
  amount: number;
};

export type AnalytiqueLine = {
  centreCode: string;
  centreLabel: string;
  account: string;
  label: string;
  debit: number;
  credit: number;
  solde: number;
};

export type ParsedVentilee = {
  type: "ventilee";
  lines: VentileeLine[];
  months: string[]; // mois présents, triés
  period: string; // dernier mois = période de l'import
  fiscalYearStart: number;
  // contrôles : totaux par classe lus dans le fichier vs recalculés par nous
  classTotals: {
    class: string;
    fileTotal: number | null;
    computedTotal: number;
    ok: boolean;
  }[];
  fileGrandTotal: number | null;
  accounts: { account: string; label: string; total: number }[];
};

export type ParsedAnalytique = {
  type: "analytique";
  lines: AnalytiqueLine[];
  centres: { code: string; label: string }[];
  accounts: { account: string; label: string; total: number }[];
  totalSolde: number;
  /**
   * Export Pennylane : la balance est répétée une fois par famille d'axes
   * analytiques (« Centre », « Nature »…). Une seule est lue, sans quoi chaque
   * montant serait compté autant de fois qu'il y a de familles.
   */
  famille?: { retenue: string; ignorees: string[] };
};

export type ParsedFile = ParsedVentilee | ParsedAnalytique;

// ── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const MOIS = [
  "janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
];
const sansAccent = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Les en-têtes de mois sont soit "11/2025" (Cegid, texte), soit "Novembre 2025"
// (Pennylane), soit un serial Excel.
function parseMonthHeader(v: unknown): string | null {
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
    const l = sansAccent(v.trim()).match(/^([a-z]+)\s+(\d{4})$/);
    const rang = l ? MOIS.indexOf(l[1]) : -1;
    if (l && rang >= 0) return `${l[2]}-${String(rang + 1).padStart(2, "0")}-01`;
    return null;
  }
  if (typeof v === "number" && v > 40000 && v < 60000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-01`;
  }
  return null;
}

/**
 * Pennylane exporte les numéros de compte sur 11 chiffres, les trois derniers à
 * zéro : 60100000000 est le 60100000 de Cegid. On les ramène à 8 chiffres pour
 * que la nomenclature, écrite sur 8, vaille pour les deux logiciels. Un compte
 * dont les trois derniers chiffres portent une information est laissé entier.
 */
export function normalizeAccount(raw: unknown): string {
  const a = String(raw ?? "").trim();
  return /^\d{11}$/.test(a) && a.endsWith("000") ? a.slice(0, 8) : a;
}

/**
 * Période d'un export Pennylane, lue dans son nom de fichier :
 * « …_(2025_11_01_2026_07_31).xlsx » → du 1er novembre 2025 au 31 juillet 2026.
 */
export function periodFromFileName(
  fileName: string
): { start: string; end: string; months: number } | null {
  const m = fileName.match(/\((\d{4})_(\d{2})_(\d{2})_(\d{4})_(\d{2})_(\d{2})\)/);
  if (!m) return null;
  const [y1, m1, y2, m2] = [m[1], m[2], m[4], m[5]].map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1) + 1;
  if (months < 1) return null;
  return { start: `${m[1]}-${m[2]}-01`, end: `${m[4]}-${m[5]}-01`, months };
}

// Exercice comptable nov → oct : nov 2025 appartient à l'exercice 2025.
export function fiscalYearOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return m >= 11 ? y : y - 1;
}

export function fiscalMonths(fiscalYearStart: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((10 + i) % 12) + 1; // 11, 12, 1..10
    const y = m >= 11 ? fiscalYearStart : fiscalYearStart + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
  }
  return out;
}

type Grid = unknown[][];

const MAX_ROWS = 20000;

function sheetToGrid(ws: XLSX.WorkSheet): Grid {
  // Certains onglets ont un range couvrant 1M+ lignes (formatage de colonnes
  // entières) : on borne la lecture pour ne pas exploser la mémoire.
  let range: XLSX.Range | undefined;
  if (ws["!ref"]) {
    const r = XLSX.utils.decode_range(ws["!ref"]);
    if (r.e.r > MAX_ROWS) {
      r.e.r = MAX_ROWS;
      range = r;
    }
  }
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    ...(range ? { range } : {}),
  });
}

// ── Balance ventilée ─────────────────────────────────────────────────────────
// Structure Cegid : ligne d'en-tête avec "Numéro" / "Intitulé" puis colonnes
// MM/YYYY et une colonne "Solde". Lignes "Total classe X" intercalées (contrôle,
// non importées).
// Structure Pennylane : "N° de compte" / "Libellé de compte" / "Solde" puis un
// mois par colonne, écrit en toutes lettres. Aucune ligne de total : le contrôle
// porte alors sur la colonne Solde, qui doit égaler la somme des mois.

const EN_TETE_COMPTE = ["Numéro", "N° de compte"];
const EN_TETE_LIBELLE = ["Intitulé", "Libellé de compte"];

function tryParseVentilee(grid: Grid): ParsedVentilee | null {
  // trouver la ligne d'en-tête
  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const row = grid[i] ?? [];
    const cells = row.map((c) => (typeof c === "string" ? c.trim() : c));
    if (
      EN_TETE_COMPTE.some((h) => cells.includes(h)) &&
      EN_TETE_LIBELLE.some((h) => cells.includes(h))
    ) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return null;

  const header = grid[headerRow].map((c) => (typeof c === "string" ? c.trim() : c));
  const accountCol = header.findIndex((c) => EN_TETE_COMPTE.includes(c as string));
  const labelCol = header.findIndex((c) => EN_TETE_LIBELLE.includes(c as string));
  const monthCols: { col: number; month: string }[] = [];
  for (let c = 0; c < header.length; c++) {
    const m = parseMonthHeader(header[c]);
    if (m) monthCols.push({ col: c, month: m });
  }
  if (monthCols.length === 0) return null;
  const soldeCol = header.findIndex((c) => c === "Solde");

  const lines: VentileeLine[] = [];
  const fileClassTotals = new Map<string, number>();
  let fileGrandTotal: number | null = null;
  const accountTotals = new Map<string, { label: string; total: number }>();
  // Colonne Solde du fichier, par classe : le contrôle des exports sans ligne de total.
  const soldeParClasse = new Map<string, number>();

  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rawAccount = row[accountCol];
    const label = String(row[labelCol] ?? "").trim();

    if (rawAccount == null || String(rawAccount).trim() === "") {
      // ligne de total du fichier ("Total classe 601", "TOTAL GENERAL")
      const mTot = label.match(/^Total classe (\d+)$/i);
      const solde = soldeCol >= 0 ? toNumber(row[soldeCol]) : 0;
      if (mTot) fileClassTotals.set(mTot[1], solde);
      else if (/^TOTAL GENERAL$/i.test(label)) fileGrandTotal = solde;
      continue;
    }

    const account = normalizeAccount(rawAccount);
    if (!/^\d{3,}$/.test(account)) continue;
    // Seules les classes 6 et 7 font le résultat. Cegid n'exporte qu'elles
    // (« Balance d'Exploitation ») ; un export Pennylane peut porter toute la
    // balance, bilan compris : ces comptes n'ont pas de ligne dans la maquette
    // et n'ont rien à y faire.
    if (!/^[67]/.test(account)) continue;
    if (soldeCol >= 0)
      soldeParClasse.set(account[0], (soldeParClasse.get(account[0]) ?? 0) + toNumber(row[soldeCol]));

    let accTotal = 0;
    for (const { col, month } of monthCols) {
      const amount = toNumber(row[col]);
      if (amount !== 0) {
        lines.push({ account, label, month, amount: round2(amount) });
        accTotal += amount;
      }
    }
    accountTotals.set(account, {
      label,
      total: round2((accountTotals.get(account)?.total ?? 0) + accTotal),
    });
  }

  if (lines.length === 0) return null;

  const months = [...new Set(lines.map((l) => l.month))].sort();
  const period = months[months.length - 1];

  // contrôles par classe (2 premiers chiffres + classes à 3 chiffres du fichier)
  const computedByClass = new Map<string, number>();
  for (const [account, { total }] of accountTotals) {
    for (const len of [1, 2, 3]) {
      const cls = account.slice(0, len);
      computedByClass.set(cls, round2((computedByClass.get(cls) ?? 0) + total));
    }
  }
  // Sans ligne « Total classe » (Pennylane), le fichier se contrôle sur sa
  // colonne Solde : une classe dont le solde n'est pas la somme de ses mois
  // signale une colonne de mois non reconnue ou une ligne tronquée.
  if (fileClassTotals.size === 0 && fileGrandTotal == null)
    for (const [cls, solde] of soldeParClasse) fileClassTotals.set(cls, solde);
  const classTotals = [...fileClassTotals.entries()].map(([cls, fileTotal]) => {
    const computedTotal = round2(computedByClass.get(cls) ?? 0);
    return {
      class: cls,
      fileTotal: round2(fileTotal),
      computedTotal,
      ok: Math.abs(computedTotal - fileTotal) < 0.02,
    };
  });

  return {
    type: "ventilee",
    lines,
    months,
    period,
    fiscalYearStart: fiscalYearOf(months[0]),
    classTotals,
    fileGrandTotal: fileGrandTotal != null ? round2(fileGrandTotal) : null,
    accounts: [...accountTotals.entries()].map(([account, v]) => ({
      account,
      label: v.label,
      total: v.total,
    })),
  };
}

// ── Balance analytique ───────────────────────────────────────────────────────
// Structure Cegid : en-tête "Centre / Intitulé du centre / Compte / Intitulé du
// compte / Débit / Crédit / Solde". Seul l'onglet brut est importé, les onglets
// de travail (X°, PDTS, FX avec tableaux croisés) sont ignorés.
// Structure Pennylane : "Famille / Code analytique / Catégorie / Numéro de
// compte / Libellé / Débit / Crédit / Solde / Solde N-1". La balance y est
// répétée pour chaque famille d'axes : on n'en lit qu'une, celle des chantiers.

/** Code donné à un centre que l'export ne numérote pas : « #» suivi de son libellé. */
export const PREFIXE_CENTRE_SANS_CODE = "#";

/** Famille d'axes qui porte les chantiers : « Centre », sinon la plus détaillée. */
function familleDesCentres(familles: Map<string, Set<string>>): string | null {
  if (familles.size === 0) return null;
  const noms = [...familles.keys()];
  const nommee = noms.find((f) => /centre|chantier/i.test(f));
  if (nommee) return nommee;
  return noms.sort((a, b) => familles.get(b)!.size - familles.get(a)!.size)[0];
}

function tryParseAnalytique(grid: Grid): ParsedAnalytique | null {
  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const row = (grid[i] ?? []).map((c) =>
      typeof c === "string" ? c.trim() : c
    );
    if (
      (row.includes("Centre") && row.includes("Compte")) ||
      (row.includes("Code analytique") && row.includes("Numéro de compte"))
    ) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return null;

  const header = grid[headerRow].map((c) =>
    typeof c === "string" ? c.trim() : c
  );
  const col = (...names: string[]) => header.findIndex((c) => names.includes(c as string));
  const cFamille = col("Famille");
  const cCentre = col("Centre", "Code analytique");
  const cCentreLabel = col("Intitulé du centre", "Catégorie");
  const cAccount = col("Compte", "Numéro de compte");
  const cLabel = col("Intitulé du compte", "Libellé");
  const cDebit = col("Débit");
  const cCredit = col("Crédit");
  const cSolde = col("Solde");
  if (cCentre === -1 || cAccount === -1 || cSolde === -1) return null;

  // Familles d'axes de l'export Pennylane, et celle qu'on retient.
  const familles = new Map<string, Set<string>>();
  if (cFamille >= 0)
    for (let i = headerRow + 1; i < grid.length; i++) {
      const f = String(grid[i]?.[cFamille] ?? "").trim();
      if (!f) continue;
      const set = familles.get(f) ?? new Set<string>();
      set.add(String(grid[i]?.[cCentreLabel] ?? ""));
      familles.set(f, set);
    }
  const famille = familleDesCentres(familles);

  // Le fichier peut contenir des colonnes parasites à droite (tableaux croisés
  // recopiés) : on ne lit que les colonnes identifiées.
  const lines: AnalytiqueLine[] = [];
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    if (famille != null && String(row[cFamille] ?? "").trim() !== famille) continue;
    const centreLabel = String(row[cCentreLabel] ?? "").trim();
    // codes centres normalisés en majuscules (le fichier réel mélange 1022B / 1022b)
    let centreCode = String(row[cCentre] ?? "").trim().toUpperCase();
    // Pennylane laisse sans code les écritures non affectées et certains axes
    // repris d'un autre logiciel. Les ignorer ferait disparaître leurs montants :
    // elles sont rangées sous un centre nommé d'après leur libellé, et signalées.
    if (!centreCode && famille != null && centreLabel)
      centreCode = PREFIXE_CENTRE_SANS_CODE + centreLabel.toUpperCase();
    const account = normalizeAccount(row[cAccount]);
    if (!centreCode || !/^\d{3,}$/.test(account)) continue;
    lines.push({
      centreCode,
      centreLabel,
      account,
      label: String(row[cLabel] ?? "").trim(),
      debit: round2(toNumber(row[cDebit])),
      credit: round2(toNumber(row[cCredit])),
      solde: round2(toNumber(row[cSolde])),
    });
  }
  if (lines.length === 0) return null;

  const centres = new Map<string, string>();
  const accountTotals = new Map<string, { label: string; total: number }>();
  let totalSolde = 0;
  for (const l of lines) {
    if (!centres.has(l.centreCode)) centres.set(l.centreCode, l.centreLabel);
    const prev = accountTotals.get(l.account);
    accountTotals.set(l.account, {
      label: l.label,
      total: round2((prev?.total ?? 0) + l.solde),
    });
    totalSolde += l.solde;
  }

  return {
    type: "analytique",
    lines,
    centres: [...centres.entries()].map(([code, label]) => ({ code, label })),
    accounts: [...accountTotals.entries()].map(([account, v]) => ({
      account,
      label: v.label,
      total: v.total,
    })),
    totalSolde: round2(totalSolde),
    ...(famille != null
      ? { famille: { retenue: famille, ignorees: [...familles.keys()].filter((f) => f !== famille) } }
      : {}),
  };
}

// ── Détection automatique du type ────────────────────────────────────────────

export function parseBalanceFile(buffer: Buffer | ArrayBuffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: buffer instanceof Buffer ? "buffer" : "array" });

  // La ventilée se détecte par ses colonnes MM/YYYY, l'analytique par Centre/Compte.
  // On teste chaque onglet et on garde le meilleur résultat (le plus de lignes) :
  // les fichiers réels contiennent des onglets de travail à ignorer.
  let bestVentilee: ParsedVentilee | null = null;
  let bestAnalytique: ParsedAnalytique | null = null;

  // Pour la ventilée, un même fichier peut contenir l'export Cegid brut et une
  // copie retravaillée : on privilégie l'onglet le plus cohérent en interne
  // (moins de contrôles de classe en écart), puis le plus complet.
  const ventileeScore = (v: ParsedVentilee) => {
    const ko = v.classTotals.filter((c) => !c.ok).length;
    return -ko * 1_000_000 + v.lines.length;
  };

  for (const name of wb.SheetNames) {
    const grid = sheetToGrid(wb.Sheets[name]);
    const v = tryParseVentilee(grid);
    if (v && (!bestVentilee || ventileeScore(v) > ventileeScore(bestVentilee))) {
      bestVentilee = v;
    }
    const a = tryParseAnalytique(grid);
    if (a && (!bestAnalytique || a.lines.length > bestAnalytique.lines.length)) {
      bestAnalytique = a;
    }
  }

  if (bestVentilee) return bestVentilee;
  if (bestAnalytique) return bestAnalytique;
  throw new Error(
    "Format non reconnu : ni balance ventilée (colonnes Numéro/Intitulé + mois MM/AAAA), ni balance analytique (colonnes Centre/Compte/Solde)."
  );
}

// Pôle d'un chantier : lettre suffixe unique du code centre (1003B → B, 1022b → B).
// Les pôles de Sodobat sont des lettres simples (A à F dans le tableau de gestion).
// Un suffixe de plusieurs lettres n'est pas un pôle : c'est typiquement un centre
// que Cegid a créé tout seul lors d'un import ASCII (« 52MF », libellé « Créé par
// Import ASCII »), à rattacher à la main. Il reste sans pôle plutôt que d'en
// inventer un. Les chantiers sans suffixe (52, 53) n'ont pas de pôle non plus.
export function poleOf(centreCode: string): string | null {
  const m = centreCode.trim().match(/^\d+\s*([A-Za-z])$/);
  return m ? m[1].toUpperCase() : null;
}

export type CentreKind = "chantier" | "structure";

// Règle analytique fondamentale : un code centre commençant par un chiffre est un
// chantier ; tout le reste (FX, DEPOT, QUADRA…) est un centre de structure, dont
// les charges vont en frais généraux. La classification peut être surchargée
// manuellement par centre (colonne centres.kind).
export function classifyCentre(centreCode: string): CentreKind {
  return /^\d/.test(centreCode.trim()) ? "chantier" : "structure";
}
