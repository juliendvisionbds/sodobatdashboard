"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type { Category } from "@/lib/mapping";
import type { ChantierRow, ChantiersData } from "@/lib/finance";
import { CHANTIER_CODES } from "@/lib/nomenclature/codes";
import { fmtEur, fmtPct } from "@/lib/format";
import { saveManualEntryAction } from "@/app/actions";

// Les postes de la maquette en lignes, un chantier par colonne, regroupés par
// pôle — la disposition demandée par la DAF (23 septembre 2026). La ligne
// « Prévision (TEC) » et la note se saisissent sur le dernier mois importé ;
// figer ou rouvrir est réservé à la DAF (canFreeze). Les autres lignes sont
// calculées.

function amountClass(v: number | null, posGreen = false) {
  if (v == null || v === 0) return "muted";
  return v < 0 ? "neg" : posGreen ? "pos" : "";
}

function amountText(v: number | null, posGreen = false) {
  if (v == null || v === 0) return "-";
  return `${v > 0 && posGreen ? "+" : ""}${fmtEur(v)}`;
}

const isRatio = (line: Category) => line.kind === "ratio";
const isDiv = (line: Category) =>
  !!line.formula && "op" in line.formula && line.formula.op === "div";
const isProduit = (line: Category) => line.section.startsWith("PRODUITS");

function cellClass(line: Category, v: number | null) {
  if (isRatio(line) || isDiv(line)) return v == null ? "muted" : "";
  return amountClass(v, isProduit(line));
}

function cellText(line: Category, v: number | null) {
  if (isRatio(line)) return v == null ? "-" : fmtPct(v);
  if (isDiv(line)) return v == null ? "-" : v.toFixed(2).replace(".", ",");
  return amountText(v, isProduit(line));
}

/** Totaux, sous-totaux, ratios et résultats : lignes mises en avant. */
const rowClass = (line: Category) => {
  if (line.kind === "total" || line.kind === "computed") return "total-row";
  if (line.kind === "subtotal" || line.kind === "ratio") return "subtotal-row";
  return "";
};

/** Lignes de la maquette rendues avec une saisie, pas une valeur calculée. */
const MANUAL_LINES = new Set<string>([CHANTIER_CODES.note, CHANTIER_CODES.statut]);

