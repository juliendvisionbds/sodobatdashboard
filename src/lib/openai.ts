// Fournisseur OpenAI de l'assistant.
//
// Les appels passent par le proxy key.one (suivi des dépenses par projet,
// budgets appliqués avant chaque appel) dès que KEYONE_API_KEY est définie.
// À défaut, on retombe sur une clé OpenAI directe (OPENAI_API_KEY).
//
// Les points d'appel utilisent `openai.chat(modèle)` (endpoint Chat
// Completions). C'est l'endpoint validé de bout en bout à travers le proxy :
// streaming, appels d'outils et remontée de l'usage. L'endpoint Responses
// (`openai(modèle)`) fonctionne aussi depuis le correctif du proxy du
// 2026-09-27 ; le changer se fait aux deux points d'appel, à revalider ensuite.
import { createOpenAI } from "@ai-sdk/openai";

const KEYONE_API_KEY = process.env.KEYONE_API_KEY;

export const KEYONE_ENABLED = Boolean(KEYONE_API_KEY);

export const openai = createOpenAI({
  apiKey: KEYONE_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: KEYONE_ENABLED
    ? (process.env.KEYONE_OPENAI_BASE_URL ?? "https://getkeyone.com/api/proxy/openai/v1")
    : undefined,
});
