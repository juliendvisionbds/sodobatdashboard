import Link from "next/link";
import { getSession, canWrite, ownsEntity } from "@/lib/auth";
import { fiscalYearLabel } from "@/lib/format";
import { debutExercice } from "@/lib/nomenclature/entites";
import UserMenu from "@/components/UserMenu";
import EntityMenu from "@/components/EntityMenu";
import { allowedEntities, getCurrentEntity, listEntities } from "@/lib/entity";
import { NAV_TABS } from "@/components/nav-tabs";
import { ENTITES_RAPPROCHEMENT } from "@/app/rapprochement/contenus";

export default async function AppHeader({
  active,
  fiscalYearStart,
}: {
  active:
    | "synthese"
    | "chantiers"
    | "fx"
    | "objectifs"
    | "rapprochement"
    | "comptes"
    | "imports"
    | "mapping"
    | "assistant";
  fiscalYearStart?: number;
}) {
  const session = await getSession();
  const writer = session ? canWrite(session) : false;
  const [entity, entities, allowed] = await Promise.all([
    getCurrentEntity(),
    listEntities(),
    allowedEntities(session),
  ]);
  // Un compte rattaché à une entité ne voit qu'elle dans le menu ; les comptes
  // de la holding voient tout le groupe, les entités fermées en « Coming soon ».
  const choices = entities
    .filter((e) => !session || ownsEntity(session, e.id))
    .map((e) => ({
      code: e.code,
      name: e.name,
      available: allowed.some((a) => a.id === e.id),
    }));

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
          <EntityMenu current={entity?.code} entities={choices} />
          <div className="brand-sep" />
          <div className="brand-group">Groupe SDG</div>
        </div>
        <nav className="nav">
          {NAV_TABS.map((t) => (
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
            <span className="header-meta">
              Exercice {fiscalYearLabel(fiscalYearStart, entity ? debutExercice(entity.code) : undefined)}
            </span>
          )}
          {session && (
            <UserMenu
              name={session.name}
              role={session.role}
              showAdminLinks={writer}
              showRapprochement={!!entity && ENTITES_RAPPROCHEMENT.has(entity.code)}
            />
          )}
        </div>
      </div>
    </header>
  );
}
