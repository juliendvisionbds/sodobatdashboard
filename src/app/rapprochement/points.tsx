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
    ask: "Ces provisions seront-elles passées en comptabilité, ou préférez-vous les saisir directement dans l'application ? Les lignes « Prévision M » et « Annulation M-1 » de l'écran Chantiers sont prévues pour cela, et chaque entité peut désormais y saisir ses prévisions, que vous figez.",
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
              <tr><td>Avril</td><td>1043B → 944B</td><td>914</td></tr>
              <tr><td>Avril</td><td>906E → 923E (produits) · 906E honoraires ↔ salaires</td><td>5 295 · 2 100</td></tr>
              <tr><td>Mai</td><td>943E sous-traitance, révisée après votre export</td><td>7 255</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Quatre centres ont été créés à la volée par Cegid lors d&apos;un import ASCII, sur une
          faute de frappe : <N>1034B</N>, <N>1047A</N>, <N>1036C</N> et <N>52MF</N>. Depuis le 22
          septembre, l&apos;application les lit comme 1034E, 1047E, 1036A et 52 : les écrans
          sont justes, et 52MF portait <N>70 871</N> de facturation en juin et juillet qui
          manquaient au chantier 52. Les écritures restent telles quelles en base ; l&apos;alerte
          le signale désormais comme « lu comme 52 par l&apos;application ».
        </p>
      </>
    ),
    ask: "Pouvez-vous faire corriger ces quatre codes centre dans Cegid, pour que la comptabilité elle-même soit juste ? Et les reclassements d'un chantier à l'autre sont-ils passés en comptabilité, ou restent-ils propres à votre tableau ?",
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
    title: "Le DEPOT et le SAV sont classés en chantier, comme dans votre tableau",
    stake: "déjà appliqué : à confirmer d'un mot",
    tone: "warn",
    body: (
      <>
        <p>
          Vous suivez le DEPOT et le SAV comme des lignes du tableau chantiers ; l&apos;application
          les classait en frais généraux. C&apos;était la cause unique de quatre écarts de frais
          généraux (masse salariale du siège, crédits-baux, petit outillage, carburant) et du
          compte d&apos;intérim « sans ligne » du point 9 : 20 812 des 21 407 € étaient sur le
          DEPOT.
        </p>
        <p>
          Nous avons donc repris votre périmètre. Le DEPOT et le SAV apparaissent dans la vue
          Chantiers avec vos reports d&apos;ouverture — DEPOT <N>7 943,05</N> de facturation et{" "}
          <N>−860 440,63</N> de résultat, SAV <N>−1 051,27</N> et <N>−1 363,54</N> — et le cumul
          du DEPOT à fin décembre tombe sur le vôtre : <N>−884 416,46</N>.
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Janvier 2026 — frais généraux</th><th>Votre fichier</th><th>Application</th><th>Écart</th></tr>
              <tr><td>Crédits-baux / LLD</td><td>2 574</td><td>2 574</td><td className="ok">0</td></tr>
              <tr><td>Petit outillage, fournitures</td><td>42</td><td>42</td><td className="ok">0</td></tr>
              <tr><td>Masse salariale du siège</td><td>15 877</td><td>15 991</td><td>114</td></tr>
              <tr><td>GNR, péages, déplacements</td><td>7 002</td><td>7 634</td><td>632</td></tr>
            </tbody>
          </table>
        </div>
        <p className="doc-note">
          Les 114 € sont la formation continue et la taxe d&apos;apprentissage du siège, que vous
          rangez en impôts ; les 632 €, la géolocalisation et les réceptions, que vous rangez en
          téléphonie et autres charges (point 8). Sur les charges d&apos;exploitation et de
          personnel des chantiers, DEPOT compris, le total du mois est identique au vôtre de
          novembre à avril.
        </p>
      </>
    ),
    ask: "Confirmez-vous ce classement du DEPOT et du SAV en chantier ? Il se règle centre par centre et se défait aussi vite.",
  },
  {
    key: "c7",
    n: 7,
    title: "Déplacements et réceptions de chantier : rangés avec les honoraires, comme chez vous",
    stake: "rien à trancher",
    tone: "ok",
    body: (
      <>
        <p>
          Votre colonne « Honoraires chantier - Gardiennage » couvre la plage de comptes 62261
          à 6282 : elle prend donc aussi les déplacements, péages et réceptions (6251, 6257,
          6264) imputés à un chantier, que la maquette rangeait avec le carburant. C&apos;était
          l&apos;origine des écarts « honoraires ↔ eau / EDF / carburant » de chaque mois (1 640,
          365, 794, 1 039, 19, 22). L&apos;application suit désormais votre colonne : les deux
          blocs sont identiques tous les mois.
        </p>
        <ul>
          <li>
            Dans la Synthèse, ces montants forment une ligne à part, « Déplacements / Réceptions
            / Péages chantier », juste sous les honoraires ; leur part siège reste sur la ligne
            GNR / péages de structure, comme dans votre bloc « Autres charges ».
          </li>
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
    ask: "Rien à trancher : à regarder ensemble sur l'écran Chantiers, colonne « Honoraire chantier / Gardiennage / Déplacements ».",
  },
  {
    key: "c8",
    n: 8,
    title: "Frais généraux : vos lignes se retrouvent à l'euro, trois conventions restent",
    stake: "à choisir : 13 038 € d'indemnités, le lissage des amortissements, un libellé",
    tone: "warn",
    body: (
      <>
        <p>
          Vos lignes de l&apos;onglet « Synthese 2026 », de novembre à mai, en regard des nôtres
          une fois le DEPOT classé comme chez vous (point 6).
        </p>
        <div className="doc-tbl-wrap">
          <table className="doc-tbl">
            <tbody>
              <tr><th>Ligne</th><th>Vous, nov. → mai</th><th>Application</th><th>Écart</th></tr>
              <tr><td>Crédits-baux / LLD</td><td>19 711</td><td>19 711</td><td className="ok">0</td></tr>
              <tr><td>GNR / Essence</td><td>41 428</td><td>41 428</td><td className="ok">0</td></tr>
              <tr><td>EDF / Eau siège</td><td>−3 270</td><td>−3 270</td><td className="ok">0</td></tr>
              <tr><td>Impôts</td><td>5 582</td><td>5 582</td><td className="ok">0</td></tr>
              <tr><td>Masse salariale du siège</td><td>83 994</td><td>83 976</td><td>−18</td></tr>
              <tr><td>Petit outillage, fournitures</td><td>6 477</td><td>6 483</td><td>6</td></tr>
              <tr><td>Entretien, réparation, maintenance</td><td>36 674</td><td>36 393</td><td>−281</td></tr>
              <tr><td>Loyer SCI Capitou</td><td>81 844</td><td>80 917</td><td>−926</td></tr>
              <tr><td>Honoraires NJW (vous) · management 62263000 (nous)</td><td>809 900</td><td>810 624</td><td>724</td></tr>
              <tr><td>Assurances</td><td>76 339</td><td>89 049</td><td className="warn">12 711</td></tr>
              <tr><td>Amortissements</td><td>28 936</td><td>24 915</td><td className="warn">−4 021</td></tr>
            </tbody>
          </table>
        </div>
        <ul>
          <li>
            <strong>Les indemnités de sinistre viennent en déduction de vos assurances</strong> :
            13 038 € de novembre à mai (7 191, 391 et 5 456), que l&apos;application classe en
            produits. Les retirer ramène l&apos;écart d&apos;assurances à 327 €.
          </li>
          <li>
            <strong>Vous lissez les amortissements</strong> à 3 600 – 4 000 € par mois, avec un
            retraitement en bas de tableau ; la comptabilité ne passe les dotations qu&apos;en mai
            (24 915) et en juin (28 332). Le résultat mensuel de l&apos;application est donc le
            vôtre avant lissage.
          </li>
          <li>
            <strong>Le compte 62263000 « Honoraires management »</strong> porte les 115 700 € que
            vous nommez « Honoraires NJW ». L&apos;application l&apos;affiche en management, puis
            ventile NJW / SDG d&apos;après une saisie : dites-nous la part de chacun.
          </li>
          <li>
            Le reste tient à des lignes de rangement : les 926 € du Tiguan en location de
            véhicules chez nous, avec le loyer chez vous ; la géolocalisation (232 € par mois)
            et les réceptions du siège avec les péages chez nous, en téléphonie et autres charges
            chez vous ; la formation continue du siège en masse salariale chez nous, en impôts
            chez vous.
          </li>
        </ul>
      </>
    ),
    ask: "Trois choix : les indemnités d'assurance en déduction de la charge ou en produit ; les amortissements lissés ou tels que comptabilisés ; et la part NJW / SDG du compte 62263000.",
  },
  {
    key: "c9",
    n: 9,
    title: "Deux comptes sans ligne prévue là où ils sont imputés",
    stake: "4 446 € hors des totaux",
    tone: "warn",
    body: (
      <p>
        Sur le centre FX, <N>62110000</N> Personnel intérimaire (595,45 en décembre) et{" "}
        <N>62261000</N> Honoraires chantiers (1 970,00 en décembre et janvier) n&apos;ont pas de
        ligne dans la maquette des frais généraux : ils remontent en alerte et restent hors des
        totaux, l&apos;application ne les range jamais d&apos;office. Le reste de l&apos;intérim
        signalé jusqu&apos;ici était sur le DEPOT, réglé par le point 6. À l&apos;inverse, deux
        produits sont imputés sur des chantiers sans ligne prévue : <N>75870000</N> Indemnités
        d&apos;assurances (1 120,00 en novembre sur 882A, 670,00 en août sur 766D) et{" "}
        <N>75800000</N> Produits divers (90,86 en novembre).
      </p>
    ),
    ask: "Pour l'intérim et les honoraires du siège : erreur d'imputation à corriger en comptabilité, ou charges du siège à ajouter aux frais généraux ? Pour les indemnités d'assurance et les produits divers d'un chantier : dans quelle ligne les rangez-vous ?",
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
        <li>
          Mai, 62 886 € : révisions multiples — provisions 74 906, sous-traitance, assurances,
          intéressement 6 848. Votre ligne « Résultat » de mai (−198 667) est, elle, juste : elle
          ne diffère de la Synthèse (−194 818) que du lissage des amortissements (3 899). C&apos;est
          votre ligne « BG comptable » (−257 704) qui datait d&apos;avant les révisions, ce que
          votre contrôle affichait déjà (62 936).
        </li>
      </ul>
    ),
    ask: "Confirmez-vous que votre tableau de mai a été bâti avant ces écritures ? Si oui, ce point est refermé : juin et juillet ne se lisent plus que dans l'application.",
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
        <li>
          Votre tableau de gestion s&apos;arrête à mai : à partir de juin, les écrans Chantiers,
          Synthèse et Frais généraux le remplacent. Ce que vous y relevez chaque mois se note
          ici, point par point, et l&apos;application est ajustée en conséquence.
        </li>
      </ul>
    ),
    ask: "Quelle date d'envoi chaque mois, et qui valide l'import ? Et voulez-vous relire les écrans avant validation, ou après ?",
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
        <p>
          <strong>Juillet et août</strong> : ni la balance de juillet — le ré-export « V2 » du 23
          septembre est identique au précédent — ni celle d&apos;août ne portent d&apos;écriture sur
          le compte 71331000 : ni reprise de la provision de juin, ni provision du mois. Les
          résultats chantiers de juillet (<N>+671 174</N>) et d&apos;août sont donc des résultats
          sans provision, et la provision de juin (1 054 701) n&apos;a pas été reprise.
        </p>
      </>
    ),
    ask: "Cette imputation sur FX est-elle volontaire ? Si la provision doit revenir aux chantiers, faut-il une écriture de reclassement en comptabilité, ou la saisir chantier par chantier dans l'application ? Et pour juillet, les provisions sont-elles à venir dans un export corrigé ?",
  },
];

export const FICHIERS = [
  {
    nom: "Balance ventilée d'août 2026",
    pourquoi:
      "La balance analytique d'août est en base ; sans la ventilée du même mois, la Synthèse s'arrête à juillet et août n'est pas recoupé.",
    tag: "point 12",
    tone: "warn" as Tone,
  },
  {
    nom: "Vos réponses aux points de la partie C",
    pourquoi:
      "Six d'entre eux commandent des réglages de l'application (périmètre, provisions, cumuls, conventions de frais généraux). Un mot suffit ; le détail se voit ensemble.",
    tag: "points 2 à 9",
    tone: "warn" as Tone,
  },
  {
    nom: "Les objectifs annuels du dirigeant, validés",
    pourquoi:
      "L'écran Objectifs porte aujourd'hui vos ratios réalisés 2025/26, saisis en brouillon, et non les objectifs. La colonne « OBJECTIF FRED » de votre synthèse (achats 15 %, location externe 10 %, EasyMat 7 %, salaires production 8 %, sédentaires 7 %, sous-traitants 41 %, intérim 15 %, eau 1 %) est saisie en cinq minutes une fois confirmée.",
    tag: "objectifs",
    tone: "warn" as Tone,
  },
];
