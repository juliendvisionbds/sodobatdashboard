import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getEntityByCode, getFx } from "@/lib/finance";
import { fiscalYearOf } from "@/lib/parsers";
import { fmtEur, fmtKEur, fmtPct, monthLabelLong } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FxPage() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;
  const data = await getFx(entity);

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

  return (
    <>
      <AppHeader active="fx" fiscalYearStart={fiscalYearOf(data.period)} />
      <div className="page">
        <div className="page-header">
          <h1>Frais généraux — {monthLabelLong(data.period)}</h1>
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
              {Math.round(data.totalYtd / 1000).toLocaleString("fr-FR")}
              <span className="unit">k€</span>
            </div>
            <div className="kpi-sub">exercice en cours</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">FX du mois</div>
            <div className="kpi-value">
              {Math.round(data.totalMois / 1000).toLocaleString("fr-FR")}
              <span className="unit">k€</span>
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
                ? `CA de référence : ${fmtKEur(data.caReference)}`
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

        <div className="table-wrap">
          <table className="ct">
            <thead>
              <tr>
                <th className="left">Comptes</th>
                <th className="left">Libellé</th>
                <th>Mois</th>
                <th>N YTD (€)</th>
                <th>% / CA</th>
                <th>N-1</th>
                <th>N-2</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((section) => (
                <FxSection key={section.name} section={section} caRef={data.caReference} />
              ))}
              <tr className="total-row">
                <td className="left">—</td>
                <td className="label-cell">TOTAL FRAIS GÉNÉRAUX</td>
                <td>{fmtEur(data.totalMois)}</td>
                <td>{fmtEur(data.totalYtd)}</td>
                <td>{fmtPct(ratioFx)}</td>
                <td className="muted">—</td>
                <td className="muted">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
          Colonnes N-1 / N-2 : disponibles après reprise de l&apos;historique (fichiers des
          exercices précédents à importer). Négatif = produit venant en déduction
          (indemnités, refacturations).
        </p>
      </div>
    </>
  );
}

function FxSection({
  section,
  caRef,
}: {
  section: {
    name: string;
    rows: {
      category: { code: string; label: string; notes: string | null };
      ytd: number;
      mois: number;
      pctCa: number | null;
      accounts: { account: string; label: string; ytd: number }[];
    }[];
    subtotal: { ytd: number; mois: number };
  };
  caRef: number | null;
}) {
  if (section.rows.length === 0) return null;
  return (
    <>
      <tr className="section-row">
        <td colSpan={7}>{section.name}</td>
      </tr>
      {section.rows.map((r) => (
        <tr key={r.category.code}>
          <td className="code-cell" title={r.accounts.map((a) => `${a.account} ${a.label}`).join("\n")}>
            {r.accounts.slice(0, 3).map((a) => a.account).join(", ")}
            {r.accounts.length > 3 ? "…" : ""}
          </td>
          <td className="label-cell" title={r.category.notes ?? undefined}>
            {r.category.label}
          </td>
          <td className={r.mois < 0 ? "neg" : ""}>{r.mois === 0 ? "—" : fmtEur(r.mois)}</td>
          <td className={r.ytd < 0 ? "neg" : ""} style={{ fontWeight: 500 }}>
            {fmtEur(r.ytd)}
          </td>
          <td className="muted">{fmtPct(r.pctCa)}</td>
          <td className="muted">—</td>
          <td className="muted">—</td>
        </tr>
      ))}
      <tr className="subtotal-row">
        <td className="code-cell">—</td>
        <td className="label-cell">TOTAL {section.name}</td>
        <td>{fmtEur(section.subtotal.mois)}</td>
        <td>{fmtEur(section.subtotal.ytd)}</td>
        <td>{fmtPct(caRef ? (section.subtotal.ytd / caRef) * 100 : null)}</td>
        <td className="muted">—</td>
        <td className="muted">—</td>
      </tr>
    </>
  );
}
