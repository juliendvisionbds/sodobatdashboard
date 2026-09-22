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
    title: "La balance analytique de mai est antérieure aux révisions",
    stake: "résultat de mai : 67 651 € d'écart",
    tone: "stop",
    body: (
      <>
        <p>
          Chaque balance analytique est recoupée avec la balance générale du même mois, sur les
          totaux des classes 6 et 7. Huit mois sur neuf tombent à <N>0,00</N>{" "}des deux côtés,
          juin compris : ces exports sont à jour. Mai est le seul en écart, et date d&apos;avant
          les corrections du cabinet. Trois conséquences mesurées :
        </p>
        <ul>
          <li>
            Mai : l&apos;analytique dépasse la ventilée de <N>55 630,80</N>{" "}en charges et lui
            manque <N>74 906,00</N>{" "}de produits — les provisions de mai, passées après
            l&apos;export.
          </li>
          <li>Mai : 23 comptes ont été révisés depuis, dont la sous-traitance auto-liquidée pour −49 240 et le chantier 943E pour 7 255.</li>
          <li>
            La VNC de <N>35 592</N>{" "}figure à la fois dans l&apos;export de mai et dans celui de
            juin, alors que la balance générale ne la porte qu&apos;en juin : elle compte donc
            deux fois dans le cumul des frais généraux, et c&apos;est l&apos;export de mai qui la
            porte en trop.
          </li>
        </ul>
      </>
    ),
    ask: "Pouvez-vous ré-exporter la balance analytique de mai 2026, au même format que les autres mois ? Celle de juin est à jour : elle n'est pas à refaire.",
  },
  {
    key: "c2",
    n: 2,
    title: "Des provisions figurent dans votre tableau sans écriture comptable",
    stake: "résultat de janvier : 30 000 €",
    tone: "stop",
    body: (
      <>
        <p>
          L&apos;application lit les provisions dans le compte <N>71331000</N>. Lorsqu&apos;une
          provision est saisie dans votre fichier sans écriture correspondante, elle ne peut pas
          la voir.
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr>
                <th>Chantier</th>
                <th>Onglet</th>
                <th>Ligne</th>
                <th>Votre tableau</th>
                <th>Comptabilité</th>
              </tr>
              <tr><td>964F Le Meust</td><td>11-12 2025</td><td>Prévision</td><td>100 000</td><td>0</td></tr>
              <tr><td>964F Le Meust</td><td>01 2026</td><td>Annulation M-1</td><td>−100 000</td><td>0</td></tr>
              <tr><td>1019E Gymnase de Vallauris</td><td>01 2026</td><td>Prévision</td><td>30 000</td><td>0</td></tr>
              <tr><td>951D</td><td>04 2026</td><td>Annulation / prévision</td><td>−75 053 / −55 053</td><td>−130 106 / 0</td></tr>
              <tr><td>951D</td><td>05 2026</td><td>Annulation M-1</td><td>—</td><td>−110 106 de plus</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          En novembre-décembre, six chantiers (964F, 994E, 53, 1003B, 993D, 876D) ont leur reprise
          de provision d&apos;ouverture classée en facturation côté comptabilité et en annulation
          dans votre tableau. Le total des produits est identique — <N>2 866 085</N>{" "}— seule la
          colonne change.
        </p>
      </>
    ),
    ask: "Ces provisions seront-elles passées en comptabilité, ou préférez-vous les saisir directement dans l'application ? Les colonnes « Provision » et « Annulation M-1 » de l'écran Chantiers sont prévues pour cela.",
  },
  {
    key: "c3",
    n: 3,
    title: "Des écritures sont reclassées d'un chantier à l'autre",
    stake: "total du mois inchangé",
    tone: "warn",
    body: (
      <>
        <p>
          Le total des charges du mois est identique : c&apos;est la répartition entre chantiers
          qui diffère. Les paires se compensent à l&apos;euro.
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Mois</th><th>Comptabilité → votre tableau</th><th>Montant</th></tr>
              <tr><td>Février</td><td>934D → 1029C</td><td>343</td></tr>
              <tr><td>Mars</td><td>1030A → 1029C (achats)</td><td>12 033</td></tr>
              <tr><td>Mars</td><td>1044C ↔ 1026C · 52 ↔ 1025C · 1043B ↔ 1007E</td><td>530 · 480 · 215</td></tr>
              <tr><td>Mars</td><td>non appariés : 1031C −2 157 · 1036A +1 687 · 1027B +814 · 53 −344</td><td>1 € net</td></tr>
              <tr><td>Avril</td><td>1043B → 944B · 1047E → 1047A</td><td>914 · 389</td></tr>
              <tr><td>Avril</td><td>906E → 923E (produits)</td><td>5 295</td></tr>
              <tr><td>Mai</td><td>1034B → 1034E · 1047A → 1047E</td><td>3 934 · 858 + 1 646</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Les centres <N>1034B</N>, <N>1047A</N>, <N>1036C</N>{" "}et <N>52MF</N>{" "}ont été créés à la
          volée par Cegid lors d&apos;un import ASCII. L&apos;application les signale déjà en
          alerte comme probables fautes de frappe de 1034E, 1047E, 1036A et 52 : tant
          qu&apos;ils subsistent, les montants manquent au bon chantier.
        </p>
      </>
    ),
    ask: "Ces imputations sont-elles corrigées en comptabilité, ou faut-il que l'application tienne une table de correspondance de centres (1034B = 1034E, etc.) ?",
  },
  {
    key: "c4",
    n: 4,
    title: "Le cumul de facturation : avec ou sans les provisions ?",
    stake: "448 423 € d'écart dès février",
    tone: "warn",
    body: (
      <p>
        Dans votre fichier, le cumul de facturation est le report plus la facturation du mois :
        les provisions en sont exclues. Le cumul de résultat, lui, les inclut. La maquette
        validée additionne au contraire le CA HT total, provisions comprises. En février,
        25 chantiers sont concernés.
      </p>
    ),
    ask: "Quelle définition fait foi pour le cumul de facturation : le facturé seul, ou le facturé augmenté de la provision ouverte ?",
  },
  {
    key: "c5",
    n: 5,
    title: "Un ajustement entre décembre et janvier",
    stake: "1012A : 74 468 €",
    tone: "warn",
    body: (
      <p>
        De janvier à mai, le report d&apos;un mois est exactement le cumul du mois précédent.
        Entre les onglets « TG 11-12 2025 » et « TG 01 2026 », onze chantiers bougent :
        1012A Déchetterie Puget de <N>+74 468</N>{" "}en facturation comme en résultat, puis 1026C
        −5 000, 1025C −846, 1022B −162 et 1006B −130. L&apos;application, partie de
        l&apos;onglet 11-12, ne connaît pas ces ajustements.
      </p>
    ),
    ask: "D'où vient la correction de 1012A, et faut-il la reprendre dans les reports d'ouverture ?",
  },
  {
    key: "c6",
    n: 6,
    title: "Le DEPOT et le SAV : chantiers ou structure ?",
    stake: "à trancher en premier — trois écrans en dépendent",
    tone: "stop",
    body: (
      <>
        <p>
          Vous suivez le DEPOT comme une ligne du tableau chantiers ; l&apos;application le classe
          en frais généraux. Charges du DEPOT dans votre fichier : 23 976 en novembre-décembre,
          puis 11 718, 19 123, 13 096, 7 463 et 7 971. Vos reports d&apos;ouverture n&apos;ont pas
          été repris : DEPOT <N>7 943,05</N>{" "}de facturation et <N>−860 440,63</N>{" "}de résultat ;
          SAV <N>−1 051,27</N>{" "}et <N>−1 363,54</N>.
        </p>
        <p>
          Depuis que la Synthèse répartit les charges entre chantiers et siège, cette question ne
          joue plus seulement sur la vue Chantiers : elle commande aussi les lignes de charges de
          la Synthèse et trois lignes de frais généraux. Et les chiffres désignent clairement le
          périmètre des centres, non le rattachement des comptes.
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Janvier 2026 — part imputée au siège</th><th>Votre fichier</th><th>Application</th><th>Écart</th></tr>
              <tr><td>Entretien / réparation / maintenance</td><td>13 995</td><td>13 995</td><td className="ok">0</td></tr>
              <tr><td>Petit outillage, fournitures</td><td>42</td><td>2 184</td><td>2 142</td></tr>
              <tr><td>Masse salariale du siège</td><td>15 877</td><td>19 342</td><td>3 465</td></tr>
              <tr><td>Carburant, péages, déplacements</td><td>7 002</td><td>7 634</td><td>632</td></tr>
            </tbody>
          </table>
        </div>
        <p className="doc-note">
          Sur l&apos;entretien, les deux lectures tombent sur le même euro : les comptes sont donc
          rattachés correctement. Sur les trois autres lignes, mêmes comptes et montants
          différents — l&apos;application sort des chantiers des centres que vous y laissez. Dans
          l&apos;autre sens, les comptes jamais imputés au siège — sous-traitance, intérims,
          déchets — sont identiques tous les mois, sans exception.
        </p>
      </>
    ),
    ask: "Le DEPOT doit-il apparaître dans la vue Chantiers ? Et le SAV ? Le classement se règle centre par centre, sans toucher au rattachement des comptes.",
  },
  {
    key: "c7",
    n: 7,
    title: "Quelques montants changent de bloc, sans changer le total",
    stake: "total des charges inchangé",
    tone: "warn",
    body: (
      <ul>
        <li>
          Novembre-décembre : vos déchets (<N>46 353</N>, 11 chantiers) sont dans « Location » ;
          l&apos;application les isole en « Déchets ».
        </li>
        <li>
          Honoraires ↔ Eau / EDF / carburant : 1 640 en novembre-décembre, 365 en janvier, 794 en
          février, 1 039 en mars, 19 en avril, 22 en mai. Toujours les mêmes chantiers : 1000E,
          985B, 994E, 951D, 1019E, 1027B, 1049E.
        </li>
        <li>906E : 2 100 passent des honoraires aux salaires en février, et dans l&apos;autre sens en avril.</li>
        <li>943E : 2 055 en salaires en novembre-décembre ; 1024A : 632 en janvier.</li>
      </ul>
    ),
    ask: "Quel compte rangez-vous en « Eau / EDF / carburant » que la maquette classe en honoraires chantier ?",
  },
  {
    key: "c8",
    n: 8,
    title: "Frais généraux : des totaux proches, des périmètres de lignes différents",
    stake: "2 906 à 18 201 € par mois",
    tone: "warn",
    body: (
      <>
        <p>Vos lignes de l&apos;onglet « Synthese 2026 » en regard des nôtres, de janvier à avril.</p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Ligne (vous / application)</th><th>Janvier</th><th>Février</th><th>Mars</th><th>Avril</th></tr>
              <tr><td>Assurances</td><td className="ok">17 629 / 17 629</td><td>43 107 / 43 498</td><td className="ok">−24 686 / −24 686</td><td className="ok">−1 580 / −1 580</td></tr>
              <tr><td>Location SCI / immobilier</td><td className="ok">11 053 / 11 053</td><td className="ok">11 053 / 11 053</td><td className="ok">14 121 / 14 121</td><td className="ok">11 053 / 11 053</td></tr>
              <tr><td>EDF / Eau</td><td className="ok">203 / 203</td><td className="ok">275 / 275</td><td className="ok">−1 100 / −1 100</td><td className="ok">0 / 0</td></tr>
              <tr><td>Honoraires NJW · SDG</td><td>115 700 / 118 085</td><td>115 700 / 115 840</td><td>115 700 / 111 506</td><td>115 700 / 115 775</td></tr>
              <tr><td>Masse salariale du siège</td><td className="warn">15 877 / 19 342</td><td className="warn">7 466 / 11 757</td><td className="warn">12 910 / 16 797</td><td className="warn">12 725 / 16 475</td></tr>
              <tr><td>Crédit-bail, LLD, véhicules</td><td className="warn">2 574 / 4 775</td><td className="warn">2 574 / 9 755</td><td className="warn">2 574 / 5 345</td><td>2 574 / 3 316</td></tr>
              <tr><td>Carburant, péages, déplacements</td><td>7 002 / 7 634</td><td>7 712 / 9 344</td><td>7 849 / 9 912</td><td>9 712 / 11 158</td></tr>
              <tr><td>Tél., banque, intérêts, cotisations</td><td>6 211 / 7 559</td><td>1 599 / 5 610</td><td className="warn">−9 400 / 3 629</td><td>7 221 / 7 511</td></tr>
              <tr><td>Petit outillage, fournitures</td><td>42 / 2 184</td><td>475 / 2 286</td><td>0 / 1 730</td><td>5 814 / 7 088</td></tr>
              <tr><td>Amortissements</td><td className="warn">3 973 / 0</td><td className="warn">3 594 / 0</td><td className="warn">3 993 / 0</td><td className="warn">3 872 / 0</td></tr>
              <tr><td>Refacturation FX</td><td>2 385 / —</td><td>7 026 / —</td><td>−2 994 / —</td><td>75 / —</td></tr>
              <tr className="sum"><td>Total autres charges</td><td>203 953 / 206 859</td><td>211 012 / 223 193</td><td>128 132 / 146 333</td><td>177 644 / 181 524</td></tr>
            </tbody>
          </table>
        </div>
        <ul>
          <li>
            <strong>Les libellés des honoraires semblent inversés.</strong>{" "}Ce que vous nommez
            « Honoraires NJW » correspond à ce que l&apos;application nomme « Honoraires SDG
            (holding) », pour un montant presque identique de novembre à mai : <N>809 900</N>{" "}chez
            vous, <N>810 688</N>{" "}chez nous.
          </li>
          <li>
            <strong>Les indemnités de sinistre viennent en déduction de vos assurances</strong>,
            d&apos;où vos montants négatifs de mars et d&apos;avril. L&apos;application les classe
            en produits. De novembre à mai, votre ligne vaut <N>76 339</N>{" "}et la nôtre{" "}
            <N>89 049</N>, dont <N>13 038</N>{" "}d&apos;indemnités isolées : les retirer ramène
            l&apos;écart à <N>328 €</N>.
          </li>
          <li>
            Masse salariale du siège : l&apos;application porte 3 500 à 4 300 € de plus chaque
            mois. Soit des centres que vous laissez en chantier (point 6), soit des comptes de la
            classe 64 rangés ailleurs.
          </li>
          <li>Amortissements : vous étalez 3 600 à 4 000 € par mois ; la comptabilité ne passe les dotations qu&apos;en mai (27 344) et en juin (31 147).</li>
          <li>« Refacturation FX » n&apos;a pas de ligne équivalente dans la maquette.</li>
          <li>
            Sur l&apos;ensemble novembre-mai, votre bloc « Autres charges » totalise{" "}
            <N>1 271 227 €</N>{" "}contre <N>1 353 336 €</N>{" "}pour le nôtre, soit 6 % d&apos;écart.
            Trois lignes tombent juste ou presque : crédits-baux 19 711 des deux côtés, EDF-eau
            −3 270 des deux côtés, entretien 36 674 contre 36 731.
          </li>
        </ul>
      </>
    ),
    ask: "Trois demandes : la liste des comptes de vos lignes « Masse Salariale », « Crédits Baux », « Tél / frais bancaires » et « Petit outillage » ; le bon libellé des honoraires, NJW ou SDG ; et la convention à retenir pour les indemnités d'assurance, en déduction de la charge ou en produit.",
  },
  {
    key: "c9",
    n: 9,
    title: "Quatre comptes sans ligne prévue là où ils sont imputés",
    stake: "23 506,64 € hors des totaux",
    tone: "warn",
    body: (
      <p>
        <N>62110000</N>{" "}Personnel intérimaire (21 406,64) et <N>62261000</N>{" "}Honoraires chantiers
        (2 100,00) sont imputés sur des centres de structure, où la maquette des frais généraux
        n&apos;a pas de ligne pour les recevoir. Ils remontent en alerte et restent hors des
        totaux : l&apos;application ne les range jamais d&apos;office. À l&apos;inverse, en
        novembre, deux produits sont imputés sur des chantiers sans ligne prévue :{" "}
        <N>75870000</N>{" "}Indemnités d&apos;assurances (1 120,00) et <N>75800000</N>{" "}Produits divers
        (90,86).
      </p>
    ),
    ask: "Pour l'intérim et les honoraires : erreur d'imputation à corriger en comptabilité, ou charges du siège à ajouter aux frais généraux ? Pour les deux produits de novembre : dans quelle ligne chantier les rangez-vous ?",
  },
  {
    key: "c10",
    n: 10,
    title: "Résultat comptable : trois mois révisés depuis votre export",
    stake: "identifié au centime sur deux mois sur trois",
    tone: "warn",
    body: (
      <ul>
        <li>Novembre-décembre, 50 102 € : la quote-part de bénéfice SEP de <N>50 011,03</N>{" "}passée en décembre, plus 90,86 de produits divers en novembre.</li>
        <li>Avril, 52 € : les intérêts d&apos;emprunts pour <N>51,82</N>.</li>
        <li>Mai, 62 886 € : révisions multiples — provisions 74 906, sous-traitance, assurances, intéressement 6 848. À recontrôler après le ré-export de mai.</li>
      </ul>
    ),
    ask: "Confirmez-vous que votre tableau de mai a été bâti avant ces écritures ? Un tableau à jour de juin et juillet permettrait de refermer ce contrôle.",
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
    title: "Le circuit mensuel",
    stake: "à caler une fois",
    tone: "ok",
    body: (
      <ul>
        <li>Chaque mois, deux fichiers : la balance ventilée de l&apos;exercice et la balance analytique <em>du mois</em>{" "}— le format actuel, sur lequel l&apos;application est alignée.</li>
        <li>Un nommage stable et deux envois : le premier à M+24, puis la version corrigée par le cabinet, qui remplace la première. L&apos;application conserve l&apos;ancienne en « remplacée ».</li>
        <li>Qui dépose les fichiers : vous, depuis l&apos;écran Imports, ou nous.</li>
        <li>À chaque tableau de gestion transmis, le rapprochement est relancé et la liste des écarts vous revient.</li>
      </ul>
    ),
    ask: "Quelle date d'envoi chaque mois, et qui valide l'import ?",
  },
  {
    key: "c13",
    n: 13,
    title: "Frais généraux : N-1 et N-2 ne sont pas comparables à N",
    stake: "écart affiché : −78 %",
    tone: "warn",
    body: (
      <>
        <p>
          Faute de balances analytiques pour les exercices antérieurs, les colonnes N-1 et N-2 sont
          reconstituées depuis la balance ventilée, qui ne porte pas l&apos;axe analytique : elles
          contiennent donc aussi la part imputée aux chantiers. L&apos;écran le signale, mais les
          chiffres restent trompeurs.
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Ligne</th><th>N-2 (ventilée)</th><th>N-1 (ventilée)</th><th>N à fin juillet (analytique)</th></tr>
              <tr><td>Total masse salariale + frais généraux</td><td>9 338 630 · 33,3 %</td><td>8 332 673 · 37,9 %</td><td>1 837 290 · 12,5 %</td></tr>
              <tr><td>Masse salariale sédentaire</td><td>1 439 329</td><td>1 519 008</td><td>163 167</td></tr>
            </tbody>
          </table>
        </div>
      </>
    ),
    ask: "Pouvez-vous exporter la balance analytique des exercices 2024/25 et 2023/24 ? Un fichier par exercice suffit : la comparaison N / N-1 des frais généraux deviendrait juste.",
  },
  {
    key: "c14",
    n: 14,
    title: "La provision de juin est portée sur le centre FX",
    stake: "1 033 201 € hors chantiers",
    tone: "stop",
    body: (
      <>
        <p>
          L&apos;export de juin est à jour — il recoupe la balance générale à l&apos;euro. Ce
          n&apos;est donc pas un problème de fichier : c&apos;est ainsi que l&apos;écriture a été
          passée. Sur les neuf mois de l&apos;exercice, juin est le seul dans ce cas.
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Compte 71331000</th><th>Annulation M-1 (débit)</th><th>Provision (crédit)</th><th>dont centre FX</th></tr>
              <tr><td>Novembre 2025</td><td>528 500</td><td>0</td><td>—</td></tr>
              <tr><td>Décembre 2025</td><td>0</td><td>−883 000</td><td>—</td></tr>
              <tr><td>Janvier 2026</td><td>240 000</td><td>−138 000</td><td>—</td></tr>
              <tr><td>Février 2026</td><td>81 495</td><td>−473 669</td><td>—</td></tr>
              <tr><td>Mars 2026</td><td>201 646</td><td>−11 800</td><td>—</td></tr>
              <tr><td>Avril 2026</td><td>213 733</td><td>−188 700</td><td>—</td></tr>
              <tr><td>Mai 2026</td><td>0</td><td>0</td><td>—</td></tr>
              <tr><td>Juin 2026</td><td>1 054 701</td><td>−1 054 701</td><td className="warn">−1 033 201</td></tr>
            </tbody>
          </table>
        </div>
        <p className="doc-note">
          L&apos;annulation de juin est bien ventilée chantier par chantier. C&apos;est la
          provision du mois qui part sur FX, à hauteur de 1 033 201 sur 1 054 701 : elle ne peut
          donc être rattachée à aucun chantier, et le résultat chantiers de juin ressort à
          −1 039 529.
        </p>
      </>
    ),
    ask: "Cette imputation sur FX est-elle volontaire ? Si la provision doit revenir aux chantiers, faut-il une écriture de reclassement en comptabilité, ou la saisir chantier par chantier dans l'application ?",
  },
];

export const FICHIERS = [
  {
    nom: "Balance analytique de mai 2026, ré-exportée",
    pourquoi:
      "Le seul mois qui ne recoupe pas la balance générale. Referme l'écart de 67 651 € sur le résultat de mai et retire la VNC comptée deux fois.",
    tag: "bloquant · point 1",
    tone: "stop" as Tone,
  },
  {
    nom: "Votre tableau de gestion à jour de juin et juillet",
    pourquoi: "L'application va jusqu'à juillet ; le tableau dont nous disposons s'arrête à mai.",
    tag: "point 10",
    tone: "warn" as Tone,
  },
  {
    nom: "La liste des comptes de vos lignes de frais généraux",
    pourquoi:
      "Pour chiffrer compte par compte les écarts de masse salariale, crédit-bail, téléphonie et fournitures.",
    tag: "point 8",
    tone: "warn" as Tone,
  },
  {
    nom: "Balances analytiques des exercices 2024/25 et 2023/24",
    pourquoi:
      "Un export par exercice clos. Rend comparables les colonnes N-1 et N-2 des frais généraux.",
    tag: "point 13",
    tone: "warn" as Tone,
  },
];
