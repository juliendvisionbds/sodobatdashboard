import { N, type Contenu } from "./points";

// ── CovarBat ─────────────────────────────────────────────────────────────────
// L'échange du début octobre 2026 (courriel « Covarbat dans l'application – ce
// dont j'ai besoin de ta part »), les réponses de la DAF du 6 octobre, reçues
// par courriel et citées telles quelles, ce que l'application en a fait le
// jour même, et les fichiers reçus le 7 octobre. Clés c31 à c38.

export const COVARBAT: Contenu = {
  fiscalYearStart: 2025,
  dateConstats: "7 octobre 2026",
  sourceReponses: "courriel du 6 octobre 2026",
  intro: (
    <>
      Ce document est le vôtre. Il reprend l&apos;échange sur Covarbat du début octobre et vos
      réponses du 6 octobre, telles que vous les avez écrites, avec ce que l&apos;application en
      a fait le jour même, puis vos envois du 7 octobre : vos neuf balances mensuelles sont en
      place, les centres sont codés, la balance 2024/2025 donne le N-1 de la Synthèse, la vue
      Chantiers et le détail mois par mois des frais généraux sont en ligne. L&apos;état de
      chaque mois (partie A) est lu en base à chaque affichage ; deux points restent ouverts
      (partie B), avec une zone de réponse sous chacun ; la suite du calendrier est en partie C.
    </>
  ),
  noteMois: (
    <>
      « Prévisions saisies » : la prévision du mois, chantier par chantier, telle que votre
      tableau de gestion la porte, reprise dans l&apos;application le 1er octobre. La comptabilité
      ne la ventile pas encore par chantier : la colonne « comptabilisées » reste vide
      jusqu&apos;au passage sur le 713 (point 3), et l&apos;écart est nul par construction.
    </>
  ),
  controles: [
    <>
      De novembre à juillet, chaque balance analytique mensuelle recoupe la colonne de la
      balance générale du même mois au centime, sur les classes 6 et 7.
    </>,
    <>
      La Synthèse est identique à votre onglet Synthese sur le chiffre d&apos;affaires total,
      sauf janvier, qui diffère de <N>4 596 €</N> d&apos;écritures passées en comptabilité après
      votre tableau ; le résultat est celui de la balance. La colonne N-1 vient de votre balance
      ventilée 2024/2025, reçue le 7 octobre.
    </>,
    <>
      La vue Chantiers retrouve chaque mois le chiffre d&apos;affaires de la Synthèse ; aucun
      compte n&apos;est sans ligne, dans aucune vue.
    </>,
    <>
      Les règles arrêtées avec vous sont en place : rémunération du gérant partagée à 50 %, LLD
      en crédit-bail, bennes en déchets, honoraires divers, CSG en masse salariale, indemnités
      d&apos;assurance en déduction du total des frais généraux.
    </>,
  ],
  titreB: "Vos réponses, et ce qui en est fait",
  introB:
    "Les points du courriel du début octobre, avec votre réponse du 6 octobre telle que vous l'avez écrite, et ce que l'application en a fait. Trois points attendent encore quelque chose de vous : la zone « Votre réponse » est là pour ça.",
  points: [
    {
      key: "c31",
      n: 1,
      title: "Les fichiers mois par mois",
      tone: "ok",
      stake: "réglé le 6 octobre 2026",
      reponseCourriel:
        "Je te joins dans les archives analytiques depuis Quadra et l'exercice en cours, mois par mois, depuis Pennylane.",
      suite: (
        <p>
          Vos neuf exports mensuels de novembre à juillet sont importés ; chacun recoupe la
          colonne du même mois de la balance générale au centime. La vue Chantiers et le détail
          mois par mois des frais généraux en découlent. Le fichier de décembre portait des dates
          de novembre dans son nom : il a été importé sous son vrai mois. Les archives Quadra ont
          servi à vérifier les reports d&apos;ouverture (point 8).
        </p>
      ),
    },
    {
      key: "c32",
      n: 2,
      title: "Les centres sans code dans Pennylane",
      tone: "ok",
      stake: "réglé le 7 octobre 2026",
      reponseCourriel:
        "J'ai repris l'ensemble des analytiques sur l'exercice en cours. J'ai nommé les doublons avec le nominal + code chantier pour ne pas se tromper. J'ai mis à jour les « créé par Import ASCII ». Dis-moi si tu en as encore.",
      suite: (
        <>
          <p>
            Les doublons sont réglés : 755 et 777 Bertoli, 779 et 781 Pavio, 723 Château Roubine,
            688 SCI Samat, 756 Sodobat, 659 et 682 Vazzoli portent chacun leur code. Vos exports
            corrigés du 7 octobre ont remplacé ceux de novembre, décembre et juillet : « LAURENT
            SA 750 » est devenu le chantier 750, le centre sans code de décembre était le dépôt
            (DEP, en frais généraux), celui de juillet le chantier 785 Baudry avec ses 31 899 € de
            ventes, et 788 Durant a retrouvé son code. Plus aucun centre n&apos;est sans code.
          </p>
        </>
      ),
    },
    {
      key: "c33",
      n: 3,
      title: "Le compte 70400000 et le passage au 713",
      tone: "warn",
      stake: "la balance analytique de juillet, après ventilation, reste à recevoir",
      reponseCourriel:
        "Effectivement. Tu as raison. Il me semble plus cohérent d'enregistrer l'écriture en 713 comme Sodobat. Quant à l'analytique, je te le ventile sur le dernier mois pour que l'annulation soit correctement ventilée.",
      suite: (
        <>
          <p>
            Dans votre 70400000, chaque chantier porte sa prévision et la reprise de celle du mois
            précédent, mêlées à la vente en autoliquidation : votre tableau le confirme à
            l&apos;euro près. L&apos;application retire donc, chantier par chantier, la prévision
            et l&apos;annulation de votre tableau ; ce qui reste est de la vente, et le chiffre
            d&apos;affaires du chantier est celui de la comptabilité.
          </p>
          <p>
            Le grand livre analytique de juillet reçu le 7 octobre montre votre ventilation : les
            PCA du 30 juin repris chantier par chantier sur le 704, reportés sur le 713 chantier
            par chantier, et la FAE de 432 au crédit du 713. C&apos;est bien la lecture de
            Sodobat. Mais un grand livre n&apos;est pas une balance : l&apos;application
            n&apos;en lit pas le format, et la balance analytique de juillet en base, exportée
            avant cette ventilation, porte encore le 713 sur « Non catégorisé ». Les deux comptes
            y sont lus comme un seul bloc, rien ne bouge, et la prévision par chantier reste
            celle de votre tableau.
          </p>
          <p>
            Pour cet exercice, l&apos;application garde donc votre tableau comme référence des
            prévisions par chantier, sur le 704 avant juillet comme sur le 713 après : ses
            chiffres sont justes dans les deux cas. La lecture directe du 713, comme pour Sodobat,
            prendra le relais au 1er novembre, avec l&apos;exercice 2026/27, sans mois de
            transition.
          </p>
        </>
      ),
      ask: "Pouvez-vous exporter la balance analytique de juillet, le même export que les autres mois, maintenant que le 713 y est ventilé ? Et d'août à octobre, continuez de passer la prévision chantier par chantier sur le 713, avec le montant par chantier reporté dans la vue Chantiers.",
    },
    {
      key: "c34",
      n: 4,
      title: "La rémunération du gérant",
      tone: "ok",
      stake: "réglé le 6 octobre 2026",
      reponseCourriel: "Non elles ne suivent pas la même règle. Laisse-les en FX.",
      suite: (
        <p>
          Le 64111000 reste partagé à 50 % entre la production et les frais généraux, comme dans
          votre tableau. La prime (64111200), la SAF/BTP (64119000) et la loi Madelin (64119100)
          sont entièrement en frais généraux.
        </p>
      ),
    },
    {
      key: "c35",
      n: 5,
      title: "Les affectations de comptes",
      tone: "ok",
      stake: "réglé le 6 octobre 2026",
      reponseCourriel:
        "LLD et leasing copieur en crédit-bail : oui. 61351000 : il s'agit de location de bennes, le laisser en déchets dans Covarbat. 62261000 : le laisser en honoraires divers dans Covarbat. 62341000 : mettre par défaut les 623 au même endroit. 62870000 en cotisations : ok. 64700000 en masse salariale : ok. 63781000 et 63782000 : non, en masse salariale.",
      suite: (
        <p>
          Appliqué le 6 octobre, avec votre plan comptable Covarbat 2026 en complément : EDF et
          eau du siège rejoignent l&apos;EDF chantier, la géolocalisation des véhicules rejoint
          les déplacements, la LLD Clio le crédit-bail. Quand le plan et votre réponse divergent,
          votre réponse l&apos;emporte : les LLD restent en crédit-bail et le 62870000 en
          cotisations.
        </p>
      ),
    },
    {
      key: "c36",
      n: 6,
      title: "Les indemnités d'assurance",
      tone: "ok",
      stake: "réglé le 6 octobre 2026",
      reponseCourriel:
        "Oui, par contre ils ne doivent pas venir en déduction des frais d'assurance puisqu'il s'agit de remboursement d'indemnité de sinistres comme sur Sodobat.",
      suite: (
        <p>
          La ligne reste à part dans les Frais généraux et vient en déduction du total, pour
          Covarbat comme pour Sodobat : <N>8 339 €</N> sur l&apos;exercice.
        </p>
      ),
    },
    {
      key: "c37",
      n: 7,
      title: "La balance ventilée 2024/2025 et les objectifs des dirigeants",
      tone: "warn",
      stake: "le N-1 est en place, l'onglet Objectifs attend",
      sansReponse: "La balance 2024/2025 est arrivée le 7 octobre, sans mot sur les objectifs.",
      suite: (
        <p>
          Votre balance ventilée 2024/2025 est importée : la Synthèse compare désormais chaque
          ligne à l&apos;exercice précédent, <N>1 102 743 €</N> de chiffre d&apos;affaires à fin
          juillet 2025 contre 1 257 129 € cette année. L&apos;onglet Objectifs de Covarbat reste
          vide.
        </p>
      ),
      ask: "Si les dirigeants ont des objectifs annuels pour Covarbat, indiquez-les ici, ou dites-moi qu'il n'y en a pas.",
    },
    {
      key: "c38",
      n: 8,
      title: "Les reports d'ouverture des chantiers",
      tone: "ok",
      stake: "repris de votre tableau, sept chantiers corrigés",
      sansReponse: "Rien à répondre, sauf si l'une de ces valeurs vous paraît fausse.",
      suite: (
        <>
          <p>
            Les cumuls d&apos;un chantier partent de sa situation au 31 octobre 2025, lue dans
            votre onglet « COVARBAT 30 11 25 » pour 97 chantiers. Huit colonnes y recopiaient la
            valeur d&apos;une colonne voisine ; six de ces chantiers figuraient aussi dans la liste
            complète de droite, dont la valeur a été retenue. Pour les sept autres, le cumul des
            balances Quadra de 2021/22 à 2024/25, qui reproduit à l&apos;euro les reports de tous
            les autres chantiers récents, a été retenu :
          </p>
          <div className="doc-tbl-wrap">
            <table className="doc-tbl">
              <tbody>
                <tr><th>Chantier</th><th>Votre onglet</th><th>Retenu</th></tr>
                <tr><td>723 Château Roubine</td><td>112 983 / 48 468</td><td>113 895 / 17 364</td></tr>
                <tr><td>726 Modica</td><td>11 352 / 2 381</td><td>11 352 / 4 381</td></tr>
                <tr><td>728 Pretari Construction</td><td>106 944 / 23 698</td><td>134 773 / 23 698</td></tr>
                <tr><td>744 Donat</td><td>0 / 31 476</td><td>0 / 0</td></tr>
                <tr><td>745, 749, 750</td><td>0 / 2 055 chacun</td><td>0 / 0, aucun historique</td></tr>
                <tr><td>748 Laurent</td><td>0 / 2 055</td><td>0 / −1 015</td></tr>
              </tbody>
            </table>
          </div>
          <p className="doc-note">Facturation / résultat, en euros, au 31 octobre 2025.</p>
        </>
      ),
      ask: "Si l'un de ces reports vous paraît faux, indiquez ici la bonne valeur : elle remplacera celle-ci.",
    },
  ],
  titreC: "La suite",
  introC:
    "Le circuit mensuel, sans autre échange que vos dépôts : l'application signale d'elle-même ce qui manque, dans la partie A et dans les alertes.",
  suite: [
    {
      titre: "Juillet",
      texte:
        "La balance analytique de juillet, exportée après la ventilation du 713, remplace celle en base depuis l'écran Imports ; le mois repasse à valider.",
    },
    {
      titre: "Août, septembre, octobre",
      texte:
        "La balance analytique du mois seul et la balance ventilée depuis novembre, déposées depuis Imports ; la prévision passée chantier par chantier sur le 713 et reportée dans la vue Chantiers ; la validation du mois.",
    },
    {
      titre: "Novembre, exercice 2026/27",
      texte:
        "L'application lit la prévision directement sur le 713, chantier par chantier, comme pour Sodobat. Les objectifs 2026/27 des dirigeants sont à renseigner à ce moment-là.",
    },
  ],
};
