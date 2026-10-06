import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import AppHeader from "@/components/AppHeader";
import { db, tables } from "@/db";
import {
  getFx,
  getMonthValidation,
  getPrevisionControl,
  getSynthese,
  listAnalytiquePeriods,
} from "@/lib/finance";
import { fiscalMonths } from "@/lib/parsers";
import { fmtNum, monthLabelLong } from "@/lib/format";
import { POINTS_CLOS, SUITE } from "./points";
import { getCurrentEntity } from "@/lib/entity";

// Écran « Rapprochement » : où en est l'exercice, et ce qui a été fait des
// réponses de la DAF. L'état mois par mois est lu en base à chaque affichage ;
// les points clos sont du contenu rédigé (points.tsx), accompagnés de la
// réponse enregistrée en base le 5 octobre 2026.

export const dynamic = "force-dynamic";

const FISCAL_YEAR_START = 2025;

const dateFr = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

type Etat = { label: string; tone: "ok" | "warn" | "muted" };

export default async function RapprochementPage() {
  const entity = await getCurrentEntity();
  if (!entity) return null;
  // Les points de ce rapprochement sont ceux du tableau de gestion de Sodobat.
  if (entity.code !== "sodobat") redirect("/");

  const rows = await db
    .select()
    .from(tables.rapprochementDecisions)
    .where(eq(tables.rapprochementDecisions.entityId, entity.id));
  const decisions = new Map(rows.map((r) => [r.pointKey, r]));

  // ── État de chaque mois de l'exercice, lu en base ──────────────────────────
  const exercice = new Set(fiscalMonths(FISCAL_YEAR_START));
  const periods = (await listAnalytiquePeriods(entity.id)).filter((p) => exercice.has(p)).sort();
  const mois = await Promise.all(
    periods.map(async (period) => {
      const control = await getPrevisionControl(entity, period);
      const validation = await getMonthValidation(entity, control);
      const valide = !!validation?.current;
      const etat: Etat = valide
        ? { label: `validé le ${validation!.validatedAt}`, tone: "ok" }
        : validation
          ? { label: "à revalider : balance réimportée", tone: "warn" }
          : !control.ventileeCovers
            ? { label: "balance générale attendue", tone: "warn" }
            : Math.abs(control.ecart) >= 1
              ? { label: "prévisions à comptabiliser", tone: "warn" }
              : control.totalComptabilise === 0 && control.rows.length === 0
                ? { label: "aucune prévision passée", tone: "warn" }
                : { label: "à valider", tone: "warn" };
      return { period, control, valide, etat };
    })
  );
  const valides = mois.filter((m) => m.valide).length;
  const recoupes = mois.filter((m) => m.control.ventileeCovers).length;

  // Comptes sans ligne d'accueil, sur les dernières balances en base.
  const [synthese, fx] = await Promise.all([getSynthese(entity), getFx(entity)]);
  const sansLigneSynthese = synthese?.unmapped.length ?? 0;
  const sansLigneFx = fx?.unmapped.length ?? 0;

  return (
    <>
      <AppHeader active="rapprochement" fiscalYearStart={FISCAL_YEAR_START} />
      <div className="page">
        <div className="page-header">
          <h1>Rapprochement</h1>
          <p>
            Ce document est le vôtre. Les huit points du 1er octobre sont clos avec vos réponses
            du 5 octobre, et vos trois balances rééditées sont en place depuis le 6 octobre : de
            novembre à juin, les tableaux de gestion de l&apos;application sont ceux de la
            comptabilité. Il reste ici l&apos;état de chaque mois (partie A), lu en base à chaque
            affichage, ce qui a été fait de chacune de vos réponses (partie B) et la suite du
            calendrier (partie C). Il n&apos;y a plus de question en attente.
          </p>
        </div>

        <div className="doc">
          {/* ── Bandeau d'état ─────────────────────────────────────────────── */}
          <div className="doc-state">
            <div className="doc-state-cell">
              <span className={`doc-state-value${valides === mois.length ? "" : " warn"}`}>
                {valides} / {mois.length}
              </span>
              <span className="doc-state-label">Mois de l&apos;exercice validés</span>
            </div>
            <div className="doc-state-cell">
              <span className={`doc-state-value${recoupes === mois.length ? "" : " warn"}`}>
                {recoupes} / {mois.length}
              </span>
              <span className="doc-state-label">Mois couverts par la balance générale</span>
            </div>
            <div className="doc-state-cell">
              <span className={`doc-state-value${sansLigneSynthese ? " warn" : ""}`}>
                {sansLigneSynthese}
              </span>
              <span className="doc-state-label">Compte sans ligne dans la Synthèse</span>
            </div>
            <div className="doc-state-cell">
              <span className={`doc-state-value${sansLigneFx ? " warn" : ""}`}>{sansLigneFx}</span>
              <span className="doc-state-label">Compte sans ligne dans les Frais généraux</span>
            </div>
          </div>

          {/* ── A · état mois par mois ─────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie A</span>
              <h2>Où en est chaque mois</h2>
              <p>
                Ce tableau est lu dans la base à chaque affichage : il avance de lui-même à mesure
                que vous déposez des balances et que les mois sont validés.
              </p>
            </div>

            <div className="doc-block">
              <h3>Exercice 2025 / 2026, mois par mois</h3>
              <div className="doc-tbl-wrap">
                <table className="doc-tbl">
                  <tbody>
                    <tr>
                      <th>Mois</th>
                      <th>Balance générale</th>
                      <th>Prévisions comptabilisées</th>
                      <th>Prévisions saisies</th>
                      <th>Écart</th>
                      <th>État</th>
                    </tr>
                    {mois.map(({ period, control, etat }) => (
                      <tr key={period}>
                        <td>{monthLabelLong(period)}</td>
                        <td className={control.ventileeCovers ? "ok" : "warn"}>
                          {control.ventileeCovers ? "reçue" : "non reçue"}
                        </td>
                        <td>{fmtNum(control.totalComptabilise)}</td>
                        <td>{control.rows.length ? fmtNum(control.totalSaisi) : "—"}</td>
                        <td className={Math.abs(control.ecart) >= 1 ? "warn" : "ok"}>
                          {fmtNum(control.ecart)}
                        </td>
                        <td className={etat.tone}>{etat.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="doc-note">
                « Prévisions comptabilisées » : la provision en cours à la fin du mois, lue
                chantier par chantier sur le compte 713 (point 2). En juillet et en août, aucune
                écriture de 713 n&apos;est encore passée : un écart nul sur ces deux mois ne dit
                donc pas qu&apos;ils sont prêts.
              </p>
            </div>

            <div className="doc-block">
              <h3>Ce qui est contrôlé et juste</h3>
              <ul>
                <li>
                  De novembre à juin, chaque balance analytique recoupe la balance générale du
                  même mois au centime, sur les classes 6 et 7, sans exception.
                </li>
                <li>
                  Tous les comptes ont une ligne d&apos;accueil dans la Synthèse, dans la vue
                  Chantiers et dans les Frais généraux ; la vue Chantiers ne perd aucun solde,
                  quel que soit le mois. Le management NJW est à 115 700 € tous les mois.
                </li>
                <li>
                  De novembre à juin, les prévisions sont comptabilisées chantier par chantier ;
                  en juin, la comptabilité est identique aux 13 prévisions saisies.
                </li>
                <li>
                  Les conventions arrêtées avec vous sont en place : base comptable, DEPOT et SAV
                  en chantier, cumuls avec leur part de prévisions, amortissements lissés,
                  assurances telles qu&apos;en comptabilité, Synthèse comptable avec son résultat
                  de gestion.
                </li>
              </ul>
            </div>
          </section>

          {/* ── B · les points clos ────────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie B</span>
              <h2>Vos réponses, et ce qui en est fait</h2>
              <p>
                Les huit points du 1er octobre, avec votre réponse du 5 octobre telle que vous
                l&apos;avez écrite, et ce que l&apos;application en a fait le 6.
              </p>
            </div>
            <div className="doc-points">
              {POINTS_CLOS.map((p) => {
                const d = decisions.get(p.key);
                const reponse = (d?.answer ?? "").trim();
                return (
                  <article key={p.key} className="doc-q doc-q--ok">
                    <div className="doc-q-top">
                      <h3>
                        {p.n}. {p.title}
                      </h3>
                      <span className="doc-stake">clos le 6 octobre 2026</span>
                    </div>
                    <div className="doc-decision">
                      <span className="doc-decision-label">Votre réponse</span>
                      {reponse ? (
                        <p className="doc-decision-read">{reponse}</p>
                      ) : (
                        <p className="doc-decision-read muted">{p.sansReponse ?? "Pas de réponse."}</p>
                      )}
                      {d && reponse && (
                        <p className="doc-note">
                          Le {dateFr(new Date(d.updatedAt))}
                          {d.updatedBy ? `, ${d.updatedBy}` : ""}.
                        </p>
                      )}
                    </div>
                    <p className="doc-ask">Ce qui en est fait</p>
                    {p.suite}
                  </article>
                );
              })}
            </div>
          </section>

          {/* ── C · la suite ───────────────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie C</span>
              <h2>La suite</h2>
              <p>
                Le circuit mensuel, sans autre échange que vos dépôts : l&apos;application signale
                d&apos;elle-même ce qui manque, dans la partie A et dans les alertes.
              </p>
            </div>
            <div className="doc-steps">
              {SUITE.map((e, i) => (
                <article key={e.titre} className="doc-step">
                  <div className="doc-step-num">{String(i + 1).padStart(2, "0")}</div>
                  <div>
                    <h3>{e.titre}</h3>
                    <p>{e.texte}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <p className="doc-foot">
            L&apos;état mois par mois est lu sur la base de l&apos;application. Les points sont
            clos au 6 octobre 2026. Montants en euros.
          </p>
        </div>
      </div>
    </>
  );
}
