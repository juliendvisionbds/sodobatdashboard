import { eq } from "drizzle-orm";
import AppHeader from "@/components/AppHeader";
import { db, tables } from "@/db";
import { getEntityByCode } from "@/lib/finance";
import { getSession, canWrite } from "@/lib/auth";
import DecisionBox from "./DecisionBox";
import { FICHIERS, POINTS } from "./points";

// Écran « Rapprochement » : l'état du contrôle de l'application contre les
// fichiers de la DAF, et les points qui appellent sa décision. Les réponses sont
// enregistrées en base — partagées, pas conservées dans le navigateur.

export const dynamic = "force-dynamic";

const dateFr = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default async function RapprochementPage() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const session = await getSession();
  const writer = session ? canWrite(session) : false;

  const rows = await db
    .select()
    .from(tables.rapprochementDecisions)
    .where(eq(tables.rapprochementDecisions.entityId, entity.id));
  const decisions = new Map(rows.map((r) => [r.pointKey, r]));

  const ouverts = POINTS.filter((p) => p.tone !== "ok");
  const enLettres = [
    "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit",
    "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  ];
  const combien = enLettres[ouverts.length] ?? String(ouverts.length);
  const repondus = ouverts.filter((p) => (decisions.get(p.key)?.answer ?? "").trim()).length;

  return (
    <>
      <AppHeader active="rapprochement" fiscalYearStart={2025} />
      <div className="page">
        <div className="page-header">
          <h1>Rapprochement avec votre tableau de gestion</h1>
          <p>
            Ce document est le vôtre. Il dit où en est l&apos;application par rapport à votre
            tableau de gestion, arrêté à mai : ce qui est déjà contrôlé (partie A), ce qui a été
            aligné sur votre présentation (partie B), et les {combien} points de la partie C
            qui appellent votre décision. Sous chacun d&apos;eux, une zone « Votre réponse »
            vous attend : écrivez-y librement, avec votre compte, avant ou pendant notre
            rendez-vous. Chaque réponse est enregistrée aussitôt et reste lisible de tous.
          </p>
        </div>

        <div className="doc">
          {/* ── Bandeau d'état ─────────────────────────────────────────────── */}
          <div className="doc-state">
            <div className="doc-state-cell">
              <span className="doc-state-value">17 / 17</span>
              <span className="doc-state-label">
                Fichiers repris en base à l&apos;identique, au centime et à la ligne
              </span>
            </div>
            <div className="doc-state-cell">
              <span className="doc-state-value">0,00 €</span>
              <span className="doc-state-label">
                Écart de contrôle inexpliqué sur les cinq exercices de la Synthèse
              </span>
            </div>
            <div className="doc-state-cell">
              <span className="doc-state-value">5 / 5</span>
              <span className="doc-state-label">
                Mois de janvier à mai dont le CA total est identique au vôtre
              </span>
            </div>
            <div className="doc-state-cell">
              <span className="doc-state-value">95 %</span>
              <span className="doc-state-label">
                Des 2 321 valeurs chantier comparées sont identiques à l&apos;euro
              </span>
            </div>
            <div className="doc-state-cell">
              <span className={`doc-state-value${repondus === ouverts.length ? "" : " warn"}`}>
                {repondus} / {ouverts.length}
              </span>
              <span className="doc-state-label">Points auxquels vous avez déjà répondu</span>
            </div>
          </div>

          {/* ── A · contrôles passés ───────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie A</span>
              <h2>Ce qui est contrôlé et juste</h2>
              <p>
                Tous ces contrôles portent sur les fichiers que vous nous avez transmis, relus
                avec les calculs qui alimentent les écrans.
              </p>
            </div>

            <div className="doc-block">
              <h3>1. Vos fichiers sont en base tels que vous les avez envoyés</h3>
              <p>
                Chaque import est relu depuis le fichier d&apos;origine et comparé à la base :
                nombre de lignes, total des soldes, total des débits.
              </p>
              <div className="doc-tbl-wrap">
                <table className="doc-tbl">
                  <tbody>
                    <tr><th>Fichiers</th><th>Nombre</th><th>Lignes</th><th>Écart</th></tr>
                    <tr><td>Balances ventilées, exercices 2021/22 à 2024/25</td><td>4</td><td>3 692</td><td className="ok">0,00</td></tr>
                    <tr><td>Balance ventilée 2025/26, arrêtée à juillet 2026</td><td>1</td><td>701</td><td className="ok">0,00</td></tr>
                    <tr><td>Balances analytiques, novembre 2025 à août 2026</td><td>10</td><td>5 437</td><td className="ok">0,00</td></tr>
                    <tr><td>Balances analytiques des exercices 2023/24 et 2024/25</td><td>2</td><td>2 817</td><td className="ok">0,00</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="doc-block">
              <h3>2. Chaque balance analytique recoupe la ventilée du même mois</h3>
              <p>
                Totaux des classes 6 et 7, analytique moins ventilée. C&apos;est ce recoupement
                qui établit que chaque balance analytique porte bien les mouvements de son mois,
                et non un cumul depuis l&apos;ouverture.
              </p>
              <div className="doc-tbl-wrap">
                <table className="doc-tbl">
                  <tbody>
                    <tr><th>Mois</th><th>Écart classe 6</th><th>Écart classe 7</th></tr>
                    <tr><td>Novembre 2025 à avril 2026 (6 mois)</td><td className="ok">0,00</td><td className="ok">0,00</td></tr>
                    <tr><td>Mai 2026 — ré-exportée le 23 septembre</td><td className="ok">0,00</td><td className="ok">0,00</td></tr>
                    <tr><td>Juin 2026</td><td className="ok">0,00</td><td className="ok">0,00</td></tr>
                    <tr><td>Juillet 2026</td><td className="ok">0,00</td><td className="ok">0,00</td></tr>
                    <tr><td>Août 2026 — balance ventilée non reçue</td><td className="muted">—</td><td className="muted">—</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="doc-note">
                Le premier export de mai était antérieur aux révisions du cabinet (point 1, refermé).
                Août sera recoupé dès réception de sa balance ventilée.
              </p>
            </div>

            <div className="doc-block">
              <h3>3. La Synthèse boucle sur les cinq exercices</h3>
              <p>
                L&apos;écart entre le résultat calculé et celui de la balance générale doit être
                intégralement expliqué par les retraitements de dotations et de VNC. Il l&apos;est,
                mois par mois et au total, et aucun compte ne reste sans ligne d&apos;accueil.
              </p>
              <div className="doc-tbl-wrap">
                <table className="doc-tbl">
                  <tbody>
                    <tr><th>Exercice</th><th>Mois</th><th>CA total</th><th>Résultat comptable</th><th>Comptes sans ligne</th><th>Inexpliqué</th></tr>
                    <tr><td>2021 / 2022</td><td>12</td><td>19 632 483</td><td>206 748</td><td>0</td><td className="ok">0,00</td></tr>
                    <tr><td>2022 / 2023</td><td>12</td><td>22 853 988</td><td>165 622</td><td>0</td><td className="ok">0,00</td></tr>
                    <tr><td>2023 / 2024</td><td>12</td><td>28 031 830</td><td>308 193</td><td>0</td><td className="ok">0,00</td></tr>
                    <tr><td>2024 / 2025</td><td>12</td><td>21 982 755</td><td>186 113</td><td>0</td><td className="ok">0,00</td></tr>
                    <tr><td>2025 / 2026, à fin juillet</td><td>9</td><td>14 699 555</td><td>−14 304</td><td>0</td><td className="ok">0,00</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="doc-note">
                En juin 2026, le résultat net de la Synthèse (−228 618) et le résultat comptable
                (−295 357) diffèrent de 66 739 € : dotations 31 147 plus VNC 35 592, soit
                exactement les retraitements.
              </p>
            </div>

            <div className="doc-block">
              <h3>4. La vue Chantiers contre vos onglets mensuels</h3>
              <p>
                Chaque onglet est comparé à ce que l&apos;écran Chantiers affiche pour le même
                mois, chantier par chantier, sur quatorze blocs : annulation, prévision,
                facturation, achats, sous-traitance, locations, déchets, honoraires, intérims,
                salaires, totaux et résultat.
              </p>
              <div className="doc-tbl-wrap">
                <table className="doc-tbl">
                  <tbody>
                    <tr><th>Onglet</th><th>Valeurs identiques</th><th>Charges, vous</th><th>Charges, application</th><th>Résultat, vous</th><th>Résultat, application</th></tr>
                    <tr><td>TG 11-12 2025</td><td>334 / 372</td><td>2 610 781</td><td className="ok">2 610 781</td><td>255 304</td><td className="ok">255 305</td></tr>
                    <tr><td>TG 01 2026</td><td>371 / 377</td><td>1 266 166</td><td className="ok">1 266 166</td><td>203 607</td><td className="warn">173 607</td></tr>
                    <tr><td>TG 02 2026</td><td>377 / 384</td><td>1 604 098</td><td className="ok">1 604 098</td><td>203 837</td><td className="ok">203 837</td></tr>
                    <tr><td>TG 03 2026</td><td>360 / 400</td><td>1 386 386</td><td>1 386 387</td><td>124 767</td><td>124 766</td></tr>
                    <tr><td>TG 04 2026</td><td>384 / 405</td><td>1 506 377</td><td className="ok">1 506 377</td><td>67 931</td><td className="ok">67 931</td></tr>
                    <tr><td>TG 05 2026</td><td>378 / 383</td><td>1 258 528</td><td className="ok">1 258 528</td><td>−1 648</td><td className="ok">−1 648</td></tr>
                    <tr className="sum"><td>Total</td><td>2 204 / 2 321 — 95 %</td><td colSpan={4} /></tr>
                  </tbody>
                </table>
              </div>
              <p className="doc-note">
                Comparaison au 24 septembre, DEPOT et SAV compris (point 6), mai ré-exporté
                (point 1). Sous-traitance, intérims, déchets, locations, eau / EDF / carburant,
                honoraires et facturation du mois : écart nul, tous les mois. Le seul écart de
                résultat, janvier, renvoie au point 2 ; ce qui reste sont vos reclassements
                manuels du point 3.
              </p>
            </div>

            <div className="doc-block">
              <h3>5. Le résultat comptable, mois par mois</h3>
              <p>Votre ligne « Resultat BG Comptable » en regard de la Synthèse de l&apos;application.</p>
              <div className="doc-tbl-wrap">
                <table className="doc-tbl">
                  <tbody>
                    <tr><th>Mois</th><th>Vous</th><th>Application</th><th>Écart</th><th>Origine</th></tr>
                    <tr><td>Novembre + décembre 2025</td><td>−20 559</td><td>29 543</td><td className="warn">50 102</td><td>quote-part SEP — point 10</td></tr>
                    <tr><td>Janvier 2026</td><td>−26 373</td><td>−26 373</td><td className="ok">0</td><td>—</td></tr>
                    <tr><td>Février 2026</td><td>−189</td><td>−189</td><td className="ok">0</td><td>—</td></tr>
                    <tr><td>Mars 2026</td><td>45 604</td><td>45 604</td><td className="ok">0</td><td>—</td></tr>
                    <tr><td>Avril 2026</td><td>−47 241</td><td>−47 292</td><td>−52</td><td>intérêts d&apos;emprunt — point 10</td></tr>
                    <tr><td>Mai 2026</td><td>−257 704</td><td>−194 818</td><td className="warn">62 886</td><td>révisions de mai — points 1 et 10</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="doc-block">
              <h3>6. Le résultat mensuel est celui de votre tableau</h3>
              <p>
                Votre ligne « Résultat » lisse les amortissements (3 600 à 4 000 € par mois, ligne
                « Retraitement DAP ») là où la comptabilité les passe en mai et en juin. Ce
                lissage neutralisé, le résultat net de la Synthèse est le vôtre.
              </p>
              <div className="doc-tbl-wrap">
                <table className="doc-tbl">
                  <tbody>
                    <tr><th>Mois</th><th>Votre « Résultat »</th><th>Votre lissage DAP</th><th>Vous, hors lissage</th><th>Application</th><th>Écart</th></tr>
                    <tr><td>Novembre + décembre 2025</td><td>−64 163</td><td>−9 604</td><td>−54 559</td><td>29 543</td><td className="warn">84 102</td></tr>
                    <tr><td>Janvier 2026</td><td>−30 346</td><td>−3 973</td><td>−26 373</td><td>−26 373</td><td className="ok">0</td></tr>
                    <tr><td>Février 2026</td><td>−3 781</td><td>−3 594</td><td>−187</td><td>−189</td><td className="ok">−2</td></tr>
                    <tr><td>Mars 2026</td><td>41 611</td><td>−3 993</td><td>45 604</td><td>45 604</td><td className="ok">0</td></tr>
                    <tr><td>Avril 2026</td><td>−51 113</td><td>−3 872</td><td>−47 241</td><td>−47 292</td><td>−51</td></tr>
                    <tr><td>Mai 2026</td><td>−198 667</td><td>−3 899</td><td>−194 768</td><td>−194 818</td><td>−50</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="doc-note">
                Novembre-décembre : les 84 102 € sont la quote-part SEP (50 011), la cession
                d&apos;immobilisation (34 000) et 91 € de produits divers, passés après votre
                export. Avril : les intérêts d&apos;emprunt de 51,82 €.
              </p>
            </div>
          </section>

          {/* ── B · alignements livrés ─────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie B</span>
              <h2>Ce qui a été aligné sur vos fichiers</h2>
              <p>
                Neuf ajustements livrés. Les quatre derniers datent des 22 et 24 septembre et
                reprennent vos conventions et vos remarques ; ils se défont aussi simplement
                qu&apos;ils se posent.
              </p>
            </div>
            <div className="doc-steps">
              <article className="doc-step">
                <div className="doc-step-num">01</div>
                <div>
                  <h3>Les balances analytiques sont lues comme des mouvements mensuels</h3>
                  <p>
                    Le mois se lit directement dans son fichier, sur les écrans Chantiers, Frais
                    généraux et fiche compte. C&apos;est ce qui fait tomber le total des charges
                    chantier à l&apos;identique du vôtre.
                  </p>
                </div>
              </article>
              <article className="doc-step">
                <div className="doc-step-num">02</div>
                <div>
                  <h3>L&apos;annulation M-1 et la prévision du mois viennent de la comptabilité</h3>
                  <p>
                    Sur le compte 71331000, le débit du mois est la reprise de la provision de M-1
                    et le crédit la provision du mois : ce sont vos colonnes « Annulation Mois-1 »
                    et « Prévision Mois », chantier par chantier.
                  </p>
                </div>
              </article>
              <article className="doc-step">
                <div className="doc-step-num">03</div>
                <div>
                  <h3>Les cumuls repartent de votre situation au 31 octobre 2025</h3>
                  <p>
                    Vos colonnes de report de l&apos;onglet « TG 11-12 2025 » ont été reprises pour
                    71 chantiers : 65 201 113,04 € de facturation et 6 758 151,76 € de résultat.
                  </p>
                </div>
              </article>
              <article className="doc-step">
                <div className="doc-step-num">04</div>
                <div>
                  <h3>Deux lectures que vous aviez demandées</h3>
                  <p>
                    Frais généraux : un mois par colonne, puis le cumul et son pourcentage du CA.
                    Synthèse : une bascule mensuel / cumulé, les ratios étant recalculés sur le
                    cumul.
                  </p>
                </div>
              </article>
              <article className="doc-step">
                <div className="doc-step-num">05</div>
                <div>
                  <h3>La Synthèse épouse la présentation de votre tableau</h3>
                  <p>
                    Les cessions, produits financiers et produits de gestion courante forment
                    désormais un bloc « Autres produits » placé après le résultat
                    d&apos;exploitation. Et les charges partagées entre chantiers et siège sont
                    réparties d&apos;après la balance analytique du mois : six lignes
                    apparaissent en frais généraux, calquées sur votre bloc « Autres charges ».
                  </p>
                  <p>
                    Le CA mensuel de janvier à mai est désormais identique au vôtre au chiffre
                    près : 1 439 773, 1 807 935, 1 511 153, 1 574 308 et 1 256 880. Le résultat
                    net, lui, est inchangé : la répartition se déplace, rien ne se perd.
                  </p>
                </div>
              </article>
              <article className="doc-step">
                <div className="doc-step-num">06</div>
                <div>
                  <h3>Le DEPOT et le SAV suivent votre périmètre chantier</h3>
                  <p>
                    Classés en chantier, avec vos reports d&apos;ouverture. Quatre lignes de frais
                    généraux tombent identiques aux vôtres et le compte d&apos;intérim « sans
                    ligne » disparaît. À confirmer au point 6.
                  </p>
                </div>
              </article>
              <article className="doc-step">
                <div className="doc-step-num">07</div>
                <div>
                  <h3>Les centres créés par Cegid sont lus comme leur vrai chantier</h3>
                  <p>
                    1034B, 1047A, 1036C et 52MF sont rattachés à 1034E, 1047E, 1036A et 52 à la
                    lecture, sans toucher aux écritures importées. La correction dans Cegid reste
                    à faire (point 3).
                  </p>
                </div>
              </article>
              <article className="doc-step">
                <div className="doc-step-num">08</div>
                <div>
                  <h3>Déplacements et réceptions de chantier rejoignent les honoraires</h3>
                  <p>
                    Comme votre colonne « Honoraires chantier - Gardiennage », qui couvre les
                    comptes 62261 à 6282. Le bloc honoraires de la vue Chantiers est désormais
                    identique au vôtre tous les mois (point 7).
                  </p>
                </div>
              </article>
              <article className="doc-step">
                <div className="doc-step-num">09</div>
                <div>
                  <h3>Vos remarques du 23 septembre</h3>
                  <p>
                    « Prévision » remplace « Provision » dans la Synthèse et les Chantiers. La
                    vue Chantiers est retournée : les postes en lignes, un chantier par colonne,
                    par pôle et par numéro croissant. La sous-traitance est scindée entre
                    paiement direct (compte 60412100) et paiement Sodobat, et les deux objectifs
                    « Sous-traitants 1 » et « 2 » ont chacun leur réalisé. Séparateur de
                    milliers plus lisible, filets verticaux sur tous les tableaux, pourcentages
                    et écarts sans couleur de signe. L&apos;assistant propose les questions les
                    plus posées, communes à tous. Un rôle « saisie » permet à chaque entité
                    d&apos;entrer ses prévisions ; vous seule les figez.
                  </p>
                </div>
              </article>
            </div>
          </section>

          {/* ── C · les points à trancher ──────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie C</span>
              <h2>Les points qui appellent votre décision</h2>
              <p>
                Classés par enjeu. En rouge, ce qui empêche un mois d&apos;être juste. En orange,
                ce sur quoi l&apos;application est cohérente avec la comptabilité mais pas avec
                votre fichier : il faut choisir la référence. Vos réponses sont enregistrées au
                fur et à mesure.
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

          {/* ── D · fichiers attendus ──────────────────────────────────────── */}
          <section className="doc-part">
            <div className="doc-part-head">
              <span className="doc-part-tag">Partie D</span>
              <h2>Ce que nous vous demandons</h2>
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

          <p className="doc-foot">
            Chiffres relevés sur la base de l&apos;application, à jour des balances de novembre
            2025 à juillet 2026 et du tableau de gestion arrêté à mai 2026. Montants en euros.
            {!writer && " Les réponses sont en lecture seule avec votre profil."}
          </p>
        </div>
      </div>
    </>
  );
}
