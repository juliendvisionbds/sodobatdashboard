// Fournisseur OpenAI de l'assistant.
//
// Les appels passent par le proxy key.one (suivi des dépenses par projet,
// budgets appliqués avant chaque appel) dès que KEYONE_API_KEY est définie.
// À défaut, on retombe sur une clé OpenAI directe (OPENAI_API_KEY).
//
// Toujours utiliser `openai.chat(modèle)` (endpoint Chat Completions) et non
// `openai(modèle)` (endpoint Responses) : le proxy key.one ajoute
// `stream_options.include_usage` pour mesurer les appels en streaming, que
// OpenAI n'accepte que sur Chat Completions. Sur Responses, tout appel en
// streaming échoue en 400.
import { createOpenAI } from "@ai-sdk/openai";

const KEYONE_API_KEY = process.env.KEYONE_API_KEY;

export const KEYONE_ENABLED = Boolean(KEYONE_API_KEY);

export const openai = createOpenAI({
  apiKey: KEYONE_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: KEYONE_ENABLED
    ? (process.env.KEYONE_OPENAI_BASE_URL ?? "https://getkeyone.com/api/proxy/openai/v1")
    : undefined,
});
