# Dashboard financier — Groupe SDG

Tableaux de gestion intelligents alimentés par les exports comptables (balance ventilée + balance analytique), Cegid ou Pennylane. Entités ouvertes : Sodobat, CovarBat, VBTP, Easy Mat, Easy Home.

## Fonctionnement

- **Import mensuel** : upload des deux fichiers xlsx (balance ventilée, balance analytique) avec prévisualisation et contrôles avant intégration. Ré-importer une période remplace la version précédente (gère les 2 mises à jour mensuelles : M+24 puis correction comptable).
- **Mapping** : chaque compte comptable est affecté, par son numéro exact, à un poste de la maquette structurelle validée avec la DAF. Tout compte inconnu remonte en alerte — jamais de classement par défaut.
- **Règle analytique** : un même compte peut exister dans la vue Chantiers et dans la vue Frais généraux (entretien, carburant, locations, fournitures). C'est le centre de la balance analytique qui tranche : un code commençant par un chiffre est un chantier, tout le reste (FX, dépôt, siège) est de la structure.
- **5 vues** : Synthèse (mensuel, exercice nov→oct, 18 colonnes), Activité chantier (mouvements de la balance analytique du mois, cumuls sur tous les mois importés), Frais généraux (N-2 / N-1 / N YTD, chaque ratio rapporté au CA de son propre exercice), Objectifs Dirigeant (réalisé vs objectif en % du CA), Consultation par compte (drill-down mensuel et ventilation par chantier).
- **Analyse mensuelle** (page Objectifs) : sur un mois validé, la DAF lance une analyse de performance. Elle comprend le flash du mois, les objectifs (cumul et mois seul), les fortes variations de charges par rapport à la moyenne des trois mois précédents, les charges directes face au CA, les chantiers à regarder, les frais généraux et la fiabilité des données. Les chiffres sont figés dans `monthly_analyses` ; le texte est rédigé par l'IA (`ANALYSE_MODEL`, `gpt-5-mini` par défaut, via key.one), puis relu et publié par la DAF. Les seuils sont dans `src/lib/analyse-mensuelle.ts` (`SEUILS`). L'analyse devient caduque si le mois est rouvert ou sa balance analytique réimportée.
- **Fiabilité** : les chiffres affichés sont recalculés à la volée depuis les lignes de balance brutes importées ; aucun agrégat n'est stocké.
- **Réactivité** : le résultat de chaque vue est conservé d'une requête à l'autre (`src/lib/views.ts`), sous une clé qui comprend une empreinte des tables sources (imports, saisies, règles, nomenclature, centres). Toute modification, y compris par un script hors application, entraîne un recalcul à la lecture suivante ; rien n'est jamais servi périmé.

## Développement

```bash
npm install
npm run db:push          # crée le schéma (PGlite embarqué dans .data/pglite si DATABASE_URL absent)
npm run db:seed          # entités et utilisateurs
npm run db:nomenclature  # nomenclature Sodobat et règles de mapping
npm run dev
```

### Nomenclature

La nomenclature des trois vues est déclarée dans `src/lib/nomenclature/sodobat.ts`,
d'après la maquette structurelle validée et le plan comptable Sodobat 2026 : chaque
poste porte ses numéros de comptes **exacts** à 8 chiffres, et les totaux, ratios et
résultats sont des formules qui référencent d'autres lignes.

```bash
npm run db:nomenclature -- --dry-run   # rapport de couverture, aucune écriture
npm run db:nomenclature                # remplace la nomenclature
```

Le remplacement ne touche ni les imports, ni les balances, ni les saisies manuelles :
les vues étant recalculées à la volée, aucun réimport n'est nécessaire. Le rapport
liste les comptes présents dans les imports validés qu'aucun poste ne couvrirait —
à passer en `--dry-run` sur la base de production avant d'appliquer.

### Entités

