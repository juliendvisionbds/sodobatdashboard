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

Connexion par défaut (seed) : `admin@visionbds.com` / `sodobat2026!` (à changer). Trois comptes : `admin@`, `daf@`, `lecteur@visionbds.com` — un par rôle.

## Production (serveurs Vision BDS puis Groupe SDG)

```bash
cp .env.example .env   # définir AUTH_SECRET et POSTGRES_PASSWORD
docker compose up -d --build
```

Le conteneur pousse le schéma et seed automatiquement au démarrage (idempotent).

## Sources de données

| Fichier | Contenu | Usage |
| --- | --- | --- |
| `*_BALANCE VENTILEE.xlsx` | Balance générale, une colonne par mois de l'exercice | Vues Synthèse et ratios / CA |
| `*_BALANCE ANALYTIQUE.xlsx` | Cumul par centre (chantier / FX) × compte à date d'édition | Vue Chantiers (delta M − M-1) et vue Frais généraux |
