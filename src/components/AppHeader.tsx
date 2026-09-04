import Link from "next/link";
import { getSession, canWrite } from "@/lib/auth";
import { fiscalYearLabel } from "@/lib/format";
import UserMenu from "@/components/UserMenu";
import EntityMenu from "@/components/EntityMenu";

export default async function AppHeader({
  active,
  fiscalYearStart,
}: {
  active:
    | "synthese"
    | "chantiers"
    | "fx"
    | "objectifs"
    | "comptes"
    | "imports"
    | "mapping"
    | "assistant";
  fiscalYearStart?: number;
}) {
  const session = await getSession();
  const writer = session ? canWrite(session) : false;

  const tabs: { key: string; label: string; href: string }[] = [
    { key: "synthese", label: "Synthèse", href: "/" },
    { key: "chantiers", label: "Chantiers", href: "/chantiers" },
    { key: "fx", label: "Frais généraux", href: "/frais-generaux" },
    { key: "assistant", label: "Assistant IA", href: "/assistant" },
  ];

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <Link href="/" className="home-btn" title="Accueil" aria-label="Accueil">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 11.5 12 4l8 7.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 10v9a1 1 0 0 0 1 1h3v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5h3a1 1 0 0 0 1-1v-9"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <EntityMenu />
          <div className="brand-sep" />
          <div className="brand-group">Groupe SDG</div>
        </div>
        <nav className="nav">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={`nav-tab${active === t.key ? " active" : ""}`}
            >
              {t.label}
            </Link>
          ))}
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
