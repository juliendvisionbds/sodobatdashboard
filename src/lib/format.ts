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

/**
 * Choisit automatiquement l'unité la plus lisible : k€ sous 1 M€, sinon M€.
 * Évite les gros nombres du type "10 506 k€" qui obligent à convertir
 * mentalement en millions ; renvoie le montant et l'unité séparément pour
 * garder le contrôle du style (ex. unité plus petite/grisée).
 * 10 506 234 → { amount: "10,5", unit: "M€" }
 * 482 000 → { amount: "482", unit: "k€" }
 */
export function splitAutoEur(n: number): { amount: string; unit: string } {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    // Sous 10 M€ : 3 décimales pour garder la précision au millier d'euros
    // (1 812 k€ → 1,812 M€, pas de perte d'info par rapport au k€).
    const decimals = abs >= 10_000_000 ? 1 : 3;
    return {
      amount: new Intl.NumberFormat("fr-FR", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      }).format(abs / 1_000_000),
      unit: "M€",
    };
  }
  return {
    amount: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(abs / 1000),
    unit: "k€",
  };
}

/** Version "tout en un" de splitAutoEur, avec signe. 10506234 → "10,5 M€" */
export function fmtEurAuto(n: number): string {
  const { amount, unit } = splitAutoEur(n);
  return `${n < 0 ? "−" : ""}${amount} ${unit}`;
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
