"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import EntityMenu from "@/components/EntityMenu";
import { NAV_TABS } from "@/components/nav-tabs";

/**
 * En-tête affiché pendant qu'une vue se calcule : même barre que AppHeader,
 * sans la session (qui se lit côté serveur), l'onglet actif déduit de l'URL
 * pour que rien ne saute quand la vraie page arrive.
 */
export default function HeaderSkeleton() {
  const pathname = usePathname();
  const active =
    NAV_TABS.find((t) => t.href !== "/" && pathname.startsWith(t.href))?.key ??
    (pathname === "/" ? "synthese" : null);

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
          <span className="skeleton skeleton-avatar" aria-hidden />
        </div>
      </div>
    </header>
  );
}
