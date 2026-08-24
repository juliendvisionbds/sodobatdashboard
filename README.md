# Dashboard financier — Groupe SDG (Sodobat, Phase 1)

Tableaux de gestion intelligents alimentés par les exports Cegid (balance ventilée + balance analytique).

## Fonctionnement

- **Import mensuel** : upload des deux fichiers xlsx (balance ventilée, balance analytique) avec prévisualisation et contrôles avant intégration. Ré-importer une période remplace la version précédente (gère les 2 mises à jour mensuelles : M+24 puis correction comptable).
- **Mapping** : chaque compte comptable est affecté à une catégorie de la nomenclature uniformisée (issue du squelette validé avec la DAF). Tout compte inconnu remonte en alerte — jamais de classement par défaut.
- **3 vues** : Synthèse (mensuel, exercice nov→oct), Activité chantier (delta des snapshots analytiques M vs M-1), Frais généraux (centre analytique FX).
- **Fiabilité** : les chiffres affichés sont recalculés à la volée depuis les lignes de balance brutes importées ; aucun agrégat n'est stocké.

## Développement

```bash
npm install
npm run db:push   # crée le schéma (PGlite embarqué dans .data/pglite si DATABASE_URL absent)
npm run db:seed   # nomenclature, règles de mapping, utilisateurs
npm run dev
```

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
