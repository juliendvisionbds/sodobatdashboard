import type { Metadata } from "next";
import Link from "next/link";
import {
  DocBlock,
  DocFaq,
  DocFlow,
  DocNote,
  DocPage,
  DocSection,
  DocSteps,
} from "@/components/doc";

// Guide utilisateur : ce que fait chaque écran et le rituel du mois, pour la
// DAF, les dirigeants et les entités. Le fonctionnement interne (règles
// d'import, calculs, conventions par entité) est dans /documentation.

export const metadata: Metadata = { title: "Guide utilisateur | Groupe SDG" };

const TOC = [
  { id: "principe", label: "Le principe" },
  { id: "reperes", label: "Se repérer" },
  { id: "ecrans", label: "Les écrans" },
  { id: "rituel", label: "Le rituel du mois" },
  { id: "analyse", label: "L’analyse mensuelle" },
  { id: "alertes", label: "Les alertes" },
  { id: "roles", label: "Rôles et accès" },
  { id: "faq", label: "Questions fréquentes" },
];

const Y = () => <span className="yes">Oui</span>;
const N = () => <span className="no">–</span>;

export default function GuidePage() {
  return (
    <DocPage
      title="Guide utilisateur"
      lead="Comment lire les tableaux de gestion du Groupe SDG, ce que fait chaque écran, et les gestes du mois pour garder des chiffres justes."
      updated="14 octobre 2026"
      toc={TOC}
      other={{ href: "/documentation", label: "Documentation détaillée" }}
    >
      <DocSection
        id="principe"
        num={1}
        title="Le principe"
        lead="Des exports comptables aux tableaux de gestion, sans ressaisie."
      >
        <DocFlow
          steps={[
            {
              title: "Exports comptables",
              body: "Chaque mois, deux balances sortent de la comptabilité, Cegid ou Pennylane : la balance ventilée et la balance analytique.",
            },
            {
              title: "Import contrôlé",
              body: "La DAF les dépose dans l’application, qui les lit, les contrôle et présente un récapitulatif. Rien n’entre avant sa validation.",
            },
            {
              title: "Tableaux à jour",
              body: "Synthèse, Chantiers, Frais généraux et Objectifs sont recalculés. Tout le monde voit les mêmes chiffres au même moment.",
            },
            {
              title: "Mois validé et analysé",
              body: "Une fois les prévisions de travaux en cours passées, la DAF valide le mois, puis publie son analyse.",
            },
          ]}
        />
        <p>
          La <b>balance ventilée</b> donne tous les comptes de l’entité, mois par mois : elle
          alimente la Synthèse. La <b>balance analytique</b> répartit les mêmes comptes par centre,
          un centre par chantier plus les centres de structure (frais généraux, dépôt, siège) :
          elle alimente les vues Chantiers et Frais généraux. Les deux se recoupent au centime sur
          le mois.
        </p>
        <p>Quatre règles garantissent la fiabilité des chiffres :</p>
        <ul>
          <li>
            <b>La comptabilité n’est jamais modifiée.</b> Les ajustements de gestion (prévisions de
            travaux en cours, notes, objectifs) sont saisis à part, signés et datés.
          </li>
          <li>
            <b>Jamais de classement par défaut.</b> Un compte qu’aucune règle ne couvre n’est rangé
            nulle part : il remonte en alerte jusqu’à ce que la DAF lui donne sa ligne.
          </li>
          <li>
            <b>Réimporter remplace.</b> La version corrigée d’un mois prend la place de la
            précédente, sans doublon ; l’ancienne reste dans l’historique.
          </li>
          <li>
            <b>Tout est recalculé à l’affichage</b>, à partir des lignes des balances importées :
            aucun total n’est recopié ni stocké.
          </li>
        </ul>
      </DocSection>

      <DocSection id="reperes" num={2} title="Se repérer">
        <DocBlock title="Connexion">
          <p>
            Chacun se connecte avec son email et son mot de passe personnels ; la session reste
            ouverte 7 jours. Il n’y a pas de lien « mot de passe oublié » : l’administrateur en
            attribue un nouveau sur demande.
          </p>
        </DocBlock>
        <DocBlock title="L’entité affichée">
          <p>
            L’application montre une entité à la fois. Son nom, en haut à gauche, ouvre le menu{" "}
            <b>Entités du Groupe SDG</b> ; en changer ramène à la Synthèse. Une entité pas encore
            ouverte porte la mention « Coming soon ». Un compte rattaché à une entité ne voit
            qu’elle.
          </p>
          <p>
            L’entité <b>Demo</b> est une entreprise fictive, aux chiffres inventés, qui sert aux
            démonstrations : elle se manipule librement sans toucher aux données du groupe.
          </p>
        </DocBlock>
        <DocBlock title="L’exercice">
          <p>
            Le bandeau rappelle à droite l’exercice affiché, par exemple « Exercice 2025–2026 ».
            Sodobat, CovarBat, Easy Mat et Easy Home ouvrent leur exercice en novembre ; VBTP suit
            l’année civile.
          </p>
        </DocBlock>
        <DocBlock title="Navigation">
          <p>
            Les onglets donnent les cinq vues : <b>Synthèse</b>, <b>Chantiers</b>,{" "}
            <b>Frais généraux</b>, <b>Objectifs</b> et <b>Assistant IA</b>. Le menu utilisateur, sous
            vos initiales en haut à droite, donne accès à <b>Comptes</b>, <b>Alertes</b>, à ce guide
            et à la documentation détaillée, et pour la DAF à <b>Imports</b> et <b>Mapping</b>. C’est
            aussi là qu’on se déconnecte.
          </p>
        </DocBlock>
        <DocBlock title="Choisir un mois, imprimer">
          <p>
            À côté du titre, un sélecteur affiche une vue telle qu’elle était à la fin d’un mois
            passé : « Arrêté à » sur la Synthèse, le mois de la balance analytique sur Chantiers et
            Frais généraux. La page Objectifs montre toujours le dernier mois.
          </p>
          <p>
            Le bouton <b>Imprimer</b> (Synthèse, Chantiers, Frais généraux, Objectifs et analyse
            mensuelle) imprime l’écran tel qu’il est affiché, filtres compris, en A4 paysage. Pour un
            PDF, choisir « Enregistrer au format PDF » dans la fenêtre d’impression ; sous Safari,
            cocher l’orientation paysage.
          </p>
        </DocBlock>
      </DocSection>

      <DocSection
        id="ecrans"
        num={3}
        title="Les écrans"
        lead="Ce que montre chaque vue, et ce qu’on peut y faire."
      >
        <DocBlock title="Synthèse" aside="Page d’accueil · balance ventilée">
          <p>
            Les résultats cumulés de l’exercice. En tête, quatre indicateurs : chiffre d’affaires
            cumulé (comparé à N-1 si l’exercice précédent est importé), résultat d’exploitation,
            résultat net, et nombre d’alertes ouvertes. Puis les graphiques : chiffre d’affaires
            mensuel, principales charges en % du CA, résultat net des six derniers mois, et ratios
            clés (sous-traitance, personnel et exploitation rapportés au CA).
          </p>
          <p>
            Le <b>tableau de synthèse</b> reprend toutes les lignes de gestion, mois par mois, avec
            le total de l’exercice, le % du CA, le total N-1 et l’écart. Il se lit en{" "}
            <b>Mensuel</b> ou en <b>Cumulé</b>, se filtre par section ou par recherche, et masque par
            défaut les lignes et colonnes vides. La ligne <b>Notes / Commentaires</b> se remplit mois
            par mois ; elle se fige quand la DAF valide le mois.
          </p>
          <p>
            La carte <b>Alertes de cohérence</b> montre les premières alertes ouvertes ; « Tout gérer
            » mène à la page Alertes.
          </p>
        </DocBlock>

        <DocBlock title="Chantiers" aside="Balance analytique du mois">
          <p>
            Un chantier par colonne, regroupés par pôle, et les postes de gestion en lignes :
            produits du mois (travaux, prestations…), prévision du mois, annulation de la prévision
            du mois précédent, CA HT total, charges d’exploitation et de personnel, résultat du mois,
            puis les cumuls depuis l’ouverture du chantier. Le tableau se filtre par pôle et par recherche, et masque
            par défaut les chantiers sans activité.
          </p>
          <p>
            La ligne <b>Prévision M (travaux en cours à facturer)</b> se saisit directement dans le
            tableau, par l’entité ou par la DAF (« 20 000 » ou « 20000,5 »). La valeur reste en{" "}
            <b>brouillon</b>, modifiable, et indique au survol qui l’a saisie et quand. La DAF la{" "}
            <b>fige</b> d’un clic, ou la <b>rouvre</b>. Chaque chantier a aussi une note pour
            expliquer un décalage avec la comptabilité.
          </p>
          <p>
            L’encart <b>Validation du mois</b>, en tête de vue, compare chantier par chantier les
            prévisions saisies à celles que la comptabilité a passées, et donne le résultat comptable
            et le résultat de gestion du mois. Voir{" "}
            <a href="#rituel">le rituel du mois</a>.
          </p>
          <DocNote>
            Chez <b>CovarBat</b>, le cabinet ne ventile pas les prévisions par chantier : la
            prévision saisie dans l’application fait foi.
          </DocNote>
        </DocBlock>

        <DocBlock title="Frais généraux" aside="Centres de structure">
          <p>
            Les charges de structure : honoraires, frais généraux (dont la masse salariale
            sédentaire), crédit-bail en bloc à part chez Easy Mat et Easy Home, puis les totaux. En
            tête : total cumulé de l’exercice, frais du mois, ratio frais généraux / CA et comptes non
            rattachés.
          </p>
          <p>
            Deux lectures. <b>Exercices</b> compare le cumul de l’exercice en cours aux exercices
            N-1 et N-2 entiers, chacun rapporté au CA de son propre exercice. <b>Mensuel</b> donne un mois par
            colonne. La recherche accepte un libellé ou un numéro de compte. Un montant négatif est
            un produit venu en déduction (indemnité d’assurance, refacturation, avoir).
          </p>
        </DocBlock>

        <DocBlock title="Objectifs" aside="Dernier mois importé">
          <p>
            Les douze indicateurs suivis par le dirigeant, en % du CA cumulé (achats, locations,
            salaires, sous-traitance, intérim, frais généraux…), chacun repris d’une ligne de la
            Synthèse ou des Frais généraux. La DAF saisit l’objectif annuel de chaque indicateur, en
            points (« 5 » pour 5 %). L’écran donne l’écart et un statut :
          </p>
          <ul>
            <li>
              <span className="tag green">BON</span> au moins 0,2 point sous l’objectif ;
            </li>
            <li>
              <span className="tag brand">BIEN</span> à 0,2 point près ;
            </li>
            <li>
              <span className="tag amber">À SURVEILLER</span> de 0,2 à 2 points au-dessus ;
            </li>
            <li>
              <span className="tag red">MAUVAIS</span> plus de 2 points au-dessus.
            </li>
          </ul>
          <p>
            Sous le tableau, les <b>analyses mensuelles</b> : voir{" "}
            <a href="#analyse">plus bas</a>.
          </p>
        </DocBlock>

        <DocBlock title="Assistant IA" aside="Tous les profils">
          <p>
            Une question en français, une réponse chiffrée : « Quel est le CA du mois ? », « Quels
            chantiers ont un résultat négatif ? », « Combien pèse la masse salariale ? ».
            L’assistant consulte les mêmes calculs que les écrans, en lecture seule : ses chiffres
            sont ceux des tableaux, et s’il lui manque une donnée, il le dit. Sous chaque réponse,
            les sources consultées mènent à l’écran concerné ; on peut copier une réponse, la
            régénérer ou l’arrêter en cours.
          </p>
          <p>
            Les conversations sont rangées à gauche par date, et peuvent être renommées ou
            supprimées. Elles sont <b>personnelles</b> : chacun ne voit que les siennes, entité par
            entité. Les suggestions de départ reprennent vos questions les plus fréquentes.
          </p>
        </DocBlock>

        <DocBlock title="Comptes" aside="Menu utilisateur · tous les profils">
          <p>
            La consultation par compte comptable : rechercher un numéro ou un intitulé, puis ouvrir
            le compte pour voir où il est rangé dans chaque vue, ses montants mois par mois et sa
            ventilation par centre analytique (chantier ou structure).
          </p>
        </DocBlock>

        <DocBlock title="Alertes" aside="Menu utilisateur · traitement par la DAF">
          <p>
            Toutes les alertes ouvertes, regroupées par type, avec un conseil et un bouton d’action ;
            puis l’historique des alertes traitées. Voir <a href="#alertes">Les alertes</a>.
          </p>
        </DocBlock>

        <DocBlock title="Imports" aside="Menu utilisateur · DAF et administrateur">
          <p>
            Le point d’entrée des balances. Un bandeau indique où en est le cycle du mois (à jour,
            analytique attendue, données en retard) ; l’historique liste chaque dépôt avec son
            statut : <span className="tag amber">En attente de validation</span>{" "}
            <span className="tag green">Validé</span> <span className="tag gray">Remplacé</span>.
          </p>
          <p>
            Chaque dépôt ouvre une page de contrôle : lignes lues, mois ou centres couverts,
            contrôles de cohérence, comptes non rattachés, et l’avertissement « Cet import remplacera
            une version validée » le cas échéant. Rien n’entre dans les tableaux avant « Valider
            l’intégration » ; « Rejeter cet import » supprime le dépôt.
          </p>
        </DocBlock>

        <DocBlock title="Mapping" aside="Menu utilisateur · DAF et administrateur">
          <p>
            La table qui range chaque compte dans une ligne de gestion. On y affecte les comptes non
            rattachés (une suggestion est proposée), on en ignore un s’il est volontairement hors
            gestion, on crée une règle sans attendre qu’un compte pose problème, avec un aperçu de ce
            qu’elle changera, et on remplace pour l’entité une règle commune au groupe : la règle de
            l’entité prend le pas, la règle commune reste en place et reprend la main si l’on supprime
            la première. Chaque changement s’applique aussitôt à tous les tableaux, sans réimport.
          </p>
        </DocBlock>
      </DocSection>

      <DocSection
        id="rituel"
        num={4}
        title="Le rituel du mois"
        lead="Les exports du mois M arrivent vers le 24 du mois M+1."
      >
        <DocSteps
          steps={[
            {
              title: "Importer la balance ventilée",
              body: "Imports → choisir le fichier → « Analyser et prévisualiser ». Le type de balance et le mois sont reconnus. Vérifier la page de contrôle, puis « Valider l’intégration ». En cas de doute, « Rejeter cet import » : le dépôt est supprimé, rien n’est intégré.",
            },
            {
              title: "Importer la balance analytique du même mois",
              body: "Même geste. Pour un export Cegid, indiquer le mois de la balance ; un export Pennylane le porte dans son nom et doit couvrir le mois seul, du 1er au dernier jour.",
            },
            {
              title: "Traiter les alertes",
              body: "Page Alertes ou Mapping : donner sa ligne à chaque nouveau compte. Le choix vaut pour tous les mois suivants.",
            },
            {
              title: "Saisir les prévisions de travaux en cours",
              body: "Vue Chantiers : chaque entité renseigne la prévision du mois de ses chantiers, en brouillon. La DAF relit et fige.",
            },
            {
              title: "Faire passer les prévisions en comptabilité",
              body: "La DAF transmet les prévisions au cabinet, puis réimporte les balances corrigées. L’encart « Validation du mois » montre l’écart restant, chantier par chantier.",
            },
            {
              title: "Valider le mois",
              body: "« Valider le mois », en tête de la vue Chantiers. Toutes les saisies du mois se figent. Si un écart subsiste, l’application demande confirmation.",
            },
            {
              title: "Analyser et publier",
              body: "Page Objectifs : lancer l’analyse du mois validé, relire le texte, le compléter si besoin, puis le publier pour les dirigeants.",
            },
          ]}
        />
        <DocNote title="Version corrigée du cabinet ?">
          Réimportez simplement les fichiers : la nouvelle version remplace l’ancienne. Si elle
          change les chiffres d’un mois validé, la validation devient caduque et le mois redevient
          modifiable : il suffit de le revalider. Après le réimport de la balance analytique d’un mois
          déjà analysé, relancez aussi son analyse.
        </DocNote>
        <p>
          Un mois validé passe en lecture seule. La DAF peut le <b>rouvrir</b> ; les valeurs restent
          alors figées et se rouvrent une par une.
        </p>
      </DocSection>

      <DocSection
        id="analyse"
        num={5}
        title="L’analyse mensuelle"
        lead="Le point du mois pour les dirigeants, préparé par l’application et relu par la DAF."
      >
        <p>
          Sur un mois validé, la DAF lance l’analyse depuis la page Objectifs (« Analyser le mois »,
          20 à 40 secondes). L’application rassemble les chiffres du mois, puis l’IA rédige un texte
          à partir de ces seuls chiffres. L’analyse comprend :
        </p>
        <ul>
          <li>le flash du mois : CA du mois et cumulé, marge d’exploitation, objectifs tenus ;</li>
          <li>
            le texte : <b>En bref</b>, <b>Points forts</b>, <b>Points d’attention</b> et{" "}
            <b>Actions suggérées</b>, plus le commentaire de la DAF ;
          </li>
          <li>
            les <b>alertes du mois</b> : les postes qui s’écartent nettement de la moyenne des trois
            mois précédents ;
          </li>
          <li>les charges directes face au CA, les objectifs de Frédéric et les frais généraux ;</li>
          <li>
            les <b>chantiers à regarder</b> : charges importantes sans facturation ni prévision, ou
            résultat du mois négatif ;
          </li>
          <li>un rappel de la fiabilité des données du mois.</li>
        </ul>
        <p>
          L’analyse naît en <span className="tag amber">Brouillon</span>, visible de la DAF seule.
          Elle peut en modifier le texte, ajouter son commentaire, la relancer, puis la{" "}
          <b>publier</b> : elle devient alors visible de tous. Une analyse publiée peut repasser en
          brouillon.
        </p>
        <p>
          Chaque analyse s’ouvre dans une fenêtre qui se partage par son lien ; les flèches du
          clavier passent d’un mois à l’autre. Elle s’imprime au format portrait.
        </p>
        <DocNote tone="warn" title="Analyse caduque.">
          Si le mois est rouvert ou sa balance analytique réimportée, l’analyse ne correspond plus aux
          chiffres : elle est marquée « Caduque » et ne peut plus être publiée avant d’être relancée.
        </DocNote>
      </DocSection>

      <DocSection
        id="alertes"
        num={6}
        title="Les alertes"
        lead="L’application signale ce qui mérite un regard. Une alerte n’est pas une erreur de l’application : c’est un point à vérifier."
      >
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Alerte</th>
                <th>Ce qu’elle signale</th>
                <th>Que faire</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Compte non mappé</td>
                <td>
                  Un compte importé n’est couvert par aucune règle : son montant n’apparaît dans
                  aucune ligne de gestion.
                </td>
                <td>
                  « Affecter dans Mapping » : l’alerte se clôt d’elle-même. Ou l’ignorer s’il est
                  volontairement hors gestion.
                </td>
              </tr>
              <tr>
                <td>Écart de contrôle</td>
                <td>
                  Le total d’une classe de comptes recalculé ne correspond pas à celui du fichier :
                  l’export est sans doute incomplet.
                </td>
                <td>Redemander l’export au cabinet et le réimporter.</td>
              </tr>
              <tr>
                <td>Mois sans données</td>
                <td>Un mois de l’exercice ne porte aucune écriture.</td>
                <td>Vérifier auprès du cabinet ; marquer comme traité si c’est normal.</td>
              </tr>
              <tr>
                <td>Montant constant</td>
                <td>
                  Un compte affiche exactement le même montant plusieurs mois de suite : forfait,
                  abonnement, ou écriture reprise d’un mois sur l’autre.
                </td>
                <td>
                  Vérifier, puis « Marquer comme normal » : l’alerte ne revient plus tant que le
                  montant reste le même.
                </td>
              </tr>
              <tr>
                <td>Centre créé par import ou sans code</td>
                <td>
                  Des écritures sont rangées sur un centre qui n’est pas un vrai chantier (code
                  inexistant ou absent) : la marge du bon chantier est faussée d’autant.
                </td>
                <td>Transmettre au cabinet le code à corriger.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Une alerte traitée ne revient pas aux imports suivants : la décision est mémorisée, avec
          son auteur et sa date, dans l’historique en bas de la page Alertes. « Réactiver la
          surveillance » l’annule. Seul l’écart de contrôle est signalé à nouveau à chaque import
          concerné.
        </p>
        <p>
          Les comptes absents des balances des exercices clos, importées pour les colonnes N-1 et
          N-2 des frais généraux, sont listés à part, hors compteur : ils n’appellent aucune
          correction.
        </p>
      </DocSection>

      <DocSection id="roles" num={7} title="Rôles et accès">
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th />
                <th className="c">Administrateur</th>
                <th className="c">DAF</th>
                <th className="c">Saisie</th>
                <th className="c">Lecteur</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Consulter les vues, Comptes, Alertes, l’assistant</td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
              </tr>
              <tr>
                <td>Saisir les prévisions et les notes</td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><N /></td>
              </tr>
              <tr>
                <td>Figer, rouvrir, valider le mois</td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><N /></td>
                <td className="c"><N /></td>
              </tr>
              <tr>
                <td>Saisir les objectifs annuels</td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><N /></td>
                <td className="c"><N /></td>
              </tr>
              <tr>
                <td>Lancer, modifier, publier une analyse</td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><N /></td>
                <td className="c"><N /></td>
              </tr>
              <tr>
                <td>Lire les analyses publiées</td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
              </tr>
              <tr>
                <td>Importer, Mapping, traiter les alertes</td>
                <td className="c"><Y /></td>
                <td className="c"><Y /></td>
                <td className="c"><N /></td>
                <td className="c"><N /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Le profil <b>Saisie</b> est celui des entités : il renseigne les prévisions et les notes de
          ses chantiers, en brouillon. Le profil <b>Lecteur</b> (dirigeants, associés) voit les mêmes
          chiffres que la DAF, sans rien modifier. Tout compte peut être rattaché à une entité : il ne
          voit alors qu’elle. Les écrans Imports et Mapping restent fermés aux autres profils, même
          en tapant leur adresse.
        </p>
      </DocSection>

      <DocSection id="faq" num={8} title="Questions fréquentes">
        <DocFaq
          items={[
            {
              q: "Où sont stockées les données ?",
              a: (
                <p>
                  Dans une base de données sécurisée, hébergée en Europe. Chaque import, saisie et
                  règle y est enregistré aussitôt : il n’y a rien à sauvegarder, et tout le monde voit
                  la même chose au même moment.
                </p>
              ),
            },
            {
              q: "J’ai importé le mauvais fichier, que faire ?",
              a: (
                <p>
                  S’il n’est pas encore validé, « Rejeter cet import » sur la page de contrôle : le
                  dépôt est supprimé, rien n’a été intégré. S’il l’est, réimportez le bon fichier pour
                  la même période : il remplace le précédent, qui reste dans l’historique avec le
                  statut « Remplacé ».
                </p>
              ),
            },
            {
              q: "Les chiffres d’un mois passé ont changé. Est-ce normal ?",
              a: (
                <p>
                  Oui. Chaque balance ventilée reprend tout l’exercice : si le cabinet a corrigé une
                  écriture de mars, la colonne de mars change au nouvel import. Les tableaux suivent
                  toujours la comptabilité la plus récente.
                </p>
              ),
            },
            {
              q: "Les chiffres diffèrent de mon ancien tableau Excel. Pourquoi ?",
              a: (
                <p>
                  Les tableaux reprennent la balance importée au centime. Un écart avec un tableau
                  tenu à la main vient en général d’une version antérieure de la balance, d’un
                  retraitement manuel ou d’un compte rangé ailleurs. La page{" "}
                  <Link href="/comptes">Comptes</Link> montre où chaque compte est rangé.
                </p>
              ),
            },
            {
              q: "Peut-on changer la ligne où apparaît un compte ?",
              a: (
                <p>
                  Oui, dans l’écran Mapping : une règle plus précise l’emporte sur les autres, et une
                  règle propre à l’entité l’emporte sur la règle commune au groupe. Le
                  changement vaut aussitôt pour tous les tableaux et tous les mois.
                </p>
              ),
            },
            {
              q: "Pourquoi le résultat de la Synthèse diffère-t-il de celui des Chantiers ?",
              a: (
                <p>
                  La Synthèse reste comptable : elle ne prend les prévisions de travaux en cours
                  qu’une fois passées par le cabinet. Les lignes « Prévisions saisies non
                  comptabilisées » et « Résultat de gestion » montrent l’écart. Quand le cabinet a
                  passé les mêmes prévisions, les deux résultats se rejoignent : c’est le contrôle de
                  la validation du mois.
                </p>
              ),
            },
            {
              q: "Où trouver le détail des règles de calcul ?",
              a: (
                <p>
                  Dans la <Link href="/documentation">documentation détaillée</Link> : sources et
                  imports, calcul de chaque vue, prévisions de travaux en cours, mapping, alertes et
                  particularités de chaque entité.
                </p>
              ),
            },
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
