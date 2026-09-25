import type { ReactNode } from "react";

// Les points ouverts du rapprochement, rédigés à l'adresse de la DAF.
//
// Ce module ne contient que du contenu : la page le met en forme et y accroche
// la zone de réponse partagée. Les numéros sont stables — ils servent de
// référence commune dans les échanges, y compris quand un point est refermé.

export type Tone = "stop" | "warn" | "ok";

export type Point = {
  /** clé de la réponse enregistrée, stable dans le temps */
  key: string;
  n: number;
  title: string;
  stake: string;
  tone: Tone;
  body: ReactNode;
  /** la question posée, mise en avant sous le constat */
  ask: string;
};

const N = ({ children }: { children: ReactNode }) => <span className="doc-num">{children}</span>;

export const POINTS: Point[] = [
  {
    key: "c1",
    n: 1,
    title: "La balance analytique de mai a été ré-exportée : écart nul",
    stake: "réglé le 23 septembre",
    tone: "ok",
    body: (
      <p>
        Votre ré-export de mai recoupe la balance générale à l&apos;euro sur les classes 6 et 7,
        comme les autres mois. Il porte les prévisions chantier par chantier, la sous-traitance
        révisée de 943E, et ne compte plus la VNC de juin. Le résultat chantiers de mai est
        désormais le vôtre : <N>−1 648</N> des deux côtés, 378 valeurs sur 383 identiques.
      </p>
    ),
    ask: "Rien à faire : le point est refermé.",
  },
  {
    key: "c2",
    n: 2,
    title: "Les prévisions : saisies par les entités, comptabilisées par vous, validées d'un bouton",
    stake: "réglé le 25 septembre, selon vos réponses",
    tone: "ok",
    body: (
      <>
        <p>
          Vous l&apos;avez précisé : la reprise de M-1 est comptabilisée avant l&apos;export, la
          prévision du mois ne l&apos;est qu&apos;après, une fois connue du tableau de gestion. C&apos;est
          le circuit de l&apos;application : chaque entité saisit ses prévisions dans la vue
          Chantiers, l&apos;encart « Validation du mois » vous montre l&apos;écart avec le 713
          comptabilisé, vous passez les écritures, et vous validez le mois d&apos;un bouton.
        </p>
        <p>
          Les prévisions de votre ancien tableau jamais comptabilisées (964F, 1019E, 951D) sont
          abandonnées, conformément à votre réponse au point 10 : l&apos;application suit la
          comptabilité.
        </p>
      </>
    ),
    ask: "Rien à trancher.",
  },
  {
    key: "c3",
    n: 3,
    title: "Des écritures sont reclassées d'un chantier à l'autre",
    stake: "vous faites vérifier les factures",
    tone: "warn",
    body: (
      <>
        <p>
          Le total des charges du mois est identique : c&apos;est la répartition entre chantiers
          qui diffère (1030A → 1029C 12 033 en mars, 906E → 923E 5 295 en avril, 934D → 1029C
          343, 1043B → 944B 914…). Nous ne vous demandons pas de corriger la comptabilité, mais
          de dire laquelle des deux sources a raison. Vous faites vérifier les factures : on
          attend ce retour. Si la comptabilité a raison, il n&apos;y a rien à faire.
        </p>
        <p>
          52MF = 52 : compris, l&apos;application lit déjà 52MF comme 52. Pour 1034B, 1047A et
          1036C, rien à faire non plus, l&apos;application les rattache déjà à 1034E, 1047E et
          1036A ; sur les prochaines écritures, mieux vaut les bons codes.
        </p>
      </>
    ),
    ask: "Après vérification des factures : la comptabilité ou votre tableau a-t-il raison sur ces reclassements ?",
  },
  {
    key: "c4",
    n: 4,
    title: "Le cumul de facturation comprend les prévisions, avec leur part en dessous",
    stake: "réglé le 25 septembre, selon votre réponse",
    tone: "ok",
    body: (
      <p>
        Vous avez tranché : le cumul de facturation additionne les prévisions, et la part de
        prévisions se lit en dessous. C&apos;est ce que fait désormais la vue Chantiers : sous
        « Cumul Facturation fin de mois », une ligne « dont prévisions en cours » donne, chantier
        par chantier, la prévision encore ouverte à la fin du mois (prévisions posées moins
        reprises, depuis l&apos;ouverture du chantier, saisie du mois comprise).
      </p>
    ),
    ask: "Rien à trancher : à regarder sur l'écran Chantiers, bloc des cumuls.",
  },
  {
    key: "c5",
    n: 5,
    title: "Les cumuls des chantiers : la comptabilité analytique partout où elle existe",
    stake: "réglé le 25 septembre",
    tone: "ok",
    body: (
      <>
        <p>
          Vous voulez reprendre l&apos;analytique depuis le début du chantier et repartir de la base
          comptable (point 10). C&apos;est la règle retenue, avec sa seule limite : la comptabilité
          analytique dont nous disposons commence en novembre 2023 (vos deux balances annuelles,
          puis les mois). Pour tout chantier ouvert depuis, le cumul est celui de l&apos;analytique,
          et nous l&apos;avons vérifié : il coïncide avec vos reports à 500 € près sur les 26
          chantiers concernés.
        </p>
        <p>
          Pour les 52 chantiers ouverts avant novembre 2023, dont 34 encore actifs cette année
          (985B, 994E, 1003B, 1000E, 52, 951D, le DEPOT…), l&apos;analytique ne peut pas remonter
          au début du chantier : votre report d&apos;ouverture au 31 octobre 2025 reste la source
          de ce qui précède, et l&apos;analytique prend le relais ensuite. C&apos;est ce que fait
          l&apos;application. Les 18 autres sont sans mouvement depuis novembre : leur cumul est
          figé.
        </p>
        <p className="doc-note">
          L&apos;ajustement entre vos onglets « TG 11-12 2025 » et « TG 01 2026 » (1012A
          +74 468, quatre autres chantiers pour moins de 5 000) n&apos;est pas repris, conformément
          au point 10 : l&apos;application est partie du premier onglet et n&apos;y revient pas.
        </p>
      </>
    ),
    ask: "Rien à trancher : si un report d'ouverture vous paraît faux pour un chantier ancien, dites-le, il se corrige à l'unité.",
  },
  {
    key: "c6",
    n: 6,
    title: "Le DEPOT et le SAV sont classés en chantier, comme dans votre tableau",
    stake: "confirmé le 24 septembre",
    tone: "ok",
    body: (
      <p>
        Vous suivez le DEPOT et le SAV comme des lignes du tableau chantiers ; l&apos;application
        les classait en frais généraux. Depuis le 22 septembre, elle reprend votre périmètre, avec
        vos reports d&apos;ouverture (DEPOT <N>7 943,05</N> de facturation et <N>−860 440,63</N> de
        résultat, SAV <N>−1 051,27</N> et <N>−1 363,54</N>). Quatre lignes de frais généraux sont
        tombées identiques aux vôtres (crédits-baux, petit outillage, masse salariale du siège,
        carburant) et le compte d&apos;intérim « sans ligne » a disparu. Vous l&apos;avez confirmé.
      </p>
    ),
    ask: "Rien à faire : le point est refermé.",
  },
  {
    key: "c7",
    n: 7,
    title: "Déplacements et réceptions de chantier : sur leur propre ligne, comme vous le préférez",
    stake: "réglé le 25 septembre, selon votre réponse",
    tone: "ok",
    body: (
      <>
        <p>
          Votre colonne « Honoraires chantier - Gardiennage » couvre la plage de comptes 62261
          à 6282, déplacements, péages et réceptions compris (6251, 6257, 6264). Nous les avions
          d&apos;abord réunis sur la ligne honoraires ; vous préférez deux lignes, c&apos;est fait :
          « Honoraire chantier / Gardiennage » et « Déplacements / Réceptions / Péages » se
          suivent dans la vue Chantiers, comme dans la Synthèse. Leur somme reste identique à votre
          colonne, tous les mois.
        </p>
        <ul>
          <li>
            Novembre-décembre : vos déchets (<N>47 770</N>, 12 chantiers) sont dans « Location » ;
            à partir de janvier vous les isolez, comme l&apos;application. Rien à changer.
          </li>
          <li>
            Les « autres droits » (compte 63580000 : 943E 2 055 en novembre, 1024A 632 en
            janvier) sont dans vos salaires et dans nos charges affectées : même total.
          </li>
        </ul>
      </>
    ),
    ask: "Rien à trancher : à regarder sur l'écran Chantiers, bloc des charges de personnel.",
  },
  {
    key: "c8",
    n: 8,
    title: "Frais généraux : indemnités, amortissements, honoraires de management",
    stake: "deux choses sont faites, une règle à confirmer",
    tone: "warn",
    body: (
      <>
        <ul>
          <li>
            <strong>Indemnités de sinistre</strong> : en produits, pas en déduction des assurances,
            comme vous le préférez. C&apos;est ce que fait l&apos;application, rien à changer.
          </li>
          <li>
            <strong>Honoraires de management</strong> : oui, créez les deux comptes, 62263000 pour
            SDG et 62263100 pour NJW, depuis le début de l&apos;exercice, et rééditez les balances.
            L&apos;application les connaît déjà : dès l&apos;import des balances rééditées, les deux
            lignes se remplissent d&apos;elles-mêmes, sans plus aucune ventilation à saisir. Les
            honoraires de chantier saisis à tort en management reviendront au bon endroit par la
            même occasion.
          </li>
          <li>
            <strong>Amortissements</strong> : Quadra ne vous donne que le cumul, vous préférez
            un lissage. Règle proposée : un douzième de la dotation annuelle N-1 chaque mois
            (57 293 / 12 = 4 774 €), recalé sur le cumul réel dès que la comptabilité le passe,
            et la ligne « Retraitement DAP » sous le résultat comptable conserve l&apos;écart,
            pour que le contrôle reste juste.
          </li>
        </ul>
      </>
    ),
    ask: "La règle d'un douzième de la dotation N-1, recalée sur le réel, vous convient-elle ?",
  },
  {
    key: "c9",
    n: 9,
    title: "Quatre comptes sans ligne prévue : deux erreurs à corriger, deux lignes ajoutées",
    stake: "réglé selon vos réponses",
    tone: "ok",
    body: (
      <ul>
        <li>
          Les 595 € d&apos;intérim (6211) et les 1 970 € d&apos;honoraires chantier (62261) sur le
          centre FX sont des erreurs de saisie du comptable : oui, corrigez et rééditez les
          balances, les deux alertes disparaîtront à l&apos;import.
        </li>
        <li>
          Les 90,86 € de produits divers (758, différence de règlement SAIEM 943E) et les
          indemnités d&apos;assurance (7587 : 1 120 sur 882A, 670 sur 766D) sont des écritures
          correctes : la vue Chantiers a désormais une ligne « Autres produits chantier », hors
          CA HT total, comprise dans le résultat.
        </li>
      </ul>
    ),
    ask: "Rien à trancher : rééditez les balances corrigées quand vous le pourrez.",
  },
  {
    key: "c10",
    n: 10,
    title: "Base comptable, feuille blanche",
    stake: "réglé le 25 septembre",
    tone: "ok",
    body: (
      <p>
        Vous l&apos;avez tranché : l&apos;application se fonde sur les extractions comptables et
        non sur ce qui était écrit dans les tableaux ; on remet les tableaux au propre sur la
        base comptable. C&apos;est le principe de l&apos;application depuis le début. Le seul point
        qui en découle est le point 5, sur les cumuls des chantiers anciens.
      </p>
    ),
    ask: "Rien à trancher.",
  },
  {
    key: "c11",
    n: 11,
    title: "Périmètre de la Synthèse — aligné sur votre présentation",
    stake: "rien à décider",
    tone: "ok",
    body: (
      <>
        <p>
          Deux différences de lecture séparaient la Synthèse de votre onglet « Synthese 2026 » :
          le chiffre d&apos;affaires intégrait les cessions et produits divers que vous isolez, et
          les charges du siège restaient dans les rubriques d&apos;exploitation.
        </p>
        <p>
          Les deux sont corrigées. Les cessions, produits financiers et produits de gestion
          courante forment un bloc « Autres produits » placé après le résultat d&apos;exploitation,
          et les charges partagées sont réparties entre chantiers et siège d&apos;après la balance
          analytique du mois. Le CA mensuel de janvier à mai est désormais identique au vôtre, au
          chiffre près.
        </p>
      </>
    ),
    ask: "Rien à trancher : simplement à regarder ensemble sur l'écran Synthèse, le bloc « Autres produits » et les lignes « (structure) » des frais généraux.",
  },
  {
    key: "c12",
    n: 12,
    title: "Le circuit mensuel, avec Pennylane",
    stake: "un export à nous transmettre dès que possible",
    tone: "stop",
    body: (
      <>
        <p>
          Vous passez sur Pennylane et ne pourrez plus sortir de balance ventilée : vous
          ressortirez les balances mois par mois depuis le début de l&apos;exercice. C&apos;est le
          point qui conditionne tout le reste : l&apos;application lit aujourd&apos;hui la balance
          ventilée Cegid (une colonne par mois) et la balance analytique Cegid par centre. Il nous
          faut un export Pennylane de chaque nature, même partiel, pour adapter l&apos;import avant
          votre prochain envoi.
        </p>
        <p>
          Votre circuit est repris tel quel : balances à J+7 après la TVA ; une V1 brouillon pour
          les premières corrections ; une V2 brouillon pour que les dirigeants saisissent leurs
          prévisions et que vous passiez les dernières corrections ; une V3 définitive. Dans
          l&apos;application : import V1, import V2 (elle remplace V1, même mois), saisie des
          prévisions par les entités, import V3 avec le 713 comptabilisé, puis « Valider le
          mois ». Vous déposez les fichiers vous-même depuis l&apos;écran Imports.
        </p>
      </>
    ),
    ask: "Pouvez-vous nous envoyer un export Pennylane de balance générale et un de balance analytique, sur n'importe quel mois, pour caler l'import ?",
  },
  {
    key: "c13",
    n: 13,
    title: "Frais généraux : N-1 et N-2 sont désormais comparables à N",
    stake: "réglé le 24 septembre",
    tone: "ok",
    body: (
      <>
        <p>
          Vos balances analytiques des exercices 2023/24 et 2024/25 sont en base. Les colonnes
          N-2 et N-1 des frais généraux se lisent désormais sur le périmètre des centres de
          structure, comme N, au lieu d&apos;être reconstituées depuis la balance ventilée,
          chantiers compris. Elles ne servent qu&apos;à cette comparaison : elles ne sont ni un
          mois affichable, ni un terme des cumuls de chantier.
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Ligne</th><th>N-2 (2023/24)</th><th>N-1 (2024/25)</th><th>N à fin juillet</th></tr>
              <tr><td>Total masse salariale + frais généraux</td><td>1 762 090</td><td>2 343 271</td><td>1 847 654</td></tr>
              <tr><td>Masse salariale sédentaire</td><td>178 833</td><td>143 148</td><td>150 178</td></tr>
              <tr><td>Dotations aux amortissements</td><td>60 180</td><td>57 293</td><td>31 147</td></tr>
            </tbody>
          </table>
        </div>
        <p className="doc-note">
          Les deux fichiers recoupent la balance générale de leur exercice sur la classe 7 ;
          sur la classe 6, il leur manque 129 732 (2023/24) et 87 531 (2024/25), des écritures
          sans centre. Quelques lignes sans centre ou sans ligne d&apos;accueil (quotes-parts de
          SEP, sous-traitance intracom) restent hors des totaux, signalées en alerte.
        </p>
      </>
    ),
    ask: "Rien à trancher : à regarder ensemble sur l'écran Frais généraux, colonnes N-1 et N-2.",
  },
  {
    key: "c14",
    n: 14,
    title: "Juin, juillet, août : les prévisions sont à saisir dans l'application",
    stake: "trois mois à rattraper, dans l'ordre",
    tone: "warn",
    body: (
      <>
        <p>
          Vous le confirmez : depuis juin, les tableaux ne sont pas tenus et les prévisions ne
          sont pas comptabilisées. La provision de juin sur le centre FX et l&apos;absence
          d&apos;écriture en juillet et août en sont la trace. Le rattrapage se fait dans
          l&apos;application, mois par mois :
        </p>
        <ul>
          <li>les dirigeants saisissent leurs prévisions de juin dans la vue Chantiers (le mois est ouvert à la saisie) ;</li>
          <li>vous les passez en comptabilité, ventilées par chantier, et réexportez juin ;</li>
          <li>l&apos;encart « Validation du mois » tombe à zéro, vous validez juin ;</li>
          <li>puis juillet, puis août.</li>
        </ul>
      </>
    ),
    ask: "Rien à trancher : à qui demandez-vous de saisir juin, et quand ? Bob a déjà son accès.",
  },
  {
    key: "c15",
    n: 15,
    title: "La Synthèse reste comptable, le 713 sera ventilé par chantier",
    stake: "réglé le 25 septembre",
    tone: "ok",
    body: (
      <p>
        Vous choisissez la lecture A : la Synthèse garde le résultat net de la balance générale,
        et les lignes « Prévisions saisies non comptabilisées » et « Résultat de gestion » portent
        l&apos;écart tant que le 713 n&apos;est pas passé. Vous saisirez le 713 ventilé par chantier
        en comptabilité : c&apos;est ce qui fait tomber l&apos;écart à zéro et rend le mois validable.
      </p>
    ),
    ask: "Rien à trancher.",
  },
];

