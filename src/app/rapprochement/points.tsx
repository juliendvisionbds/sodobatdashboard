import type { ReactNode } from "react";

// Les points à conclure du rapprochement, rédigés à l'adresse de la DAF.
//
// Ce module ne contient que du contenu : la page le met en forme et y accroche
// la zone de réponse partagée. Document repris à zéro le 30 septembre 2026 :
// les quinze points du premier échange (clés c1 à c15) sont clos, leurs réponses
// restent en base ; ceux-ci portent des clés neuves, de c21 à c28.
// Constats mis à jour le 1er octobre 2026, après l'import des balances rééditées
// de novembre à juin.

export type Tone = "stop" | "warn" | "ok";

export type Point = {
  /** clé de la réponse enregistrée, stable dans le temps */
  key: string;
  n: number;
  title: string;
  stake: string;
  tone: Tone;
  body: ReactNode;
  /** ce qui est attendu, mis en avant sous le constat */
  ask: string;
};

const N = ({ children }: { children: ReactNode }) => <span className="doc-num">{children}</span>;

export const POINTS: Point[] = [
  {
    key: "c21",
    n: 1,
    title: "Vos corrections sont en place : il manque mai et deux écritures",
    stake: "le fichier de mai bloque la validation de mai",
    tone: "stop",
    body: (
      <>
        <p>
          Vos balances rééditées de novembre à juin sont importées depuis le 1er octobre, sauf
          mai. Le management NJW est à <N>115 700 €</N> tous les mois, sur le seul centre FX ;
          les honoraires de chantier sont revenus sur le 62261000, chantier par chantier ; les
          1 970 € d&apos;honoraires chantier ont quitté le centre FX. Les Frais généraux
          n&apos;ont plus qu&apos;une ligne, « Honoraires management NJW ».
        </p>
        <p>Trois choses restent :</p>
        <ul>
          <li>
            <strong>Le fichier de mai</strong> : la balance analytique reçue sous le nom de mai
            contient les données d&apos;avril (mêmes totaux au centime : 1 680 439,92 de charges,
            1 633 147,54 de produits, mêmes 603 lignes). Elle n&apos;a pas été importée : mai reste
            sur l&apos;export du 23 septembre, sans vos corrections d&apos;honoraires.
          </li>
          <li>
            <strong>Les 595 € d&apos;intérim de décembre</strong> (compte 6211) sont toujours sur
            le centre FX. C&apos;est le dernier compte sans ligne dans les Frais généraux.
          </li>
          <li>
            <strong>Mars</strong> : la balance générale porte <N>1 283,34 €</N> sur un compte
            nouveau, 79150000 « remboursement assurance sinistre », absent de la balance
            analytique de mars. C&apos;est le seul écart entre les deux balances, de novembre à
            juin.
          </li>
        </ul>
      </>
    ),
    ask: "Pouvez-vous renvoyer la balance analytique de mai ? Les 595 € d'intérim de décembre sont-ils à sortir du centre FX ? Et à quel centre rattacher les 1 283,34 € de mars ?",
  },
  {
    key: "c22",
    n: 2,
    title: "Juin : les prévisions sont comptabilisées par chantier",
    stake: "réglé le 1er octobre, juin est validable",
    tone: "ok",
    body: (
      <>
        <p>
          Le bloc de 1 033 201 € sur le centre FX a disparu. Les prévisions de juin sont
          passées chantier par chantier, pour <N>502 911 €</N>. Sur les 13 chantiers saisis dans
          la vue Chantiers, la comptabilité est identique à la saisie : <N>470 661 €</N> des deux
          côtés, écart nul. Les chantiers sans saisie (964F, 53, 993D, 52, 1007E, 1038C,
          1000E…) sont à zéro en comptabilité comme à l&apos;écran.
        </p>
        <p>
          Le résultat comptable de juin passe ainsi de −295 357 € à <N>−847 147 €</N> : la
          prévision réelle remplace l&apos;écriture d&apos;attente de 1 054 701 €.
        </p>
        <p>
          <strong>994E</strong> : le 713 de juin porte <N>32 250 €</N> au crédit, soit les
          21 500 € qui rattrapent la reprise de mai (64 500 € repris pour 43 000 € de prévision
          en avril) et les 10 750 € de prévision de juin. L&apos;application lit tout crédit du
          713 comme une prévision : la case affiche donc 32 250 €. Le chiffre d&apos;affaires et
          le cumul du chantier sont justes ; seule la répartition entre les lignes Annulation et
          Prévision de juin est décalée de 21 500 €.
        </p>
        <p className="doc-note">
          Ne saisissez pas 10 750 dans la case de 994E : la saisie remplacerait les 32 250 € lus
          en comptabilité, et un écart de 21 500 € apparaîtrait au contrôle du mois.
        </p>
      </>
    ),
    ask: "Pour 994E, préférez-vous laisser ainsi, ou corriger la reprise de mai à 43 000 € en comptabilité, ce qui remettrait chaque montant sur sa ligne ?",
  },
  {
    key: "c23",
    n: 3,
    title: "Juillet : la balance générale, les écritures récurrentes et le 713",
    stake: "bloque la Synthèse et la validation de juillet",
    tone: "stop",
    body: (
      <>
        <p>
          Votre balance générale rééditée s&apos;arrête à juin : la Synthèse s&apos;arrête donc à
          juin, et juillet n&apos;y reviendra qu&apos;avec une balance générale allant
          jusqu&apos;à juillet. La balance analytique de juillet en base est celle du 20
          septembre.
        </p>
        <p>
          Elle ne porte aucune écriture de 713 : ni la reprise des <N>502 911 €</N> de juin, ni
          la prévision de juillet. Et plusieurs charges qui tombent chaque mois y sont à zéro :
          crédit-bail (612, 2 574 € par mois jusqu&apos;en juin), assurances (616), impôts et
          taxes (635), ainsi que les comptes 618 et 623.
        </p>
      </>
    ),
    ask: "Une fois juin validé : écritures récurrentes de juillet, reprise de juin, prévision de juillet saisie par les dirigeants puis comptabilisée par chantier, et dépôt de la balance analytique de juillet et de la balance générale jusqu'à juillet.",
  },
  {
    key: "c24",
    n: 4,
    title: "Août : la balance générale manque, l'analytique est à confirmer",
    stake: "bloque la Synthèse d'août",
    tone: "stop",
    body: (
      <>
        <p>
          Nous n&apos;avons pas de balance générale pour août, et la balance analytique
          d&apos;août ne peut pas être recoupée.
        </p>
        <p>
          Cette balance analytique, déposée le 24 septembre, est basse : <N>550 095 €</N> de
          chiffre d&apos;affaires, <N>55 379 €</N> de charges de personnel contre 130 000 environ
          les autres mois, 418 lignes contre 570 à 640. L&apos;effet des congés d&apos;août
          l&apos;explique peut-être. Elle ne porte aucune écriture de 713.
        </p>
      </>
    ),
    ask: "Cette balance d'août est-elle définitive ou un premier brouillon ? Après juillet : même circuit, avec la balance générale arrêtée à août.",
  },
  {
    key: "c25",
    n: 5,
    title: "Valider les mois, de novembre à juin",
    stake: "novembre à avril et juin sont prêts",
    tone: "warn",
    body: (
      <p>
        Novembre, que vous aviez validé le 28 septembre, est à revalider : ses balances ont été
        réimportées. De décembre à juin, les prévisions comptabilisées sont ventilées par
        chantier et l&apos;écart de contrôle est nul. Novembre à avril et juin peuvent être
        validés dès maintenant ; mai attend son bon fichier (point 1), sans quoi il serait à
        revalider. L&apos;analyse mensuelle de novembre, sur la page Objectifs, est restée en
        brouillon.
      </p>
    ),
    ask: "Validez novembre à avril, puis juin, dans la vue Chantiers ; mai dès que son fichier est déposé.",
  },
  {
    key: "c26",
    n: 6,
    title: "Des codes de centre erronés, encore utilisés cet exercice",
    stake: "les écrans sont justes, la comptabilité ne l'est pas",
    tone: "warn",
    body: (
      <>
        <p>
          Vous aviez répondu ne plus pouvoir corriger les exercices antérieurs. Ces écritures-ci
          sont de l&apos;exercice en cours, et votre balance rééditée de juin les porte encore :
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Centre saisi</th><th>Vrai chantier</th><th>Juin</th><th>Juillet</th><th>Août</th></tr>
              <tr><td>52MF</td><td>52 · Mairie de Fréjus</td><td>17 155</td><td>53 716</td><td className="muted">—</td></tr>
              <tr><td>1036C</td><td>1036A · SCI BXJF</td><td>423</td><td>421</td><td className="muted">—</td></tr>
              <tr><td>1047A</td><td>1047E · École Aubanel</td><td className="muted">—</td><td>4 650</td><td>2 473</td></tr>
              <tr><td>FORMA</td><td>à identifier</td><td className="muted">—</td><td className="muted">—</td><td>3 955</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          L&apos;application rattache déjà 52MF, 1036C et 1047A à leur vrai chantier. Le centre
          FORMA, lui, n&apos;est rattaché à rien : ce sont des salaires et charges sociales, que
          l&apos;application range en frais généraux faute de mieux.
        </p>
      </>
    ),
    ask: "FORMA est-il le centre FORMATION ? Et pouvez-vous corriger ces codes en reprenant juillet et août, ou au moins ne plus les alimenter ?",
  },
  {
    key: "c27",
    n: 7,
    title: "Pennylane en novembre : un export de chaque nature avant le premier envoi",
    stake: "à recevoir avant le tableau de novembre",
    tone: "warn",
    body: (
      <>
        <p>
          Vous l&apos;avez précisé le 1er octobre : Sodobat passe sur Pennylane en novembre.
          Août, septembre et octobre nous arrivent donc encore au format Cegid, comme
          aujourd&apos;hui : rien ne change pour la fin de l&apos;exercice, et la balance
          générale d&apos;août peut être déposée telle quelle (point 4).
        </p>
        <p>
          L&apos;application lit la balance ventilée Cegid (une colonne par mois) et la balance
          analytique Cegid par centre. Pennylane ne sort pas de balance ventilée : l&apos;import
          est à adapter avant votre premier envoi dans ce format, celui du tableau de novembre,
          attendu fin décembre. Les autres entités étant déjà sur Pennylane, un export de
          l&apos;une d&apos;elles suffit pour commencer.
        </p>
      </>
    ),
    ask: "Pouvez-vous nous envoyer dès maintenant un export Pennylane de balance générale et un de balance analytique, sur n'importe quel mois et n'importe quelle entité ?",
  },
  {
    key: "c28",
    n: 8,
    title: "La clôture au 31 octobre : assurances, amortissements, objectifs",
    stake: "à prévoir, rien ne bloque",
    tone: "warn",
    body: (
      <ul>
        <li>
          <strong>Assurances (616)</strong> : elles ne sont pas réparties par mois en comptabilité
          (<N>+116 796</N> en novembre, <N>−76 991</N> en décembre, <N>−24 686</N> en mars).
          Le résultat mensuel en est déformé. L&apos;application peut les lisser comme les
          amortissements, si vous le souhaitez.
        </li>
        <li>
          <strong>Amortissements</strong> : réglé selon votre réponse du 1er octobre. Jusqu&apos;à
          la clôture, rien ne change : l&apos;application lisse le cumul comptabilisé
          (<N>31 147 €</N> passés en juin, soit 3 893 € par mois jusqu&apos;en juin et 4 774 €
          ensuite). L&apos;écriture de clôture recalera les douze mois à parts égales : les mois
          déjà affichés bougeront de quelques centaines d&apos;euros chacun. À partir de
          novembre, les dotations passées chaque mois dans Pennylane seront lues telles
          quelles, sans lissage : l&apos;application est prête.
        </li>
        <li>
          <strong>Septembre et octobre</strong> : les deux dernières balances de l&apos;exercice,
          selon votre circuit (V1, V2, V3), puis les écritures d&apos;inventaire.
        </li>
        <li>
          <strong>Objectifs 2026/27</strong> : les douze objectifs de l&apos;exercice en cours
          sont saisis ; ceux du prochain seront à renseigner en novembre.
        </li>
      </ul>
    ),
    ask: "Souhaitez-vous que les assurances soient lissées dans l'application, et à quelle date prévoyez-vous la balance de clôture ?",
  },
];

