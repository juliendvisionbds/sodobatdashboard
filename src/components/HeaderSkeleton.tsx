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
        <EntityMenu />
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