export const FICHIERS = [
  {
    nom: "Un export Pennylane de balance générale et un de balance analytique",
    pourquoi:
      "Vous ne pourrez plus sortir de balance ventilée : il faut adapter l'import à vos nouveaux fichiers avant le prochain envoi mensuel. N'importe quel mois convient.",
    tag: "bloquant · point 12",
    tone: "stop" as Tone,
  },
  {
    nom: "Les balances rééditées après vos corrections",
    pourquoi:
      "Honoraires de management sur deux comptes (62263000 SDG, 62263100 NJW), intérim et honoraires chantier retirés du centre FX, honoraires chantier saisis à tort en management. Un import par mois corrigé.",
    tag: "points 8 et 9",
    tone: "warn" as Tone,
  },
  {
    nom: "Les prévisions de juin, juillet et août, saisies par les dirigeants",
    pourquoi:
      "Dans la vue Chantiers, mois par mois ; vous les comptabilisez ensuite et validez chaque mois.",
    tag: "point 14",
    tone: "warn" as Tone,
  },
  {
    nom: "Vos réponses aux points 3 et 8",
    pourquoi:
      "Le verdict des factures sur les reclassements, et la règle de lissage des amortissements.",
    tag: "points 3 et 8",
    tone: "warn" as Tone,
  },
];
