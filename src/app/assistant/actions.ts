"use server";

import { getSession } from "@/lib/auth";
import { deleteConversation, renameConversation } from "@/lib/assistant-conversations";
import { CONVERSATION_ID } from "@/lib/assistant-shared";

// Chaque action ne touche qu'aux conversations de la personne connectée.

export async function deleteConversationAction(id: string) {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié");
  if (!CONVERSATION_ID.test(id)) return;
  await deleteConversation(id, session.userId);
}

export async function renameConversationAction(id: string, title: string) {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié");
  if (!CONVERSATION_ID.test(id) || !title.trim()) return;
  await renameConversation(id, session.userId, title);
}
