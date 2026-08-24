import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import AppHeader from "@/components/AppHeader";
import { getEntityByCode } from "@/lib/finance";
import { canWrite, getSession } from "@/lib/auth";
import { fmtEur, monthLabelLong } from "@/lib/format";
import { forgetAlertAction, resolveAlertAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const TYPE_META: Record<
  string,
  { label: string; action: string; conseil: string }
> = {
  compte_non_mappe: {
    label: "Compte non mappé",
    action: "Affecter dans Mapping",
    conseil:
      "Le montant de ce compte n'apparaît dans aucune ligne de gestion. L'affecter dans l'écran Mapping (l'alerte se clôt alors automatiquement), ou l'ignorer s'il est volontairement hors gestion.",
  },
  ecart_controle: {
    label: "Écart de contrôle",
    action: "Vérifier l'export",
    conseil:
      "Le total du fichier ne correspond pas au recalcul : l'export est probablement corrompu ou tronqué. Redemander le fichier au cabinet et réimporter — ne pas ignorer sans vérification.",
  },
  mois_sans_donnees: {
    label: "Mois sans données",
    action: "Relancer le cabinet",
    conseil:
      "Aucune écriture pour ce mois de l'exercice. Vérifier auprès du cabinet, puis marquer comme traité si c'est normal (ex. mois sans activité).",
  },
  montant_constant: {
    label: "Montant constant",
    action: "Vérifier puis statuer",
    conseil:
      "Montant strictement identique plusieurs mois de suite : abonnement ou forfait légitime, ou saisie recopiée par erreur. Si c'est normal, « Marquer comme normal » — l'alerte ne reviendra plus pour ce montant.",
  },
};

export default async function AlertesPage() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;
  const session = await getSession();
  const writer = !!session && canWrite(session);

  const open = await db
    .select()
    .from(tables.alerts)
    .where(and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "open")))
    .orderBy(desc(tables.alerts.severity), desc(tables.alerts.createdAt));

  const resolved = await db
    .select()
    .from(tables.alerts)
    .where(
      and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "resolved"))
    )
    .orderBy(desc(tables.alerts.resolvedAt))
    .limit(50);

  const types = [...new Set(open.map((a) => a.type))];

  return (
    <>
      <AppHeader active="synthese" />
      <div className="page">
        <div className="page-header">
          <h1>Alertes de cohérence</h1>
          <p>
            Générées automatiquement à chaque import validé. Une alerte marquée comme
            traitée ne reviendra pas au prochain import (sauf « écart de contrôle »,
            toujours re-signalé) — la décision est réversible dans l&apos;historique
            ci-dessous.
          </p>
        </div>

        {open.length === 0 && (
          <div className="alert pos" style={{ marginBottom: 20 }}>
            <div className="alert-ico">✓</div>
            <div>
              <div className="alert-title">Aucune alerte ouverte</div>
              <div className="alert-desc">Tous les contrôles sont au vert.</div>
            </div>
          </div>
        )}

        {types.map((type) => {
          const meta = TYPE_META[type];
          const items = open.filter((a) => a.type === type);
          return (
            <div className="card" key={type} style={{ marginBottom: 20 }}>
              <div className="card-label">
                {meta?.label ?? type} ({items.length})
              </div>
              <p style={{ fontSize: 12.5, color: "var(--gray2)", margin: "10px 0 4px" }}>
                {meta?.conseil}
              </p>
              {items.map((a) => (
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
                  <div className="alert-ico" style={{ flexShrink: 0 }}>
                    {a.severity === "error" ? "✕" : "⚠"}
                  </div>
                  <div style={{ flex: "1 1 320px" }}>
                    <div className="alert-title">{a.title}</div>
                    <div className="alert-desc">
                      {a.description}
                      {a.period ? ` · Période : ${monthLabelLong(String(a.period))}` : ""}
                    </div>
                  </div>
                  {writer && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {a.type === "compte_non_mappe" && (
                        <Link href="/admin/mapping" className="btn" style={{ padding: "7px 14px" }}>
                          Affecter dans Mapping
                        </Link>
                      )}
                      <form action={resolveAlertAction}>
                        <input type="hidden" name="alertId" value={a.id} />
                        <button
                          type="submit"
                          className="btn secondary"
                          style={{ padding: "7px 12px" }}
                          title={
                            a.type === "montant_constant"
                              ? "Ne reviendra plus tant que ce montant reste identique"
                              : a.type === "ecart_controle"
                                ? "Clôt cette alerte ; un écart sur un prochain import sera re-signalé"
                                : "Ne reviendra plus aux prochains imports"
                          }
                        >
                          {a.type === "montant_constant"
                            ? "Marquer comme normal"
                            : "Marquer comme traitée"}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {resolved.length > 0 && (
          <div className="card">
            <div className="card-label">Historique — traitées ({resolved.length})</div>
            {resolved.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--gray5)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 320px" }}>
                  <div className="charge-name" style={{ color: "var(--gray3)" }}>
                    {a.title}
                  </div>
                  <div className="charge-code">
                    {TYPE_META[a.type]?.label ?? a.type}
                    {a.amount != null ? ` · ${fmtEur(Number(a.amount))}` : ""} · traitée par{" "}
                    {a.resolvedBy ?? "—"}
                    {a.resolvedAt
                      ? ` le ${new Date(a.resolvedAt).toLocaleDateString("fr-FR")}`
                      : ""}
                  </div>
                </div>
                {writer && (
                  <form action={forgetAlertAction}>
                    <input type="hidden" name="alertId" value={a.id} />
                    <button
                      type="submit"
                      className="btn secondary"
                      style={{ padding: "6px 12px" }}
                      title="Annule la décision : l'alerte sera recréée au prochain import si l'anomalie persiste"
                    >
                      Réactiver la surveillance
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
