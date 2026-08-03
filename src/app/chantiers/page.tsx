import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getChantiers, getEntityByCode } from "@/lib/finance";
import { getSession, canWrite } from "@/lib/auth";
import { fiscalYearOf } from "@/lib/parsers";
import { fmtKEur, monthLabelLong } from "@/lib/format";
import ChantiersTable from "./ChantiersTable";

export const dynamic = "force-dynamic";

export default async function ChantiersPage() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;
  const data = await getChantiers(entity);
  const session = await getSession();
  const writer = session ? canWrite(session) : false;

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
              chantiers est calculée à partir des snapshots mensuels.
            </p>
            <Link href="/imports" className="btn">Aller aux imports →</Link>
          </div>
        </div>
      </>
    );
  }

  const activeRows = data.rows.filter(
    (r) => r.totalProduits !== 0 || r.achatsMp !== 0 || r.sousTraitance !== 0 || r.autresCharges !== 0
  );

  return (
    <>
      <AppHeader active="chantiers" fiscalYearStart={fiscalYearOf(data.period)} />
      <div className="page">
        <div className="page-header">
          <h1>Chantiers — {monthLabelLong(data.period)}</h1>
          <p>
            {data.prevPeriod
              ? `Activité du mois : delta entre les snapshots analytiques ${monthLabelLong(data.prevPeriod)} → ${monthLabelLong(data.period)}`
              : "Premier snapshot analytique importé : montants en cumul depuis le début de l'exercice"}
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <span className="tag blue">Total produits : {fmtKEur(data.totals.totalProduits)}</span>
          <span className={`tag ${data.totals.resultat >= 0 ? "green" : "red"}`}>
            Résultat : {data.totals.resultat >= 0 ? "+" : ""}{fmtKEur(data.totals.resultat)}
          </span>
          <span className="tag gray">{activeRows.length} chantiers avec activité</span>
          {!data.prevPeriod && <span className="tag amber">cumul (pas de snapshot M-1)</span>}
        </div>

        <ChantiersTable
          rows={data.rows}
          totals={data.totals}
          poles={data.poles}
          period={data.period}
          canEdit={writer}
        />
        <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
          Résultat = total produits − charges directes affectées au chantier. Frais
          généraux (centre FX) exclus de cette vue. La colonne Prévision est éditable
          (brouillon 🟡 puis figé) par la DAF.
        </p>
      </div>
    </>
  );
}
