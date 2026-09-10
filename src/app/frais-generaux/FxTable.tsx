"use client";

import { useMemo, useState } from "react";
import type { FxData, FxRow } from "@/lib/finance";
import { fmtEur, fmtPct } from "@/lib/format";

// Colonnes imposées par la maquette, dans cet ordre exact :
// Intitulé · N-2 (€) · % / CA · N-1 (€) · % / CA · N YTD (€) · % / CA · Nb mois ·
// Écart N–N-1 (€) · Écart (%). Chaque « % / CA » est rapporté au CA de son propre
// exercice, jamais recopié d'une colonne à l'autre.

const COL_COUNT = 10;

function pctBadge(pct: number | null) {
  return pct == null ? (
    <span className="muted">-</span>
  ) : (
    <span className={`pct-badge${pct < 0 ? " neg" : ""}`}>{fmtPct(pct)}</span>
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

export default function FxTable({ data }: { data: FxData }) {
  const [search, setSearch] = useState("");

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.sections;
    return data.sections
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) =>
          `${r.category.label} ${r.accounts.map((a) => a.account).join(" ")}`
            .toLowerCase()
            .includes(q)
        ),
      }))
      .filter((s) => s.rows.length > 0);
  }, [data.sections, search]);

  const sourceNote = (col: "n1" | "n2") => {
    const s = data.sources[col];
    if (s === "absent") return `${col === "n1" ? "N-1" : "N-2"} : exercice non importé`;
    if (s === "ventilee")
      return `${col === "n1" ? "N-1" : "N-2"} : reconstitué depuis la balance ventilée (sans axe analytique)`;
    return null;
  };
  const notes = [sourceNote("n2"), sourceNote("n1")].filter(Boolean);

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
        <table className="ct">
          <thead>
            <tr>
              <th className="left">Intitulé</th>
              <th>N-2 (€)</th>
              <th className="pct-col">% / CA</th>
              <th>N-1 (€)</th>
              <th className="pct-col">% / CA</th>
              <th>N YTD (€)</th>
              <th className="pct-col">% / CA</th>
              <th>Nb mois</th>
              <th>Écart N–N-1 (€)</th>
              <th className="pct-col">Écart (%)</th>
            </tr>
          </thead>
          <tbody>
            {visibleSections.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  Aucun poste ne correspond à la recherche.
                </td>
              </tr>
            )}
            {visibleSections.map((s) => (
              <Section key={s.name} name={s.name} rows={s.rows} nbMois={data.nbMois} />
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
        Chaque « % / CA » est calculé contre le CA total de son propre exercice.
        {notes.length > 0 && ` ${notes.join(" · ")}.`}
      </p>
    </div>
  );
}

function Section({ name, rows, nbMois }: { name: string; rows: FxRow[]; nbMois: number }) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={COL_COUNT}>{name}</td>
      </tr>
      {rows.map((r) => {
        const isRatio = r.category.kind === "ratio";
        const cell = (v: number | null) => (isRatio ? pctBadge(v) : money(v));
        const accountList = r.accounts.map((a) => a.account);
        return (
          <tr key={r.category.code} className={rowClass(r.category.kind)}>
            <td
              className="label-cell"
              title={
                accountList.length
                  ? `Comptes : ${accountList.join(", ")}`
                  : r.category.notes ?? undefined
              }
            >
              {r.category.label}
            </td>
            <td className={negClass(r.cells.n2)}>{cell(r.cells.n2)}</td>
            <td className="pct-col">{pctBadge(r.pct.n2)}</td>
            <td className={negClass(r.cells.n1)}>{cell(r.cells.n1)}</td>
            <td className="pct-col">{pctBadge(r.pct.n1)}</td>
            <td className={negClass(r.cells.n)} style={{ fontWeight: 500 }}>
              {cell(r.cells.n)}
            </td>
            <td className="pct-col">{pctBadge(r.pct.n)}</td>
            <td className="muted">{nbMois}</td>
            <td className={negClass(r.ecart)}>{money(r.ecart)}</td>
            <td className="pct-col">{pctBadge(r.ecartPct)}</td>
          </tr>
        );
      })}
    </>
  );
}