export const FICHIERS = [
  {
    nom: "La balance analytique de mai",
    pourquoi:
      "Le fichier reçu sous le nom de mai contient les données d'avril. Mai reste sur l'export du 23 septembre tant que le bon fichier n'est pas déposé.",
    tag: "point 1",
    tone: "stop" as Tone,
  },
  {
    nom: "Juillet : la balance analytique et la balance générale jusqu'à juillet",
    pourquoi:
      "Après les écritures récurrentes, la reprise des 502 911 € de juin et la prévision de juillet par chantier. La Synthèse s'arrête à juin en attendant.",
    tag: "point 3",
    tone: "stop" as Tone,
  },
  {
    nom: "Août : la balance analytique et la balance générale jusqu'à août",
    pourquoi:
      "Même circuit que juillet. La balance générale remplace la précédente en un seul import.",
    tag: "point 4",
    tone: "stop" as Tone,
  },
  {
    nom: "Un export Pennylane de balance générale et un de balance analytique",
    pourquoi:
      "Pour adapter l'import avant le tableau de novembre, premier mois de Sodobat sur Pennylane. N'importe quel mois convient, d'une entité déjà sur Pennylane.",
    tag: "point 7",
    tone: "warn" as Tone,
  },
  {
    nom: "Les balances de septembre et d'octobre, puis la clôture",
    pourquoi:
      "Selon votre circuit : à J+7 après la TVA, en V1, V2 puis V3 définitive. Octobre ferme l'exercice.",
    tag: "point 8",
    tone: "warn" as Tone,
  },
];

export const ETAPES = [
  {
    titre: "Mai",
    texte:
      "Vous déposez la bonne balance analytique de mai depuis l'écran Imports : elle remplace celle du même mois. Au passage, les 595 € d'intérim de décembre et les 1 283,34 € de mars (point 1).",
  },
  {
    titre: "Les validations, de novembre à juin",
    texte:
      "Novembre à avril et juin sont prêts ; mai suit son fichier. Un mois après l'autre, dans la vue Chantiers (point 5).",
  },
  {
    titre: "Juillet",
    texte:
      "Écritures récurrentes, reprise de juin, prévisions des dirigeants, 713 par chantier, puis balance analytique et balance générale jusqu'à juillet. L'écart tombe à zéro, vous validez (point 3).",
  },
  {
    titre: "Août",
    texte: "De la même façon, avec la balance générale arrêtée à août (point 4).",
  },
  {
    titre: "Septembre, octobre et la clôture",
    texte:
      "Au format Cegid, comme aujourd'hui. Pennylane prend le relais avec le tableau de novembre (points 7 et 8).",
  },
];
