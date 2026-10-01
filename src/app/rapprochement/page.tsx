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
import DecisionBox from "./DecisionBox";
import { ETAPES, FICHIERS, POINTS } from "./points";
import { getCurrentEntity } from "@/lib/entity";

// Écran « Rapprochement » : ce qu'il reste à recevoir de la DAF pour que les
// tableaux de gestion soient ceux de la comptabilité. L'état mois par mois est
// lu en base à chaque affichage ; les points et les fichiers attendus sont du
// contenu rédigé (points.tsx). Les réponses sont enregistrées en base —
// partagées, pas conservées dans le navigateur.

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

  const session = await getSession();
  const writer = session ? canWrite(session) : false;

  const rows = await db
    .select()
    .from(tables.rapprochementDecisions)
    .where(eq(tables.rapprochementDecisions.entityId, entity.id));
  const decisions = new Map(rows.map((r) => [r.pointKey, r]));
  const repondus = POINTS.filter((p) => (decisions.get(p.key)?.answer ?? "").trim()).length;

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
            Ce document est le vôtre. Il repart de zéro : les quinze points du premier échange
            sont clos et appliqués, vos réponses sont conservées. Il ne reste ici que ce qui
            sépare encore l&apos;application de tableaux de gestion identiques à la comptabilité :
            l&apos;état de chaque mois (partie A), les huit points et ce qu&apos;il en reste
            (partie B), les fichiers attendus (partie C) et l&apos;ordre dans lequel les traiter
            (partie D). Vos balances rééditées de novembre à juin sont en place depuis le
            1er octobre.
            Sous chaque point, une zone « Votre réponse » est à votre disposition ; chaque
            réponse est enregistrée aussitôt et reste lisible de tous.
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
              <span className="doc-state-label">
                Compte sans ligne dans les Frais généraux (point 1)
              </span>
            </div>
            <div className="doc-state-cell">
              <span className={`doc-state-value${repondus === POINTS.length ? "" : " warn"}`}>
                {repondus} / {POINTS.length}
              </span>
              <span className="doc-state-label">Points auxquels vous avez répondu</span>
            </div>
          </div>

          {/* ── A · état mois par mois ─────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie A</span>
              <h2>Où en est chaque mois</h2>
              <p>
                Ce tableau est lu dans la base à chaque affichage : il avance de lui-même à mesure
                que vous déposez des balances et validez des mois.
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
                « Prévisions comptabilisées » : le crédit du compte 713 porté par les chantiers
                dans la balance analytique du mois. En juin, il comprend les 32 250 € de 994E,
                que personne n&apos;a saisis (point 2). En juillet et en août, aucune écriture de
                713 n&apos;est passée (points 3 et 4) : un écart nul sur ces deux mois ne dit donc
                pas qu&apos;ils sont prêts.
              </p>
            </div>

            <div className="doc-block">
              <h3>Ce qui est contrôlé et juste</h3>
              <ul>
                <li>
                  De novembre à juin, chaque balance analytique recoupe la balance générale du
                  même mois au centime, sur les classes 6 et 7. Seule exception : 1 283,34 € de
                  produits en mars (point 1).
                </li>
                <li>
                  Tous les comptes ont une ligne d&apos;accueil dans la Synthèse et dans la vue
                  Chantiers ; la vue Chantiers ne perd aucun solde, quel que soit le mois. Le
                  management NJW est à 115 700 € tous les mois.
                </li>
                <li>
                  De novembre à juin, les prévisions sont comptabilisées chantier par chantier ;
                  en juin, la comptabilité est identique aux 13 prévisions saisies.
                </li>
                <li>
                  Les conventions arrêtées avec vous sont en place : base comptable, DEPOT et SAV
                  en chantier, cumuls avec leur part de prévisions, amortissements lissés,
                  Synthèse comptable avec son résultat de gestion.
                </li>
              </ul>
            </div>
          </section>

          {/* ── B · les points à conclure ──────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie B</span>
              <h2>Les huit points, et ce qu&apos;il en reste</h2>
              <p>
                En rouge, ce qui empêche de valider un mois ; en orange, ce qui suit ou se
                prépare ; en vert, ce qui est réglé. Constats relevés le 1er octobre 2026, après
                l&apos;import de vos balances rééditées.
              </p>
            </div>
            <div className="doc-points">
              {POINTS.map((p) => {
                const d = decisions.get(p.key);
                return (
                  <article key={p.key} className={`doc-q doc-q--${p.tone}`}>
                    <div className="doc-q-top">
                      <h3>
                        {p.n}. {p.title}
                      </h3>
                      <span className="doc-stake">{p.stake}</span>
                    </div>
                    {p.body}
                    <p className="doc-ask">{p.ask}</p>
                    <DecisionBox
                      pointKey={p.key}
                      initial={d?.answer ?? ""}
                      updatedBy={d?.updatedBy ?? null}
                      updatedAt={d ? dateFr(new Date(d.updatedAt)) : null}
                      canEdit={writer}
                    />
                  </article>
                );
              })}
            </div>
          </section>

          {/* ── C · fichiers attendus ──────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie C</span>
              <h2>Les fichiers que nous attendons</h2>
              <p>Vous les déposez vous-même depuis l&apos;écran Imports.</p>
            </div>
            <div className="doc-files">
              {FICHIERS.map((f) => (
                <div key={f.nom} className={`doc-file doc-file--${f.tone}`}>
                  <h3>{f.nom}</h3>
                  <p>{f.pourquoi}</p>
                  <span className="doc-file-tag">{f.tag}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── D · l'ordre ────────────────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie D</span>
              <h2>Dans quel ordre</h2>
              <p>
                Un mois réimporté est à revalider : les corrections passent donc avant les
                validations, et les mois se concluent dans l&apos;ordre.
              </p>
            </div>
            <div className="doc-steps">
              {ETAPES.map((e, i) => (
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
            points datent du 1er octobre 2026. Montants en euros.
            {!writer && " Les réponses sont en lecture seule avec votre profil."}
          </p>
        </div>
      </div>
    </>
  );
}
