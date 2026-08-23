// Test de bout en bout de l'assistant (modèle réel + outils réels), hors HTTP.
// Pose les questions types du cahier des charges et affiche les réponses pour
// vérification manuelle contre les écrans.
// Usage : node --env-file=.env.local --import=tsx scripts/test-assistant-live.ts

import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { getEntityByCode } from "../src/lib/finance";
import { buildAssistantTools } from "../src/lib/assistant-tools";
import { ASSISTANT_MODEL, ASSISTANT_SYSTEM_PROMPT } from "../src/lib/assistant";

const QUESTIONS = [
  "Quel était le CA d'avril vs octobre ?",
  "La masse salariale pèse combien vs le CA ?",
  "Quels chantiers perdent de l'argent ce mois-ci ? Donne les 3 pires.",
  "Quelle est la météo à Fréjus ?", // hors périmètre → doit décliner
];

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY manquant");
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("Entité sodobat introuvable");
  const tools = buildAssistantTools(entity);

  for (const q of QUESTIONS) {
    console.log(`\n━━━ Q: ${q}`);
    const started = Date.now();
    const result = await generateText({
      model: openai(ASSISTANT_MODEL),
      system: ASSISTANT_SYSTEM_PROMPT,
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
