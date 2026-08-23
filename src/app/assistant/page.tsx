import AppHeader from "@/components/AppHeader";
import { getEntityByCode, latestValidatedImport } from "@/lib/finance";
import { monthLabelLong } from "@/lib/format";
import Chat from "./Chat";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const entity = await getEntityByCode("sodobat");
  const lastImport = entity
    ? await latestValidatedImport(entity.id, "ventilee")
    : null;

  return (
    <>
      <AppHeader active="assistant" fiscalYearStart={lastImport?.fiscalYearStart} />
      <div className="page" style={{ maxWidth: 860 }}>
        <div className="page-header">
          <h1>Assistant IA</h1>
          <p>
            Posez vos questions en langage naturel sur les données de gestion —
            les chiffres cités proviennent directement des balances importées.
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
          <Chat />
        )}
      </div>
    </>
  );
}