L'application affiche une entité à la fois, choisie dans le menu de l'en-tête
(cookie de préférence ; le serveur ne sert qu'une entité ouverte et à laquelle
le compte a droit). La maquette des trois vues est commune au groupe : c'est
celle de Sodobat, comme l'a demandé la DAF.

Ce qu'une entité a en propre est déclaré dans `src/lib/nomenclature/entites.ts` :

- **comptes** que Sodobat n'a pas, et exceptions (même numéro, autre nature).
  Pour un compte donné, la règle de l'entité l'emporte sur celle de Sodobat
  (y compris celles créées depuis l'écran Mapping), qui l'emporte sur la règle
  commune : « c'est le code de Sodobat qui prévaut » ;
- **libellés** qui diffèrent ;
- **prévisions de travaux** : `compte` (Sodobat sur le 71331000, VBTP sur le
  71345000, Easy Mat sur le 71331000 après le 71340000 (`autresComptes`),
  Easy Home sur le 71350000 : la
  balance analytique porte la prévision par chantier, la prévision du mois est
  la provision en cours à la fin du mois, l'annulation celle du mois précédent
  de signe opposé, convention de la DAF) ou `saisie`
  (CovarBat, le cabinet ne la ventile pas : la prévision saisie dans
  l'application fait foi, l'annulation d'un mois est la prévision du mois
  précédent, et le reste du compte 70400000 est du chiffre d'affaires) ;
- **exercice** : mois d'ouverture (`exercice.debut`). Novembre chez Sodobat,
  CovarBat, Easy Mat et Easy Home (exercice 2025 = novembre 2025 → octobre 2026), janvier
  chez VBTP (année civile). Un exercice est repéré par l'année de son ouverture ;
- **centres** dont la nature ne se lit pas dans le code, et centres lus comme
  un autre (`aliasOf`) : un chantier que Pennylane exporte sans code est
  rattaché au numéro que lui donne le tableau de gestion (VBTP), ses écritures
  suivent ce numéro dans les vues ;
- **centres de structure** (`centresStructure`) : par défaut un code qui
  commence par un chiffre est un chantier, le reste de la structure. Easy Mat
  et Easy Home numérotent leurs affaires par des lettres (MFR191, AO250428,
  PR364, STRA125…) : leur structure est énumérée (FX, QUADRA, dépôts, SDG,
  DIVERS, véhicules, centres sans code), tout autre centre est une affaire.

Une ligne de la maquette qui ne concerne que certaines entités porte leur code
dans `entityScope`. La colonne « Entités concernées » de la maquette est
indicative : une ligne reste ouverte à tout le groupe tant qu'une entité peut y
passer des écritures, et les tableaux masquent d'eux-mêmes les lignes sans
montant. Les périmètres restreints sont de deux natures :

- des lignes **structurelles** (marchandises en revente, sous-traitance en
  paiement direct, rémunération du gérant, résultat SEP) ;
- une **couche de détail par entité**, sous les sous-totaux communs, reprise du
  tableau de gestion de l'entité : produits d'Easy Mat et d'Easy Home dans la
  Synthèse et les Chantiers (locations, prestations d'aménagement, modules en
  location, prestations administratives, assurances refacturées) ; ventes par
  taux de TVA dans les Chantiers de VBTP (prestations 20 %, 0 % LQ, 10 %,
  travaux sur sinistres) et de CovarBat (travaux LQ, 10 %, 20 %, 5,5 %), la
  ligne commune « Produits travaux » ne restant qu'à Sodobat ; indemnités sur
  charges de personnel, franchise sinistre et honoraires avocats dans les
  Chantiers de VBTP ; bloc « Total 3 — Crédit-bail » des frais généraux
  d'Easy Mat et d'Easy Home, véhicules et matériel séparés, avec son ratio,
  là où les autres entités gardent le crédit-bail dans le Total 2. Les totaux
  ne changent pas, seul le détail s'ouvre.

```bash
npm run entite:installer -- covarbat            # rapport seul
npm run entite:installer -- covarbat --apply    # aligne la maquette, installe les règles, ouvre l'entité
npm run import:file -- "<balance>" --entite covarbat
npm run init:provisions -- "<tableau de gestion.xlsx>" --entite covarbat [--apply]
npm run rapprochement:synthese -- "<tableau de gestion.xlsx>" --entite covarbat
npm run init:reports -- "<tableau de gestion.xlsx>" --entite covarbat [--apply]
npm run entite:installer -- vbtp --apply
npm run import:file -- "<balance Pennylane>" --entite vbtp
npm run import:file -- "<VBTP_2025 BALANCE ANALYTIQUE.xlsx>" --entite vbtp --annuel --period 2025-12
npm run rapprochement:synthese -- "<2026 06_TG VBTP.xlsx>" --entite vbtp
npm run init:reports -- "<2026 06_TG VBTP.xlsx>" --entite vbtp [--apply]
npm run entite:installer -- easymat --apply
npm run import:file -- "<balance Pennylane>" --entite easymat
npm run import:file -- "<2024 2025_BALANCE ANALYTIQUE EASYMAT.xlsx>" --entite easymat --annuel --period 2025-10
npm run rapprochement:synthese -- "<2026 06_TG EASYMAT.XLSX>" --entite easymat
npm run entite:installer -- easyhome --apply
npm run import:file -- "<balance Pennylane>" --entite easyhome
npm run import:file -- "<2024 2025_BALANCE ARCHIVE EASYHOME.xlsx>" --entite easyhome --annuel --period 2025-10
npm run rapprochement:synthese -- "<2026 06_TG EASYHOME.xlsx>" --entite easyhome
```

`entite:installer` remplace `db:nomenclature` sur une base en service : il ne
supprime rien et ne modifie aucune règle créée par un utilisateur.

Pour répéter une opération avant de la lancer en production, copier une
sauvegarde dans une base locale jetable :

```bash
PGLITE_DIR=/tmp/clone npx drizzle-kit push --force
PGLITE_DIR=/tmp/clone npm run clone:local -- ../backups/sodobat-AAAA-MM-JJ-….json
```

Pour voir ce clone dans l'application à côté du serveur de développement, le
placer dans `.data/clone` (ignoré par git), compiler avec
`DATABASE_URL= PGLITE_DIR=.data/clone npm run build`, puis lancer la
configuration d'aperçu `dashboard-clone` (`.claude/launch.json`), qui sert la
version compilée sur le port 3100 contre ce clone. La sauvegarde ne contient pas
les comptes utilisateurs : en créer un avec `DATABASE_URL= PGLITE_DIR=.data/clone npm run db:user -- …`.

### Recette

```bash
npm run recette          # import de mai + contrôles de fiabilité fichier vs recalcul
npm run recette:tg       # rapprochement avec le tableau de gestion Excel de mai 2026
npm run recette:mapping  # cycle de vie des règles de mapping
```

Rapprochement avec le tableau de gestion de la DAF, en lecture seule — onglets
« TG MM AAAA » contre la vue Chantiers, chantier par chantier, et résultat BG
contre la Synthèse :

```bash
npm run rapprochement:tg -- "<TABLEAU GESTION.xlsx>" [--detail]
```

Deux invariants font échouer la recette : un compte non mappé, et un écart de contrôle
(`Ctrl`) qui ne serait pas intégralement expliqué par les retraitements DAP et VNC.

Le seed crée trois comptes, un par rôle (admin, DAF, lecteur), listés dans
`src/db/seed-data.ts`. Aucun mot de passe n'est écrit en dur : `npm run db:seed`
en tire un au hasard et l'affiche **une seule fois**. Pour le fixer (installation
reproductible), définir `SEED_PASSWORD` avant de lancer le seed.

Rotation d'un mot de passe, y compris en production :

```bash
npm run db:password -- --email admin@visionbds.com     # nouveau mdp aléatoire, affiché
npm run db:password -- --all                           # un mdp distinct par compte
```

Ce script est le seul à ne pas refuser de tourner sur la base de production :
c'est son objet. Il ne touche que la colonne `password_hash`.

## Production — Vercel + Supabase

L'application est déployée sur Vercel, la base est un Postgres Supabase. Vercel
attend les variables `DATABASE_URL` (chaîne du **session pooler** Supabase, port
5432), `AUTH_SECRET` et les trois variables key.one : `KEYONE_API_KEY`,
`KEYONE_OPENAI_BASE_URL` et `KEYONE_ANTHROPIC_BASE_URL` (voir `.env.example`).
Elles sont à saisir à la main dans Vercel : l'assistant passe par le proxy
key.one, qui suit les dépenses IA du projet ; sans `KEYONE_API_KEY`, il retombe
sur `OPENAI_API_KEY`.

⚠️ **Sur Vercel, rien ne migre la base automatiquement.** Le build ne lance ni
`drizzle-kit push` ni le seed : après tout changement de schéma ou de
nomenclature, il faut les appliquer soi-même, depuis un poste, avant ou juste
après le déploiement.

```bash
printf 'DATABASE_URL=<chaîne session pooler>\n' > .env.prod.local   # ignoré par git
DOTENV_CONFIG_PATH=.env.prod.local npm run db:nomenclature -- --dry-run  # lecture seule
DOTENV_CONFIG_PATH=.env.prod.local npx drizzle-kit push --force          # si le schéma a bougé
DOTENV_CONFIG_PATH=.env.prod.local npm run db:nomenclature               # si la nomenclature a bougé
rm .env.prod.local
```

Le `--dry-run` est à passer systématiquement en premier : il liste les comptes
présents dans les imports de production qu'aucun poste ne couvrirait. Il ne faut
appliquer que si cette liste est vide.

Les scripts `recette` et `import-juin` **refusent** de tourner dès que
`DATABASE_URL` est défini : ils écrivent des données de test et détruiraient les
imports réels. C'est volontaire (`scripts/guard-local.ts`).

### Déploiement Docker (alternative, non utilisée)

```bash
cp .env.example .env   # définir AUTH_SECRET et POSTGRES_PASSWORD
docker compose up -d --build
```

Dans ce mode seulement, le conteneur pousse le schéma et installe la nomenclature
au démarrage — cette dernière n'étant réécrite que si elle a changé dans le code,
pour ne pas effacer les règles créées depuis l'écran Mapping.

## Sources de données

| Fichier | Contenu | Usage |
| --- | --- | --- |
| `*_BALANCE VENTILEE.xlsx` | Balance générale, une colonne par mois de l'exercice | Vues Synthèse et ratios / CA |
| `*_BALANCE ANALYTIQUE.xlsx` | Mouvements **du mois** par centre (chantier / FX) × compte — ses totaux de classe 6 et 7 recoupent la colonne du même mois de la ventilée | Vue Chantiers (le mois se lit dans son fichier) et vue Frais généraux (cumul = somme des mois) |

Exports Pennylane : la balance ventilée a un mois par colonne, écrit en toutes
lettres, et pas de ligne de total (le contrôle porte sur la colonne Solde). Les
comptes sont sur 11 ou 12 chiffres selon le dossier, ramenés à 8. La balance analytique est répétée par
famille d'axes (« Centre », « Nature ») : seule celle des chantiers est lue. Elle
est cumulée sur la période exportée, lue dans le nom du fichier : il faut un
export par mois (du 1er au dernier jour). Un export qui part de l'ouverture de
l'exercice entre comme balance cumulée : exercice entier (colonnes N-1 / N-2 des
frais généraux) ou exercice en cours arrêté à un mois (cumul N des frais
généraux, sans détail mensuel, tant qu'aucune balance mensuelle n'existe). Tout
autre export de plusieurs mois est refusé. Un centre exporté sans code est rangé sous
« # » suivi de son libellé, et signalé par une alerte.
