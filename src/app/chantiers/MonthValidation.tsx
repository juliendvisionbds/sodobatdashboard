"use client";

import { useState, useTransition } from "react";
import type { MonthValidation as Validation, PrevisionControl } from "@/lib/finance";
import { fmtEur, monthLabelLong } from "@/lib/format";
import { reopenMonthAction, validateMonthAction } from "@/app/actions";

// Le contrôle du mois et son bouton de validation, pour la DAF : les prévisions
// saisies dans la vue Chantiers contre le compte 713 comptabilisé, chantier par
// chantier ; et donc l'écart entre le résultat de gestion et le résultat de la
// balance générale. Écart nul (ou assumé) : le mois se valide, tout se fige.

const eur = (v: number | null) => (v == null ? "—" : fmtEur(v));

export default function MonthValidation({
  control,
  validation,
  canValidate,
}: {
  control: PrevisionControl;
  validation: Validation | null;
  canValidate: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const mois = monthLabelLong(control.period);
  const ecartRows = control.rows.filter((r) => r.ecart !== 0);
  const blocked = !control.analytiqueImportId || !control.ventileeCovers;

  const run = (action: (fd: FormData) => Promise<void>) => {
    const fd = new FormData();
    fd.set("period", control.period);
    setConfirm(false);
    start(async () => {
      await action(fd);
    });
  };

  return (
    <div className="card val-card" style={pending ? { opacity: 0.6 } : undefined}>
      <div className="val-head">
        <h2>Validation du mois · {mois}</h2>
        {validation?.current && (
          <span className="tag green">
            validé le {validation.validatedAt} par {validation.validatedBy}
          </span>
        )}
        {validation && !validation.current && (
          <span className="tag amber" title={validation.staleReason ?? undefined}>
            validation du {validation.validatedAt} caduque : {validation.staleReason}
          </span>
        )}
        {!validation && <span className="tag gray">à valider</span>}
      </div>

      <div className="val-grid">
        <div className="val-item">
          <div className="k">Prévisions comptabilisées (713)</div>
          <div className="v">{eur(control.totalComptabilise)}</div>
        </div>
        <div className="val-item">
          <div className="k">Prévisions saisies · {control.rows.length} chantier{control.rows.length > 1 ? "s" : ""}</div>
          <div className="v">{eur(control.totalSaisi)}</div>
        </div>
        <div className="val-item">
          <div className="k">Écart saisi − comptabilisé</div>
          <div className={`v ${control.ecart === 0 ? "ok" : "neg"}`}>{eur(control.ecart)}</div>
        </div>
        <div className="val-item">
          <div className="k">Résultat comptable du mois</div>
          <div className="v">{eur(control.resultatComptable)}</div>
        </div>
        <div className="val-item">
          <div className="k">Résultat de gestion</div>
          <div className="v">{eur(control.resultatGestion)}</div>
        </div>
      </div>

      {ecartRows.length > 0 && (
        <div className="val-rows">
          <div className="h">
            <span>Chantier</span>
            <span />
            <span>Saisi</span>
            <span>Comptabilisé</span>
            <span>Écart</span>
          </div>
          {ecartRows.slice(0, 12).map((r) => (
            <div key={r.centreCode} title={r.by ? `Saisi par ${r.by}` : undefined}>
              <span>{r.centreCode}</span>
              <span>{r.centreLabel}</span>
              <span>{fmtEur(r.saisie)}</span>
              <span>{fmtEur(r.comptabilisee)}</span>
              <span className={r.ecart < 0 ? "neg" : ""}>{fmtEur(r.ecart)}</span>
            </div>
          ))}
          {ecartRows.length > 12 && (
            <div>
              <span className="muted" style={{ gridColumn: "1 / -1" }}>
                … et {ecartRows.length - 12} autre{ecartRows.length - 12 > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="val-foot">
        {!control.ventileeCovers && (
          <span className="muted">
            Balance ventilée de {mois} non reçue : le résultat comptable manque, le mois ne peut pas
            être validé.
          </span>
        )}
        {control.ventileeCovers && control.ecart === 0 && !validation?.current && (
          <span className="muted">Prévisions saisies et comptabilisées concordent.</span>
        )}
        {control.ventileeCovers && control.ecart !== 0 && !validation?.current && (
          <span className="muted">
            Les prévisions saisies ne sont pas encore en comptabilité : le résultat de gestion
            diffère du résultat comptable de {eur(control.ecart)}.
          </span>
        )}

        {canValidate && !validation?.current && !confirm && (
          <button className="btn" disabled={blocked || pending} onClick={() => (control.ecart === 0 ? run(validateMonthAction) : setConfirm(true))}>
            Valider le mois
          </button>
        )}
        {canValidate && confirm && (
          <>
            <span className="muted">Valider malgré l&apos;écart de {eur(control.ecart)} ?</span>
            <button className="btn" disabled={pending} onClick={() => run(validateMonthAction)}>
              Oui, valider
            </button>
            <button className="btn outline" disabled={pending} onClick={() => setConfirm(false)}>
              Annuler
            </button>
          </>
        )}
        {canValidate && validation?.current && (
          <button className="btn outline" disabled={pending} onClick={() => run(reopenMonthAction)}>
            Rouvrir le mois
          </button>
        )}
        {!canValidate && !validation?.current && (
          <span className="muted">La validation du mois est du ressort de la DAF.</span>
        )}
      </div>
    </div>
  );
}
