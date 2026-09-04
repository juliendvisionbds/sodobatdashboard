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

// Les en-têtes de mois sont soit "11/2025" (texte), soit un serial Excel.
function parseMonthHeader(v: unknown): string | null {
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
    return null;
  }
  if (typeof v === "number" && v > 40000 && v < 60000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-01`;
  }
  return null;
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
// Structure : ligne d'en-tête avec "Numéro" / "Intitulé" puis colonnes MM/YYYY
// et une colonne "Solde". Lignes "Total classe X" intercalées (contrôle, non importées).

function tryParseVentilee(grid: Grid): ParsedVentilee | null {
  // trouver la ligne d'en-tête
  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const row = grid[i] ?? [];
    const cells = row.map((c) => (typeof c === "string" ? c.trim() : c));
    if (cells.includes("Numéro") && cells.includes("Intitulé")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return null;

  const header = grid[headerRow];
  const accountCol = header.findIndex((c) => c === "Numéro");
  const labelCol = header.findIndex((c) => c === "Intitulé");
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

    const account = String(rawAccount).trim();
    if (!/^\d{3,}$/.test(account)) continue;

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
// Structure : en-tête "Centre / Intitulé du centre / Compte / Intitulé du compte
// / Débit / Crédit / Solde". Seul l'onglet brut est importé, les onglets de
// travail (X°, PDTS, FX avec tableaux croisés) sont ignorés.

function tryParseAnalytique(grid: Grid): ParsedAnalytique | null {
  let headerRow = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const row = (grid[i] ?? []).map((c) =>
      typeof c === "string" ? c.trim() : c
    );
    if (row.includes("Centre") && row.includes("Compte")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return null;

  const header = grid[headerRow].map((c) =>
    typeof c === "string" ? c.trim() : c
  );
  const col = (name: string) => header.findIndex((c) => c === name);
  const cCentre = col("Centre");
  const cCentreLabel = col("Intitulé du centre");
  const cAccount = col("Compte");
  const cLabel = col("Intitulé du compte");
  const cDebit = col("Débit");
  const cCredit = col("Crédit");
  const cSolde = col("Solde");
  if (cCentre === -1 || cAccount === -1 || cSolde === -1) return null;

  // Le fichier peut contenir des colonnes parasites à droite (tableaux croisés
  // recopiés) : on ne lit que les colonnes identifiées.
  const lines: AnalytiqueLine[] = [];
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    // codes centres normalisés en majuscules (le fichier réel mélange 1022B / 1022b)
    const centreCode = String(row[cCentre] ?? "").trim().toUpperCase();
    const account = String(row[cAccount] ?? "").trim();
    if (!centreCode || !/^\d{3,}$/.test(account)) continue;
    lines.push({
      centreCode,
      centreLabel: String(row[cCentreLabel] ?? "").trim(),
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

// Pôle d'un chantier : suffixe alphabétique du code centre (1003B → B, 52MF → MF).
// Les chantiers sans suffixe (52, 53) n'ont pas de pôle.
export function poleOf(centreCode: string): string | null {
  const m = centreCode.trim().match(/^\d+\s*([A-Za-z]{1,2})$/);
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
