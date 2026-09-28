// Conversations de l'assistant IA : chacune appartient à un utilisateur, qui
// seul peut la lire, la renommer ou la supprimer. Toutes les fonctions
// prennent l'identifiant de l'utilisateur et filtrent dessus.

import { and, asc, desc, eq, gt } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db, tables } from "@/db";

import { CONVERSATION_ID, titleFrom, type ConversationSummary } from "./assistant-shared";

export { CONVERSATION_ID, titleFrom, type ConversationSummary };

export async function listConversations(
  userId: number,
  entityId: number
): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: tables.assistantConversations.id,
      title: tables.assistantConversations.title,
      updatedAt: tables.assistantConversations.updatedAt,
    })
    .from(tables.assistantConversations)
    .where(
      and(
        eq(tables.assistantConversations.userId, userId),
        eq(tables.assistantConversations.entityId, entityId)
      )
    )
    .orderBy(desc(tables.assistantConversations.updatedAt))
    .limit(200);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

async function ownerOf(id: string): Promise<number | null> {
  const [row] = await db
    .select({ userId: tables.assistantConversations.userId })
    .from(tables.assistantConversations)
    .where(eq(tables.assistantConversations.id, id));
  return row?.userId ?? null;
}

/** Messages d'une conversation de l'utilisateur, dans l'ordre ; null si elle n'est pas à lui. */
export async function loadConversation(
  id: string,
  userId: number
): Promise<{ title: string; messages: UIMessage[] } | null> {
  if (!CONVERSATION_ID.test(id)) return null;
  const [conv] = await db
    .select()
    .from(tables.assistantConversations)
    .where(
      and(eq(tables.assistantConversations.id, id), eq(tables.assistantConversations.userId, userId))
    );
  if (!conv) return null;
  const rows = await db
    .select()
    .from(tables.assistantMessages)
    .where(eq(tables.assistantMessages.conversationId, id))
    .orderBy(asc(tables.assistantMessages.seq));
  return {
    title: conv.title,
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role,
      parts: r.parts as UIMessage["parts"],
    })),
  };
}

/**
 * Crée la conversation à la première question, ou vérifie qu'elle appartient
 * bien à l'utilisateur. Renvoie false si elle est à quelqu'un d'autre.
 */
export async function ensureConversation(opts: {
  id: string;
  userId: number;
  entityId: number;
  firstQuestion: string;
}): Promise<boolean> {
  const owner = await ownerOf(opts.id);
  if (owner != null) return owner === opts.userId;
  await db
    .insert(tables.assistantConversations)
    .values({
      id: opts.id,
      userId: opts.userId,
      entityId: opts.entityId,
      title: titleFrom(opts.firstQuestion),
    })
    .onConflictDoNothing();
  return (await ownerOf(opts.id)) === opts.userId;
}

/** Enregistre un message, ou remplace ses parties s'il existe déjà. */
export async function saveMessage(conversationId: string, message: UIMessage) {
  const role = message.role === "user" ? "user" : "assistant";
  await db
    .insert(tables.assistantMessages)
    .values({ id: message.id, conversationId, role, parts: message.parts })
    .onConflictDoUpdate({
      target: tables.assistantMessages.id,
      set: { parts: message.parts },
    });
  await db
    .update(tables.assistantConversations)
    .set({ updatedAt: new Date() })
    .where(eq(tables.assistantConversations.id, conversationId));
}

/**
 * Retire les messages postérieurs à `messageId` : une réponse régénérée
 * remplace la précédente au lieu de s'y ajouter.
 */
export async function truncateAfter(conversationId: string, messageId: string) {
  const [anchor] = await db
    .select({ seq: tables.assistantMessages.seq })
    .from(tables.assistantMessages)
    .where(
      and(
        eq(tables.assistantMessages.conversationId, conversationId),
        eq(tables.assistantMessages.id, messageId)
      )
    );
  if (!anchor) return;
  await db
    .delete(tables.assistantMessages)
    .where(
      and(
        eq(tables.assistantMessages.conversationId, conversationId),
        gt(tables.assistantMessages.seq, anchor.seq)
      )
    );
}

export async function renameConversation(id: string, userId: number, title: string) {
  const t = titleFrom(title);
  await db
    .update(tables.assistantConversations)
    .set({ title: t })
    .where(
      and(eq(tables.assistantConversations.id, id), eq(tables.assistantConversations.userId, userId))
    );
}

/**
 * Supprime la conversation et ses messages. Le journal d'usage garde la ligne
 * de coût (tokens, durée, date) mais perd le texte de la question.
 */
export async function deleteConversation(id: string, userId: number) {
  if ((await ownerOf(id)) !== userId) return;
  await db.transaction(async (tx) => {
    await tx
      .update(tables.assistantLogs)
      .set({ question: "" })
      .where(eq(tables.assistantLogs.conversationId, id));
    await tx
      .delete(tables.assistantConversations)
      .where(
        and(
          eq(tables.assistantConversations.id, id),
          eq(tables.assistantConversations.userId, userId)
        )
      );
  });
}
