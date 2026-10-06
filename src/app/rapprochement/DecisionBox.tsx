"use client";

import { useState, useTransition } from "react";
import { saveDecisionAction } from "@/app/actions";

// Zone de réponse d'un point du rapprochement. La saisie est enregistrée en
// base et non dans le navigateur : tout le monde voit la même réponse, et elle
// est retrouvée après le rendez-vous.

export default function DecisionBox({
  pointKey,
  initial,
  updatedBy,
  updatedAt,
  canEdit,
}: {
  pointKey: string;
  initial: string;
  updatedBy: string | null;
  updatedAt: string | null;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState<string>(initial);
  const [pending, start] = useTransition();
  const dirty = value !== saved;

  if (!canEdit) {
    return (
      <div className="doc-decision">
        <span className="doc-decision-label">Votre réponse</span>
        {initial ? (
          <p className="doc-decision-read">{initial}</p>
        ) : (
          <p className="doc-decision-read muted">Pas encore renseignée.</p>
        )}
      </div>
    );
  }

  const save = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("pointKey", pointKey);
      fd.set("answer", value);
      await saveDecisionAction(fd);
      setSaved(value);
    });

  return (
    <div className="doc-decision">
      <span className="doc-decision-label">Votre réponse</span>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => dirty && save()}
        rows={3}
        placeholder="Écrivez ici — la réponse est enregistrée pour tout le monde."
      />
      <div className="doc-decision-foot">
        <button type="button" className="btn btn-sm" onClick={save} disabled={!dirty || pending}>
          {pending ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
        </button>
        {updatedAt && !dirty && (
          <span className="muted">
            Dernière modification le {updatedAt}
            {updatedBy ? ` par ${updatedBy}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
