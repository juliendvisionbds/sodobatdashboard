"use client";

import { useMemo, useState, useTransition } from "react";
import { ChantierRow, ChantiersData } from "@/lib/finance";
import { fmtNum } from "@/lib/format";
import { saveManualEntryAction } from "@/app/actions";

function Amount({ v, posGreen = false }: { v: number; posGreen?: boolean }) {
  if (v === 0) return <span className="muted">—</span>;
  const cls = v < 0 ? "neg" : posGreen ? "pos" : "";
  return <span className={cls}>{v > 0 && posGreen ? "+" : ""}{fmtNum(v)}</span>;
}

export default function ChantiersTable({
  rows,
  totals,
  poles,
  period,
  canEdit,
}: {
  rows: ChantierRow[];
  totals: ChantiersData["totals"];
  poles: string[];
  period: string;
  canEdit: boolean;
}) {
  const [pole, setPole] = useState("");
  const [search, setSearch] = useState("");
  const [hideInactive, setHideInactive] = useState(true);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (pole && r.pole !== pole) return false;
      if (
        search &&
        !`${r.centreCode} ${r.centreLabel}`.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (
        hideInactive &&
        r.totalProduits === 0 &&
        r.achatsMp === 0 &&
        r.sousTraitance === 0 &&
        r.autresCharges === 0 &&
        !r.previsionManuelle
      )
        return false;
      return true;
    });
  }, [rows, pole, search, hideInactive]);

  const byPole = useMemo(() => {
    const map = new Map<string, ChantierRow[]>();
    for (const r of filtered) {
      const key = r.pole ? `Pôle ${r.pole}` : "Autres centres";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      <div className="table-controls">
        <select className="tctl-select" value={pole} onChange={(e) => setPole(e.target.value)}>
          <option value="">Tous les pôles</option>
          {poles.map((p) => (
            <option key={p} value={p}>Pôle {p}</option>
          ))}
        </select>
        <input
          className="tctl-input"
          placeholder="Rechercher un chantier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label style={{ fontSize: 12, color: "var(--gray2)", display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={hideInactive}
            onChange={(e) => setHideInactive(e.target.checked)}
          />
          Masquer les chantiers sans activité
        </label>
        <div className="tctl-stats">
          {filtered.length} chantier{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
        </div>
      </div>

      <div className="table-wrap">
        <table className="ct">
          <thead>
            <tr>
              <th className="left">Réf.</th>
              <th className="left">Chantier</th>
              <th>Annulation</th>
              <th>Prévision {canEdit ? "🟡" : ""}</th>
              <th>Facturé</th>
              <th>Total produits</th>
              <th>Achats MP</th>
              <th>Sous-trait.</th>
              <th>Autres charges</th>
              <th>Résultat mois</th>
              <th className="left">Note</th>
            </tr>
          </thead>
          <tbody>
            {byPole.map(([poleName, poleRows]) => (
              <PoleGroup
                key={poleName}
                name={poleName}
                rows={poleRows}
                period={period}
                canEdit={canEdit}
              />
            ))}
            <tr className="total-row">
              <td className="left">Total</td>
              <td className="label-cell">{filtered.length} chantiers</td>
              <td><Amount v={totals.annulation} /></td>
              <td><Amount v={totals.prevision} /></td>
              <td><Amount v={totals.facture} posGreen /></td>
              <td><Amount v={totals.totalProduits} /></td>
              <td><Amount v={totals.achatsMp} /></td>
              <td><Amount v={totals.sousTraitance} /></td>
              <td><Amount v={totals.autresCharges} /></td>
              <td><Amount v={totals.resultat} posGreen /></td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function PoleGroup({
  name,
  rows,
  period,
  canEdit,
}: {
  name: string;
  rows: ChantierRow[];
  period: string;
  canEdit: boolean;
}) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={11}>{name}</td>
      </tr>
      {rows.map((r) => (
        <ChantierTr key={r.centreCode} row={r} period={period} canEdit={canEdit} />
      ))}
    </>
  );
}

function ChantierTr({
  row,
  period,
  canEdit,
}: {
  row: ChantierRow;
  period: string;
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const manual = row.previsionManuelle;
  const previsionValue = manual?.value ?? row.prevision;
  const isFinal = manual?.status === "final";

  const save = (valueNum: string, status: "draft" | "final") => {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("centreCode", row.centreCode);
    fd.set("field", "tec_provision");
    fd.set("valueNum", valueNum);
    fd.set("status", status);
    startTransition(() => {
      void saveManualEntryAction(fd);
    });
  };

  const saveNote = (text: string) => {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("centreCode", row.centreCode);
    fd.set("field", "note");
    fd.set("valueText", text);
    fd.set("status", "draft");
    startTransition(() => {
      void saveManualEntryAction(fd);
    });
  };

  return (
    <tr style={isPending ? { opacity: 0.5 } : undefined}>
      <td className="code-cell">{row.centreCode}</td>
      <td className="label-cell">{row.centreLabel}</td>
      <td><Amount v={row.annulation} /></td>
      <td>
        {canEdit && !isFinal ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              className={`inline-num${manual ? " draft" : ""}`}
              defaultValue={previsionValue || ""}
              placeholder="0"
              title={manual ? "Saisie manuelle (brouillon)" : "Provision issue de la balance — modifiable"}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== "" && parseFloat(v.replace(",", ".")) !== previsionValue) {
                  save(v, "draft");
                }
              }}
            />
            {manual && (
              <button
                className="tag amber"
                style={{ border: "none", cursor: "pointer" }}
                title="Figer cette valeur jusqu'au mois suivant"
                onClick={() => save(String(manual.value), "final")}
              >
                figer
              </button>
            )}
          </span>
        ) : (
          <span title={isFinal ? "Valeur figée" : undefined}>
            <Amount v={previsionValue} />
            {isFinal && " 🔒"}
          </span>
        )}
      </td>
      <td><Amount v={row.facture} posGreen /></td>
      <td><Amount v={row.totalProduits} /></td>
      <td><Amount v={row.achatsMp} /></td>
      <td><Amount v={row.sousTraitance} /></td>
      <td><Amount v={row.autresCharges} /></td>
      <td><Amount v={row.resultat} posGreen /></td>
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
    </tr>
  );
}
