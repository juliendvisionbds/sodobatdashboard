// Règles de l'assistant partagées entre le serveur et le navigateur (sans
// accès à la base).

/** Identifiant de conversation généré par le chat : jeton opaque, sans surprise. */
export const CONVERSATION_ID = /^[A-Za-z0-9_-]{8,64}$/;

export type ConversationSummary = { id: string; title: string; updatedAt: string };

const TITLE_MAX = 80;

/** Titre par défaut : la première question, sur une ligne, raccourcie. */
export function titleFrom(question: string): string {
  const t = question.replace(/\s+/g, " ").trim();
  if (!t) return "Nouvelle conversation";
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1).trimEnd()}…` : t;
}
