"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import type { Category } from "@/lib/mapping";
import type { ChantierRow, ChantiersData } from "@/lib/finance";
import { CHANTIER_CODES } from "@/lib/nomenclature/codes";
import { fmtEur, fmtPct } from "@/lib/format";
import { saveManualEntryAction } from "@/app/actions";

// Un chantier par ligne, les postes de la maquette en colonnes (disposition du
// tableau de gestion Excel). La colonne « Provision (TEC) » et la note restent
// saisissables sur le dernier mois importé ; les autres colonnes sont calculées.

// Classe et texte appliqués directement sur le <td> (et non sur un <span>
// interne) : les règles CSS td.neg / td.pos ciblent le <td> lui-même, sinon les
// négatifs ne ressortent jamais en rouge.
function amountClass(v: number | null, posGreen = false) {
  if (v == null || v === 0) return "muted";
  return v < 0 ? "neg" : posGreen ? "pos" : "";
}

function amountText(v: number | null, posGreen = false) {
  if (v == null || v === 0) return "-";
  return `${v > 0 && posGreen ? "+" : ""}${fmtEur(v)}`;
}

function cellText(line: Category, v: number | null) {
  if (line.kind === "ratio") return v == null ? "-" : fmtPct(v);
  if (line.formula && "op" in line.formula && line.formula.op === "div")
    return v == null ? "-" : v.toFixed(2);
  return amountText(v, line.section.startsWith("PRODUITS"));
}

/** Les lignes de saisie de la maquette ont leur propre colonne dédiée. */
const MANUAL_COLUMNS: string[] = [CHANTIER_CODES.note, CHANTIER_CODES.statut];

/** Totaux, sous-totaux, ratios et résultats : colonnes mises en avant (fond
 *  --total-col). Déduit du `kind` de la nomenclature, pas d'une liste de codes :
 *  une nouvelle ligne de total sera teintée sans retoucher ce fichier. */
const TOTAL_KINDS = new Set(["total", "subtotal", "ratio", "computed"]);
const isTotalCol = (l: Category) => TOTAL_KINDS.has(l.kind) && !l.hidden;
const totCls = (l: Category) => (isTotalCol(l) ? " tot-col" : "");

export default function ChantiersTable({
  lines,
  rows,
  totals,
  poles,
  period,
  canEdit,
}: {
  lines: Category[];
  rows: ChantierRow[];
  totals: ChantiersData["totals"];
  poles: string[];
  period: string;
  canEdit: boolean;
}) {
  const [pole, setPole] = useState("");
  const [search, setSearch] = useState("");
  const [hideInactive, setHideInactive] = useState(true);

  // Colonnes calculées : tout sauf la provision (éditable) et les lignes de
  // gestion, rendues séparément en fin de tableau.
  const valueLines = useMemo(
    () =>
      lines.filter(
        (l) => l.code !== CHANTIER_CODES.provision && !MANUAL_COLUMNS.includes(l.code)
      ),
    [lines]
  );
  const provisionLine = lines.find((l) => l.code === CHANTIER_CODES.provision);

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

  const byPole = useMemo(() => {
    const map = new Map<string, ChantierRow[]>();
    for (const r of filtered) {
      const key = r.pole ?? "—";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Réf. + Chantier + provision + colonnes calculées + note + statut
  const colCount = 2 + (provisionLine ? 1 : 0) + valueLines.length + 2;
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
      </div>

      <div className="table-wrap">
        <table className="ct chantiers-ct">
          <thead>
            <tr>
              <th className="left">Réf.</th>
              <th className="left">Chantier</th>
              {provisionLine && (
                <th title={provisionLine.notes ?? undefined}>
                  Provision (TEC){canEdit ? " 🟡" : ""}
                </th>
              )}
              {valueLines.map((l) => (
                <th key={l.code} title={l.notes ?? undefined} className={totCls(l).trim() || undefined}>
                  {l.label}
                </th>
              ))}
              <th className="left">Note</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colCount} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  Aucun chantier ne correspond au filtre.
                </td>
              </tr>
            )}
            {byPole.map(([p, list]) => (
              <Fragment key={`pole-${p}`}>
                <tr className="section-row">
                  <td colSpan={colCount}>{p === "—" ? "Sans pôle" : `Pôle ${p}`}</td>
                </tr>
                {list.map((r) => (
                  <ChantierTr
                    key={r.centreCode}
                    row={r}
                    valueLines={valueLines}
                    hasProvision={!!provisionLine}
                    period={period}
                    canEdit={canEdit}
                  />
                ))}
              </Fragment>
            ))}
            <tr className="total-row">
              <td className="left" colSpan={2}>
                Total général · {filtered.length} chantier{filtered.length > 1 ? "s" : ""} affiché
                {filtered.length > 1 ? "s" : ""}
              </td>
              {provisionLine && (
                <td className={amountClass(totals[provisionLine.code])}>
                  {amountText(totals[provisionLine.code])}
                </td>
              )}
              {valueLines.map((l) => (
                <td key={l.code} className={amountClass(totals[l.code]) + totCls(l)}>
                  {cellText(l, totals[l.code] ?? null)}
                </td>
              ))}
              <td colSpan={2} className="muted" />
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
        Montants du mois = écart entre les deux derniers snapshots analytiques de
        l&apos;exercice. Les cumuls de fin de tableau couvrent en revanche toute la durée de
        vie du chantier. Les centres de structure (FX, dépôt) sont exclus : voir Frais
        généraux.
        {hidden > 0 && ` ${hidden} chantier(s) sans activité masqué(s) — les données sont conservées.`}
        {" Le total général porte sur les chantiers affichés."}
      </p>
    </div>
  );
}

