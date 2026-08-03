import { and, asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import AppHeader from "@/components/AppHeader";
import { getEntityByCode } from "@/lib/finance";
import { fmtEur } from "@/lib/format";
import { assignAccountAction, deleteRuleAction, resolveAlertAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const VIEW_LABEL: Record<string, string> = {
  synthese: "Synthèse",
  chantier: "Chantiers",
  fx: "Frais généraux",
};

export default async function MappingPage() {
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
    .select({
      id: tables.accountRules.id,
      pattern: tables.accountRules.pattern,
      matchType: tables.accountRules.matchType,
      createdBy: tables.accountRules.createdBy,
      categoryId: tables.accountRules.categoryId,
    })
    .from(tables.accountRules)
    .orderBy(asc(tables.accountRules.pattern));

  const catById = new Map(categories.map((c) => [c.id, c]));
  const customRules = rules.filter((r) => r.createdBy !== "seed");

  return (
    <>
      <AppHeader active="mapping" />
      <div className="page">
        <div className="page-header">
          <h1>Mapping des comptes</h1>
          <p>
            Tout compte comptable inconnu de la nomenclature remonte ici — il n&apos;est
            jamais classé par défaut. Affectez-le à une catégorie : la règle s&apos;applique
            immédiatement à toutes les vues.
          </p>
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

        <div className="grid-2">
          <div className="card">
            <div className="card-label">Règles ajoutées manuellement ({customRules.length})</div>
            {customRules.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--gray2)" }}>
                Aucune règle manuelle : le mapping actuel provient de la nomenclature seedée
                (squelette + codes DAF).
              </p>
            )}
            {customRules.map((r) => {
              const cat = catById.get(r.categoryId);
              return (
                <div key={r.id} className="charge-row">
                  <div className="charge-left">
                    <div className="charge-bar" style={{ background: "var(--blue)" }} />
                    <div>
                      <div className="charge-name">
                        {r.pattern}
                        {r.matchType === "prefix" ? "…" : ""} → {cat?.label}
                      </div>
                      <div className="charge-code">
                        {cat ? `${VIEW_LABEL[cat.view]} · ${cat.section}` : ""} · par {r.createdBy}
                      </div>
                    </div>
                  </div>
                  <form action={deleteRuleAction}>
                    <input type="hidden" name="ruleId" value={r.id} />
                    <button type="submit" className="btn secondary" style={{ padding: "5px 10px" }}>
                      Supprimer
                    </button>
                  </form>
                </div>
              );
            })}
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
                      const catRules = rules.filter((r) => r.categoryId === c.id);
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
      </div>
    </>
  );
}
