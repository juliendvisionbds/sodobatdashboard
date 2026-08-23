// Recette de la couche outils de l'assistant IA (sans LLM) :
// exécute chaque outil comme le ferait le modèle et vérifie que les chiffres
// retournés correspondent aux valeurs de référence de la recette de mai 2026.
// Usage : node --import=tsx scripts/recette-assistant.ts

import { getEntityByCode } from "../src/lib/finance";
import { buildAssistantTools } from "../src/lib/assistant-tools";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("Entité sodobat introuvable — lancer db:seed");

  const tools = buildAssistantTools(entity);
  // Les outils du SDK attendent (input, options) ; options inutilisé ici.
  const run = async (t: { execute?: unknown }, input: unknown) =>
    (t.execute as (i: unknown, o: unknown) => Promise<unknown>)(input, {});

  // ── synthese ────────────────────────────────────────────────────────────
  const syn = (await run(tools.synthese, { detail: "totaux" })) as {
    erreur?: string;
    caTotal?: { cumulExercice: number; parMois: Record<string, number> };
    resultatNet?: { cumulExercice: number };
    dernierMoisImporte?: string;
  };
  if (syn.erreur) {
    console.log(`! synthese : ${syn.erreur} (importer les balances avant la recette)`);
    failures++;
  } else {
    check(
      "synthese : CA cumulé = 10 506 102 € (recette mai 2026)",
      Math.abs((syn.caTotal?.cumulExercice ?? 0) - 10_506_102) < 2,
      `obtenu ${syn.caTotal?.cumulExercice}`
    );
    check(
      "synthese : résultat net = −481 608 €",
      Math.abs((syn.resultatNet?.cumulExercice ?? 0) - -481_608) < 2,
      `obtenu ${syn.resultatNet?.cumulExercice}`
    );
    check(
      "synthese : dernier mois = Mai 2026",
      syn.dernierMoisImporte === "Mai 2026",
      `obtenu ${syn.dernierMoisImporte}`
    );
    const avril = syn.caTotal?.parMois?.["Avril 2026"];
    check("synthese : CA d'avril présent (question type CDC)", avril != null && avril !== 0, `Avril 2026 = ${avril}`);
  }

  const synFull = (await run(tools.synthese, { detail: "complet" })) as {
    sections?: { section: string; lignes: { ligne: string; cumulExercice: number; pctDuCa: number | null }[] }[];
  };
  const ms = synFull.sections
    ?.flatMap((s) => s.lignes)
    .find((l) => l.ligne.toLowerCase().includes("masse salariale"));
  check(
    "synthese complet : ratio masse salariale / CA disponible (question type CDC)",
    ms != null && ms.pctDuCa != null,
    ms ? `${ms.ligne} : ${ms.cumulExercice} € (${ms.pctDuCa} % du CA)` : "ligne introuvable"
  );

  // ── chantiers ───────────────────────────────────────────────────────────
  const cha = (await run(tools.chantiers, {})) as {
    erreur?: string;
    nombreChantiers?: number;
    chantiers?: { resultatMois: number; chantier: string }[];
    totaux?: { resultatMois: number };
  };
  if (cha.erreur) {
    console.log(`! chantiers : ${cha.erreur}`);
    failures++;
  } else {
    check("chantiers : des chantiers sont retournés", (cha.nombreChantiers ?? 0) > 0, `${cha.nombreChantiers} chantiers`);
    const perdants = cha.chantiers?.filter((c) => c.resultatMois < 0) ?? [];
    console.log(`  (info) chantiers en perte ce mois : ${perdants.length}`);
  }

  // ── frais_generaux ──────────────────────────────────────────────────────
  const fx = (await run(tools.frais_generaux, {})) as {
    erreur?: string;
    totalCumulExercice?: number;
    ratioFxSurCa?: number | null;
    postes?: unknown[];
  };
  if (fx.erreur) {
    console.log(`! frais_generaux : ${fx.erreur}`);
    failures++;
  } else {
    check("fx : total YTD non nul", (fx.totalCumulExercice ?? 0) !== 0, `${fx.totalCumulExercice} €`);
    check("fx : ratio FX/CA calculé", fx.ratioFxSurCa != null, `${fx.ratioFxSurCa} %`);
  }

  // ── alertes + imports ───────────────────────────────────────────────────
  const al = (await run(tools.alertes, {})) as { alertesOuvertes: number };
  console.log(`  (info) alertes ouvertes : ${al.alertesOuvertes}`);
  const imp = (await run(tools.imports_disponibles, {})) as { imports: unknown[] };
  check("imports_disponibles : au moins 1 import validé", imp.imports.length > 0, `${imp.imports.length} imports`);

  console.log(failures === 0 ? "\nRecette outils assistant : OK" : `\nRecette : ${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
