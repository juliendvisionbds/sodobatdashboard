import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import AppHeader from "@/components/AppHeader";
import { ImportSummary } from "@/lib/import-service";
import { fmtEur, monthLabel, monthLabelLong } from "@/lib/format";
import { rejectImportAction, validateImportAction } from "@/app/actions";
import { requireWriterOrRedirect } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ImportPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireWriterOrRedirect();
  const { id } = await params;
  const [imp] = await db
    .select()
    .from(tables.imports)
    .where(eq(tables.imports.id, Number(id)));
  if (!imp) notFound();

  const s = imp.summary as ImportSummary;
  const koChecks = (s.classChecks ?? []).filter((c) => !c.ok);
  const validate = validateImportAction.bind(null, imp.id);
  const reject = rejectImportAction.bind(null, imp.id);

  return (
    <>
      <AppHeader active="imports" fiscalYearStart={imp.fiscalYearStart} />
      <div className="page">
        <div className="page-header">
          <h1>
            Contrôle avant intégration —{" "}
            {s.type === "ventilee" ? "Balance ventilée" : "Balance analytique"}
          </h1>
          <p>
            {imp.fileName} · période {monthLabelLong(imp.period)} · importé par {imp.createdBy}
          </p>
        </div>

        {imp.status !== "preview" && (
          <div className="alert pos" style={{ marginBottom: 20 }}>
            <div className="alert-ico">✓</div>
            <div>
              <div className="alert-title">Import déjà traité (statut : {imp.status})</div>
            </div>
          </div>
        )}

        <div className="kpi-strip">
          <div className="kpi">
            <div className="kpi-label">Lignes lues</div>
            <div className="kpi-value">{s.lineCount}</div>
            <div className="kpi-sub">{s.accountCount} comptes distincts</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">
              {s.type === "ventilee" ? "Mois couverts" : "Centres (chantiers)"}
            </div>
            <div className="kpi-value">
              {s.type === "ventilee" ? (s.months?.length ?? 0) : (s.centreCount ?? 0)}
            </div>
            <div className="kpi-sub">
              {s.type === "ventilee"
                ? `${monthLabel(s.months![0])} → ${monthLabel(s.months![s.months!.length - 1])}`
                : "dont FX (frais généraux)"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Contrôles de classes</div>
            <div className="kpi-value" style={{ color: koChecks.length ? "var(--red)" : "var(--green)" }}>
              {s.classChecks ? `${s.classChecks.length - koChecks.length}/${s.classChecks.length}` : "—"}
            </div>
            <div className={`kpi-sub ${koChecks.length ? "neg" : "pos"}`}>
              {s.classChecks
                ? koChecks.length
                  ? `${koChecks.length} écart(s) fichier vs recalcul`
                  : "totaux fichier = totaux recalculés"
                : "non applicable"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Comptes non mappés</div>
            <div className="kpi-value" style={{ color: s.unmapped.length ? "var(--amber)" : "var(--green)" }}>
              {s.unmapped.length}
            </div>
            <div className="kpi-sub warn">
              {s.unmapped.length
                ? "seront remontés en alerte — jamais classés par défaut"
                : "tous les comptes sont affectés"}
            </div>
          </div>
        </div>

        {s.replaces && (
          <div className="alert warn" style={{ marginBottom: 20 }}>
            <div className="alert-ico">⚠</div>
            <div>
              <div className="alert-title">Cet import remplacera une version validée</div>
              <div className="alert-desc">
                {s.replaces.fileName} (période {monthLabelLong(s.replaces.period)}) passera
                en statut « remplacé ». C&apos;est le fonctionnement normal des 2 mises à
                jour mensuelles (M+24 puis correction comptable).
              </div>
            </div>
          </div>
        )}

        <div className="grid-2">
          {koChecks.length > 0 && (
            <div className="card">
              <div className="card-label">Écarts de contrôle par classe</div>
              {koChecks.map((c) => (
                <div key={c.class} className="charge-row">
                  <div className="charge-name">Classe {c.class}</div>
                  <div className="charge-right">
                    <span className="charge-amt">{fmtEur(c.fileTotal ?? 0)}</span>
                    <span className="tag red">recalc {fmtEur(c.computedTotal)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="card-label">
              Comptes non mappés ({s.unmapped.length})
            </div>
            {s.unmapped.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--gray2)" }}>
                Tous les comptes du fichier sont couverts par la nomenclature.
              </p>
            )}
            {s.unmapped.slice(0, 15).map((u) => (
              <div key={u.account + u.views.join()} className="charge-row">
                <div className="charge-left">
                  <div className="charge-bar" style={{ background: "var(--amber)" }} />
                  <div>
                    <div className="charge-name">{u.label}</div>
                    <div className="charge-code">
                      {u.account} · vues : {u.views.join(", ")}
                    </div>
                  </div>
                </div>
                <div className="charge-amt">{fmtEur(u.total)}</div>
              </div>
            ))}
            {s.unmapped.length > 15 && (
              <p style={{ fontSize: 12, color: "var(--gray3)", marginTop: 8 }}>
                … et {s.unmapped.length - 15} autres — traitables ensuite dans l&apos;écran Mapping.
              </p>
            )}
          </div>
        </div>

        {imp.status === "preview" && (
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <form action={validate}>
              <button type="submit" className="btn">
                Valider l&apos;intégration ✓
              </button>
            </form>
            <form action={reject}>
              <button type="submit" className="btn danger">
                Rejeter cet import
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
