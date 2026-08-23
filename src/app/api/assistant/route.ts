import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { db, tables } from "@/db";
import { getSession } from "@/lib/auth";
import { getEntityByCode } from "@/lib/finance";
import { buildAssistantTools } from "@/lib/assistant-tools";
import { ASSISTANT_MODEL, ASSISTANT_SYSTEM_PROMPT } from "@/lib/assistant";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Non authentifié" }, { status: 401 });
  }
  const entity = await getEntityByCode("sodobat");
  if (!entity) {
    return Response.json({ error: "Entité introuvable" }, { status: 500 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();
  const started = Date.now();

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const question =
    lastUser?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ") ?? "";

  const result = streamText({
    model: openai(ASSISTANT_MODEL),
    system: ASSISTANT_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: buildAssistantTools(entity),
    stopWhen: stepCountIs(6),
    onFinish: async ({ totalUsage }) => {
      try {
        await db.insert(tables.assistantLogs).values({
          entityId: entity.id,
          userEmail: session.email,
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

  return result.toUIMessageStreamResponse();
}
