import type { ReactNode } from "react";

// Les points à conclure du rapprochement, rédigés à l'adresse de la DAF.
//
// Ce module ne contient que du contenu : la page le met en forme et y accroche
// la zone de réponse partagée. Document repris à zéro le 30 septembre 2026 :
// les quinze points du premier échange (clés c1 à c15) sont clos, leurs réponses
// restent en base ; ceux-ci portent des clés neuves, de c21 à c28.

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
    title: "Les balances rééditées après vos corrections, de novembre à août",
    stake: "à faire en premier : tout le reste en dépend",
    tone: "stop",
    body: (
      <>
        <p>
          Vous aviez annoncé trois corrections en comptabilité. Aucune n&apos;est encore dans les
          balances que nous avons :
        </p>
        <ul>
          <li>
            <strong>Honoraires de management</strong> : tout est encore sur le seul compte
            62263000. Le compte 62263100 (NJW) n&apos;existe pas dans les balances. Les deux
            lignes de l&apos;application l&apos;attendent.
          </li>
          <li>
            <strong>Honoraires de chantier saisis en management</strong> : environ{" "}
            <N>17 100 €</N> sur le compte 62263000, imputés à des chantiers (994E, 934D, 919D,
            962F, 1032E…), de février à juin.
          </li>
          <li>
            <strong>Deux erreurs de saisie sur le centre FX</strong> : <N>595 €</N> d&apos;intérim
            (6211, décembre) et <N>1 970 €</N> d&apos;honoraires chantier (62261 : 270 en
            décembre, 1 700 en janvier). Ce sont les deux seuls comptes encore sans ligne dans
            les Frais généraux.
          </li>
        </ul>
        <p className="doc-note">
          Un mois réimporté est à revalider : novembre, que vous avez validé le 28 septembre,
          le sera aussi. C&apos;est pourquoi ce point passe avant les validations.
        </p>
      </>
    ),
    ask: "Passez ces corrections, puis rééditez et déposez les balances analytiques de novembre à août et la balance générale.",
  },
  {
    key: "c22",
    n: 2,
    title: "Juin : la prévision à ventiler par chantier",
    stake: "bloque la validation de juin",
    tone: "stop",
    body: (
      <>
        <p>
          La reprise des prévisions de mai est bien passée chantier par chantier
          (<N>1 054 701 €</N>). En face, la prévision de juin est un bloc de{" "}
          <N>1 033 201 €</N> sur le centre FX, plus <N>21 500 €</N> sur 994E : le total égale
          exactement la reprise. C&apos;est une écriture d&apos;attente, pas une prévision par
          chantier.
        </p>
        <p>
          Dans la vue Chantiers, <N>470 661 €</N> de prévisions sont saisis pour juin, sur 13
          chantiers, encore en brouillon. En mai, 28 chantiers portaient une prévision. Ceux qui
          n&apos;en ont pas en juin, pour les plus gros :
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Chantier</th><th>Prévision de mai</th><th>Saisie de juin</th></tr>
              <tr><td>964F · Le Meust</td><td>257 240</td><td className="muted">—</td></tr>
              <tr><td>53 · Travaux divers</td><td>85 000</td><td className="muted">—</td></tr>
              <tr><td>993D · École de la Bouverie</td><td>80 000</td><td className="muted">—</td></tr>
              <tr><td>52 · Mairie de Fréjus</td><td>55 000</td><td className="muted">—</td></tr>
              <tr><td>1007E · Cinéma La Renaissance</td><td>45 000</td><td className="muted">—</td></tr>
              <tr><td>1038C · Transgourmet</td><td>35 000</td><td className="muted">—</td></tr>
              <tr><td>1000E · Port de Sainte-Maxime</td><td>20 000</td><td className="muted">—</td></tr>
            </tbody>
          </table>
        </div>
      </>
    ),
    ask: "Faites confirmer par les dirigeants que ces chantiers sont bien à zéro en juin, puis passez le 713 chantier par chantier à la place du bloc FX, et réexportez juin.",
  },
  {
    key: "c23",
    n: 3,
    title: "Juillet : le mois ne paraît pas clôturé",
    stake: "bloque la validation de juillet",
    tone: "stop",
    body: (
      <>
        <p>
          La balance de juillet ne porte aucune écriture de 713 : ni la reprise de juin, ni la
          prévision de juillet. Son résultat de <N>+469 803 €</N> n&apos;est donc pas un
          résultat de gestion.
        </p>
        <p>
          Plusieurs charges qui tombent chaque mois sont à zéro en juillet : crédit-bail (612,
          2 574 € par mois jusqu&apos;en juin), assurances (616), impôts et taxes (635), ainsi que
          les comptes 618 et 623.
        </p>
      </>
    ),
    ask: "Pouvez-vous passer les écritures récurrentes de juillet, puis la reprise de juin et la prévision de juillet une fois saisie par les dirigeants, et réexporter le mois ?",
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
          Nous n&apos;avons pas de balance générale pour août : la Synthèse s&apos;arrête à
          juillet, et la balance analytique d&apos;août ne peut pas être recoupée.
        </p>
        <p>
          Cette balance analytique, déposée le 24 septembre, est basse : <N>550 095 €</N> de
          chiffre d&apos;affaires, <N>55 379 €</N> de charges de personnel contre 130 000 environ
          les autres mois, 418 lignes contre 570 à 640. L&apos;effet des congés d&apos;août
          l&apos;explique peut-être. Elle ne porte aucune écriture de 713.
        </p>
      </>
    ),
    ask: "Cette balance d'août est-elle définitive ou un premier brouillon ? Et pouvez-vous déposer la balance générale arrêtée à août ?",
  },
  {
    key: "c25",
    n: 5,
    title: "Valider les mois, de novembre à mai",
    stake: "après le point 1",
    tone: "warn",
    body: (
      <p>
        Seul novembre est validé. De décembre à mai, les prévisions comptabilisées sont ventilées
        par chantier et l&apos;écart de contrôle est nul : ces six mois sont validables tels
        quels. Mieux vaut pourtant attendre les balances rééditées du point 1, puisqu&apos;un mois
        réimporté est à revalider. L&apos;analyse mensuelle de novembre, sur la page Objectifs,
        est restée en brouillon.
      </p>
    ),
    ask: "Une fois les balances rééditées déposées, validez novembre à mai dans la vue Chantiers, et publiez les analyses mensuelles.",
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
          sont de l&apos;exercice en cours :
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
    ask: "FORMA est-il le centre FORMATION ? Et pouvez-vous corriger ces quatre codes sur juin, juillet et août, ou au moins ne plus les alimenter ?",
  },
  {
    key: "c27",
    n: 7,
    title: "Pennylane : un export de chaque nature, et la date de bascule",
    stake: "conditionne la lecture des prochains mois",
    tone: "warn",
    body: (
      <p>
        L&apos;application lit aujourd&apos;hui la balance ventilée Cegid (une colonne par mois) et
        la balance analytique Cegid par centre. Vous ne pourrez plus sortir de balance ventilée
        depuis Pennylane : il faut adapter l&apos;import avant votre premier envoi dans ce format.
        Si août ou septembre nous arrivent déjà depuis Pennylane, ce point passe devant le point 4.
      </p>
    ),
    ask: "À partir de quel mois les balances sortiront-elles de Pennylane ? Envoyez-nous un export de balance générale et un de balance analytique, sur n'importe quel mois.",
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
          <strong>Amortissements</strong> : une seule écriture cet exercice, <N>31 147 €</N> en
          juin. L&apos;application lisse à 3 893 € par mois jusqu&apos;en juin et à 4 774 €
          ensuite ; l&apos;écriture de clôture recalera le tout.
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
    nom: "Les balances analytiques de novembre à août, rééditées",
    pourquoi:
      "Après les corrections du point 1 (deux comptes d'honoraires de management, honoraires de chantier, intérim et honoraires retirés du centre FX) et, pour juin à août, celles des codes de centre du point 6.",
    tag: "point 1 · point 6",
    tone: "stop" as Tone,
  },
  {
    nom: "La balance générale arrêtée à août",
    pourquoi:
      "Elle manque : la Synthèse s'arrête à juillet. Rééditée après les mêmes corrections, elle remplace celle de juillet en un seul import.",
    tag: "points 1 et 4",
    tone: "stop" as Tone,
  },
  {
    nom: "Juin, juillet et août avec le 713 ventilé par chantier",
    pourquoi:
      "Un mois après l'autre : les dirigeants saisissent, vous comptabilisez par chantier, vous réexportez le mois, l'écart tombe à zéro et vous validez.",
    tag: "points 2, 3 et 4",
    tone: "stop" as Tone,
  },
  {
    nom: "Un export Pennylane de balance générale et un de balance analytique",
    pourquoi:
      "Pour adapter l'import avant votre premier envoi dans ce format. N'importe quel mois convient.",
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
    titre: "Les corrections en comptabilité",
    texte:
      "Honoraires de management sur deux comptes, honoraires de chantier remis à leur place, intérim et honoraires sortis du centre FX, codes de centre corrigés (points 1 et 6).",
  },
  {
    titre: "Les balances rééditées, de novembre à mai",
    texte:
      "Vous les déposez depuis l'écran Imports : chaque fichier remplace celui du même mois. Vous validez ensuite ces sept mois, l'un après l'autre (point 5).",
  },
  {
    titre: "Juin",
    texte:
      "Les dirigeants terminent leurs prévisions, vous passez le 713 par chantier, vous réexportez juin, l'encart « Validation du mois » tombe à zéro, vous validez (point 2).",
  },
  {
    titre: "Juillet, puis août",
    texte:
      "De la même façon, avec les écritures récurrentes de juillet et la balance générale d'août (points 3 et 4).",
  },
  {
    titre: "Septembre, octobre et la clôture",
    texte:
      "Dans le format Cegid ou Pennylane selon la date de bascule (points 7 et 8).",
  },
];
