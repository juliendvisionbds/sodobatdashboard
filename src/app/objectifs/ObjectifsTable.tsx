"use client";

import { useTransition } from "react";
import type { ObjectifRow, ObjectifsData } from "@/lib/finance";
import { STATUT_CLASS } from "@/lib/objectifs";
import { fmtEur, fmtPct } from "@/lib/format";
import { saveManualEntryAction } from "@/app/actions";

// L'objectif annuel est la seule valeur saisie : le réalisé, l'écart et le statut
// en découlent. Les objectifs valent pour tout l'exercice, ils sont
// donc rangés sur son premier mois et restent visibles quel que soit le mois consulté.

export default function ObjectifsTable({
  data,
  canEdit,
}: {
  data: ObjectifsData;
  canEdit: boolean;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <div className="table-wrap">
        <table className="ct">
          <thead>
            <tr>
              <th className="left">Indicateur</th>
              <th>Montant cumulé</th>
              <th className="pct-col">Réalisé (% CA)</th>
              <th className="pct-col">Objectif annuel (% CA)</th>
              <th className="pct-col">Écart (points)</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <ObjectifTr
                key={r.key}
                row={r}
                period={data.saisiePeriod}
                canEdit={canEdit}
              />
            ))}
            <tr className="total-row">
              <td className="label-cell">Total de contrôle (≈ 100 % du CA)</td>
              <td className="muted">-</td>
              <td className="pct-col">{fmtPct(data.totalControle)}</td>
              <td colSpan={3} className="muted" />
            </tr>
            <tr className="total-row">
              <td className="label-cell">Charges directes cumulées / CA</td>
              <td className="muted">-</td>
              <td className="pct-col">{fmtPct(data.chargesDirectes)}</td>
              <td colSpan={3} className="muted" />
            </tr>
            <tr className="total-row">
              <td className="label-cell">Marge — résultat d&apos;exploitation / CA</td>
              <td className="muted">-</td>
              <td className="pct-col">{fmtPct(data.margeExploitation)}</td>
              <td colSpan={3} className="muted" />
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
        Écart = réalisé − objectif, en points de pourcentage : négatif = on dépense
        moins que prévu. Statut : BON si l&apos;écart est favorable d&apos;au moins
        0,2 point, BIEN entre −0,2 et +0,2, À SURVEILLER jusqu&apos;à 2 points de
        dépassement, MAUVAIS au-delà.
        {!canEdit && " La saisie des objectifs est réservée à la DAF."}
      </p>
    </div>
  );
}

function ObjectifTr({
  row,
  period,
  canEdit,
}: {
  row: ObjectifRow;
  period: string;
  canEdit: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const save = (field: "objectif_annuel", value: string) => {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("field", field);
    fd.set("subKey", row.key);
    fd.set("valueNum", value);
    fd.set("status", "draft");
    startTransition(() => {
      void saveManualEntryAction(fd);
    });
  };

  const numCell = (
    field: "objectif_annuel",
    value: number | null
  ) =>
    canEdit ? (
      // Saisie en points de pourcentage : 5 = 5 % du CA.
      <span style={{ whiteSpace: "nowrap" }}>
        <input
          className="inline-num"
          defaultValue={value ?? ""}
          placeholder="—"
          aria-label="Objectif annuel en % du CA"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== String(value ?? "")) save(field, v);
          }}
        />
        <span className="muted" style={{ marginLeft: 4 }}>%</span>
      </span>
    ) : (
      <span className={value == null ? "muted" : undefined}>
        {value == null ? "-" : fmtPct(value)}
      </span>
    );

  return (
    <tr style={isPending ? { opacity: 0.5 } : undefined}>
      <td className="label-cell" title={row.notes}>
        {row.label}
        {row.notes && <span className="charge-code" style={{ marginLeft: 8 }}>ⓘ</span>}
      </td>
      <td className={row.montant == null ? "muted" : row.montant < 0 ? "neg" : ""}>
        {row.montant == null ? "-" : fmtEur(row.montant)}
      </td>
      <td className="pct-col">
        {row.realise == null ? (
          <span className="muted">-</span>
        ) : (
          <span className="pct-badge">{fmtPct(row.realise)}</span>
        )}
      </td>
      <td className="pct-col">{numCell("objectif_annuel", row.objectif)}</td>
      <td className={`pct-col${row.ecart != null && row.ecart > 0 ? " neg" : ""}`}>
        {row.ecart == null ? <span className="muted">-</span> : fmtPct(row.ecart)}
      </td>
      <td>
        {row.statut ? (
          <span className={`tag ${STATUT_CLASS[row.statut]}`}>{row.statut}</span>
        ) : (
          <span className="muted">-</span>
        )}
      </td>
    </tr>
  );
}
