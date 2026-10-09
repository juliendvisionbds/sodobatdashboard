import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import AppHeader from "@/components/AppHeader";
import { getSynthese, listVentileePeriods } from "@/lib/views";
import { getNotesEntite, listValidatedMonths } from "@/lib/finance";
import { canSaisir, getSession, ownsEntity } from "@/lib/auth";
import { VIDE, fmtEur, fmtEurAuto, fmtPct, monthLabel, monthLabelLong, splitAutoEur } from "@/lib/format";
import MonthSelect from "@/components/MonthSelect";
import { currentFiscalCutoff, splitAlerts } from "@/lib/alerts";
import SyntheseTable from "./SyntheseTable";
import { getCurrentEntity } from "@/lib/entity";

export const dynamic = "force-dynamic";

/** Hauteur, en pixels, de la plus haute barre du CA mensuel. */
const BAR_HEIGHT = 180;
/** Hauteur partagée entre bénéfices et pertes du résultat net mensuel, et marge de chaque côté de l'axe. */
const NET_HEIGHT = 132;
const NET_MARGIN = 12;
/** Alertes listées sur la Synthèse ; les suivantes se lisent dans l'écran Alertes. */
const ALERTES_AFFICHEES = 5;

const ANOMALIES: Record<string, string> = {
  compte_non_mappe: "Compte non mappé",
  ecart_controle: "Écart de contrôle",
  mois_sans_donnees: "Mois sans données",
  montant_constant: "Montant fixe",
  centre_import_ascii: "Centre à corriger",
};

type AlerteLue = { type: string; title: string; account: string | null };

/** Le titre d'une alerte répète le compte et l'anomalie, qui ont ici leur colonne. */
function alertLabel(a: AlerteLue): string {
  const sansCompte = a.account ? a.title.split(`${a.account} · `).pop()! : a.title;
  return sansCompte.replace(/ : montant fixe sur \d+\+ mois$/, "");
}

function anomalie(a: AlerteLue): string {
  const mois = a.type === "montant_constant" ? a.title.match(/sur (\d+\+) mois$/) : null;
  return mois ? `Fixe ${mois[1]} mois` : (ANOMALIES[a.type] ?? a.type);
}

/** Étiquette d'une barre : « 1,44 » au-delà du million (en M€), « 711 k » en dessous. */
function barLabel(v: number): string {
  if (v === 0) return VIDE;
  const abs = Math.abs(v);
  const text = abs >= 1_000_000 ? (abs / 1_000_000).toFixed(2).replace(".", ",") : `${Math.round(abs / 1000)} k`;
  return `${v < 0 ? "−" : ""}${text}`;
}

const signedPct = (n: number) => `${n > 0 ? "+" : ""}${fmtPct(n)}`;
const meterWidth = (pct: number) => Math.min(100, Math.max(0, pct)).toFixed(1);

