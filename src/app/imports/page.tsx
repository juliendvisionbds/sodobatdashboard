import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import AppHeader from "@/components/AppHeader";
import UploadForm from "./UploadForm";
import { getEntityByCode } from "@/lib/finance";
import { requireWriterOrRedirect } from "@/lib/auth";
import { monthLabelLong } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  preview: { label: "En attente de validation", cls: "amber" },
  validated: { label: "Validé", cls: "green" },
  replaced: { label: "Remplacé", cls: "gray" },
  rejected: { label: "Rejeté", cls: "red" },
};

export default async function ImportsPage() {
  await requireWriterOrRedirect();
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const rows = await db
    .select()
    .from(tables.imports)
    .where(eq(tables.imports.entityId, entity.id))
    .orderBy(desc(tables.imports.createdAt))
    .limit(50);

  // État du cycle mensuel : dernière période validée pour chaque type de balance
  const lastValidated = (type: "ventilee" | "analytique") =>
    rows
      .filter((r) => r.type === type && r.status === "validated")
      .map((r) => r.period)
      .sort()
      .at(-1) ?? null;
  const lastVentilee = lastValidated("ventilee");
  const lastAnalytique = lastValidated("analytique");
  const analytiqueEnRetard =
    lastVentilee != null && (lastAnalytique == null || lastAnalytique < lastVentilee);

  // Règle CDC §4.3 : les données du mois M sont attendues à M+24 jours.
  // Dernier mois exigible = le mois précédant (aujourd'hui − 24 jours).
  // Composant serveur en force-dynamic : l'heure est lue à chaque requête, c'est voulu.
  // eslint-disable-next-line react-hooks/purity
  const ref = new Date(Date.now() - 24 * 24 * 3600 * 1000);
  const exigible = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const expectedPeriod = `${exigible.getFullYear()}-${String(exigible.getMonth() + 1).padStart(2, "0")}-01`;
  const donneesEnRetard = lastVentilee != null && lastVentilee < expectedPeriod;

  return (
    <>
      <AppHeader active="imports" />
      <div className="page">
        <div className="page-header">
          <h1>Imports mensuels</h1>
          <p>
            Déposez les exports Cegid (balance ventilée et balance analytique). Chaque
            import est prévisualisé et contrôlé avant intégration — ré-importer une
            période remplace la version précédente.
          </p>
        </div>

        {lastVentilee && (
          <div
            className={`alert ${donneesEnRetard || analytiqueEnRetard ? "warn" : "pos"}`}
            style={{ marginBottom: 20 }}
          >
            <div className="alert-ico">{donneesEnRetard || analytiqueEnRetard ? "⏳" : "✓"}</div>
            <div>
              <div className="alert-title">
                {donneesEnRetard
                  ? `Données en retard : dernier mois validé ${monthLabelLong(lastVentilee)}, attendu ${monthLabelLong(expectedPeriod)}`
                  : analytiqueEnRetard
                    ? `Cycle mensuel : ventilée ${monthLabelLong(lastVentilee)} validée · analytique ${monthLabelLong(lastVentilee)} attendue`
                    : `Cycle mensuel à jour : ventilée et analytique ${monthLabelLong(lastVentilee)} validées`}
              </div>
              <div className="alert-desc">
                {donneesEnRetard
                  ? `Les exports du mois M sont attendus vers le 24 du mois M+1 (règle TVA). Relancez le cabinet si besoin, puis importez ${monthLabelLong(expectedPeriod)}${analytiqueEnRetard ? " — l'analytique du dernier mois est aussi en attente" : ""}.`
                  : analytiqueEnRetard
                    ? "Déposez la balance analytique du même mois pour mettre à jour Chantiers et Frais généraux."
                    : "Les deux balances du dernier mois exigible sont intégrées."}
              </div>
            </div>
          </div>
        )}

        <div className="grid-2" style={{ gridTemplateColumns: "2fr 3fr" }}>
          <UploadForm />

          <div className="card">
            <div className="card-label">Historique des imports</div>
            {rows.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--gray2)" }}>
                Aucun import pour l&apos;instant. Le cycle mensuel se fait en deux temps :
                d&apos;abord la balance ventilée, puis la balance analytique du même mois —
                chacune est contrôlée puis validée séparément.
              </p>
            )}
            {rows.map((r) => {
              const st = STATUS_LABEL[r.status];
              return (
                <div key={r.id} className="charge-row">
                  <div className="charge-left">
                    <div
                      className="charge-bar"
                      style={{
                        background:
                          r.status === "validated"
                            ? "var(--green)"
                            : r.status === "preview"
                              ? "var(--amber)"
                              : "var(--gray4)",
                      }}
                    />
                    <div>
                      <div className="charge-name">
                        {r.type === "ventilee" ? "Balance ventilée" : "Balance analytique"}{" "}
                        — {monthLabelLong(r.period)}
                      </div>
                      <div className="charge-code">
                        {r.fileName} · {r.createdAt.toLocaleDateString("fr-FR")} ·{" "}
                        {r.createdBy}
                      </div>
                    </div>
                  </div>
                  <div className="charge-right">
                    <span className={`tag ${st.cls}`}>{st.label}</span>
                    {r.status === "preview" && (
                      <Link href={`/imports/${r.id}`} className="btn secondary" style={{ padding: "5px 12px" }}>
                        Contrôler →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
