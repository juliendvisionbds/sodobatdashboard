import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getEntityByCode, listAccounts } from "@/lib/finance";
import AccountSearch from "./AccountSearch";

export const dynamic = "force-dynamic";

export default async function ComptesPage() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) return null;

  const accounts = await listAccounts(entity);

  return (
    <>
      <AppHeader active="comptes" />
      <div className="page">
        <div className="page-header">
          <h1>Consultation par compte</h1>
          <p>
            Résultat d&apos;un compte comptable précis, mois par mois et ventilé par
            centre analytique — hors des lignes agrégées de la nomenclature.
          </p>
        </div>
        {accounts.length === 0 ? (
          <div className="card" style={{ maxWidth: 520 }}>
            <div className="card-label">Pour démarrer</div>
            <p style={{ fontSize: 13, color: "var(--gray2)", marginBottom: 16 }}>
              Importez une balance ventilée pour alimenter la liste des comptes.
            </p>
            <Link href="/imports" className="btn">
              Aller aux imports →
            </Link>
          </div>
        ) : (
          <AccountSearch accounts={accounts} />
        )}
      </div>
    </>
  );
}
