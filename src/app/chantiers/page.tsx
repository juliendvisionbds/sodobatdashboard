import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getChantiers, getEntityByCode, listAnalytiquePeriods } from "@/lib/views";
import { getSession, canFiger, canSaisir } from "@/lib/auth";
import { fiscalYearOf } from "@/lib/parsers";
import { fmtEurAuto, monthLabelLong } from "@/lib/format";
import MonthSelect from "@/components/MonthSelect";
import ChantiersTable from "./ChantiersTable";
import { CHANTIER_CODES } from "@/lib/nomenclature/codes";

export const dynamic = "force-dynamic";

export default async function ChantiersPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const [periods, { mois }, session] = await Promise.all([
    listAnalytiquePeriods(entity),
    searchParams,
    getSession(),
  ]);
  const period = mois && periods.includes(mois) ? mois : undefined;
  const data = await getChantiers(entity, { period });
  // Saisies (prévision TEC, notes) réservées au dernier mois : un mois passé est consultable
  // mais figé, on ne réécrit pas l'histoire d'une période déjà clôturée. L'entité
  // saisit (rôle saisie), la DAF fige.
  const isLatestPeriod = !data || data.period === periods[0];
  const writer = !!session && canSaisir(session) && isLatestPeriod;
  const freezer = !!session && canFiger(session) && isLatestPeriod;

  if (!data) {
    return (
      <>
        <AppHeader active="chantiers" />
        <div className="page">
          <div className="page-header">
            <h1>Activité chantier</h1>
            <p>Aucune balance analytique validée pour l&apos;instant.</p>
          </div>
          <div className="card" style={{ maxWidth: 520 }}>
            <div className="card-label">Pour démarrer</div>
            <p style={{ fontSize: 13, color: "var(--gray2)", marginBottom: 16 }}>
              Importez la balance analytique mensuelle (export Cegid par centre) : la vue
              chantiers se lit dans la balance de chaque mois.
            </p>
            <Link href="/imports" className="btn">Aller aux imports →</Link>
          </div>
        </div>
      </>
    );
  }

  const activeRows = data.rows.filter((r) => r.mouvemente);
  const totalProduits = data.totals[CHANTIER_CODES.caTotal] ?? 0;
  const resultat = data.totals[CHANTIER_CODES.resultat] ?? 0;

  return (
    <>
      <AppHeader active="chantiers" fiscalYearStart={fiscalYearOf(data.period)} />
      <div className="page">
        <div className="page-header">
          <div className="page-header-row">
            <h1>Chantiers · {monthLabelLong(data.period)}</h1>
            {periods.length > 0 && (
              <MonthSelect basePath="/chantiers" periods={periods} current={data.period} />
            )}
          </div>
          <p>
            Activité du mois : mouvements de la balance analytique de{" "}
            {monthLabelLong(data.period)}
            {data.prevPeriod
              ? ` · reports de cumul arrêtés à ${monthLabelLong(data.prevPeriod)}`
              : " · premier mois importé, aucun report de cumul"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <span className={`tag ${totalProduits >= 0 ? "blue" : "red"}`}>
            CA HT total : {fmtEurAuto(totalProduits)}
          </span>
          <span className={`tag ${resultat >= 0 ? "green" : "red"}`}>
            Résultat : {resultat >= 0 ? "+" : ""}{fmtEurAuto(resultat)}
          </span>
          <span className="tag gray">{activeRows.length} chantiers avec activité</span>
          {!isLatestPeriod && <span className="tag gray">mois passé · lecture seule</span>}
        </div>

        <ChantiersTable
          lines={data.lines}
          rows={data.rows}
          totals={data.totals}
          poles={data.poles}
          period={data.period}
          canEdit={writer}
          canFreeze={freezer}
        />
        <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
          Résultat chantier = CA HT total − charges d&apos;exploitation − charges de
          personnel affectées. Les centres de structure (FX, siège) sont exclus : voir
          Frais généraux. La ligne Prévision (TEC) et la note se saisissent sur le dernier
          mois importé ; le statut brouillon / figé est du ressort de la DAF.
        </p>
      </div>
    </>
  );
}