export default async function SynthesePage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const entity = await getCurrentEntity();
  if (!entity) return null;

  const [periods, { mois }] = await Promise.all([listVentileePeriods(entity), searchParams]);
  const period = mois && periods.includes(mois) ? mois : undefined;
  const [data, allOpenAlerts, cutoff] = await Promise.all([
    getSynthese(entity, { period }),
    db
      .select()
      .from(tables.alerts)
      .where(and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "open")))
      .orderBy(desc(tables.alerts.severity), desc(tables.alerts.createdAt)),
    currentFiscalCutoff(entity),
  ]);
  // Les alertes des exercices clos (imports annuels) restent hors du compteur.
  const openAlerts = splitAlerts(allOpenAlerts, cutoff).current;
  const isLatestPeriod = !data || data.period === periods[0];

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
              Importez la balance ventilée mensuelle (export Cegid ou Pennylane) : la synthèse, les
              ratios et les alertes seront calculés automatiquement.
            </p>
            <Link href="/imports" className="btn">Aller aux imports →</Link>
          </div>
        </div>
      </>
    );
  }

  // La note mensuelle et le verrou des mois validés changent à chaque saisie :
  // lus en direct, hors du cache des vues.
  const [session, notes, validatedMonths] = await Promise.all([
    getSession(),
    getNotesEntite(entity.id, data.months),
    listValidatedMonths(entity.id),
  ]);
  const canEditNotes = !!session && canSaisir(session) && ownsEntity(session, entity.id);

  const shown = data.monthsWithData;
  const nbMois = shown.length;
  const ca = data.caTotal.total;
  const caByMonth = shown.map((m) => ({ m, v: data.caTotal.monthly[m] ?? 0 }));
  const maxCa = Math.max(...caByMonth.map((x) => Math.abs(x.v)), 1);
  const avgCa = nbMois ? ca / nbMois : 0;
  const resByMonth = shown.slice(-6).map((m) => ({
    m,
    v: data.resultatNet.monthly[m] ?? 0,
    ca: data.caTotal.monthly[m] ?? 0,
  }));
  // Barres divergentes : la hauteur disponible se partage entre bénéfices et
  // pertes au prorata de leurs plus grandes valeurs.
  const maxGain = Math.max(...resByMonth.map((x) => x.v), 0);
  const maxLoss = Math.max(...resByMonth.map((x) => -x.v), 0);
  const netScale = NET_HEIGHT / (maxGain + maxLoss || 1);

  // top charges pour la carte structure : postes de charge uniquement, triés
  // (les totaux et ratios de la nomenclature ne sont pas des postes de dépense)
  const chargeRows = data.sections
    .filter((s) => s.name !== "PRODUITS / CA")
    .flatMap((s) => s.rows)
    .filter((r) => r.category.kind === "poste" && (r.total ?? 0) > 0)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 6);
  const maxChargePct = Math.max(...chargeRows.map((r) => r.pctCa ?? 0), 1);

  const pctOfCa = (v: number) => (ca !== 0 ? (v / ca) * 100 : null);
  const pctExpl = pctOfCa(data.resultatExploitation.total);
  const pctNet = pctOfCa(data.resultatNet.total);
  const st = data.byCode["syn_st_sous_traitance"]?.total ?? 0;
  const personnel = data.totalChargesPersonnel.total;
  const ratios = [
    { label: "Sous-traitance / CA", amount: st, pct: pctOfCa(st), tone: "" },
    { label: "Personnel / CA", amount: personnel, pct: pctOfCa(personnel), tone: "" },
    {
      label: "Exploitation / CA",
      amount: data.resultatExploitation.total,
      pct: pctExpl,
      tone: (pctExpl ?? 0) >= 0 ? "pos" : "neg",
    },
  ];

  const caSplit = splitAutoEur(ca);
  const expSplit = splitAutoEur(data.resultatExploitation.total);
  const netSplit = splitAutoEur(data.resultatNet.total);
  // Le CA N-1 n'est comparable que s'il est arrêté au même rang de mois.
  const prevCa = data.hasPrevYear && data.prevCaTotal ? data.prevCaTotal : null;
  const caVsPrev = prevCa ? ((ca - prevCa) / Math.abs(prevCa)) * 100 : null;
  const nbUnmapped = data.unmapped.length;

  return (
    <>
      <AppHeader active="synthese" fiscalYearStart={data.fiscalYearStart} />
      <div className="page">
        <div className="page-top">
          <div className="page-header">
            <h1>Résultats cumulés</h1>
            <p>
              {nbMois} mois · {monthLabelLong(shown[0]).toLowerCase()} →{" "}
              {monthLabelLong(shown[nbMois - 1]).toLowerCase()} · source : balance générale
              {!isLatestPeriod && " · chiffres à jour des dernières révisions"}
            </p>
          </div>
          {periods.length > 0 && (
            <div className="page-actions">
              <MonthSelect basePath="/" periods={periods} current={data.period} prefix="Arrêté à" large />
            </div>
          )}
        </div>

        <div className="kpi-strip">
          <div className="kpi">
            <div className="kpi-label">Chiffre d&apos;affaires cumulé</div>
            <div className="kpi-value" style={ca < 0 ? { color: "var(--red)" } : undefined}>
              {ca < 0 ? "−" : ""}
              {caSplit.amount}
              <span className="unit">{caSplit.unit}</span>
            </div>
            <div className="kpi-sub">
              {caVsPrev != null && (
                <span className={`tag ${caVsPrev >= 0 ? "green" : "red"}`}>{signedPct(caVsPrev)}</span>
              )}
              <span>
                {prevCa
                  ? `vs N-1 : ${fmtEurAuto(prevCa)}`
                  : data.prevYearAnnual && data.prevCaTotalFull
                    ? `N-1, exercice entier : ${fmtEurAuto(data.prevCaTotalFull)}`
                    : "historique N-1 non importé"}
              </span>
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
            <div className="kpi-sub">
              <span className={`tag ${(pctExpl ?? 0) >= 0 ? "green" : "red"}`}>{fmtPct(pctExpl)}</span>
              <span>du CA</span>
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
            <div className="kpi-sub">
              <span className={`tag ${(pctNet ?? 0) >= 0 ? "green" : "red"}`}>{fmtPct(pctNet)}</span>
              <span>dont frais généraux {fmtEurAuto(data.totalFx.total)}</span>
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Alertes ouvertes</div>
            <div className="kpi-value" style={{ color: openAlerts.length ? "var(--amber)" : "var(--green)" }}>
              {openAlerts.length}
            </div>
            <div className="kpi-sub">
              <span className={`tag ${nbUnmapped ? "amber" : "gray"}`}>
                {nbUnmapped} non mappé{nbUnmapped > 1 ? "s" : ""}
              </span>
              <span>{nbUnmapped ? "à affecter dans Mapping" : "comptes tous affectés"}</span>
            </div>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-title-row">
              <div className="card-label">Chiffre d&apos;affaires mensuel</div>
              <div className="card-aside">
                Moyenne <b>{fmtEurAuto(avgCa)}</b> / mois
              </div>
            </div>
            <div className="chart-box">
              <div
                className={`bar-chart${nbMois > 9 ? " dense" : ""}`}
                style={{ "--n": nbMois } as React.CSSProperties}
              >
                {avgCa > 0 && (
                  <div className="bar-avg" style={{ bottom: Math.round((avgCa / maxCa) * BAR_HEIGHT) }} />
                )}
                {caByMonth.map(({ m, v }, i) => (
                  <div
                    className={`bar-col${v < 0 ? " neg" : i === nbMois - 1 ? " last" : ""}`}
                    key={m}
                    title={`${monthLabelLong(m)} : ${fmtEur(v)}`}
                  >
                    <div className="bar-val">{barLabel(v)}</div>
                    <div className="bar" style={{ height: Math.round((Math.abs(v) / maxCa) * BAR_HEIGHT) }} />
                  </div>
                ))}
              </div>
              <div
                className={`bar-labels${nbMois > 9 ? " dense" : ""}`}
                style={{ "--n": nbMois } as React.CSSProperties}
              >
                {caByMonth.map(({ m }) => {
                  const [mois, annee] = monthLabel(m).split(" ");
                  return (
                    <div key={m}>
                      {mois}
                      <span className="wide-only"> {annee}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title-row" style={{ marginBottom: 8 }}>
              <div className="card-label">Principales charges</div>
              <div className="card-aside">en % du CA</div>
            </div>
            {chargeRows.map((r) => (
              <div className="share-row" key={r.category.code} title={r.category.section}>
                <div className="share-top">
                  <div className="share-label">{r.category.label}</div>
                  <div className="share-vals">
                    <span className="share-amt">{fmtEurAuto(r.total ?? 0)}</span>
                    <span className="share-pct">{fmtPct(r.pctCa)}</span>
                  </div>
                </div>
                <div className="meter">
                  <span style={{ width: `${meterWidth(((r.pctCa ?? 0) / maxChargePct) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-title-row" style={{ marginBottom: 16 }}>
              <div className="card-label">Résultat net mensuel</div>
              <div className="legend">
                <span>
                  <i className="pos" />
                  Bénéfice
                </span>
                <span>
                  <i className="neg" />
                  Perte
                </span>
              </div>
            </div>
            <div className="chart-box">
              <div className="net-chart">
                {resByMonth.map(({ m, v, ca: caMois }, i) => (
                  <div className={`net-col${i === resByMonth.length - 1 ? " last" : ""}`} key={m}>
                    <div className="net-pos" style={{ height: Math.round(maxGain * netScale) + NET_MARGIN }}>
                      {v > 0 && <span style={{ height: Math.max(3, Math.round(v * netScale)) }} />}
                    </div>
                    <div className="net-axis" />
                    <div className="net-neg" style={{ height: Math.round(maxLoss * netScale) + NET_MARGIN }}>
                      {v < 0 && <span style={{ height: Math.max(3, Math.round(-v * netScale)) }} />}
                    </div>
                    <div className={`net-val${v > 0 ? " pos" : v < 0 ? " neg" : ""}`}>
                      {v === 0 ? VIDE : `${v > 0 ? "+" : "−"}${fmtEurAuto(Math.abs(v))}`}
                    </div>
                    <div className="net-pct">
                      {caMois !== 0 ? fmtPct((v / caMois) * 100) : VIDE}
                      {caMois !== 0 && <span className="wide-only"> du CA</span>}
                    </div>
                    <div className="net-month">{monthLabel(m)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-label" style={{ marginBottom: 10 }}>
              Ratios clés
            </div>
            {ratios.map((r) => (
              <div className="share-row ratio-row" key={r.label}>
                <div className="share-top">
                  <div className="share-label">{r.label}</div>
                  <div className="share-vals">
                    <span className="ratio-amt">{fmtEurAuto(r.amount)}</span>
                    <span className={`ratio-pct ${r.tone}`}>{fmtPct(r.pct)}</span>
                  </div>
                </div>
                <div className={`meter ${r.tone}`}>
                  {/* 50 % du CA remplit la jauge : les ratios suivis restent en dessous. */}
                  <span style={{ width: `${meterWidth(Math.abs(r.pct ?? 0) * 2)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card flush" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <div className="card-head-group">
              <div className="card-label">Alertes de cohérence</div>
              <span className={`count-badge${openAlerts.length ? "" : " ok"}`}>
                {openAlerts.length} ouverte{openAlerts.length > 1 ? "s" : ""}
              </span>
            </div>
            <Link href="/alertes" className="card-link">
              Tout gérer →
            </Link>
          </div>
          {openAlerts.length === 0 ? (
            <div className="alert-more">
              <span className="status ok">Aucune alerte ouverte, tous les contrôles sont au vert.</span>
            </div>
          ) : (
            <div className="alert-list">
              <div className="alert-line head">
                <div>Compte</div>
                <div>Libellé</div>
                <div className="amount">Montant</div>
                <div className="anomaly">Anomalie</div>
                <div />
              </div>
              {openAlerts.slice(0, ALERTES_AFFICHEES).map((a) => (
                <div className="alert-line" key={a.id} title={a.description ?? undefined}>
                  <div className="code">{a.account ?? VIDE}</div>
                  <div className="label">{alertLabel(a)}</div>
                  <div className="amount">{a.amount != null ? fmtEur(Number(a.amount)) : VIDE}</div>
                  <div className="anomaly">
                    <span className={`status${a.severity === "error" ? " error" : a.severity === "info" ? " info" : ""}`}>
                      {anomalie(a)}
                    </span>
                  </div>
                  <Link href="/alertes" className="btn secondary sm action">
                    Vérifier
                  </Link>
                </div>
              ))}
              {openAlerts.length > ALERTES_AFFICHEES && (
                <div className="alert-more">
                  + {openAlerts.length - ALERTES_AFFICHEES} autre
                  {openAlerts.length - ALERTES_AFFICHEES > 1 ? "s" : ""} alerte
                  {openAlerts.length - ALERTES_AFFICHEES > 1 ? "s" : ""}
                  {" · "}le détail et le traitement de chacune se trouvent dans l&apos;écran Alertes.
                </div>
              )}
            </div>
          )}
        </div>

        <SyntheseTable
          data={data}
          notes={notes}
          canEdit={canEditNotes}
          lockedMonths={validatedMonths}
        />
      </div>
    </>
  );
}
