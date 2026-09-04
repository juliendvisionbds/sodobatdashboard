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

  const caN = data.caReference.n;
  const ratioFx = caN ? (data.totalYtd / caN) * 100 : null;
  const ytdSplit = splitAutoEur(data.totalYtd);
  const moisSplit = splitAutoEur(data.totalMois);

  return (
    <>
      <AppHeader active="fx" fiscalYearStart={fiscalYearOf(data.period)} />
      <div className="page">
        <div className="page-header">
          <div className="page-header-row">
            <h1>Frais généraux · {monthLabelLong(data.period)}</h1>
            {periods.length > 0 && (
              <MonthSelect basePath="/frais-generaux" periods={periods} current={data.period} />
            )}
          </div>
          <p>
            Centres de structure (FX, dépôt, siège) · cumul exercice à date ·{" "}
            {data.nbMois} mois écoulés
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
              {ratioFx != null ? fmtPct(ratioFx) : "-"}
            </div>
            <div className="kpi-sub">
              {caN != null
                ? `CA de référence : ${fmtEurAuto(caN)}`
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
          Négatif = produit venant en déduction (indemnités, refacturations). Les
          comptes partagés avec les chantiers (carburant, entretien, locations) ne
          sont comptés ici que pour leur part imputée à un centre de structure.
        </p>
      </div>
    </>
  );
}

