import type { ReactNode } from "react";

// Contenu rédigé de la page Rapprochement, par entité. La page met en forme et
// joint à chaque point la réponse enregistrée en base (table
// rapprochement_decisions, par entité et par clé). Une réponse reçue hors de
// l'application (courriel) est citée ici telle quelle.

export type Tone = "stop" | "warn" | "ok";

export type Point = {
  /** clé de la réponse enregistrée, stable dans le temps (c + chiffres) */
  key: string;
  n: number;
  title: string;
  tone: Tone;
  /** ce que le point bloque, ou son état */
  stake: string;
  /** réponse reçue par courriel, citée telle quelle */
  reponseCourriel?: string;
  /** à afficher quand aucune réponse n'existe */
  sansReponse?: string;
  /** ce qui en a été fait dans l'application, ou ce qui suit et par qui */
  suite: ReactNode;
  /** point encore ouvert : ce qui est attendu, avec une zone de réponse */
  ask?: string;
};

export type Contenu = {
  fiscalYearStart: number;
  /** date des constats, en toutes lettres */
  dateConstats: string;
  /** date et canal des réponses citées hors application */
  sourceReponses: string;
  intro: ReactNode;
  /** note sous le tableau des mois */
  noteMois: ReactNode;
  /** « Ce qui est contrôlé et juste » */
  controles: ReactNode[];
  titreB: string;
  introB: string;
  points: Point[];
  titreC: string;
  introC: string;
  suite: { titre: string; texte: string }[];
};

export const N = ({ children }: { children: ReactNode }) => <span className="doc-num">{children}</span>;

// ── Sodobat ──────────────────────────────────────────────────────────────────
// Les huit points du 1er octobre 2026, clos le 6 avec les réponses de la DAF du
// 5 octobre (clés c21 à c28 ; les quinze points du premier échange, c1 à c15,
// restent en base eux aussi).

