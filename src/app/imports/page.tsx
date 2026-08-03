import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import AppHeader from "@/components/AppHeader";
import UploadForm from "./UploadForm";
import { getEntityByCode } from "@/lib/finance";
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
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const rows = await db
    .select()
    .from(tables.imports)
    .where(eq(tables.imports.entityId, entity.id))
    .orderBy(desc(tables.imports.createdAt))
    .limit(50);

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

        <div className="grid-2" style={{ gridTemplateColumns: "2fr 3fr" }}>
          <UploadForm />

          <div className="card">
            <div className="card-label">Historique des imports</div>
            {rows.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--gray2)" }}>
                Aucun import pour l&apos;instant. Commencez par la balance ventilée puis
                la balance analytique du même mois.
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