function ChantierTr({
  row,
  valueLines,
  hasProvision,
  period,
  canEdit,
}: {
  row: ChantierRow;
  valueLines: Category[];
  hasProvision: boolean;
  period: string;
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const manual = row.previsionManuelle;
  const previsionValue = manual?.value ?? row.values[CHANTIER_CODES.provision] ?? 0;
  const isFinal = manual?.status === "final";

  const send = (fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("centreCode", row.centreCode);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    startTransition(() => {
      void saveManualEntryAction(fd);
    });
  };

  const saveProvision = (valueNum: string, status: "draft" | "final") =>
    send({ field: "tec_provision", valueNum, status });
  const saveNote = (text: string) =>
    send({ field: "note", valueText: text, status: "draft" });
  const saveStatut = (status: "draft" | "final") =>
    send({ field: "statut", valueText: status, status });

  return (
    <tr style={isPending ? { opacity: 0.5 } : undefined}>
      <td className="code-cell">{row.centreCode}</td>
      <td className="label-cell">{row.centreLabel}</td>
      {hasProvision && (
        <td className={canEdit && !isFinal ? undefined : amountClass(previsionValue)}>
          {canEdit && !isFinal ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input
                className={`inline-num${manual ? " draft" : ""}`}
                defaultValue={previsionValue || ""}
                placeholder="0"
                title={
                  manual
                    ? "Saisie manuelle (brouillon)"
                    : "Provision issue de la balance, modifiable"
                }
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== "" && parseFloat(v.replace(",", ".")) !== previsionValue) {
                    saveProvision(v, "draft");
                  }
                }}
              />
              {manual && (
                <button
                  className="tag amber"
                  style={{ border: "none", cursor: "pointer" }}
                  title="Figer cette valeur jusqu'au mois suivant"
                  onClick={() => saveProvision(String(manual.value), "final")}
                >
                  figer
                </button>
              )}
            </span>
          ) : (
            <span title={isFinal ? "Valeur figée" : undefined}>
              {amountText(previsionValue)}
              {isFinal && " 🔒"}
            </span>
          )}
        </td>
      )}
      {valueLines.map((l) => {
        const v = row.values[l.code] ?? null;
        return (
          <td key={l.code} className={amountClass(v, l.section.startsWith("PRODUITS")) + totCls(l)}>
            {cellText(l, v)}
          </td>
        );
      })}
      <td className="left" style={{ maxWidth: 160 }}>
        {canEdit ? (
          <input
            className="inline-num"
            style={{ width: 150, textAlign: "left" }}
            defaultValue={row.note ?? ""}
            placeholder="note…"
            onBlur={(e) => {
              if (e.target.value !== (row.note ?? "")) saveNote(e.target.value);
            }}
          />
        ) : (
          <span style={{ fontSize: 11, color: "var(--gray2)" }}>{row.note}</span>
        )}
      </td>
      <td>
        {canEdit ? (
          <button
            className={`tag ${row.statut === "final" ? "" : "amber"}`}
            style={{ border: "none", cursor: "pointer" }}
            title={
              row.statut === "final"
                ? "Enregistrement figé — cliquer pour repasser en brouillon"
                : "Brouillon — cliquer pour figer"
            }
            onClick={() => saveStatut(row.statut === "final" ? "draft" : "final")}
          >
            {row.statut === "final" ? "figé 🔒" : "brouillon"}
          </button>
        ) : (
          <span className="tag">{row.statut === "final" ? "figé" : "brouillon"}</span>
        )}
      </td>
    </tr>
  );
}
