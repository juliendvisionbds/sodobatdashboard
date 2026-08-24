"use client";

import { useMemo, useState } from "react";
import { FxData } from "@/lib/finance";
import { fmtEur, fmtPct } from "@/lib/format";

export default function FxTable({ data }: { data: FxData }) {
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const filtering = section !== "" || search.trim() !== "";
  const ratioFx = data.caReference ? (data.totalYtd / data.caReference) * 100 : null;

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.sections
      .filter((s) => s.rows.length > 0)
      .filter((s) => !section || s.name === section)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          if (!q) return true;
          const accounts = r.accounts.map((a) => `${a.account} ${a.label}`).join(" ");
          return `${r.category.label} ${accounts}`.toLowerCase().includes(q);
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [data.sections, section, search]);

  return (
    <>
      <div className="table-controls">
        <select
          className="tctl-select"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="">Toutes les sections</option>
          {data.sections
            .filter((s) => s.rows.length > 0)
            .map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
        </select>
        <input
          className="tctl-input"
          placeholder="Rechercher (libellé, n° de compte)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filtering && (
          <span style={{ fontSize: 11, color: "var(--gray3)", alignSelf: "center" }}>
            Filtre actif : les sous-totaux affichés restent ceux de la section complète.
          </span>
        )}
      </div>
      <div className="table-wrap">
        <table className="ct">
          <thead>
            <tr>
              <th className="left">Comptes</th>
              <th className="left">Libellé</th>
              <th>Mois</th>
              <th>N YTD (€)</th>
              <th>% / CA</th>
              <th>N-1</th>
              <th>N-2</th>
            </tr>
          </thead>
          <tbody>
            {visibleSections.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  Aucune ligne ne correspond au filtre.
                </td>
              </tr>
            )}
            {visibleSections.map((s) => (
              <FxSection key={s.name} section={s} caRef={data.caReference} />
            ))}
            {!filtering && (
              <tr className="total-row">
                <td className="left">-</td>
                <td className="label-cell">TOTAL GÉNÉRAL (toutes sections)</td>
                <td>{fmtEur(data.totalMois)}</td>
                <td>{fmtEur(data.totalYtd)}</td>
                <td>{fmtPct(ratioFx)}</td>
                <td className="muted">-</td>
                <td className="muted">-</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FxSection({
  section,
  caRef,
}: {
  section: FxData["sections"][number];
  caRef: number | null;
}) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={7}>{section.name}</td>
      </tr>
      {section.rows.map((r) => (
        <tr key={r.category.code}>
          <td className="code-cell" title={r.accounts.map((a) => `${a.account} ${a.label}`).join("\n")}>
            {r.accounts.slice(0, 3).map((a) => a.account).join(", ")}
            {r.accounts.length > 3 ? "…" : ""}
          </td>
          <td className="label-cell" title={r.category.notes ?? undefined}>
            {r.category.label}
          </td>
          <td className={r.mois < 0 ? "neg" : ""}>{r.mois === 0 ? "-" : fmtEur(r.mois)}</td>
          <td className={r.ytd < 0 ? "neg" : ""} style={{ fontWeight: 500 }}>
            {fmtEur(r.ytd)}
          </td>
          <td className="muted">{fmtPct(r.pctCa)}</td>
          <td className="muted">-</td>
          <td className="muted">-</td>
        </tr>
      ))}
      <tr className="subtotal-row">
        <td className="code-cell">-</td>
        <td className="label-cell">TOTAL {section.name}</td>
        <td>{fmtEur(section.subtotal.mois)}</td>
        <td>{fmtEur(section.subtotal.ytd)}</td>
        <td>{fmtPct(caRef ? (section.subtotal.ytd / caRef) * 100 : null)}</td>
        <td className="muted">-</td>
        <td className="muted">-</td>
      </tr>
    </>
  );
}