export const SODOBAT: Contenu = {
  fiscalYearStart: 2025,
  dateConstats: "6 octobre 2026",
  sourceReponses: "page Rapprochement, 5 octobre 2026",
  intro: (
    <>
      Ce document est le vôtre. Les huit points du 1er octobre sont clos avec vos réponses du
      5 octobre, et vos trois balances rééditées sont en place depuis le 6 octobre : de novembre
      à juin, les tableaux de gestion de l&apos;application sont ceux de la comptabilité. Il
      reste ici l&apos;état de chaque mois (partie A), lu en base à chaque affichage, ce qui a été
      fait de chacune de vos réponses (partie B) et la suite du calendrier (partie C). Il
      n&apos;y a plus de question en attente.
    </>
  ),
  noteMois: (
    <>
      « Prévisions comptabilisées » : la provision en cours à la fin du mois, lue chantier par
      chantier sur le compte 713 (point 2). En juillet et en août, aucune écriture de 713
      n&apos;est encore passée : un écart nul sur ces deux mois ne dit donc pas qu&apos;ils sont
      prêts.
    </>
  ),
  controles: [
    <>
      De novembre à juin, chaque balance analytique recoupe la balance générale du même mois au
      centime, sur les classes 6 et 7, sans exception.
    </>,
    <>
      Tous les comptes ont une ligne d&apos;accueil dans la Synthèse, dans la vue Chantiers et
      dans les Frais généraux ; la vue Chantiers ne perd aucun solde, quel que soit le mois. Le
      management NJW est à 115 700 € tous les mois.
    </>,
    <>
      De novembre à juin, les prévisions sont comptabilisées chantier par chantier ; en juin, la
      comptabilité est identique aux 13 prévisions saisies.
    </>,
    <>
      Les conventions arrêtées avec vous sont en place : base comptable, DEPOT et SAV en
      chantier, cumuls avec leur part de prévisions, amortissements lissés, assurances telles
      qu&apos;en comptabilité, Synthèse comptable avec son résultat de gestion.
    </>,
  ],
  titreB: "Vos réponses, et ce qui en est fait",
  introB:
    "Les huit points du 1er octobre, avec votre réponse du 5 octobre telle que vous l'avez écrite, et ce que l'application en a fait le 6.",
  points: [
    {
      key: "c21",
      n: 1,
      title: "Mai, les 595 € de décembre et les 1 283,34 € de mars",
      tone: "ok",
      stake: "clos le 6 octobre 2026",
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
      tone: "ok",
      stake: "clos le 6 octobre 2026",
      suite: (
        <p>
          L&apos;application lit désormais la prévision d&apos;un mois comme la provision en
          cours à la fin du mois, et l&apos;annulation comme la prévision du mois précédent, de
          signe opposé. Pour 994E, mai montre une annulation de <N>−43 000</N> et une prévision
          de <N>−21 500</N> ; juin, une annulation de <N>21 500</N> et une prévision de{" "}
          <N>10 750</N>. Dans le cas courant, cette lecture est identique à l&apos;ancienne ; le
          chiffre d&apos;affaires, le résultat et les cumuls ne bougent pas.
        </p>
      ),
    },
    {
      key: "c23",
      n: 3,
      title: "Juillet",
      tone: "ok",
      stake: "clos le 6 octobre 2026",
      suite: (
        <p>
          Juin est complet, recoupé et conforme à vos réponses : novembre à juin sont validés
          dans la vue Chantiers. Juillet suit, à votre rythme : écritures récurrentes, reprise de
          juin et prévision de juillet passées chantier par chantier sur le 713, puis la balance
          analytique de juillet et la balance générale jusqu&apos;à juillet, déposées depuis
          l&apos;écran Imports.
        </p>
      ),
    },
    {
      key: "c24",
      n: 4,
      title: "Août",
      tone: "ok",
      stake: "clos le 6 octobre 2026",
      suite: (
        <p>
          Même circuit après la validation de juillet, avec la balance générale arrêtée à août.
          La balance analytique d&apos;août du 24 septembre sera remplacée par la vôtre.
        </p>
      ),
    },
    {
      key: "c25",
      n: 5,
      title: "Valider les mois",
      tone: "ok",
      stake: "clos le 6 octobre 2026",
      sansReponse: "Pas de réponse attendue : c'était à nous de le faire.",
      suite: (
        <p>
          Novembre à juin ont été validés le 6 octobre dans la vue Chantiers. La partie A en
          tient le compte à chaque affichage.
        </p>
      ),
    },
    {
      key: "c26",
      n: 6,
      title: "FORMA et les codes de centre erronés",
      tone: "ok",
      stake: "clos le 6 octobre 2026",
      suite: (
        <p>
          FORMA est lu comme FX par l&apos;application : ses salaires et charges sociales sont en
          frais généraux, et l&apos;alerte d&apos;août est refermée. 52MF, 1036C et 1047A restent
          rattachés à leur vrai chantier. La correction des codes dans Cegid reste souhaitable
          pour la comptabilité elle-même, sans rien bloquer.
        </p>
      ),
    },
    {
      key: "c27",
      n: 7,
      title: "Pennylane en novembre",
      tone: "ok",
      stake: "clos le 6 octobre 2026",
      sansReponse: "Pas de réponse nécessaire : réglé par ailleurs.",
      suite: (
        <p>
          L&apos;import Pennylane est construit et en service sur Covarbat depuis le 1er octobre,
          à partir de la balance ventilée mois par mois et de la balance analytique du mois. Pour
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
      tone: "ok",
      stake: "clos le 6 octobre 2026",
      suite: (
        <p>
          Les assurances sont lissées en comptabilité par vos écritures : l&apos;application ne
          les retraite pas, la comptabilité fait foi. Les amortissements restent lissés
          jusqu&apos;à la clôture, puis lus mois par mois à partir de novembre. Les indemnités
          d&apos;assurance (75870000) gardent leur ligne à part dans les Frais généraux ; elle
          vient désormais en déduction du total au lieu de s&apos;y ajouter, c&apos;était une
          erreur de signe. Septembre, octobre et la clôture suivent votre circuit, au format Cegid.
        </p>
      ),
    },
  ],
  titreC: "La suite",
  introC:
    "Le circuit mensuel, sans autre échange que vos dépôts : l'application signale d'elle-même ce qui manque, dans la partie A et dans les alertes.",
  suite: [
    {
      titre: "Novembre à juin",
      texte: "Les huit mois sont validés dans la vue Chantiers. Rien n'est attendu de vous.",
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
  ],
};
