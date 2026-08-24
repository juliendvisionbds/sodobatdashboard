"use client";

import { useActionState, useMemo, useState } from "react";
import { createRuleAction } from "@/app/actions";

export type RuleLite = {
  id: number;
  pattern: string;
  matchType: "exact" | "prefix";
  active: boolean;
  categoryLabel: string;
};

export type CategoryOption = {
  id: number;
  view: string;
  viewLabel: string;
  section: string;
  label: string;
};

export default function NewRuleForm({
  rules,
  categories,
}: {
  rules: RuleLite[];
  categories: CategoryOption[];
}) {
  const [state, action, pending] = useActionState(createRuleAction, undefined);
  const [pattern, setPattern] = useState("");
  const [matchType, setMatchType] = useState<"exact" | "prefix">("prefix");

  // Simulation : quelles règles actives interagissent avec le pattern saisi ?
  const impact = useMemo(() => {
    const p = pattern.trim();
    if (p.length < 2) return null;
    const active = rules.filter((r) => r.active);

    // règle qui gagnerait AUJOURD'HUI pour un compte égal au pattern
    const exactHit = active.find((r) => r.matchType === "exact" && r.pattern === p);
    const prefixHits = active
      .filter((r) => r.matchType === "prefix" && p.startsWith(r.pattern))
      .sort((a, b) => b.pattern.length - a.pattern.length);
    const current = exactHit ?? prefixHits[0] ?? null;

    // règles existantes qui resteraient prioritaires sur la nouvelle règle préfixe
    const stillWin =
      matchType === "prefix"
        ? active.filter(
            (r) =>
              r.pattern !== p &&
              r.pattern.startsWith(p) // plus spécifiques → gagnent
          )
        : [];

    return { current, stillWin: stillWin.slice(0, 6), stillWinCount: stillWin.length };
  }, [pattern, matchType, rules]);

  return (
    <form action={action} className="card">
      <div className="card-label">Nouvelle règle</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label className="field-label" htmlFor="pattern">Compte ou préfixe</label>
          <input
            id="pattern"
            name="pattern"
            className="field-input"
            style={{ width: 140 }}
            placeholder="ex. 6135"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="matchType">Portée</label>
          <select
            id="matchType"
            name="matchType"
            className="tctl-select"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as "exact" | "prefix")}
          >
            <option value="prefix">tous les comptes commençant par</option>
            <option value="exact">ce compte uniquement</option>
          </select>
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label className="field-label" htmlFor="categoryId">Catégorie de destination</label>
          <select id="categoryId" name="categoryId" className="tctl-select" style={{ width: "100%" }} required defaultValue="">
            <option value="" disabled>Choisir…</option>
            {["synthese", "chantier", "fx"].map((view) => (
              <optgroup key={view} label={categories.find((c) => c.view === view)?.viewLabel ?? view}>
                {categories
                  .filter((c) => c.view === view)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.section} — {c.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "…" : "Créer la règle"}
        </button>
      </div>

      {impact && (
        <div className="alert info" style={{ marginTop: 14 }}>
          <div className="alert-ico">ℹ</div>
          <div style={{ fontSize: 12.5 }}>
            {impact.current ? (
              <div>
                Aujourd&apos;hui, un compte « {pattern.trim()} » est classé via la règle{" "}
                <strong>
                  {impact.current.pattern}
                  {impact.current.matchType === "prefix" ? "…" : ""}
                </strong>{" "}
                → {impact.current.categoryLabel}. Votre règle{" "}
                {matchType === "exact" || pattern.trim().length > impact.current.pattern.length || impact.current.pattern === pattern.trim()
                  ? "sera prioritaire (plus spécifique)."
                  : "ne s'appliquera qu'aux comptes non couverts par cette règle plus spécifique."}
              </div>
            ) : (
              <div>
                Aucune règle active ne couvre « {pattern.trim()} » aujourd&apos;hui — ces
                comptes remontent en alerte « non mappé ».
              </div>
            )}
            {impact.stillWin.length > 0 && (
              <div style={{ marginTop: 6 }}>
                Règles plus spécifiques qui resteront prioritaires :{" "}
                {impact.stillWin.map((r) => `${r.pattern}${r.matchType === "prefix" ? "…" : ""} → ${r.categoryLabel}`).join(" · ")}
                {impact.stillWinCount > impact.stillWin.length && ` (+${impact.stillWinCount - impact.stillWin.length})`}
              </div>
            )}
          </div>
        </div>
      )}

      {state?.error && (
        <div className="alert neg" style={{ marginTop: 14 }}>
          <div className="alert-ico">✕</div>
          <div className="alert-desc">{state.error}</div>
        </div>
      )}
      {state?.ok && (
        <div className="alert pos" style={{ marginTop: 14 }}>
          <div className="alert-ico">✓</div>
          <div className="alert-desc">{state.ok} — appliquée immédiatement à toutes les vues.</div>
        </div>
      )}
    </form>
  );
}
