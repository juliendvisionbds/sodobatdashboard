import { notFound } from "next/navigation";
import { generateId, type UIMessage } from "ai";
import AppHeader from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { latestValidatedImport } from "@/lib/finance";
import { getFrequentQuestions } from "@/lib/assistant-questions";
import { listConversations, loadConversation } from "@/lib/assistant-conversations";
import { monthLabelLong } from "@/lib/format";
import AssistantShell from "../AssistantShell";
import { getCurrentEntity } from "@/lib/entity";

export const dynamic = "force-dynamic";

// /assistant : nouvelle conversation ; /assistant/<id> : conversation enregistrée.
export default async function AssistantPage({
  params,
}: {
  params: Promise<{ id?: string[] }>;
}) {
  const [{ id: segments }, session, entity] = await Promise.all([
    params,
    getSession(),
    getCurrentEntity(),
  ]);
  if (!session || !entity) notFound();
  if (segments && segments.length > 1) notFound();

  const conversationId = segments?.[0] ?? null;
  let initialMessages: UIMessage[] = [];
  if (conversationId) {
    const conv = await loadConversation(conversationId, session.userId);
    if (!conv) notFound();
    initialMessages = conv.messages;
  }

  // Les questions les plus posées par la personne connectée : relues à chaque
  // affichage, le journal bouge à chaque question.
  const [lastImport, frequent, conversations] = await Promise.all([
    latestValidatedImport(entity.id, "ventilee"),
    getFrequentQuestions(entity.id, session.email),
    listConversations(session.userId, entity.id),
  ]);

  return (
    <>
      <AppHeader active="assistant" fiscalYearStart={lastImport?.fiscalYearStart} />
      {!lastImport ? (
        <div className="page" style={{ maxWidth: 860 }}>
          <div className="page-header">
            <h1>Assistant IA</h1>
          </div>
          <div className="card">
            <div className="card-label">Pour démarrer</div>
            <p style={{ fontSize: 13, color: "var(--gray2)" }}>
              Aucune balance validée pour l&apos;instant. Importez et validez une
              balance ventilée dans l&apos;écran Imports, puis revenez poser vos
              questions ici.
            </p>
          </div>
        </div>
      ) : (
        <AssistantShell
          // Un identifiant neuf à chaque nouvelle conversation ; il devient
          // celui de la conversation enregistrée dès la première question.
          chatId={conversationId ?? generateId()}
          savedId={conversationId}
          initialMessages={initialMessages}
          conversations={conversations}
          frequent={frequent}
          dataMonth={monthLabelLong(lastImport.period)}
        />
      )}
    </>
  );
}
