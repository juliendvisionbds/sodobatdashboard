import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getObjectifs } from "@/lib/views";
import { getSession, canFiger, canWrite } from "@/lib/auth";
import { fmtPct, monthLabelLong, splitAutoEur } from "@/lib/format";
import { listAnalyses, listMoisAnalysables } from "@/lib/analyse-mensuelle";
import ObjectifsTable from "./ObjectifsTable";
import AnalysesMensuelles from "./AnalysesMensuelles";
import { getCurrentEntity } from "@/lib/entity";

export const dynamic = "force-dynamic";
// L'analyse mensuelle calcule puis fait rédiger le texte par l'IA : les actions
// serveur de la page ont besoin de plus que le délai par défaut.
export const maxDuration = 60;

export default async function ObjectifsPage({
  searchParams,
}: {
  searchParams: Promise<{ analyse?: string }>;
}) {
  const entity = await getCurrentEntity();
  if (!entity) return null;

  const [session, data, { analyse }] = await Promise.all([
    getSession(),
    getObjectifs(entity),
    searchParams,
  ]);
  const writer = session ? canWrite(session) : false;
  const daf = session ? canFiger(session) : false;
  const [analyses, moisAnalysables] = await Promise.all([
    listAnalyses(entity, { brouillons: daf }),
    daf ? listMoisAnalysables(entity) : Promise.resolve([]),
  ]);
  const initialPeriod = analyse && /^\d{4}-\d{2}$/.test(analyse) ? `${analyse}-01` : null;

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

  const caSplit = splitAutoEur(data.caTotal);

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
            <div className="kpi-value">
              {data.caTotal < 0 ? "−" : ""}
              {caSplit.amount}
              <span className="unit">{caSplit.unit}</span>
            </div>
            <div className="kpi-sub">base de tous les ratios</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Total de contrôle</div>
            <div className="kpi-value" style={{ color: "var(--brand)" }}>
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

        <AnalysesMensuelles
          analyses={analyses}
          moisAnalysables={moisAnalysables}
          canEdit={daf}
          initialPeriod={initialPeriod}
        />
      </div>
    </>
  );
}
