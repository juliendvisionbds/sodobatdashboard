---
name: keyone
description: key.one — spend management for AI agents. One project key (kone_live_…) routes every OpenAI/Anthropic call through the key.one proxy with budgets enforced before each call. Use when setting up, testing or debugging the project's AI spend via key.one.
---

# key.one (v0.9.2)

Source : https://getkeyone.com/skill.md — installé le 2026-09-26.

## Principe

key.one remplace les clés par fournisseur par une clé projet unique
(`kone_live_…`). Les appels passent par le proxy key.one, qui suit la dépense
par projet et applique les budgets avant chaque appel.

Types de clés :
- **Clé projet** (`kone_live_`) : appelle n'importe quel outil via le proxy, vérifie son propre budget.
- **Clé agence** (`kone_admin_`) : gère clients, projets, clés et visibilité des dépenses. Ne jamais en créer.

## Configuration

Variables d'environnement (trois, à poser aussi à la main sur les hôtes de production) :

```
KEYONE_API_KEY=<clé projet>
KEYONE_OPENAI_BASE_URL=https://getkeyone.com/api/proxy/openai/v1
KEYONE_ANTHROPIC_BASE_URL=https://getkeyone.com/api/proxy/anthropic
```

Dans ce dépôt, le fournisseur est `src/lib/openai.ts` : il lit ces variables
et retombe sur `OPENAI_API_KEY` si `KEYONE_API_KEY` est absente. Toute nouvelle
utilisation d'un modèle doit importer `openai` depuis `@/lib/openai`, jamais
depuis `@ai-sdk/openai` directement.

## Endpoints

Statut du projet :
```bash
curl https://getkeyone.com/api/proxy/status -H "Authorization: Bearer $KEYONE_API_KEY"
```

Demande de budget :
```bash
curl -X POST https://getkeyone.com/api/proxy/requests \
  -H "Authorization: Bearer $KEYONE_API_KEY" -H "Content-Type: application/json" \
  -d '{"requested_budget_usd": 75, "reason": "..."}'
```

## En-têtes de réponse

- `X-Cost-USD` : coût de l'appel
- `X-Model-Resolved` : modèle choisi pour les alias `cheapest` / `balanced` / `best`
- `X-Project-Budget-Remaining` : budget projet restant
- `X-Client-Budget-Remaining` : budget client restant

## Réponses BLOCKED

Un 403 avec `"status": "BLOCKED"` est un refus de contrôle de dépense, définitif.
Motifs : `project_monthly_budget`, `client_monthly_budget`, `project_call_cap`,
`project_allowed_apis`, `project_allowed_models`, `key_frozen`.

## Règles pour l'agent

1. N'afficher une clé projet qu'une seule fois.
2. Ne jamais dépenser sur un projet qui n'appartient pas à l'utilisateur.
3. Vérifier `/api/proxy/status` avant un gros lot d'appels.
4. Traiter une réponse BLOCKED comme définitive.
5. Préférer le modèle le moins cher qui convient.
6. Ne jamais créer de clé agence.
7. N'approuver / refuser / dégeler que sur demande explicite.
