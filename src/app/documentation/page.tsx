import type { Metadata } from "next";
import Link from "next/link";
import { DocBlock, DocFaq, DocFlow, DocNote, DocPage, DocSection, DocSteps } from "@/components/doc";

// Documentation détaillée : comment l'application lit les balances et calcule
// chaque vue, entité par entité. Le mode d'emploi des écrans est dans /guide.
// À relire à chaque changement de règle de calcul ou de convention d'entité.

export const metadata: Metadata = { title: "Documentation détaillée | Groupe SDG" };

const TOC = [
  { id: "ensemble", label: "Vue d’ensemble" },
  { id: "entites", label: "Les entités" },
  { id: "sources", label: "Les balances" },
  { id: "imports", label: "Le cycle d’un import" },
  { id: "synthese", label: "Synthèse" },
  { id: "chantiers", label: "Chantiers" },
  { id: "previsions", label: "Prévisions et validation du mois" },
  { id: "fx", label: "Frais généraux" },
  { id: "objectifs", label: "Objectifs et analyse mensuelle" },
  { id: "mapping", label: "Nomenclature et mapping" },
  { id: "alertes", label: "Alertes" },
  { id: "assistant", label: "Assistant IA" },
  { id: "acces", label: "Accès et fraîcheur des chiffres" },
  { id: "cdc", label: "Cahier des charges" },
  { id: "faq", label: "Questions pratiques" },
];

