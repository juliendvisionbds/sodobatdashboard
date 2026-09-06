# Dashboard financier — Groupe SDG (Sodobat, Phase 1)

Tableaux de gestion intelligents alimentés par les exports Cegid (balance ventilée + balance analytique).

## Fonctionnement

- **Import mensuel** : upload des deux fichiers xlsx (balance ventilée, balance analytique) avec prévisualisation et contrôles avant intégration. Ré-importer une période remplace la version précédente (gère les 2 mises à jour mensuelles : M+24 puis correction comptable).
- **Mapping** : chaque compte comptable est affecté, par son numéro exact, à un poste de la maquette structurelle validée avec la DAF. Tout compte inconnu remonte en alerte — jamais de classement par défaut.
- **Règle analytique** : un même compte peut exister dans la vue Chantiers et dans la vue Frais généraux (entretien, carburant, locations, fournitures). C'est le centre de la balance analytique qui tranche : un code commençant par un chiffre est un chantier, tout le reste (FX, dépôt, siège) est de la structure.
- **5 vues** : Synthèse (mensuel, exercice nov→oct, 18 colonnes), Activité chantier (delta des snapshots analytiques M vs M-1, cumuls sur la durée de vie du chantier), Frais généraux (N-2 / N-1 / N YTD, chaque ratio rapporté au CA de son propre exercice), Objectifs Dirigeant (réalisé vs objectif en % du CA), Consultation par compte (drill-down mensuel et ventilation par chantier).
- **Fiabilité** : les chiffres affichés sont recalculés à la volée depuis les lignes de balance brutes importées ; aucun agrégat n'est stocké.

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

### Recette

```bash
npm run recette          # import de mai + contrôles de fiabilité fichier vs recalcul
npm run recette:tg       # rapprochement avec le tableau de gestion Excel de mai 2026
npm run recette:mapping  # cycle de vie des règles de mapping
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
5432), `AUTH_SECRET` et `OPENAI_API_KEY`.

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
| `*_BALANCE ANALYTIQUE.xlsx` | Cumul par centre (chantier / FX) × compte à date d'édition | Vue Chantiers (delta M − M-1) et vue Frais généraux |
