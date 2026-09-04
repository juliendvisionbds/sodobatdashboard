import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getEntityByCode, getObjectifs } from "@/lib/finance";
import { getSession, canWrite } from "@/lib/auth";
import { fmtEurAuto, fmtPct, monthLabelLong } from "@/lib/format";
import ObjectifsTable from "./ObjectifsTable";

export const dynamic = "force-dynamic";

export default async function ObjectifsPage() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const session = await getSession();
  const writer = session ? canWrite(session) : false;
  const data = await getObjectifs(entity);

  if (!data) {
    return (
      <>
        <AppHeader active="objectifs" />
        <div className="page">
          <div className="page-header">
            <h1>Objectifs Dirigeant</h1>
            <p>Aucune balance ventilée validée pour l&apos;instant.</p>
          </div>
          <div className="card" style={{ maxWidth: 520 }}>
            <div className="card-label">Pour démarrer</div>
            <p style={{ fontSize: 13, color: "var(--gray2)", marginBottom: 16 }}>
              Les objectifs se comparent au réalisé, qui provient de la balance
              ventilée. Importez-la pour alimenter cette vue.
            </p>
            <Link href="/imports" className="btn">
              Aller aux imports →
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader active="objectifs" fiscalYearStart={data.fiscalYearStart} />
      <div className="page">
        <div className="page-header">
          <h1>Objectifs Dirigeant · {monthLabelLong(data.period)}</h1>
          <p>
            Réalisé cumulé de l&apos;exercice comparé aux objectifs annuels, en % du CA.
            Le réalisé reprend les ratios des vues Synthèse et Frais généraux : aucun
            calcul indépendant, aucun mapping dupliqué.
          </p>
        </div>

        <div className="kpi-strip">
          <div className="kpi">
            <div className="kpi-label">CA de référence</div>
            <div className="kpi-value">{fmtEurAuto(data.caTotal)}</div>
            <div className="kpi-sub">base de tous les ratios</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Total de contrôle</div>
            <div className="kpi-value" style={{ color: "var(--blue)" }}>
              {fmtPct(data.totalControle)}
            </div>
            <div className="kpi-sub">somme des indicateurs suivis · cible ≈ 100 %</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Charges directes / CA</div>
            <div className="kpi-value">{fmtPct(data.chargesDirectes)}</div>
            <div className="kpi-sub">exploitation + personnel</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Marge d&apos;exploitation</div>
            <div
              className="kpi-value"
              style={{
                color:
                  (data.margeExploitation ?? 0) >= 0 ? "var(--green)" : "var(--red)",
              }}
            >
              {fmtPct(data.margeExploitation)}
            </div>
            <div className="kpi-sub">résultat d&apos;exploitation en % du CA</div>
          </div>
        </div>

        <ObjectifsTable data={data} canEdit={writer} />
      </div>
    </>
  );
}
