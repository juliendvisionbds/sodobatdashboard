import { and, asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import AppHeader from "@/components/AppHeader";
import { getEntityByCode } from "@/lib/finance";
import { requireWriterOrRedirect } from "@/lib/auth";
import { fmtEur } from "@/lib/format";
import {
  assignAccountAction,
  deleteRuleAction,
  reactivateRuleAction,
  replaceRuleAction,
  resolveAlertAction,
} from "@/app/actions";
import NewRuleForm, { CategoryOption, RuleLite } from "./NewRuleForm";

export const dynamic = "force-dynamic";

const VIEW_LABEL: Record<string, string> = {
  synthese: "Synthèse",
  chantier: "Chantiers",
  fx: "Frais généraux",
};

function CategoryOptions({ categories }: { categories: CategoryOption[] }) {
  return (
    <>
      <option value="" disabled>
        Nouvelle catégorie…
      </option>
      {(["synthese", "chantier", "fx"] as const).map((view) => (
        <optgroup key={view} label={VIEW_LABEL[view]}>
          {categories
            .filter((c) => c.view === view)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.section} — {c.label}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

export default async function MappingPage() {
  await requireWriterOrRedirect();
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const unmappedAlerts = await db
    .select()
    .from(tables.alerts)
    .where(
      and(
        eq(tables.alerts.entityId, entity.id),
        eq(tables.alerts.type, "compte_non_mappe"),
        eq(tables.alerts.status, "open")
      )
    )
    .orderBy(asc(tables.alerts.account));

  const categories = await db
    .select()
    .from(tables.categories)
    .orderBy(asc(tables.categories.view), asc(tables.categories.sortOrder));

  const rules = await db
    .select()
    .from(tables.accountRules)
    .orderBy(asc(tables.accountRules.pattern));

  const catById = new Map(categories.map((c) => [c.id, c]));
  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    id: c.id,
    view: c.view,
    viewLabel: VIEW_LABEL[c.view],
    section: c.section,
    label: c.label,
  }));
  const rulesLite: RuleLite[] = rules.map((r) => ({
    id: r.id,
    pattern: r.pattern,
    matchType: r.matchType,
    active: r.active,
    categoryLabel: catById.get(r.categoryId)?.label ?? "?",
  }));

  const activeRules = rules.filter((r) => r.active);
  const inactiveRules = rules.filter((r) => !r.active);

  return (
    <>
      <AppHeader active="mapping" />
      <div className="page">
        <div className="page-header">
          <h1>Mapping des comptes</h1>
          <p>
            Tout compte comptable inconnu de la nomenclature remonte ici — il n&apos;est
            jamais classé par défaut. Les règles s&apos;appliquent au moment du calcul :
            toute modification corrige immédiatement les vues, sans réimport.
          </p>
        </div>

        <div className="alert info" style={{ marginBottom: 20 }}>
          <div className="alert-ico">ℹ</div>
          <div>
            <div className="alert-title">Ordre de priorité des règles</div>
            <div className="alert-desc">
              <strong>1.</strong> Règle exacte (compte précis) ·{" "}
              <strong>2.</strong> Préfixe le plus long (ex. 6135… gagne sur 613…) ·{" "}
              <strong>3.</strong> À égalité, la règle propre à l&apos;entité gagne sur la
              règle commune du groupe. Une règle plus spécifique surcharge donc les
              autres sans avoir à les supprimer.
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-label">
            Comptes non mappés ({unmappedAlerts.length})
          </div>
          {unmappedAlerts.length === 0 && (
            <div className="alert pos">
              <div className="alert-ico">✓</div>
              <div>
                <div className="alert-title">Aucun compte en attente d&apos;affectation</div>
                <div className="alert-desc">
                  Les prochains imports remonteront ici tout nouveau compte inconnu.
                </div>
              </div>
            </div>
          )}
          {unmappedAlerts.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid var(--gray5)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 300px" }}>
                <div className="charge-name">{a.title.replace("Compte non mappé : ", "")}</div>
                <div className="charge-code">
                  {a.amount != null ? fmtEur(Number(a.amount)) : ""} · {a.description}
                </div>
              </div>
              <form
                action={assignAccountAction}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <input type="hidden" name="account" value={a.account ?? ""} />
                <select name="categoryId" className="tctl-select" required defaultValue="">
                  <option value="" disabled>
                    Affecter à une catégorie…
                  </option>
                  {(["synthese", "chantier", "fx"] as const).map((view) => (
                    <optgroup key={view} label={VIEW_LABEL[view]}>
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
                <select name="matchType" className="tctl-select" defaultValue="exact">
                  <option value="exact">ce compte uniquement</option>
                  <option value="prefix">tous les comptes commençant par</option>
                </select>
                <button type="submit" className="btn" style={{ padding: "7px 14px" }}>
                  Affecter
                </button>
              </form>
              <form action={resolveAlertAction}>
                <input type="hidden" name="alertId" value={a.id} />
                <button
                  type="submit"
                  className="btn secondary"
                  style={{ padding: "7px 12px" }}
                  title="Clore l'alerte sans créer de règle (compte à ignorer)"
                >
                  Ignorer
                </button>
              </form>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 20 }}>
          <NewRuleForm rules={rulesLite} categories={categoryOptions} />
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-label">
            Toutes les règles ({activeRules.length} actives
            {inactiveRules.length > 0 ? ` · ${inactiveRules.length} remplacée(s)` : ""})
          </div>
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {(["synthese", "chantier", "fx"] as const).map((view) => {
              const viewRules = activeRules.filter(
                (r) => catById.get(r.categoryId)?.view === view
              );
              if (viewRules.length === 0) return null;
              return (
                <div key={view} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--blue)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      margin: "10px 0 6px",
                    }}
                  >
                    {VIEW_LABEL[view]}
                  </div>
                  {viewRules.map((r) => {
                    const cat = catById.get(r.categoryId);
                    const isSeed = r.createdBy === "seed";
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 0",
                          borderBottom: "1px solid var(--gray5)",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ flex: "1 1 280px" }}>
                          <div className="charge-name">
                            {r.pattern}
                            {r.matchType === "prefix" ? "…" : ""} → {cat?.label}
                          </div>
                          <div className="charge-code">{cat?.section}</div>
                        </div>
                        <span className={`tag ${isSeed ? "gray" : "blue"}`}>
                          {isSeed ? "nomenclature groupe" : `par ${r.createdBy}`}
                        </span>
                        {isSeed ? (
                          <details style={{ position: "relative" }}>
                            <summary
                              className="btn secondary"
                              style={{ padding: "5px 10px", listStyle: "none", cursor: "pointer" }}
                            >
                              Remplacer
                            </summary>
                            <form
                              action={replaceRuleAction}
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                marginTop: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <input type="hidden" name="ruleId" value={r.id} />
                              <select name="categoryId" className="tctl-select" required defaultValue="">
                                <CategoryOptions categories={categoryOptions} />
                              </select>
                              <button type="submit" className="btn" style={{ padding: "6px 12px" }}>
                                Confirmer
                              </button>
                            </form>
                          </details>
                        ) : (
                          <form action={deleteRuleAction}>
                            <input type="hidden" name="ruleId" value={r.id} />
                            <button
                              type="submit"
                              className="btn secondary"
                              style={{ padding: "5px 10px" }}
                            >
                              Supprimer
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {inactiveRules.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--gray4)" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--amber)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 6,
                }}
              >
                Règles remplacées (désactivées, réversibles)
              </div>
              {inactiveRules.map((r) => {
                const cat = catById.get(r.categoryId);
                const replacement = activeRules.find(
                  (a) => a.pattern === r.pattern && a.matchType === r.matchType
                );
                const replCat = replacement ? catById.get(replacement.categoryId) : null;
                return (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--gray5)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: "1 1 280px" }}>
                      <div className="charge-name" style={{ color: "var(--gray3)" }}>
                        {r.pattern}
                        {r.matchType === "prefix" ? "…" : ""} → {cat?.label}
                      </div>
                      <div className="charge-code">
                        {replCat
                          ? `remplacée par : → ${replCat.label} (${replacement?.createdBy})`
                          : "désactivée"}
                      </div>
                    </div>
                    <form action={reactivateRuleAction}>
                      <input type="hidden" name="ruleId" value={r.id} />
                      <button
                        type="submit"
                        className="btn secondary"
                        style={{ padding: "5px 10px" }}
                        title="Restaure la règle d'origine et supprime la règle de remplacement"
                      >
                        Rétablir l&apos;origine
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-label">Nomenclature ({categories.length} catégories)</div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {(["synthese", "chantier", "fx"] as const).map((view) => (
              <div key={view} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--blue)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    margin: "10px 0 6px",
                  }}
                >
                  {VIEW_LABEL[view]}
                </div>
                {categories
                  .filter((c) => c.view === view)
                  .map((c) => {
                    const catRules = activeRules.filter((r) => r.categoryId === c.id);
                    return (
                      <div key={c.id} style={{ padding: "5px 0", borderBottom: "1px solid var(--gray5)" }}>
                        <div style={{ fontSize: 12.5, color: "var(--gray1)" }}>{c.label}</div>
                        <div style={{ fontSize: 10.5, color: "var(--gray3)" }}>
                          {c.section} ·{" "}
                          {catRules
                            .map((r) => `${r.pattern}${r.matchType === "prefix" ? "…" : ""}`)
                            .join(", ") || "aucune règle"}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
