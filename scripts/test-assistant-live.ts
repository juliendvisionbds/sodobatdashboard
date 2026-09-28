// Test de bout en bout de l'assistant (modèle réel + outils réels), hors HTTP.
// Pose les questions types du cahier des charges et affiche les réponses pour
// vérification manuelle contre les écrans.
// Usage : node --env-file=.env.local --import=tsx scripts/test-assistant-live.ts

import { generateText, stepCountIs } from "ai";
import { openai } from "../src/lib/openai";
import { getEntityByCode } from "../src/lib/finance";
import { buildAssistantTools } from "../src/lib/assistant-tools";
import {
  ASSISTANT_MODEL,
  ASSISTANT_PROVIDER_OPTIONS,
  assistantSystemPrompt,
} from "../src/lib/assistant";

const QUESTIONS = [
  "Quel était le CA d'avril vs octobre ?",
  "La masse salariale pèse combien vs le CA ?",
  "Et la masse salariale en % du CA sur le seul mois de juin ?",
  "Quels chantiers perdent de l'argent ce mois-ci ? Donne les 3 pires.",
  "Comment a évolué le chantier Vallauris ?",
  "Où en est-on par rapport aux objectifs ?",
  "Combien on dépense en location de matériel, compte par compte ?",
  "Le mois de juin est-il validé ?",
  "Quelle est la météo à Fréjus ?", // hors périmètre → doit décliner
];

async function main() {
  if (!process.env.KEYONE_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("KEYONE_API_KEY (ou OPENAI_API_KEY) manquante");
  }
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("Entité sodobat introuvable");
  const tools = buildAssistantTools(entity);

  // Questions passées en argument : elles remplacent la liste type.
  const questions = process.argv.length > 2 ? process.argv.slice(2) : QUESTIONS;
  for (const q of questions) {
    console.log(`\n━━━ Q: ${q}`);
    const started = Date.now();
    const result = await generateText({
      model: openai.chat(ASSISTANT_MODEL),
      system: assistantSystemPrompt(),
      providerOptions: ASSISTANT_PROVIDER_OPTIONS,
      prompt: q,
      tools,
      stopWhen: stepCountIs(6),
    });
    const toolCalls = result.steps.flatMap((s) =>
      s.content.filter((c) => c.type === "tool-call").map((c) => (c as { toolName: string }).toolName)
    );
    console.log(`(outils : ${toolCalls.join(", ") || "aucun"} · ${Date.now() - started} ms · ${result.totalUsage.inputTokens}→${result.totalUsage.outputTokens} tokens)`);
    console.log(result.text);
  }
  process.exit(0); // PGlite garde sinon le process ouvert
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
