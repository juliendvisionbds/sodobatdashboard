"use client";

import { useActionState } from "react";
import { uploadImportAction } from "@/app/actions";

export default function UploadForm() {
  const [state, action, pending] = useActionState(uploadImportAction, undefined);

  return (
    <form action={action} className="card">
      <div className="card-label">Nouvel import</div>

      <div className="alert info" style={{ marginBottom: 18 }}>
        <div className="alert-ico">ℹ</div>
        <div>
          <div className="alert-title">Chaque mois, 2 imports à faire l&apos;un après l&apos;autre</div>
          <div className="alert-desc">
            <strong>1.</strong> Balance <strong>ventilée</strong> — déposer le fichier
            (le mois est détecté automatiquement) → contrôler → valider.
            <br />
            <strong>2.</strong> Balance <strong>analytique</strong> — déposer le fichier{" "}
            <strong>et renseigner le mois du snapshot</strong> → contrôler → valider.
            <br />
            La ventilée alimente la Synthèse ; l&apos;analytique alimente Chantiers et
            Frais généraux.
          </div>
        </div>
      </div>

      <label className="field-label" htmlFor="file">
        Fichier xlsx — le type de balance est détecté automatiquement
      </label>
      <input
        id="file"
        name="file"
        type="file"
        accept=".xlsx,.xls"
        required
        className="field-input"
        style={{ marginBottom: 16 }}
      />

      <label className="field-label" htmlFor="period">
        Mois du snapshot <span style={{ fontWeight: 400, textTransform: "none" }}>
          (requis pour la balance analytique — la ventilée est détectée automatiquement)
        </span>
      </label>
      <input
        id="period"
        name="period"
        type="month"
        className="field-input"
        style={{ marginBottom: 18 }}
      />

      {state?.error && (
        <div className="alert neg" style={{ marginBottom: 14 }}>
          <div className="alert-ico">✕</div>
          <div className="alert-desc">{state.error}</div>
        </div>
      )}

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Analyse du fichier…" : "Analyser et prévisualiser →"}
      </button>
      <p style={{ fontSize: 11, color: "var(--gray3)", marginTop: 12 }}>
        Rien n&apos;est intégré à cette étape : un écran de contrôle (totaux par classe,
        comptes non mappés) s&apos;affiche avant validation.
      </p>
    </form>
  );
}
