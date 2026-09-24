"use client";

import { useMemo, useState } from "react";
import type { FxMensuelData, FxMensuelRow } from "@/lib/finance";
import { TOTAL_COLUMN } from "@/lib/nomenclature/columns";
import { fmtEur, fmtPct, monthLabel } from "@/lib/format";

// Vue mensuelle des frais généraux : Intitulé · un mois par colonne · Cumul ·
// % / CA du cumul. Les ratios se recalculent dans chaque colonne contre le CA du
// même mois, et dans le cumul contre le CA cumulé — un ratio ne se somme pas.

function pctBadge(pct: number | null) {
  return pct == null ? (
    <span className="muted">-</span>
  ) : (
    <span className="pct-badge">{fmtPct(pct)}</span>
  );
}

function money(v: number | null) {
  if (v == null || v === 0) return <span className="muted">-</span>;
  return fmtEur(v);
}

const negClass = (v: number | null) => (v != null && v < 0 ? "neg" : "");

const rowClass = (kind: string) => {
  if (kind === "total" || kind === "computed") return "total-row";
  if (kind === "subtotal") return "subtotal-row";
  return "";
};

export default function FxMensuelTable({ data }: { data: FxMensuelData }) {
  const [search, setSearch] = useState("");
  const colCount = data.months.length + 3;

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.sections;
    return data.sections
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) =>
          `${r.category.label} ${r.accounts.join(" ")}`.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.rows.length > 0);
  }, [data.sections, search]);

  return (
    <div style={{ marginTop: 24 }}>
      <div className="table-controls">
        <input
          className="tctl-input"
          placeholder="Rechercher un poste ou un numéro de compte…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="table-wrap">
        <table className="ct fx-mensuel-ct">
          <thead>
            <tr>
              <th className="left">Intitulé</th>
              {data.months.map((m) => (
                <th
                  key={m}
                  title={data.missing.includes(m) ? "Balance analytique non importée" : undefined}
                >
                  {monthLabel(m)}
                </th>
              ))}
              <th className="total-col">Cumul</th>
              <th className="pct-col">% / CA</th>
            </tr>
          </thead>
          <tbody>
            {visibleSections.length === 0 && (
              <tr>
                <td colSpan={colCount} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  Aucun poste ne correspond à la recherche.
                </td>
              </tr>
            )}
            {visibleSections.map((s) => (
              <Section key={s.name} name={s.name} rows={s.rows} months={data.months} colCount={colCount} />
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
        Chaque colonne reprend la balance analytique de son mois ; le cumul est la
        somme des mois affichés, et son « % / CA » est rapporté au CA cumulé des
        mêmes mois.
        {data.missing.length > 0 &&
          ` Mois sans balance analytique : ${data.missing.map(monthLabel).join(", ")}.`}
      </p>
    </div>
  );
}

function Section({
  name,
  rows,
  months,
  colCount,
}: {
  name: string;
  rows: FxMensuelRow[];
  months: string[];
  colCount: number;
}) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={colCount}>{name}</td>
      </tr>
      {rows.map((r) => {
        const isRatio = r.category.kind === "ratio";
        const cell = (v: number | null) => (isRatio ? pctBadge(v) : money(v));
        const cumul = r.cells[TOTAL_COLUMN] ?? null;
        return (
          <tr key={r.category.code} className={rowClass(r.category.kind)}>
            <td
              className="label-cell"
              title={
                r.accounts.length
                  ? `Comptes : ${r.accounts.join(", ")}`
                  : r.category.notes ?? undefined
              }
            >
              {r.category.label}
            </td>
            {months.map((m) => {
              const v = r.cells[m] ?? null;
              return (
                <td key={m} className={negClass(v)}>
                  {cell(v)}
                </td>
              );
            })}
            <td className={`total-col ${negClass(cumul)}`} style={{ fontWeight: 500 }}>
              {cell(cumul)}
            </td>
            <td className="pct-col">{pctBadge(r.pctCumul)}</td>
          </tr>
        );
      })}
    </>
  );
}
