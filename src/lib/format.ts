const MONTH_LABELS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
];

/** "2026-03-01" → "Mar 26" */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${String(y).slice(2)}`;
}

/** "2026-03-01" → "Mars 2026" */
export function monthLabelLong(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const long = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
  ];
  return `${long[m - 1]} ${y}`;
}

export function fmtEur(n: number, opts?: { decimals?: number }): string {
  return (
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: opts?.decimals ?? 0,
      minimumFractionDigits: 0,
    }).format(n) + " €"
  );
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
}

/** 1511234 → "1 511 k€" */
export function fmtKEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n / 1000) + " k€";
}

export function fmtPct(n: number | null, decimals = 1): string {
  if (n == null) return "—";
  return (
    new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(n) + " %"
  );
}

export function fiscalYearLabel(start: number): string {
  return `${start} / ${start + 1}`;
}
