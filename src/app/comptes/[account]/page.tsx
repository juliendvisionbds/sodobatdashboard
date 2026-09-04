import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getAccountDetail, getEntityByCode } from "@/lib/finance";
import { fmtEur, monthLabel, monthLabelLong } from "@/lib/format";

export const dynamic = "force-dynamic";

const VIEW_LABEL: Record<string, string> = {
  synthese: "Synthèse",
  chantier: "Chantiers",
  fx: "Frais généraux",
};

export default async function ComptePage({
  params,
}: {
  params: Promise<{ account: string }>;
}) {
  const { account } = await params;
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const data = await getAccountDetail(entity, account);
  if (!data) notFound();

  const monthsWithData = data.months.filter((m) => data.monthly[m]);

  return (
    <>
      <AppHeader active="comptes" fiscalYearStart={data.fiscalYearStart} />
      <div className="page">
        <div className="page-header">
          <div className="page-header-row">
            <h1>
              {data.account} · {data.label}
            </h1>
            <Link href="/comptes" className="btn">
              ← Tous les comptes
            </Link>
          </div>
          <p>
            Exercice {data.fiscalYearStart}/{data.fiscalYearStart + 1} · cumul{" "}
            {fmtEur(data.total)}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {data.postes.map((p) => (
            <span key={p.view} className={`tag ${p.label ? "blue" : "gray"}`}>
              {VIEW_LABEL[p.view]} :{" "}
              {p.label ?? "non mappé"}
            </span>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-label">Montants mensuels · balance ventilée</div>
          <div className="table-wrap">
            <table className="ct">
              <thead>
                <tr>
                  {monthsWithData.map((m) => (
                    <th key={m}>{monthLabel(m)}</th>
                  ))}
                  <th>Cumul</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {monthsWithData.map((m) => {
                    const v = data.monthly[m] ?? 0;
                    return (
                      <td key={m} className={v < 0 ? "neg" : ""}>
                        {fmtEur(v)}
                      </td>
                    );
                  })}
                  <td className={data.total < 0 ? "neg" : ""} style={{ fontWeight: 500 }}>
                    {fmtEur(data.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {monthsWithData.length === 0 && (
            <p className="muted" style={{ fontSize: 12 }}>
              Aucun mouvement sur ce compte dans la balance ventilée de l&apos;exercice.
            </p>
          )}
        </div>

        <div className="card">
          <div className="card-label">
            Ventilation analytique
            {data.analytiquePeriod
              ? ` · snapshot ${monthLabelLong(data.analytiquePeriod)}`
              : ""}
          </div>
          {data.ventilation.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>
              Ce compte n&apos;est imputé à aucun centre analytique.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="ct">
                <thead>
                  <tr>
                    <th className="left">Centre</th>
                    <th className="left">Intitulé</th>
                    <th>Pôle</th>
                    <th>Nature</th>
                    <th>Débit</th>
                    <th>Crédit</th>
                    <th>Cumul exercice</th>
                    <th>Mois</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ventilation.map((v) => (
                    <tr key={v.centreCode}>
                      <td className="code-cell">{v.centreCode}</td>
                      <td className="label-cell">{v.centreLabel}</td>
                      <td className="muted">{v.pole ?? "-"}</td>
                      <td>
                        <span className={`tag ${v.kind === "chantier" ? "blue" : "gray"}`}>
                          {v.kind === "chantier" ? "chantier" : "structure"}
                        </span>
                      </td>
                      <td className={v.debit ? "" : "muted"}>
                        {v.debit ? fmtEur(v.debit) : "-"}
                      </td>
                      <td className={v.credit ? "" : "muted"}>
                        {v.credit ? fmtEur(v.credit) : "-"}
                      </td>
                      <td className={v.solde < 0 ? "neg" : ""}>{fmtEur(v.solde)}</td>
                      <td className={v.mois == null ? "muted" : v.mois < 0 ? "neg" : ""}>
                        {v.mois == null ? "-" : fmtEur(v.mois)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
            La colonne « Mois » est l&apos;écart avec le snapshot précédent du même
            exercice
            {data.prevAnalytiquePeriod
              ? ` (${monthLabelLong(data.prevAnalytiquePeriod)})`
              : " — indisponible sur le premier snapshot"}
            . C&apos;est la nature du centre (chantier ou structure) qui décide si une
            écriture alimente la vue Chantiers ou la vue Frais généraux.
          </p>
        </div>
      </div>
    </>
  );
}
