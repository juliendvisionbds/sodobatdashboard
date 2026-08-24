import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getEntityByCode, getFx, listAnalytiquePeriods } from "@/lib/finance";
import { fiscalYearOf } from "@/lib/parsers";
import { fmtEurAuto, fmtPct, monthLabelLong, splitAutoEur } from "@/lib/format";
import MonthSelect from "@/components/MonthSelect";
import FxTable from "./FxTable";

export const dynamic = "force-dynamic";

export default async function FxPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const periods = await listAnalytiquePeriods(entity.id);
  const { mois } = await searchParams;
  const period = mois && periods.includes(mois) ? mois : undefined;
  const data = await getFx(entity, { period });

  if (!data) {
    return (
      <>
        <AppHeader active="fx" />
        <div className="page">
          <div className="page-header">
            <h1>Frais généraux</h1>
            <p>Aucune balance analytique validée pour l&apos;instant.</p>
          </div>
          <div className="card" style={{ maxWidth: 520 }}>
            <div className="card-label">Pour démarrer</div>
            <p style={{ fontSize: 13, color: "var(--gray2)", marginBottom: 16 }}>
              Les frais généraux proviennent du centre analytique FX de la balance
              analytique. Importez-la pour alimenter cette vue.
            </p>
            <Link href="/imports" className="btn">Aller aux imports →</Link>
          </div>
        </div>
      </>
    );
  }

  const ratioFx = data.caReference ? (data.totalYtd / data.caReference) * 100 : null;
  const ytdSplit = splitAutoEur(data.totalYtd);
  const moisSplit = splitAutoEur(data.totalMois);

  return (
    <>
      <AppHeader active="fx" fiscalYearStart={fiscalYearOf(data.period)} />
      <div className="page">
        <div className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h1>Frais généraux — {monthLabelLong(data.period)}</h1>
            {periods.length > 0 && (
              <MonthSelect basePath="/frais-generaux" periods={periods} current={data.period} />
            )}
          </div>
          <p>
            Centre analytique FX · cumul exercice à date
            {data.prevPeriod
              ? ` · colonne « Mois » = delta vs snapshot ${monthLabelLong(data.prevPeriod)}`
              : " · premier snapshot : colonne « Mois » égale au cumul"}
          </p>
        </div>

        <div className="kpi-strip">
          <div className="kpi">
            <div className="kpi-label">Total FX cumulé (YTD)</div>
            <div className="kpi-value">
              {ytdSplit.amount}
              <span className="unit">{ytdSplit.unit}</span>
            </div>
            <div className="kpi-sub">exercice en cours</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">FX du mois</div>
            <div className="kpi-value">
              {moisSplit.amount}
              <span className="unit">{moisSplit.unit}</span>
            </div>
            <div className="kpi-sub">{monthLabelLong(data.period)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Ratio FX / CA</div>
            <div className="kpi-value" style={{ color: "var(--blue)" }}>
              {ratioFx != null ? fmtPct(ratioFx) : "—"}
            </div>
            <div className="kpi-sub">
              {data.caReference != null
                ? `CA de référence : ${fmtEurAuto(data.caReference)}`
                : "importer la balance ventilée pour les ratios"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Comptes FX non mappés</div>
            <div className="kpi-value" style={{ color: data.unmapped.length ? "var(--amber)" : "var(--green)" }}>
              {data.unmapped.length}
            </div>
            <div className="kpi-sub warn">
              {data.unmapped.length ? "à affecter dans Mapping" : "tout est affecté"}
            </div>
          </div>
        </div>

        <FxTable data={data} />
        <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
          Colonnes N-1 / N-2 : disponibles après reprise de l&apos;historique (fichiers des
          exercices précédents à importer). Négatif = produit venant en déduction
          (indemnités, refacturations).
        </p>
      </div>
    </>
  );
}

