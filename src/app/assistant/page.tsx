import AppHeader from "@/components/AppHeader";
import { getEntityByCode, latestValidatedImport } from "@/lib/finance";
import { getFrequentQuestions, getRecentQuestions } from "@/lib/assistant-questions";
import { monthLabelLong } from "@/lib/format";
import Chat from "./Chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const entity = await getEntityByCode("sodobat");
  // Les questions déjà posées, par tout le monde : les plus fréquentes et les
  // dernières. Relues à chaque affichage, le journal bouge à chaque question.
  const [lastImport, frequent, recent] = await Promise.all([
    entity ? latestValidatedImport(entity.id, "ventilee") : null,
    entity ? getFrequentQuestions(entity.id) : [],
    entity ? getRecentQuestions(entity.id) : [],
  ]);

  return (
    <>
      <AppHeader active="assistant" fiscalYearStart={lastImport?.fiscalYearStart} />
      <div className="page" style={{ maxWidth: 860 }}>
        <div className="page-header">
          <h1>Assistant IA</h1>
          <p>
            Posez vos questions en langage naturel sur les données de gestion.
            Les chiffres cités proviennent directement des balances importées.
            {lastImport && (
              <> Données à jour : {monthLabelLong(lastImport.period)}.</>
            )}
          </p>
        </div>
        {!lastImport ? (
          <div className="card">
            <div className="card-label">Pour démarrer</div>
            <p style={{ fontSize: 13, color: "var(--gray2)" }}>
              Aucune balance validée pour l&apos;instant. Importez et validez une
              balance ventilée dans l&apos;écran Imports, puis revenez poser vos
              questions ici.
            </p>
          </div>
        ) : (
          <Chat frequent={frequent} recent={recent} />
        )}
      </div>
    </>
  );
}
