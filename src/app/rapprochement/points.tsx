import type { ReactNode } from "react";

// Les huit points du rapprochement, clos le 6 octobre 2026 avec les réponses de
// la DAF du 5 octobre. Ce module ne contient que du contenu : la page le met en
// forme et y joint la réponse enregistrée en base (clés c21 à c28, celles du
// document du 1er octobre ; les quinze points du premier échange, c1 à c15,
// restent en base eux aussi).

export type PointClos = {
  /** clé de la réponse enregistrée, stable dans le temps */
  key: string;
  n: number;
  title: string;
  /** à afficher quand aucune réponse n'a été enregistrée */
  sansReponse?: string;
  /** ce qui en a été fait dans l'application, ou ce qui suit et par qui */
  suite: ReactNode;
};

const N = ({ children }: { children: ReactNode }) => <span className="doc-num">{children}</span>;

export const POINTS_CLOS: PointClos[] = [
  {
    key: "c21",
    n: 1,
    title: "Mai, les 595 € de décembre et les 1 283,34 € de mars",
    suite: (
      <p>
        Vos trois balances rééditées le 5 octobre sont importées le 6 : décembre, où
        l&apos;intérim est passé sur DEPOT ; mars, où le remboursement de sinistre est sur le
        chantier 766D Château Margui, sur la ligne « Autres produits chantier » ; et mai, le bon
        fichier cette fois, avec vos corrections d&apos;honoraires. Plus aucun compte n&apos;est
        sans ligne, dans aucune vue, et chaque mois de novembre à juin recoupe la balance
        générale au centime.
      </p>
    ),
  },
  {
    key: "c22",
    n: 2,
    title: "994E : la lecture du compte 713 suit votre convention",
    suite: (
      <p>
        L&apos;application lit désormais la prévision d&apos;un mois comme la provision en cours
        à la fin du mois, et l&apos;annulation comme la prévision du mois précédent, de signe
        opposé. Pour 994E, mai montre une annulation de <N>−43 000</N> et une prévision de{" "}
        <N>−21 500</N> ; juin, une annulation de <N>21 500</N> et une prévision de{" "}
        <N>10 750</N>. Dans le cas courant, cette lecture est identique à l&apos;ancienne ; le
        chiffre d&apos;affaires, le résultat et les cumuls ne bougent pas.
      </p>
    ),
  },
  {
    key: "c23",
    n: 3,
    title: "Juillet",
    suite: (
      <p>
        Juin est complet, recoupé et conforme à vos réponses : nous validons novembre à juin dans
        la vue Chantiers. Juillet suit, à votre rythme : écritures récurrentes, reprise de juin et
        prévision de juillet passées chantier par chantier sur le 713, puis la balance analytique
        de juillet et la balance générale jusqu&apos;à juillet, déposées depuis l&apos;écran
        Imports.
      </p>
    ),
  },
  {
    key: "c24",
    n: 4,
    title: "Août",
    suite: (
      <p>
        Même circuit après la validation de juillet, avec la balance générale arrêtée à août. La
        balance analytique d&apos;août du 24 septembre sera remplacée par la vôtre.
      </p>
    ),
  },
  {
    key: "c25",
    n: 5,
    title: "Valider les mois",
    sansReponse: "Pas de réponse attendue : c'est à nous de le faire.",
    suite: (
      <p>
        Novembre à juin se valident de notre côté, dans la vue Chantiers, un mois après
        l&apos;autre. La partie A en tient le compte à chaque affichage.
      </p>
    ),
  },
  {
    key: "c26",
    n: 6,
    title: "FORMA et les codes de centre erronés",
    suite: (
      <p>
        FORMA est lu comme FX par l&apos;application : ses salaires et charges sociales sont en
        frais généraux, et l&apos;alerte d&apos;août est refermée. 52MF, 1036C et 1047A restent
        rattachés à leur vrai chantier. La correction des codes dans Cegid reste souhaitable pour
        la comptabilité elle-même, sans rien bloquer.
      </p>
    ),
  },
  {
    key: "c27",
    n: 7,
    title: "Pennylane en novembre",
    sansReponse: "Pas de réponse nécessaire : réglé par ailleurs.",
    suite: (
      <p>
        L&apos;import Pennylane est construit et en service sur Covarbat depuis le 1er octobre, à
        partir de la balance ventilée mois par mois et de la balance analytique du mois. Pour
        Sodobat en novembre, deux attentions : un code et un libellé propres à chaque chantier,
        et la prévision passée chantier par chantier sur le 713. Les numéros de compte des
        dotations aux amortissements dans Pennylane seront à nous indiquer au premier envoi.
      </p>
    ),
  },
  {
    key: "c28",
    n: 8,
    title: "Assurances, amortissements, clôture",
    suite: (
      <p>
        Les assurances sont lissées en comptabilité par vos écritures : l&apos;application ne les
        retraite pas, la comptabilité fait foi. Les amortissements restent lissés jusqu&apos;à la
        clôture, puis lus mois par mois à partir de novembre. Les indemnités d&apos;assurance
        (75870000) gardent leur ligne à part dans les Frais généraux ; elle vient désormais en
        déduction du total au lieu de s&apos;y ajouter, c&apos;était une erreur de signe.
        Septembre, octobre et la clôture suivent votre circuit, au format Cegid.
      </p>
    ),
  },
];

export const SUITE = [
  {
    titre: "Novembre à juin",
    texte: "Nous validons les huit mois dans la vue Chantiers. Rien n'est attendu de vous.",
  },
  {
    titre: "Juillet",
    texte:
      "Écritures récurrentes, reprise de juin et prévision de juillet par chantier, puis les deux balances depuis l'écran Imports. L'écart tombe à zéro, le mois se valide.",
  },
  {
    titre: "Août, septembre, octobre",
    texte:
      "Même circuit, mois après mois, puis les écritures d'inventaire et la balance de clôture.",
  },
  {
    titre: "Novembre, sur Pennylane",
    texte:
      "Balance ventilée mois par mois et balance analytique du mois, comme pour Covarbat. Les objectifs 2026/27 sont à renseigner à ce moment-là.",
  },
];
