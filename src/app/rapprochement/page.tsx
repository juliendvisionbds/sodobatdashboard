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
import { getSession, canWrite } from "@/lib/auth";
import { entiteConfig } from "@/lib/nomenclature/entites";
import DecisionBox from "./DecisionBox";
import { SODOBAT, type Contenu } from "./points";
import { COVARBAT } from "./points-covarbat";
import { getCurrentEntity } from "@/lib/entity";

// Écran « Rapprochement » : où en est l'exercice de l'entité affichée, et ce
// qui a été fait des réponses de la DAF. L'état mois par mois est lu en base à
// chaque affichage ; les points sont du contenu rédigé par entité (points.tsx,
// points-covarbat.tsx), accompagnés de la réponse enregistrée en base. Les
// points encore ouverts ont une zone de réponse, partagée, pas conservée dans
// le navigateur.

export const dynamic = "force-dynamic";

const CONTENUS: Record<string, Contenu> = { sodobat: SODOBAT, covarbat: COVARBAT };

const dateFr = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

type Etat = { label: string; tone: "ok" | "warn" | "muted" };

export default async function RapprochementPage() {
  const entity = await getCurrentEntity();
  if (!entity) return null;
  const contenu = CONTENUS[entity.code];
  if (!contenu) redirect("/");

  const session = await getSession();
  const writer = session ? canWrite(session) : false;
  // En mode « saisie », la comptabilité ne ventile pas la prévision par chantier :
  // la colonne « comptabilisées » n'a rien à montrer.
  const modeSaisie = entiteConfig(entity.code).provisions.mode === "saisie";

  const rows = await db
    .select()
    .from(tables.rapprochementDecisions)
    .where(eq(tables.rapprochementDecisions.entityId, entity.id));
  const decisions = new Map(rows.map((r) => [r.pointKey, r]));
  // Un point « ok » peut garder une zone de réponse (vérification facultative) sans être ouvert.
  const ouverts = contenu.points.filter((p) => p.ask && p.tone !== "ok");

  // ── État de chaque mois de l'exercice, lu en base ──────────────────────────
  const exercice = new Set(fiscalMonths(contenu.fiscalYearStart));
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
                ? { label: modeSaisie ? "aucune prévision saisie" : "aucune prévision passée", tone: "warn" }
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
      <AppHeader active="rapprochement" fiscalYearStart={contenu.fiscalYearStart} />
      <div className="page">
        <div className="page-header">
          <h1>Rapprochement · {entity.name}</h1>
          <p>{contenu.intro}</p>
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
            {ouverts.length > 0 && (
              <div className="doc-state-cell">
                <span className="doc-state-value warn">{ouverts.length}</span>
                <span className="doc-state-label">
                  Point{ouverts.length > 1 ? "s" : ""} encore ouvert{ouverts.length > 1 ? "s" : ""}
                </span>
              </div>
            )}
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
              <h3>
                Exercice {contenu.fiscalYearStart} / {contenu.fiscalYearStart + 1}, mois par mois
              </h3>
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
                        <td>{modeSaisie ? "—" : fmtNum(control.totalComptabilise)}</td>
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
              <p className="doc-note">{contenu.noteMois}</p>
            </div>

            <div className="doc-block">
              <h3>Ce qui est contrôlé et juste</h3>
              <ul>
                {contenu.controles.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── B · les points ─────────────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie B</span>
              <h2>{contenu.titreB}</h2>
              <p>{contenu.introB}</p>
            </div>
            <div className="doc-points">
              {contenu.points.map((p) => {
                const d = decisions.get(p.key);
                const reponse = (d?.answer ?? "").trim();
                return (
                  <article key={p.key} className={`doc-q doc-q--${p.tone}`}>
                    <div className="doc-q-top">
                      <h3>
                        {p.n}. {p.title}
                      </h3>
                      <span className="doc-stake">{p.stake}</span>
                    </div>
                    {(p.reponseCourriel || (!p.ask && (reponse || p.sansReponse))) && (
                      <div className="doc-decision">
                        <span className="doc-decision-label">
                          Votre réponse{p.reponseCourriel ? ` (${contenu.sourceReponses})` : ""}
                        </span>
                        {p.reponseCourriel ? (
                          <p className="doc-decision-read">{p.reponseCourriel}</p>
                        ) : reponse ? (
                          <p className="doc-decision-read">{reponse}</p>
                        ) : (
                          <p className="doc-decision-read muted">{p.sansReponse}</p>
                        )}
                        {!p.reponseCourriel && d && reponse && (
                          <p className="doc-note">
                            Le {dateFr(new Date(d.updatedAt))}
                            {d.updatedBy ? `, ${d.updatedBy}` : ""}.
                          </p>
                        )}
                      </div>
                    )}
                    <p className="doc-ask">{p.ask ? "Ce qui en est fait, et ce qui reste" : "Ce qui en est fait"}</p>
                    {p.suite}
                    {p.ask && (
                      <>
                        <p className="doc-ask">{p.ask}</p>
                        <DecisionBox
                          pointKey={p.key}
                          initial={reponse}
                          updatedBy={d?.updatedBy ?? null}
                          updatedAt={d ? dateFr(new Date(d.updatedAt)) : null}
                          canEdit={writer}
                        />
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {/* ── C · la suite ───────────────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie C</span>
              <h2>{contenu.titreC}</h2>
              <p>{contenu.introC}</p>
            </div>
            <div className="doc-steps">
              {contenu.suite.map((e, i) => (
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
            L&apos;état mois par mois est lu sur la base de l&apos;application. Les constats des
            points datent du {contenu.dateConstats}. Montants en euros.
            {!writer && " Les réponses sont en lecture seule avec votre profil."}
          </p>
        </div>
      </div>
    </>
  );
}
