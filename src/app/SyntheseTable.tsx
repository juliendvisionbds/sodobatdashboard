"use client";

import { useMemo, useState } from "react";
import { SyntheseData } from "@/lib/finance";
import { fmtEur, fmtPct, monthLabel } from "@/lib/format";

export default function SyntheseTable({ data }: { data: SyntheseData }) {
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const months = data.monthsWithData;
  const filtering = section !== "" || search.trim() !== "";

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.sections
      .filter((s) => !section || s.name === section)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          if (r.total === 0 && (r.prevTotal ?? 0) === 0) return false;
          if (!q) return true;
          return `${r.category.label} ${r.category.section}`.toLowerCase().includes(q);
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [data.sections, section, search]);

  const fmtCell = (v: number) => (v === 0 ? <span className="muted">—</span> : fmtEur(v));

  const totalLine = (
    label: string,
    rec: { monthly: Record<string, number>; total: number }
  ) => (
    <tr className="total-row" key={label}>
      <td className="code-cell">—</td>
      <td className="label-cell">{label}</td>
      {months.map((m) => {
        const v = rec.monthly[m] ?? 0;
        return (
          <td key={m} className={v > 0 ? "" : v !== 0 ? "neg" : "muted"}>
            {fmtCell(v)}
          </td>
        );
      })}
      <td>{fmtEur(rec.total)}</td>
      <td>{fmtPct(data.caTotal.total ? (rec.total / data.caTotal.total) * 100 : null)}</td>
      <td className="muted">—</td>
    </tr>
  );

  return (
    <div style={{ marginTop: 32 }}>
      <div className="card-label" style={{ border: "none", padding: 0, marginBottom: 12 }}>
        Tableau de synthèse — détail par catégorie
      </div>
      <div className="table-controls">
        <select
          className="tctl-select"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="">Toutes les sections</option>
          {data.sections.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className="tctl-input"
          placeholder="Rechercher une ligne (libellé, section)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filtering && (
          <span style={{ fontSize: 11, color: "var(--gray3)", alignSelf: "center" }}>
            Filtre actif — les sous-totaux affichés restent ceux de la section complète.
          </span>
        )}
      </div>
      <div className="table-wrap">
        <table className="ct">
          <thead>
            <tr>
              <th className="left">Section</th>
              <th className="left">Libellé</th>
              {months.map((m) => (
                <th key={m}>{monthLabel(m)}</th>
              ))}
              <th>Total exercice</th>
              <th>% / CA</th>
              <th>N-1</th>
            </tr>
          </thead>
          <tbody>
            {visibleSections.length === 0 && (
              <tr>
                <td colSpan={months.length + 5} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  Aucune ligne ne correspond au filtre.
                </td>
              </tr>
            )}
            {visibleSections.map((s) => (
              <SectionRows key={s.name} section={s} data={data} />
            ))}
            {!filtering && totalLine("RÉSULTAT D'EXPLOITATION", data.resultatExploitation)}
            {!filtering && totalLine("RÉSULTAT NET", data.resultatNet)}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
        Chiffres recalculés à la volée depuis les lignes de balance importées (aucun
        agrégat stocké). Résultat net = CA − charges d&apos;exploitation − personnel −
        frais généraux &amp; autres charges.
      </p>
    </div>
  );
}

function SectionRows({
  section,
  data,
}: {
  section: SyntheseData["sections"][number];
  data: SyntheseData;
}) {
  const months = data.monthsWithData;
  const isProduits = section.name === "PRODUITS / CA";

  return (
    <>
      <tr className="section-row">
        <td colSpan={months.length + 5}>{section.name}</td>
      </tr>
      {section.rows.map((r) => (
        <tr key={r.category.code}>
          <td className="code-cell">{r.category.section}</td>
          <td className="label-cell" title={r.category.notes ?? undefined}>
            {r.category.label}
          </td>
          {months.map((m) => {
            const v = r.monthly[m] ?? 0;
            return (
              <td key={m} className={v === 0 ? "muted" : v < 0 ? "neg" : ""}>
                {v === 0 ? "—" : fmtEur(v)}
              </td>
            );
          })}
          <td style={{ fontWeight: 500 }}>{fmtEur(r.total)}</td>
          <td className="muted">{fmtPct(r.pctCa)}</td>
          <td className="muted">{r.prevTotal != null ? fmtEur(r.prevTotal) : "—"}</td>
        </tr>
      ))}
      <tr className="subtotal-row">
        <td className="code-cell">—</td>
        <td className="label-cell">
          {isProduits ? "CA TOTAL" : `TOTAL ${section.name}`}
        </td>
        {months.map((m) => (
          <td key={m}>{fmtEur(section.subtotal.monthly[m] ?? 0)}</td>
        ))}
        <td>{fmtEur(section.subtotal.total)}</td>
        <td>
          {fmtPct(
            data.caTotal.total ? (section.subtotal.total / data.caTotal.total) * 100 : null
          )}
        </td>
        <td className="muted">—</td>
      </tr>
    </>
  );
}
