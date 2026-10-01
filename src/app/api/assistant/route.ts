import { openai } from "@/lib/openai";
import {
  APICallError,
  RetryError,
  convertToModelMessages,
  createIdGenerator,
  stepCountIs,
  streamText,
  validateUIMessages,
  type UIMessage,
} from "ai";
import { db, tables } from "@/db";
import { getSession } from "@/lib/auth";
import { buildAssistantTools } from "@/lib/assistant-tools";
import {
  ASSISTANT_MODEL,
  ASSISTANT_PROVIDER_OPTIONS,
  assistantSystemPrompt,
} from "@/lib/assistant";
import * as views from "@/lib/views";
import {
  CONVERSATION_ID,
  ensureConversation,
  loadConversation,
  saveMessage,
  truncateAfter,
} from "@/lib/assistant-conversations";
import { getCurrentEntity } from "@/lib/entity";

export const maxDuration = 60;

// Message d'erreur affiché tel quel dans le chat : dire ce qui s'est passé et
// quoi faire, plutôt qu'un « une erreur est survenue » indifférencié.
function explainError(err: unknown): string {
  // Le SDK retente les appels en échec ; l'erreur utile est la dernière.
  const e = RetryError.isInstance(err) ? err.lastError : err;
  if (APICallError.isInstance(e)) {
    const s = e.statusCode ?? 0;
    if (s === 401 || s === 403)
      return "Le service IA a refusé la connexion (clé d'accès). Contactez Vision BDS.";
    if (s === 402 || s === 429)
      return "La limite d'utilisation du service IA est atteinte pour le moment. Réessayez dans quelques minutes ; si cela persiste, contactez Vision BDS.";
    if (s >= 500)
      return "Le service IA est momentanément indisponible. Réessayez dans un instant.";
  }
  return "La réponse n'a pas pu aboutir. Réessayez ; si le problème persiste, contactez Vision BDS.";
}

// Le navigateur n'envoie que la question posée ; l'historique est relu en base.
type Body = { id?: unknown; message?: { id?: unknown; role?: unknown; parts?: unknown } };

const MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Non authentifié" }, { status: 401 });
  }
  const entity = await getCurrentEntity();
  if (!entity) {
    return Response.json({ error: "Entité introuvable" }, { status: 500 });
  }

  const body = (await req.json()) as Body;
  const conversationId = typeof body.id === "string" ? body.id : "";
  const incoming = body.message;
  if (
    !CONVERSATION_ID.test(conversationId) ||
    incoming?.role !== "user" ||
    typeof incoming.id !== "string" ||
    !MESSAGE_ID.test(incoming.id) ||
    !Array.isArray(incoming.parts)
  ) {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  // Seul le texte de la question est repris du navigateur.
  const question = incoming.parts
    .filter((p): p is { type: "text"; text: string } => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join(" ")
    .trim();
  if (!question) {
    return Response.json({ error: "Question vide" }, { status: 400 });
  }
  const userMessage: UIMessage = {
    id: incoming.id,
    role: "user",
    parts: [{ type: "text", text: question.slice(0, 4000) }],
  };

  const owned = await ensureConversation({
    id: conversationId,
    userId: session.userId,
    entityId: entity.id,
    firstQuestion: question,
  });
  if (!owned) {
    return Response.json({ error: "Conversation introuvable" }, { status: 404 });
  }

  // Historique en base. Si la question y est déjà (régénération, nouvel essai
  // après une erreur), on repart d'elle et on retire ce qui la suivait.
  const stored = (await loadConversation(conversationId, session.userId))?.messages ?? [];
  const at = stored.findIndex((m) => m.id === userMessage.id);
  if (at >= 0) await truncateAfter(conversationId, userMessage.id);
  else await saveMessage(conversationId, userMessage);
  const history = [...(at >= 0 ? stored.slice(0, at) : stored), userMessage];

  const tools = buildAssistantTools(entity, views);
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({
      messages: history,
      // Les types génériques des outils ne s'accordent pas avec la signature
      // de validation ; la validation, elle, lit bien leurs schémas.
      tools: tools as unknown as Parameters<typeof validateUIMessages>[0]["tools"],
    });
  } catch (e) {
    console.error("assistant history invalid", e);
    return Response.json(
      { error: "Cette conversation ne peut plus être poursuivie. Démarrez-en une nouvelle." },
      { status: 409 }
    );
  }

  const started = Date.now();
  const result = streamText({
    model: openai.chat(ASSISTANT_MODEL),
    system: assistantSystemPrompt(entity.name),
    providerOptions: ASSISTANT_PROVIDER_OPTIONS,
    // Une réponse arrêtée par l'utilisateur pendant la lecture d'un outil laisse
    // un appel sans résultat : on l'ignore pour que la question suivante passe.
    messages: await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(6),
    onError: ({ error }) => {
      console.error("assistant stream failed", error);
    },
    onFinish: async ({ totalUsage }) => {
      try {
        await db.insert(tables.assistantLogs).values({
          entityId: entity.id,
          userEmail: session.email,
          conversationId,
          question: question.slice(0, 2000),
          model: ASSISTANT_MODEL,
          inputTokens: totalUsage.inputTokens ?? null,
          outputTokens: totalUsage.outputTokens ?? null,
          durationMs: Date.now() - started,
        });
      } catch (e) {
        console.error("assistant log failed", e);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
    onError: explainError,
    // Réponse enregistrée même partielle (arrêtée par l'utilisateur).
    onEnd: async ({ responseMessage }) => {
      if (responseMessage.role !== "assistant" || responseMessage.parts.length === 0) return;
      try {
        await saveMessage(conversationId, responseMessage);
      } catch (e) {
        console.error("assistant save failed", e);
      }
    },
  });
}
