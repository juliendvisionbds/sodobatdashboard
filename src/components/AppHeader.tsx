import Link from "next/link";
import { getSession, canWrite } from "@/lib/auth";
import { fiscalYearLabel } from "@/lib/format";
import UserMenu from "@/components/UserMenu";

const OTHER_ENTITIES = ["Easy Mat", "Easy Home", "VBTP", "CovarBat"];

export default async function AppHeader({
  active,
  fiscalYearStart,
}: {
  active: "synthese" | "chantiers" | "fx" | "imports" | "mapping" | "assistant";
  fiscalYearStart?: number;
}) {
  const session = await getSession();
  const writer = session ? canWrite(session) : false;

  const tabs: { key: string; label: string; href: string; disabled?: boolean }[] = [
    { key: "synthese", label: "Synthèse", href: "/" },
    { key: "chantiers", label: "Chantiers", href: "/chantiers" },
    { key: "fx", label: "Frais généraux", href: "/frais-generaux" },
    { key: "assistant", label: "Assistant IA", href: "#", disabled: true },
  ];

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <div className="entity-btn" title="Les autres entités arrivent en phase 2">
            Sodobat
            <span style={{ fontSize: 10, color: "var(--gray3)" }}>▼</span>
          </div>
          <div className="brand-sep" />
          <div className="brand-group" title={`À venir : ${OTHER_ENTITIES.join(", ")}`}>
            Groupe SDG
          </div>
        </div>
        <nav className="nav">
          {tabs.map((t) =>
            t.disabled ? (
              <span
                key={t.key}
                className="nav-tab"
                style={{ color: "var(--gray3)", cursor: "default" }}
                title="Disponible en itération 2"
              >
                {t.label}
              </span>
            ) : (
              <Link
                key={t.key}
                href={t.href}
                className={`nav-tab${active === t.key ? " active" : ""}`}
              >
                {t.label}
              </Link>
            )
          )}
        </nav>
        <div className="header-right">
          {fiscalYearStart != null && (
            <span className="header-meta">Exercice {fiscalYearLabel(fiscalYearStart)}</span>
          )}
          {session && (
            <UserMenu
              name={session.name}
              role={session.role}
              showAdminLinks={writer}
            />
          )}
        </div>
      </div>
    </header>
  );
}