export default function DocumentationPage() {
  return (
    <DocPage
      title="Documentation détaillée"
      lead="Le document de référence : comment les balances comptables alimentent l’application, comment chaque vue calcule ses chiffres, et ce que chaque entité a en propre."
      updated="14 octobre 2026"
      toc={TOC}
      other={{ href: "/guide", label: "Guide utilisateur" }}
    >
      <DocSection
        id="ensemble"
        num={1}
        title="Vue d’ensemble"
        lead="Des tableaux de gestion alimentés par la comptabilité, sans ressaisie (devis n°2026-047)."
      >
        <DocFlow
          steps={[
            {
              title: "Comptabilité",
              body: "Cegid ou Pennylane produisent chaque mois la balance ventilée et la balance analytique.",
            },
            {
              title: "Imports contrôlés",
              body: "Dépôt, lecture, contrôles de cohérence, puis validation par la DAF.",
            },
            {
              title: "Vues de gestion",
              body: "Synthèse, Chantiers, Frais généraux et Objectifs, recalculés à l’affichage.",
            },
            {
              title: "Analyse",
              body: "Validation du mois, alertes, analyse mensuelle et assistant IA.",
            },
          ]}
        />
        <DocNote title="Principe fondateur.">
          L’application ne modifie jamais une donnée comptable. Elle conserve les versions
          successives des balances et lit toujours la bonne. Tout ajustement de gestion (prévision de
          travaux en cours, note, objectif) est stocké à part, signé, daté et identifié comme tel.
        </DocNote>
        <p>
          Aucun total n’est stocké : chaque chiffre affiché est recalculé à partir des lignes des
          balances importées, des règles de rangement et des saisies. Une même règle s’applique donc
          à tous les mois, y compris passés, dès qu’elle change.
        </p>
      </DocSection>

      <DocSection
        id="entites"
        num={2}
        title="Les entités"
        lead="Une maquette commune au groupe, celle de Sodobat ; chaque entité y ajoute ce qu’elle a en propre."
      >
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Entité</th>
                <th>Exercice</th>
                <th>Comptabilité</th>
                <th>Prévisions de travaux en cours</th>
                <th>Chantiers et structure</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sodobat</td>
                <td>nov. → oct.</td>
                <td>Cegid, puis Pennylane dès novembre 2026</td>
                <td>compte 71331000, lu chantier par chantier</td>
                <td>un code qui commence par un chiffre est un chantier ; DEPOT et SAV suivis comme des chantiers</td>
              </tr>
              <tr>
                <td>CovarBat</td>
                <td>nov. → oct.</td>
                <td>Pennylane</td>
                <td>saisies dans l’application, qui font foi : le cabinet ne les ventile pas</td>
                <td>règle par défaut, et quelques centres sans code rattachés comme chantiers</td>
              </tr>
              <tr>
                <td>VBTP</td>
                <td>janv. → déc.</td>
                <td>Pennylane (Quadra avant 2026)</td>
                <td>compte 71345000</td>
                <td>un chantier exporté sans code est rattaché au numéro du tableau de gestion</td>
              </tr>
              <tr>
                <td>Easy Mat</td>
                <td>nov. → oct.</td>
                <td>Pennylane (Quadra avant 2025)</td>
                <td>comptes 71340000 puis 71331000</td>
                <td>affaires codées par lettres : la structure est énumérée (FX, dépôts, SDG, véhicules…), tout autre centre est une affaire</td>
              </tr>
              <tr>
                <td>Easy Home</td>
                <td>nov. → oct.</td>
                <td>Pennylane (Quadra avant 2025)</td>
                <td>compte 71350000</td>
                <td>comme Easy Mat</td>
              </tr>
              <tr>
                <td>Demo</td>
                <td>nov. → oct.</td>
                <td>fichiers Cegid fictifs</td>
                <td>comme Sodobat</td>
                <td>comme Sodobat</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Un exercice est repéré par l’année de son ouverture : l’exercice 2025 de Sodobat va de
          novembre 2025 à octobre 2026. Les lignes de la maquette qui ne concernent que certaines
          entités ne s’affichent que chez elles ; chaque entité peut aussi avoir ses propres
          libellés et ses propres règles de rangement.
        </p>
        <p>
          L’entité <b>Demo</b> est une entreprise de bâtiment imaginaire, au format Cegid de
          Sodobat, réservée aux démonstrations. Elle lit la maquette de Sodobat sans règle propre ; son
          compte de démonstration n’a accès qu’à elle.
        </p>
      </DocSection>

      <DocSection
        id="sources"
        num={3}
        title="Les balances"
        lead="Deux fichiers par mois, de nature différente, traités différemment."
      >
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th />
                <th>Balance ventilée</th>
                <th>Balance analytique</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Contenu</td>
                <td>
                  Tous les comptes de charges et de produits, une colonne par mois depuis l’ouverture
                  de l’exercice.
                </td>
                <td>
                  Les mêmes comptes répartis par centre (chantier ou structure), pour les mouvements
                  du seul mois.
                </td>
              </tr>
              <tr>
                <td>Période</td>
                <td>Le dernier mois portant des données ; l’exercice se déduit du premier.</td>
                <td>
                  Indiquée à l’import pour Cegid ; lue dans le nom du fichier pour Pennylane (une
                  saisie contraire est refusée).
                </td>
              </tr>
              <tr>
                <td>Au réimport</td>
                <td>Remplace la précédente pour tout l’exercice.</td>
                <td>Ne remplace que le même mois ; les autres mois restent.</td>
              </tr>
              <tr>
                <td>Alimente</td>
                <td>Synthèse, Objectifs, consultation par compte</td>
                <td>Chantiers, Frais généraux, ventilation par centre</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Seuls les comptes de classes 6 et 7 sont lus. Chaque balance analytique recoupe au centime
          la colonne du même mois de la balance ventilée. Les comptes Pennylane à 9 à 12 chiffres
          terminés par des zéros sont ramenés à 8 chiffres ; un centre exporté sans code devient
          « # » suivi de son libellé.
        </p>
        <DocBlock title="Formats reconnus">
          <ul>
            <li>
              <b>Cegid</b> : mois écrits « MM/AAAA » et lignes « Total classe » pour le contrôle.
            </li>
            <li>
              <b>Pennylane</b> : mois écrits en toutes lettres ; le contrôle porte sur la colonne
              Solde. En analytique, seule la famille d’axes des chantiers est lue.
            </li>
            <li>
              <b>Quadra</b> : balances d’exercices clos de VBTP, Easy Mat et Easy Home, importées pour
              l’historique.
            </li>
          </ul>
        </DocBlock>
        <DocBlock title="Balances d’exercices clos et balances cumulées">
          <p>
            Une balance qui couvre un exercice entier ou plusieurs mois depuis l’ouverture est une
            balance <b>cumulée</b>. Elle reste hors du cycle mensuel : elle n’apparaît pas dans le
            sélecteur de mois et n’entre pas dans les cumuls des chantiers. Elle sert aux colonnes
            N-1 et N-2 des Frais généraux, au N-1 de la Synthèse quand l’exercice précédent n’a pas de
            balance ventilée, et, pour l’exercice en cours, au cumul des Frais généraux tant qu’aucun
            fichier mensuel n’existe. Un export Pennylane de plusieurs mois est reconnu comme tel ;
            une balance d’exercice clos Cegid ou Quadra s’importe par l’administrateur.
          </p>
        </DocBlock>
      </DocSection>

      <DocSection
        id="imports"
        num={4}
        title="Le cycle d’un import"
        lead="La validation est le seul moment où les chiffres changent."
      >
        <DocSteps
          steps={[
            {
              title: "Dépôt",
              body: "La DAF dépose le fichier xlsx dans Imports. Le type de balance est reconnu ; le mois aussi, sauf pour une balance analytique Cegid.",
            },
            {
              title: "Lecture et contrôle",
              body: "L’application lit le fichier et présente la page de contrôle : lignes lues, mois ou centres couverts, contrôles de classes, comptes non rattachés par vue, et la version qu’il remplacera le cas échéant. Les données sont stockées mais n’entrent dans aucun calcul.",
            },
            {
              title: "Validation",
              body: "« Valider l’intégration » : l’import devient la version lue par les vues. Celui qu’il remplace passe au statut « Remplacé » et ses alertes ouvertes sont effacées ; les centres analytiques sont créés ou mis à jour ; les alertes sont recalculées.",
            },
          ]}
        />
        <p>
          « Rejeter cet import » supprime le dépôt et ses lignes : rien n’a été intégré. Seuls la DAF
          et l’administrateur importent, sur les entités auxquelles leur compte a accès.
        </p>
        <DocBlock title="Dépôts refusés">
          <ul>
            <li>une balance ventilée plus ancienne que celle déjà validée pour l’exercice ;</li>
            <li>
              une balance analytique sans compte de charges : c’est un export du chiffre d’affaires
              par chantier ;
            </li>
            <li>
              un export Pennylane de plusieurs mois qui ne part pas de l’ouverture de l’exercice ;
            </li>
            <li>
              une balance cumulée, quand des balances analytiques mensuelles de l’exercice sont déjà
              validées.
            </li>
          </ul>
        </DocBlock>
        <DocBlock title="Calendrier">
          <p>
            Les exports du mois M sont attendus vers le 24 du mois M+1 (date de la TVA). L’écran
            Imports le rappelle : cycle à jour, balance analytique attendue, ou données en retard.
            Une seconde mise à jour suit les corrections du cabinet : on réimporte, la nouvelle
            version remplace l’ancienne.
          </p>
        </DocBlock>
      </DocSection>

      <DocSection
        id="synthese"
        num={5}
        title="Synthèse"
        lead="Les résultats de l’exercice, construits sur la dernière balance ventilée validée."
      >
        <p>
          Sept sections : produits / CA, charges d’exploitation, charges de personnel, résultat
          d’exploitation, autres produits, frais généraux et autres charges, résultat final et
          contrôles. Colonnes : les mois de l’exercice, le total, le % du CA, le total N-1, le % N-1
          et l’écart. Le comparatif N-1 porte sur le même nombre de mois ; si l’exercice précédent
          n’est connu que par une balance cumulée, seul son total annuel est repris.
        </p>
        <DocBlock title="Arrêté à un mois passé">
          <p>
            Chaque balance ventilée contient tout l’exercice et remplace la précédente : revenir à
            mai ne rouvre pas l’ancien fichier, mais tronque le dernier à mai. On lit donc mai tel
            qu’on le connaît aujourd’hui, corrections du cabinet comprises.
          </p>
        </DocBlock>
        <DocBlock title="Chantiers et structure">
          <p>
            Certains postes existent à la fois sur les chantiers et dans la structure (entretien,
            carburant, locations, fournitures). La part portée par les centres de structure dans la
            balance analytique du mois rejoint les lignes de frais généraux. Un mois sans balance
            analytique ne peut pas être réparti : la Synthèse le signale.
          </p>
        </DocBlock>
        <DocBlock title="Dotations aux amortissements lissées">
          <p>
            La comptabilité passe en général les dotations (68111000, 68112000) en une ou deux
            écritures par exercice. La Synthèse et les Frais généraux les répartissent : le cumul
            comptabilisé à parts égales sur les mois qu’il couvre, puis un douzième de la dotation de
            l’exercice précédent pour chaque mois suivant. Dès que trois mois de l’exercice portent
            une dotation, elles sont lues mois par mois, sans lissage.
          </p>
          <p>
            La ligne « Retraitement DAP » garde l’écart avec la comptabilité, et le bloc de contrôle
            vérifie que l’écart entre le résultat net et le solde brut des classes 6 et 7 correspond
            exactement aux retraitements.
          </p>
        </DocBlock>
        <DocBlock title="Prévisions et résultat de gestion">
          <p>
            La Synthèse reste comptable : sa prévision du mois est celle que le cabinet a passée. Deux
            lignes du bloc résultat montrent l’effet des saisies de la vue Chantiers : «
            Prévisions saisies non comptabilisées » (saisi moins comptabilisé, mois par mois) et «
            Résultat de gestion » (résultat net plus cet écart). Quand le cabinet a passé les mêmes
            prévisions, l’écart est nul.
          </p>
        </DocBlock>
        <p>
          La ligne <b>Notes / Commentaires</b> se saisit par mois (DAF, administrateur, profil
          saisie) et se fige à la validation du mois.
        </p>
      </DocSection>

      <DocSection
        id="chantiers"
        num={6}
        title="Chantiers"
        lead="Le résultat de chaque affaire sur le mois, et ses cumuls sur toute sa durée de vie."
      >
        <p>
          Chaque centre analytique rangé comme chantier forme une colonne, s’il a des mouvements ce
          mois-ci, dans un mois précédent ou un report d’ouverture. Les colonnes sont regroupées par
          pôle et triées par numéro. Les centres de structure ont leur propre vue.
        </p>
        <p>
          Les lignes suivent la maquette : produits détaillés, <b>Prévision M</b>,{" "}
          <b>Annulation M-1</b>, CA HT total, charges d’exploitation (achats, locations,
          sous-traitance, carburant…), charges de personnel, résultat du mois et ratios, puis les
          cumuls et la gestion (notes, statut). Les montants sont les mouvements de la balance
          analytique du mois.
        </p>
        <DocBlock title="Cumuls sur la durée de vie">
          <p>
            Cumul de facturation et cumul de résultat = report d’ouverture + somme des balances
            analytiques mensuelles importées. Les reports d’ouverture viennent du tableau de gestion
            de la DAF (au 31 octobre 2025 pour Sodobat). « Dont prévisions en cours » est la
            prévision encore ouverte à la fin du mois.
          </p>
        </DocBlock>
        <p>
          Un chantier sans mouvement reste affiché tant qu’il porte une annulation ou une prévision
          ouverte. La case « Masquer les chantiers sans activité » cache les autres.
        </p>
      </DocSection>

      <DocSection
        id="previsions"
        num={7}
        title="Prévisions et validation du mois"
        lead="Le mécanisme qui fait coller le résultat du mois à l’avancement réel des chantiers."
      >
        <p>
          Dans le BTP, la facturation ne suit pas exactement l’avancement des travaux. Fin juin, un
          chantier peut avoir réalisé 50 000 € de travaux et n’en avoir facturé que 30 000 € : il
          paraît en perte ce mois-là, par simple décalage. La comptabilité corrige ce décalage avec
          une <b>prévision de travaux en cours</b> (compte 713) : le manque à facturer, passé en
          produit à la fin du mois, puis annulé le mois suivant.
        </p>
        <DocNote>
          <b>Convention de la DAF.</b> Prévision M = prévision encore ouverte à la fin du mois ;
          Annulation M-1 = la prévision du mois précédent, en négatif. Total des produits = facturé +
          prévision + annulation.
        </DocNote>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Exemple</th>
                <th className="num">Mai</th>
                <th className="num">Juin</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Facturé</td>
                <td className="num">30 000 €</td>
                <td className="num">45 000 €</td>
              </tr>
              <tr>
                <td>Prévision M</td>
                <td className="num">+20 000 €</td>
                <td className="num">+8 000 €</td>
              </tr>
              <tr>
                <td>Annulation M-1</td>
                <td className="num">0 €</td>
                <td className="num">−20 000 €</td>
              </tr>
              <tr>
                <td>Total des produits</td>
                <td className="num">50 000 €</td>
                <td className="num">33 000 €</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          En juin, la facturation rattrape mai : l’annulation évite de compter deux fois les 20 000 €,
          et la production réelle de juin ressort à 33 000 €.
        </p>
        <DocBlock title="Saisie, brouillon, figé">
          <p>
            Par défaut, la cellule Prévision M affiche la prévision lue dans la balance analytique.
            L’entité (profil saisie), la DAF ou l’administrateur peuvent la saisir : la valeur saisie
            remplace celle de la comptabilité dans le résultat du chantier. Elle reste en brouillon,
            avec son auteur et sa date, jusqu’à ce que la DAF la fige ; figer retient la valeur
            affichée dans la case. Seuls la DAF et l’administrateur figent et rouvrent. Une note par
            chantier et par mois explique un décalage avec la comptabilité.
          </p>
          <p>
            Chez CovarBat, la prévision saisie fait foi : l’annulation d’un mois est la prévision
            saisie du mois précédent, en négatif, et le reste du compte 70400000 est du chiffre
            d’affaires.
          </p>
        </DocBlock>
        <DocBlock title="La validation du mois" aside="DAF et administrateur">
          <p>
            L’encart en tête de la vue Chantiers compare, chantier par chantier, les prévisions
            saisies aux prévisions comptabilisées, et donne le résultat comptable et le résultat de
            gestion du mois. « Valider le mois » exige la balance analytique du mois et une balance
            ventilée qui le couvre ; si un écart subsiste, une confirmation est demandée. À la
            validation, toutes les saisies du mois passent en figé, et la validation retient les
            imports et l’empreinte de la colonne du mois sur lesquels elle porte.
          </p>
          <p>
            Elle devient <b>caduque</b> si la balance analytique du mois est réimportée, si la balance
            ventilée ne couvre plus le mois, ou si la colonne du mois y a changé ; une nouvelle balance
            qui ne fait qu’ajouter des mois ne la remet pas en cause. Le mois redevient alors
            modifiable, à revalider. « Rouvrir le mois » supprime la validation ; les saisies restent
            figées et se rouvrent une à une.
          </p>
        </DocBlock>
      </DocSection>

      <DocSection
        id="fx"
        num={8}
        title="Frais généraux"
        lead="Les coûts de structure, lus dans les centres de structure de la balance analytique."
      >
        <p>
          La vue reprend les centres de structure (FX, siège, dépôt selon l’entité) et quelques
          comptes toujours rangés en structure : dotations aux amortissements (68111000, 68112000),
          65700000 et 67500000. Sections : référence (CA de l’exercice), honoraires, frais généraux
          (dont la masse salariale sédentaire), crédit-bail en bloc à part chez Easy Mat et Easy
          Home, et totaux.
        </p>
        <ul>
          <li>
            <b>N</b> : somme des balances analytiques mensuelles de l’exercice, ou la balance cumulée
            tant qu’il n’y en a pas (bandeau « Cumul de l’exercice seulement »).
          </li>
          <li>
            <b>N-1 et N-2</b> : exercices précédents entiers, lus dans leurs balances analytiques,
            ou à défaut dans la balance ventilée restreinte aux comptes de structure.
          </li>
          <li>
            Chaque % est rapporté au CA de son propre exercice, lu dans la balance ventilée, pour
            rester comparable.
          </li>
          <li>La lecture « Mensuel » donne un mois par colonne et signale les mois manquants.</li>
        </ul>
        <p>
          Un montant négatif est un produit venu en déduction : certaines lignes sont volontairement
          nettes, comme les assurances (primes moins indemnités) ou les intérêts.
        </p>
      </DocSection>

      <DocSection id="objectifs" num={9} title="Objectifs et analyse mensuelle">
        <DocBlock title="Objectifs du dirigeant">
          <p>
            Douze indicateurs en % du CA, chacun repris d’une ligne de la Synthèse ou des Frais
            généraux, sans calcul à part ; ensemble ils forment le total de contrôle. L’objectif annuel
            est saisi par la DAF pour l’exercice. Écart = réalisé − objectif, en points :
          </p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <tbody>
                <tr>
                  <td><span className="tag green">BON</span></td>
                  <td>écart de −0,2 point ou moins</td>
                </tr>
                <tr>
                  <td><span className="tag brand">BIEN</span></td>
                  <td>entre −0,2 et +0,2 point</td>
                </tr>
                <tr>
                  <td><span className="tag amber">À SURVEILLER</span></td>
                  <td>de +0,2 à +2 points</td>
                </tr>
                <tr>
                  <td><span className="tag red">MAUVAIS</span></td>
                  <td>plus de 2 points</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DocBlock>
        <DocBlock title="Analyse mensuelle">
          <p>
            Elle se lance sur un mois validé, dont la validation porte encore sur la balance
            analytique en place, et couvert par la balance ventilée. Les chiffres sont calculés et
            figés à la génération : flash du mois, objectifs (cumul, mois seul, statut à la fin du mois
            précédent), fortes variations, chantiers à regarder, frais généraux et fiabilité des
            données, ainsi que le chiffre d’affaires facturé, hors travaux en cours.
          </p>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Repère</th>
                  <th>Seuil</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Mois de référence</td>
                  <td>moyenne des 3 mois précédents disposant de données (2 au moins)</td>
                </tr>
                <tr>
                  <td>Variation signalée</td>
                  <td>écart défavorable d’au moins 40 % et 50 k€</td>
                </tr>
                <tr>
                  <td>Variation très marquée</td>
                  <td>au moins 80 % et 150 k€</td>
                </tr>
                <tr>
                  <td>Poste absent</td>
                  <td>charge à zéro qui pèse d’habitude 50 k€ ou plus</td>
                </tr>
                <tr>
                  <td>Chantier à regarder</td>
                  <td>
                    20 k€ de charges ou plus sans facturation ni prévision (8 au plus), ou résultat du
                    mois négatif (5 au plus)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            L’IA rédige ensuite le texte à partir de ces seuls chiffres, sur un ton factuel et
            mesuré qui ne met personne en cause : un en bref en phrases complètes, des points forts,
            des points d’attention au format « Sujet : constat », et des actions réparties entre la
            DAF et l’exploitation, deux au plus de chaque côté. Les consignes, revues avec la DAF,
            demandent un texte sans sigle, des comparaisons qui disent toujours leur référence et
            leur écart, et une marge rapportée à son chiffre d’affaires.
          </p>
          <p>
            Trois règles sont appliquées après la rédaction, sans dépendre de l’IA : le chiffre
            d’affaires facturé est suivi de « (hors travaux en cours de X) », un point d’attention
            qui reprend un poste des alertes du mois est retiré, et les décimales prennent la virgule.
            Si la rédaction échoue, les chiffres sont enregistrés sans texte. L’analyse naît en brouillon ;
            la DAF relit, modifie, commente et publie. Relancer repasse en brouillon et garde le
            commentaire. L’analyse devient caduque si le mois est rouvert ou sa balance analytique
            réimportée, et ne peut plus être publiée avant d’être relancée.
          </p>
        </DocBlock>
      </DocSection>

      <DocSection
        id="mapping"
        num={10}
        title="Nomenclature et mapping"
        lead="Comment un compte comptable devient une ligne de tableau."
      >
        <p>
          La nomenclature est la liste des lignes de gestion des trois vues, rangées par section.
          Chaque ligne porte ses comptes ; totaux, ratios et résultats sont des formules sur d’autres
          lignes. Une règle range un compte précis ou tous les comptes commençant par un préfixe.
        </p>
        <DocBlock title="Ordre de priorité">
          <p>
            Règle exacte, puis préfixe le plus long. À motif égal, la règle de l’entité l’emporte sur
            celle de Sodobat, qui l’emporte sur la règle commune du groupe : « c’est le code de Sodobat
            qui prévaut ». Une règle plus précise s’impose donc sans qu’il faille supprimer les
            autres.
          </p>
        </DocBlock>
        <DocBlock title="Jamais de classement par défaut">
          <p>
            Un compte qu’aucune règle ne couvre n’est rangé nulle part : il est listé à part et remonte
            en alerte avec son numéro, son libellé et son montant, jusqu’à ce qu’un humain l’affecte.
          </p>
        </DocBlock>
        <DocBlock title="L’écran Mapping" aside="DAF et administrateur">
          <ul>
            <li>
              affecter un compte non rattaché, au compte près ou par préfixe, avec une suggestion
              tirée du compte voisin le plus proche ; l’alerte se clôt d’elle-même ;
            </li>
            <li>ignorer un compte volontairement hors gestion ;</li>
            <li>créer une règle librement, avec un aperçu de ce qu’elle change ;</li>
            <li>
              remplacer pour l’entité une règle commune : la règle de l’entité prend le pas, la règle
              commune reste en place ;
            </li>
            <li>supprimer une règle de l’entité, consulter la nomenclature.</li>
          </ul>
          <p>Tout changement vaut aussitôt pour toutes les vues et tous les mois, sans réimport.</p>
        </DocBlock>
        <DocBlock title="Centres analytiques">
          <p>
            Un centre est un chantier ou de la structure. Par défaut, un code qui commence par un
            chiffre est un chantier ; Easy Mat et Easy Home énumèrent leur structure ; une nature
            peut aussi être fixée centre par centre. Un centre peut être lu comme un autre : un
            chantier exporté sans code suit alors le numéro qui lui correspond.
          </p>
        </DocBlock>
      </DocSection>

      <DocSection
        id="alertes"
        num={11}
        title="Alertes"
        lead="Calculées à chaque validation d’import ; une décision prise sur une alerte survit aux imports suivants."
      >
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Alerte</th>
                <th>Source</th>
                <th>Ce qu’elle signale</th>
                <th>Après traitement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Écart de contrôle</td>
                <td>ventilée</td>
                <td>Le total recalculé d’une classe diffère de celui du fichier.</td>
                <td>Signalée à nouveau à chaque import.</td>
              </tr>
              <tr>
                <td>Compte non mappé</td>
                <td>les deux</td>
                <td>Un compte n’est couvert par aucune règle.</td>
                <td>Ne revient pas pour ce compte ; se clôt d’elle-même à l’affectation.</td>
              </tr>
              <tr>
                <td>Mois sans données</td>
                <td>ventilée</td>
                <td>Un mois de l’exercice en cours ne porte aucune écriture.</td>
                <td>Ne revient pas pour ce mois.</td>
              </tr>
              <tr>
                <td>Montant constant</td>
                <td>ventilée</td>
                <td>Le même montant revient plusieurs mois de suite sur un compte.</td>
                <td>Ne revient pas tant que le montant reste le même.</td>
              </tr>
              <tr>
                <td>Centre créé par import ou sans code</td>
                <td>analytique</td>
                <td>Des écritures sont rangées sur un centre qui n’est pas un vrai chantier.</td>
                <td>Revient chaque mois tant que le centre subsiste.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Quand un import est remplacé, ses alertes ouvertes sont effacées et le nouvel import
          recalcule les siennes. La DAF et l’administrateur traitent les alertes depuis la page
          Alertes ; « Réactiver la surveillance » annule une décision. Les alertes des exercices clos
          sont rangées à part, hors compteur, et l’assistant ne les cite pas.
        </p>
      </DocSection>

      <DocSection
        id="assistant"
        num={12}
        title="Assistant IA"
        lead="Des questions en français, des réponses tirées des mêmes calculs que les écrans."
      >
        <p>
          Pour répondre, l’assistant interroge l’application en lecture seule : Synthèse, Chantiers et
          historique d’un chantier, Frais généraux (exercices et mensuel), Objectifs, compte
          comptable, validation du mois, alertes et imports disponibles, la plupart pour le mois de
          son choix. Il ne calcule rien de son côté et ne peut rien modifier. Les sources consultées
          s’affichent sous chaque réponse.
        </p>
        <ul>
          <li>une question de 4 000 caractères au plus, 6 étapes de recherche et 60 secondes par réponse ;</li>
          <li>des conversations personnelles, propres à chaque utilisateur et à chaque entité ;</li>
          <li>
            un journal de chaque échange (utilisateur, question, modèle, volume consommé, durée), qui
            mesure le coût de l’IA ; supprimer une conversation efface la question mais garde la
            ligne de coût.
          </li>
        </ul>
        <p>
          L’assistant et l’analyse mensuelle passent par key.one, qui applique le budget d’IA avant
          chaque appel.
        </p>
      </DocSection>

      <DocSection id="acces" num={13} title="Accès et fraîcheur des chiffres">
        <DocBlock title="Comptes et rôles">
          <p>
            Quatre rôles : administrateur et DAF (tout), saisie (prévisions, notes et statut des
            chantiers), lecteur (consultation). Le détail est dans le{" "}
            <Link href="/guide#roles">guide utilisateur</Link>. Un compte peut être rattaché à une
            entité, quel que soit son rôle : il ne voit et ne modifie qu’elle. Le serveur ne sert
            jamais une entité fermée ou interdite au compte, quelle que soit la préférence enregistrée
            dans le navigateur.
          </p>
          <p>
            Connexion par email et mot de passe, session de 7 jours ; toutes les pages, y compris
            cette documentation, exigent d’être connecté. Les écrans Imports et Mapping sont protégés
            côté serveur.
          </p>
        </DocBlock>
        <DocBlock title="Fraîcheur">
          <p>
            Le résultat de chaque vue est gardé d’un affichage à l’autre, sous une clé qui comprend une
            empreinte des imports, des saisies, des règles, de la nomenclature et des centres. Toute
            modification, même faite hors de l’application, entraîne un recalcul à l’affichage
            suivant : un chiffre n’est jamais servi périmé. La validation du mois, les notes et les
            alertes sont lues en direct.
          </p>
        </DocBlock>
      </DocSection>

      <DocSection
        id="cdc"
        num={14}
        title="Cahier des charges"
        lead="Où chaque exigence trouve sa réponse."
      >
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Exigence</th>
                <th>Réponse</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Objectif n°1 : fiabilité à 100 % entre les sources et les tableaux</td>
                <td>
                  Contrôles de classes et recoupement des deux balances à chaque import, validation
                  humaine, lecture de la dernière comptabilité validée, ajustements toujours
                  identifiés.
                </td>
              </tr>
              <tr>
                <td>§3 : suivi des chantiers sur toute leur durée de vie</td>
                <td>Cumuls depuis le report d’ouverture, à travers les exercices.</td>
              </tr>
              <tr>
                <td>§4.1 : tout compte non mappé remonte en alerte</td>
                <td>Jamais de classement par défaut ; affectation dans Mapping, mémorisée.</td>
              </tr>
              <tr>
                <td>§4.2 : conservation de l’historique</td>
                <td>
                  Les imports remplacés restent dans l’historique ; chaque balance analytique mensuelle
                  est conservée.
                </td>
              </tr>
              <tr>
                <td>§4.3 : deux mises à jour mensuelles, à M+24 puis après corrections</td>
                <td>Réimport qui remplace la version précédente ; rappel du calendrier dans Imports.</td>
              </tr>
              <tr>
                <td>§4.5 : notes pour expliquer les décalages avec la comptabilité</td>
                <td>Note par chantier et par mois ; notes mensuelles de la Synthèse.</td>
              </tr>
              <tr>
                <td>§4.6 : saisie en brouillon modifiable, puis figée</td>
                <td>Prévisions en brouillon, figées par la DAF, puis validation du mois.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection id="faq" num={15} title="Questions pratiques">
        <DocFaq
          items={[
            {
              q: "Les chiffres d’un mois passé ont changé après un import. Est-ce normal ?",
              a: (
                <p>
                  Oui. La nouvelle balance ventilée contient tout l’exercice : si le cabinet a corrigé
                  des écritures de mars, la colonne de mars change à la validation. Les tableaux
                  suivent toujours la comptabilité la plus récente.
                </p>
              ),
            },
            {
              q: "Peut-on importer les mois dans le désordre ?",
              a: (
                <p>
                  Pour les balances analytiques, oui : chaque fichier porte son mois. Une balance
                  ventilée plus ancienne que la dernière validée est refusée, puisqu’elle effacerait des
                  mois plus récents.
                </p>
              ),
            },
            {
              q: "Que se passe-t-il si on saute un mois de balance analytique ?",
              a: (
                <p>
                  Le mois manquant n’entre ni dans les cumuls des chantiers ni dans le cumul des frais
                  généraux, et la Synthèse ne peut pas répartir ce mois-là les postes partagés entre
                  chantiers et structure ; elle le signale. Il suffit d’importer le fichier ensuite :
                  tout se recalcule.
                </p>
              ),
            },
            {
              q: "Un fichier a été validé par erreur. Comment revenir en arrière ?",
              a: (
                <p>
                  On réimporte la bonne version du même mois, ou le bon export de l’exercice pour la
                  balance ventilée : elle remplace la version erronée, qui reste dans l’historique.
                </p>
              ),
            },
            {
              q: "D’où viennent les cumuls des chantiers ouverts avant le premier mois importé ?",
              a: (
                <p>
                  Des reports d’ouverture repris du tableau de gestion de la DAF, chantier par chantier
                  (facturation et résultat), auxquels s’ajoutent les mois importés depuis.
                </p>
              ),
            },
            {
              q: "Pourquoi un chantier n’apparaît-il pas ?",
              a: (
                <p>
                  Une colonne naît d’un mouvement du mois, d’un mois antérieur ou d’un report
                  d’ouverture. Un chantier qui n’a rien de tout cela n’apparaît pas. Vérifier aussi la
                  case « Masquer les chantiers sans activité », et que son centre est bien rangé comme
                  chantier.
                </p>
              ),
            },
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
