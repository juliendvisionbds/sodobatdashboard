"use client";

import { useMemo, useState } from "react";
import type { SyntheseData, SyntheseRow } from "@/lib/finance";
import { TOTAL_COLUMN } from "@/lib/nomenclature/columns";
import { fmtEur, fmtPct, monthLabel } from "@/lib/format";

// Structure de référence : Intitulé · les 12 mois de l'exercice · Total exercice ·
// % / CA · N-1 Total · % N-1 · Écart N–N-1, soit 18 colonnes. Les mois sans données
// sont masqués par défaut (« Masquer les colonnes vides ») ; décocher l'option
// restitue les 12 mois pour retrouver la structure complète de la maquette.

function pctBadge(pct: number | null) {
  return pct == null ? (
    <span className="muted">-</span>
  ) : (
    <span className={`pct-badge${pct < 0 ? " neg" : ""}`}>{fmtPct(pct)}</span>
  );
}

function money(v: number | null) {
  if (v == null) return <span className="muted">-</span>;
  if (v === 0) return <span className="muted">-</span>;
  return fmtEur(v);
}

const negClass = (v: number | null) => (v != null && v < 0 ? "neg" : "");

/** Une ligne de total, sous-total ou résultat est mise en avant. */
const rowClass = (kind: string) => {
  if (kind === "total" || kind === "computed") return "total-row";
  if (kind === "subtotal") return "subtotal-row";
  return "";
};

export default function SyntheseTable({ data }: { data: SyntheseData }) {
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);
  // Masquer les mois vides est l'affichage par défaut : en cours d'exercice, la
  // moitié des colonnes est encore à zéro.
  const [hideEmptyCols, setHideEmptyCols] = useState(true);
  const months = data.months;
  const filtering = section !== "" || search.trim() !== "";

  // Un mois est vide si aucune ligne n'y porte de valeur. Calculé sur l'ensemble
  // des sections, jamais sur les lignes filtrées : les colonnes ne doivent pas
  // bouger pendant qu'on tape une recherche.
  const monthsShown = useMemo(() => {
    if (!hideEmptyCols) return months;
    const kept = months.filter((m) =>
      data.sections.some((s) =>
        s.rows.some((r) => {
          const v = r.cells[m];
          return v != null && v !== 0;
        }),
      ),
    );
    return kept.length > 0 ? kept : months;
  }, [months, data.sections, hideEmptyCols]);

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.sections
      .filter((s) => !section || s.name === section)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          // Les lignes calculées structurent le tableau : jamais masquées.
          const isStructural = r.category.kind !== "poste";
          if (hideEmpty && !isStructural && !r.total && !r.prevTotal) return false;
          if (!q) return true;
          return `${r.category.label} ${r.category.section}`.toLowerCase().includes(q);
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [data.sections, section, search, hideEmpty]);

  const colCount = monthsShown.length + 6;

  return (
    <div style={{ marginTop: 32 }}>
      <div className="card-label" style={{ border: "none", padding: 0, marginBottom: 12 }}>
        Tableau de synthèse · exercice {data.fiscalYearStart}/{data.fiscalYearStart + 1}
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
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
          />
          Masquer les lignes vides
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={hideEmptyCols}
            onChange={(e) => setHideEmptyCols(e.target.checked)}
          />
          Masquer les colonnes vides
        </label>
      </div>
      <div className="table-wrap">
        <table className="ct synthese-ct">
          <thead>
            <tr>
              <th className="left">Intitulé</th>
              {monthsShown.map((m) => (
                <th key={m} className={data.monthsWithData.includes(m) ? "" : "muted"}>
                  {monthLabel(m)}
                </th>
              ))}
              <th>Total exercice</th>
              <th className="pct-col">% / CA</th>
              <th>N-1 Total</th>
              <th className="pct-col">% N-1</th>
              <th>Écart N–N-1</th>
            </tr>
          </thead>
          <tbody>
            {visibleSections.length === 0 && (
              <tr>
                <td colSpan={colCount} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  Aucune ligne ne correspond au filtre.
                </td>
              </tr>
            )}
            {visibleSections.map((s) => (
              <SectionRows key={s.name} name={s.name} rows={s.rows} months={monthsShown} colCount={colCount} />
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
        Chiffres recalculés à la volée depuis les lignes de balance importées (aucun
        agrégat stocké). Le total N-1 est arrêté au même rang de mois que l&apos;exercice
        en cours, pour une comparaison à périmètre égal.
        {filtering && " Filtre actif : les totaux restent ceux de la section complète."}
      </p>
    </div>
  );
}

function SectionRows({
  name,
  rows,
  months,
  colCount,
}: {
  name: string;
  rows: SyntheseRow[];
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
        return (
          <tr key={r.category.code} className={rowClass(r.category.kind)}>
            <td className="label-cell" title={r.category.notes ?? undefined}>
              {r.category.label}
            </td>
            {months.map((m) => {
              const v = r.cells[m] ?? null;
              return (
                <td key={m} className={v ? negClass(v) : "muted"}>
                  {cell(v)}
                </td>
              );
            })}
            <td className={negClass(r.total)} style={{ fontWeight: 500 }}>
              {cell(r.cells[TOTAL_COLUMN] ?? r.total)}
            </td>
            <td className="pct-col">{pctBadge(r.pctCa)}</td>
            <td className={r.prevTotal != null ? negClass(r.prevTotal) : "muted"}>
              {cell(r.prevTotal)}
            </td>
            <td className="pct-col">{pctBadge(r.pctPrev)}</td>
            <td className={r.ecart != null ? negClass(r.ecart) : "muted"}>
              {cell(r.ecart)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