export default function ChantiersTable({
  lines,
  rows,
  totals,
  poles,
  period,
  canEdit,
  canFreeze,
}: {
  lines: Category[];
  rows: ChantierRow[];
  totals: ChantiersData["totals"];
  poles: string[];
  period: string;
  /** peut saisir prévision et note (entité, DAF, admin) */
  canEdit: boolean;
  /** peut figer et rouvrir (DAF, admin) */
  canFreeze: boolean;
}) {
  const [pole, setPole] = useState("");
  const [search, setSearch] = useState("");
  const [hideInactive, setHideInactive] = useState(true);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (pole && r.pole !== pole) return false;
        if (
          search &&
          !`${r.centreCode} ${r.centreLabel}`.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        // Un chantier non mouvementé est masqué, jamais supprimé : il réapparaît
        // dès qu'une écriture lui est imputée.
        if (hideInactive && !r.mouvemente && !r.previsionManuelle) return false;
        return true;
      }),
    [rows, pole, search, hideInactive]
  );

  // Colonnes groupées par pôle, dans l'ordre des pôles.
  const byPole = useMemo(() => {
    const map = new Map<string, ChantierRow[]>();
    for (const r of filtered) {
      const key = r.pole ?? "—";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);
  const columns = useMemo(() => byPole.flatMap(([, list]) => list), [byPole]);

  // Lignes groupées par section de la maquette, dans l'ordre.
  const sections = useMemo(() => {
    const out: { name: string; lines: Category[] }[] = [];
    for (const l of lines) {
      const last = out[out.length - 1];
      if (last && last.name === l.section) last.lines.push(l);
      else out.push({ name: l.section, lines: [l] });
    }
    return out;
  }, [lines]);

  // Intitulé + chantiers + total
  const colCount = columns.length + 2;
  const hidden = rows.length - filtered.length;

  return (
    <div style={{ marginTop: 24 }}>
      <div className="table-controls">
        <select className="tctl-select" value={pole} onChange={(e) => setPole(e.target.value)}>
          <option value="">Tous les pôles</option>
          {poles.map((p) => (
            <option key={p} value={p}>
              Pôle {p}
            </option>
          ))}
        </select>
        <input
          className="tctl-input"
          placeholder="Rechercher un chantier (numéro, nom)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={hideInactive}
            onChange={(e) => setHideInactive(e.target.checked)}
          />
          Masquer les chantiers sans activité
        </label>
        <span className="tctl-stats">
          {filtered.length} chantier{filtered.length > 1 ? "s" : ""} affiché
          {filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="table-wrap">
        <table className="ct chantiers-ct">
          <thead>
            <tr>
              <th className="left" rowSpan={2}>
                Intitulé
              </th>
              {byPole.map(([p, list]) => (
                <th key={`pole-${p}`} className="pole-head" colSpan={list.length}>
                  {p === "—" ? "Sans pôle" : `Pôle ${p}`}
                </th>
              ))}
              <th className="tot-col" rowSpan={2} title="Tous les chantiers du mois, filtres compris">
                Total
              </th>
            </tr>
            <tr>
              {columns.map((r) => (
                <th key={r.centreCode} className="col-head" title={`${r.centreCode} · ${r.centreLabel}`}>
                  <span className="col-code">{r.centreCode}</span>
                  <span className="col-name">{r.centreLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.length === 0 && (
              <tr>
                <td colSpan={colCount} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  Aucun chantier ne correspond au filtre.
                </td>
              </tr>
            )}
            {columns.length > 0 &&
              sections.map((s) => (
                <Fragment key={s.name}>
                  <tr className="section-row">
                    <td className="label-cell">{s.name}</td>
                    <td colSpan={colCount - 1} />
                  </tr>
                  {s.lines.map((line) => (
                    <LineTr
                      key={line.code}
                      line={line}
                      columns={columns}
                      total={totals[line.code] ?? null}
                      period={period}
                      canEdit={canEdit}
                      canFreeze={canFreeze}
                    />
                  ))}
                </Fragment>
              ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
        Montants du mois = mouvements de la balance analytique du mois, lue telle quelle. Les
        cumuls de fin de tableau additionnent en revanche tous les mois importés, sur toute la
        durée de vie du chantier. La colonne Total porte sur tous les chantiers du mois, filtres
        compris. Les centres de structure (FX) sont exclus : voir Frais généraux.
        {hidden > 0 && ` ${hidden} chantier(s) sans activité masqué(s) — les données sont conservées.`}
      </p>
    </div>
  );
}

function LineTr({
  line,
  columns,
  total,
  period,
  canEdit,
  canFreeze,
}: {
  line: Category;
  columns: ChantierRow[];
  total: number | null;
  period: string;
  canEdit: boolean;
  canFreeze: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const send = (centreCode: string, fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("centreCode", centreCode);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    startTransition(() => {
      void saveManualEntryAction(fd);
    });
  };

  const isProvision = line.code === CHANTIER_CODES.provision;
  const isNote = line.code === CHANTIER_CODES.note;
  const isStatut = line.code === CHANTIER_CODES.statut;
  const manual = isProvision || MANUAL_LINES.has(line.code);

  return (
    <tr className={rowClass(line)} style={isPending ? { opacity: 0.5 } : undefined}>
      <td className="label-cell" title={line.notes ?? undefined}>
        {line.label}
        {isProvision && canEdit && " 🟡"}
      </td>
      {columns.map((row) => {
        if (isProvision)
          return <ProvisionTd key={row.centreCode} row={row} canEdit={canEdit} canFreeze={canFreeze} send={send} />;
        if (isNote) return <NoteTd key={row.centreCode} row={row} canEdit={canEdit} send={send} />;
        if (isStatut) return <StatutTd key={row.centreCode} row={row} canFreeze={canFreeze} send={send} />;
        const v = row.values[line.code] ?? null;
        return (
          <td key={row.centreCode} className={cellClass(line, v)}>
            {cellText(line, v)}
          </td>
        );
      })}
      <td className={`tot-col ${manual ? "muted" : cellClass(line, total)}`}>
        {manual ? "" : cellText(line, total)}
      </td>
    </tr>
  );
}

type Send = (centreCode: string, fields: Record<string, string>) => void;

function ProvisionTd({
  row,
  canEdit,
  canFreeze,
  send,
}: {
  row: ChantierRow;
  canEdit: boolean;
  canFreeze: boolean;
  send: Send;
}) {
  const manual = row.previsionManuelle;
  const value = manual?.value ?? row.values[CHANTIER_CODES.provision] ?? 0;
  const isFinal = manual?.status === "final";
  const save = (valueNum: string, status: "draft" | "final") =>
    send(row.centreCode, { field: "tec_provision", valueNum, status });
  // Qui a saisi, et quand : la DAF relit avant de figer.
  const trace = manual?.by ? `Saisi par ${manual.by}${manual.at ? ` le ${manual.at}` : ""}` : null;

  if (!(canEdit && !isFinal)) {
    return (
      <td
        className={amountClass(value)}
        title={[isFinal ? "Valeur figée" : null, trace].filter(Boolean).join(" · ") || undefined}
      >
        {amountText(value)}
        {isFinal && " 🔒"}
        {isFinal && canFreeze && (
          <button
            className="tag cell-unfreeze"
            title="Rouvrir cette valeur (retour en brouillon)"
            onClick={() => save(String(manual!.value), "draft")}
          >
            rouvrir
          </button>
        )}
      </td>
    );
  }
  return (
    <td>
      <span className="cell-edit">
        <input
          className={`inline-num${manual ? " draft" : ""}`}
          defaultValue={value || ""}
          placeholder="0"
          title={
            manual
              ? `Saisie manuelle (brouillon)${trace ? ` · ${trace}` : ""}`
              : "Prévision issue de la balance, modifiable"
          }
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== "" && parseFloat(v.replace(",", ".")) !== value) save(v, "draft");
          }}
        />
        {manual && canFreeze && (
          <button
            className="tag amber"
            style={{ border: "none", cursor: "pointer" }}
            title="Figer cette valeur jusqu'au mois suivant"
            onClick={() => save(String(manual.value), "final")}
          >
            figer
          </button>
        )}
        {manual && !canFreeze && trace && <span className="cell-trace">{trace}</span>}
      </span>
    </td>
  );
}

function NoteTd({ row, canEdit, send }: { row: ChantierRow; canEdit: boolean; send: Send }) {
  if (!canEdit) {
    return (
      <td className="left" title={row.note ?? undefined}>
        <span className="cell-note">{row.note}</span>
      </td>
    );
  }
  return (
    <td className="left">
      <input
        className="inline-num cell-note-input"
        defaultValue={row.note ?? ""}
        placeholder="note…"
        onBlur={(e) => {
          if (e.target.value !== (row.note ?? ""))
            send(row.centreCode, { field: "note", valueText: e.target.value, status: "draft" });
        }}
      />
    </td>
  );
}

function StatutTd({ row, canFreeze, send }: { row: ChantierRow; canFreeze: boolean; send: Send }) {
  const final = row.statut === "final";
  if (!canFreeze) {
    return (
      <td>
        <span className="tag">{final ? "figé" : "brouillon"}</span>
      </td>
    );
  }
  return (
    <td>
      <button
        className={`tag ${final ? "" : "amber"}`}
        style={{ border: "none", cursor: "pointer" }}
        title={
          final
            ? "Enregistrement figé — cliquer pour repasser en brouillon"
            : "Brouillon — cliquer pour figer"
        }
        onClick={() =>
          send(row.centreCode, {
            field: "statut",
            valueText: final ? "draft" : "final",
            status: final ? "draft" : "final",
          })
        }
      >
        {final ? "figé 🔒" : "brouillon"}
      </button>
    </td>
  );
}
