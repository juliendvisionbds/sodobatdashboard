import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import AppHeader from "@/components/AppHeader";
import { getEntityByCode, getSynthese, SyntheseData } from "@/lib/finance";
import { fmtEur, fmtEurAuto, fmtPct, monthLabel, monthLabelLong, splitAutoEur } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SynthesePage() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;
  const data = await getSynthese(entity);

  if (!data) {
    return (
      <>
        <AppHeader active="synthese" />
        <div className="page">
          <div className="page-header">
            <h1>Synthèse</h1>
            <p>Aucune balance ventilée validée pour l&apos;instant.</p>
          </div>
          <div className="card" style={{ maxWidth: 520 }}>
            <div className="card-label">Pour démarrer</div>
            <p style={{ fontSize: 13, color: "var(--gray2)", marginBottom: 16 }}>
              Importez la balance ventilée mensuelle (export Cegid) : la synthèse, les
              ratios et les alertes seront calculés automatiquement.
            </p>
            <Link href="/imports" className="btn">Aller aux imports →</Link>
          </div>
        </div>
      </>
    );
  }

  const openAlerts = await db
    .select()
    .from(tables.alerts)
    .where(and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "open")))
    .orderBy(desc(tables.alerts.severity), desc(tables.alerts.createdAt))
    .limit(6);

  const shown = data.monthsWithData;
  const nbMois = shown.length;
  const caByMonth = shown.map((m) => ({ m, v: data.caTotal.monthly[m] ?? 0 }));
  const maxCa = Math.max(...caByMonth.map((x) => Math.abs(x.v)), 1);
  const resByMonth = shown.slice(-6).map((m) => ({
    m,
    v: data.resultatNet.monthly[m] ?? 0,
    ca: data.caTotal.monthly[m] ?? 0,
  }));

  // top charges pour la carte structure (catégories charges, triées)
  const chargeRows = data.sections
    .filter((s) => s.name !== "PRODUITS / CA")
    .flatMap((s) => s.rows)
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const palette = ["var(--blue)", "#5B8DEF", "#8AAEF5", "var(--gray3)", "var(--gray4)", "var(--gray4)"];

  const pctExpl =
    data.caTotal.total !== 0
      ? (data.resultatExploitation.total / data.caTotal.total) * 100
      : null;
  const pctNet =
    data.caTotal.total !== 0 ? (data.resultatNet.total / data.caTotal.total) * 100 : null;
  const st = data.sections
    .flatMap((s) => s.rows)
    .filter((r) => r.category.code.startsWith("syn_st_"))
    .reduce((s, r) => s + r.total, 0);
  const personnel = data.totalChargesPersonnel.total;

  const caSplit = splitAutoEur(data.caTotal.total);
  const expSplit = splitAutoEur(data.resultatExploitation.total);
  const netSplit = splitAutoEur(data.resultatNet.total);
  const fgPctCa = (data.totalFx.total / (data.caTotal.total || 1)) * 100;

  return (
    <>
      <AppHeader active="synthese" fiscalYearStart={data.fiscalYearStart} />
      <div className="page">
        <div className="page-header">
          <h1>Résultats cumulés — {nbMois} mois</h1>
          <p>
            Données issues de la balance Cegid · {monthLabelLong(shown[0])} →{" "}
            {monthLabelLong(shown[nbMois - 1])}
          </p>
        </div>

        <div className="kpi-strip">
          <div className="kpi">
            <div className="kpi-label">CA cumulé</div>
            <div className="kpi-value">
              {caSplit.amount}
              <span className="unit">{caSplit.unit}</span>
            </div>
            <div className="kpi-sub">
              {data.hasPrevYear && data.prevCaTotal
                ? `N-1 : ${fmtEurAuto(data.prevCaTotal)}`
                : "historique N-1 non importé"}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Résultat d&apos;exploitation</div>
            <div
              className="kpi-value"
              style={{ color: data.resultatExploitation.total >= 0 ? "var(--green)" : "var(--red)" }}
            >
              {data.resultatExploitation.total >= 0 ? "+" : "−"}
              {expSplit.amount}
              <span className="unit">{expSplit.unit}</span>
            </div>
            <div className={`kpi-sub ${(pctExpl ?? 0) >= 0 ? "pos" : "neg"}`}>
              {fmtPct(pctExpl)} du CA
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Résultat net</div>
            <div
              className="kpi-value"
              style={{ color: data.resultatNet.total >= 0 ? "var(--green)" : "var(--red)" }}
            >
              {data.resultatNet.total >= 0 ? "+" : "−"}
              {netSplit.amount}
              <span className="unit">{netSplit.unit}</span>
            </div>
            <div className={`kpi-sub ${data.resultatNet.total >= 0 ? "pos" : "neg"}`}>
              {fmtPct(pctNet)} du CA
            </div>
            <div className="kpi-sub-2">
              Frais généraux : {fmtEurAuto(data.totalFx.total)} · {fmtPct(fgPctCa)} du CA
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Alertes ouvertes</div>
            <div className="kpi-value" style={{ color: openAlerts.length ? "var(--amber)" : "var(--green)" }}>
              {openAlerts.length}
            </div>
            <div className="kpi-sub warn">
              {data.unmapped.length} compte(s) non mappé(s)
            </div>
          </div>
        </div>

        <div className="grid-3-2">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card">
              <div className="card-label">CA mensuel — exercice en cours</div>
              <div>
                {caByMonth.map(({ m, v }) => (
                  <div className="ca-row" key={m}>
                    <div className="ca-month">{monthLabel(m)}</div>
                    <div className="ca-bar-wrap">
                      {v !== 0 && (
                        <div
                          className="ca-bar"
                          style={{
                            width: `${Math.round((Math.abs(v) / maxCa) * 100)}%`,
                            background: v >= 0 ? "var(--blue)" : "var(--red)",
                          }}
                        />
                      )}
                    </div>
                    <div className={`ca-value ${v > 0 ? "pos" : "muted"}`}>
                      {v !== 0 ? fmtEurAuto(v) : "n.d."}
                    </div>
                  </div>
                ))}
              </div>
              <div className="ind-row">
                <div className="ind">
                  <div className="ind-label">Sous-trait. / CA</div>
                  <div className="ind-val">
                    {fmtPct(data.caTotal.total ? (st / data.caTotal.total) * 100 : null)}
                  </div>
                  <div className="ind-sub">{fmtEurAuto(st)}</div>
                </div>
                <div className="ind">
                  <div className="ind-label">Personnel / CA</div>
                  <div className="ind-val">
                    {fmtPct(data.caTotal.total ? (personnel / data.caTotal.total) * 100 : null)}
                  </div>
                  <div className="ind-sub">{fmtEurAuto(personnel)}</div>
                </div>
                <div className="ind">
                  <div className="ind-label">Exploit. / CA</div>
                  <div className="ind-val" style={{ color: (pctExpl ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                    {fmtPct(pctExpl)}
                  </div>
                  <div className="ind-sub">{fmtEurAuto(data.resultatExploitation.total)}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-label">Résultat net mensuel</div>
              <div className="result-row-months">
                {resByMonth.map(({ m, v, ca }, i) => (
                  <div className={`rm${i === resByMonth.length - 1 ? " highlight" : ""}`} key={m}>
                    <div className="rm-label">{monthLabel(m)}</div>
                    <div
                      className={`rm-val ${
                        i === resByMonth.length - 1 ? "blue" : v > 0 ? "pos" : v < 0 ? "neg" : ""
                      }`}
                    >
                      {v === 0 ? "—" : `${v > 0 ? "+" : "−"}${fmtEurAuto(Math.abs(v))}`}
                    </div>
                    <div className="rm-pct">
                      {ca !== 0 ? fmtPct((v / ca) * 100) : "n.d."}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card">
              <div className="card-label">Structure des charges — cumulé</div>
              {chargeRows.map((r, i) => (
                <div className="charge-row" key={r.category.code}>
                  <div className="charge-left">
                    <div className="charge-bar" style={{ background: palette[i] }} />
                    <div>
                      <div className="charge-name">{r.category.label}</div>
                      <div className="charge-code">{r.category.section}</div>
                    </div>
                  </div>
                  <div className="charge-right">
                    <div className="charge-amt">{fmtEurAuto(r.total)}</div>
                    <div className="charge-pct">{fmtPct(r.pctCa)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-label">Alertes cohérence</div>
              {openAlerts.length === 0 && (
                <div className="alert pos">
                  <div className="alert-ico">✓</div>
                  <div>
                    <div className="alert-title">Aucune alerte ouverte</div>
                    <div className="alert-desc">Tous les contrôles sont au vert.</div>
                  </div>
                </div>
              )}
              {openAlerts.map((a) => (
                <div key={a.id} className={`alert ${a.severity === "error" ? "neg" : "warn"}`}>
                  <div className="alert-ico">⚠</div>
                  <div>
                    <div className="alert-title">{a.title}</div>
                    <div className="alert-desc">{a.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <SyntheseTable data={data} />
      </div>
    </>
  );
}

function SyntheseTable({ data }: { data: SyntheseData }) {
  const months = data.monthsWithData;
  const fmtCell = (v: number) =>
    v === 0 ? <span className="muted">—</span> : fmtEur(v);

  const totalLine = (
    label: string,
    rec: { monthly: Record<string, number>; total: number },
    opts?: { invert?: boolean }
  ) => (
    <tr className="total-row" key={label}>
      <td className="code-cell">—</td>
      <td className="label-cell">{label}</td>
      {months.map((m) => {
        const v = rec.monthly[m] ?? 0;
        return (
          <td key={m} className={v > 0 !== !!opts?.invert ? "" : v !== 0 ? "neg" : "muted"}>
            {fmtCell(v)}
          </td>
        );
      })}
      <td>{fmtEur(rec.total)}</td>
      <td>{fmtPct(data.caTotal.total ? (rec.total / data.caTotal.total) * 100 : null)}</td>
      <td className="muted">—</td>
    </tr>
  );

  return (
    <div style={{ marginTop: 32 }}>
      <div className="card-label" style={{ border: "none", padding: 0, marginBottom: 12 }}>
        Tableau de synthèse — détail par catégorie
      </div>
      <div className="table-wrap">
        <table className="ct">
          <thead>
            <tr>
              <th className="left">Section</th>
              <th className="left">Libellé</th>
              {months.map((m) => (
                <th key={m}>{monthLabel(m)}</th>
              ))}
              <th>Total exercice</th>
              <th>% / CA</th>
              <th>N-1</th>
            </tr>
          </thead>
          <tbody>
            {data.sections.map((section) => (
              <SectionRows key={section.name} section={section} data={data} />
            ))}
            {totalLine("RÉSULTAT D'EXPLOITATION", data.resultatExploitation)}
            {totalLine("RÉSULTAT NET", data.resultatNet)}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 10, fontSize: 11, color: "var(--gray3)" }}>
        Chiffres recalculés à la volée depuis les lignes de balance importées (aucun
        agrégat stocké). Résultat net = CA − charges d&apos;exploitation − personnel −
        frais généraux &amp; autres charges.
      </p>
    </div>
  );
}

function SectionRows({
  section,
  data,
}: {
  section: SyntheseData["sections"][number];
  data: SyntheseData;
}) {
  const months = data.monthsWithData;
  const isProduits = section.name === "PRODUITS / CA";
  const visibleRows = section.rows.filter((r) => r.total !== 0 || (r.prevTotal ?? 0) !== 0);

  return (
    <>
      <tr className="section-row">
        <td colSpan={months.length + 5}>{section.name}</td>
      </tr>
      {visibleRows.map((r) => (
        <tr key={r.category.code}>
          <td className="code-cell">{r.category.section}</td>
          <td className="label-cell" title={r.category.notes ?? undefined}>
            {r.category.label}
          </td>
          {months.map((m) => {
            const v = r.monthly[m] ?? 0;
            return (
              <td key={m} className={v === 0 ? "muted" : v < 0 ? "neg" : ""}>
                {v === 0 ? "—" : fmtEur(v)}
              </td>
            );
          })}
          <td style={{ fontWeight: 500 }}>{fmtEur(r.total)}</td>
          <td className="muted">{fmtPct(r.pctCa)}</td>
          <td className="muted">{r.prevTotal != null ? fmtEur(r.prevTotal) : "—"}</td>
        </tr>
      ))}
      <tr className="subtotal-row">
        <td className="code-cell">—</td>
        <td className="label-cell">
          {isProduits ? "CA TOTAL" : `TOTAL ${section.name}`}
        </td>
        {months.map((m) => (
          <td key={m}>{fmtEur(section.subtotal.monthly[m] ?? 0)}</td>
        ))}
        <td>{fmtEur(section.subtotal.total)}</td>
        <td>
          {fmtPct(
            data.caTotal.total ? (section.subtotal.total / data.caTotal.total) * 100 : null
          )}
        </td>
        <td className="muted">—</td>
      </tr>
    </>
  );
}
