"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions";

export default function UserMenu({
  name,
  role,
  showAdminLinks,
  showRapprochement,
}: {
  name: string;
  role: string;
  showAdminLinks: boolean;
  /** le rapprochement avec le tableau de gestion n'existe que pour Sodobat */
  showRapprochement: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // « Marie Blanc » → MB ; un nom d'un seul mot donne ses deux premières lettres.
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (
    words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "").slice(0, 2)
  ).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu compte : ${name}`}
        title={`${name} (${role})`}
        onClick={() => setOpen((v) => !v)}
      >
        {initials}
      </button>

      {open && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-meta">{name}</div>
          <Link
            href="/comptes"
            role="menuitem"
            className="user-dropdown-item"
            onClick={() => setOpen(false)}
          >
            Comptes
          </Link>
          {!showAdminLinks && <div className="user-dropdown-sep" />}
          {showAdminLinks && (
            <>
              <Link
                href="/imports"
                role="menuitem"
                className="user-dropdown-item"
                onClick={() => setOpen(false)}
              >
                Imports
              </Link>
              <Link
                href="/admin/mapping"
                role="menuitem"
                className="user-dropdown-item"
                onClick={() => setOpen(false)}
              >
                Mapping
              </Link>
              <div className="user-dropdown-sep" />
            </>
          )}
          <Link
            href="/alertes"
            role="menuitem"
            className="user-dropdown-item"
            onClick={() => setOpen(false)}
          >
            Alertes
          </Link>
          {showRapprochement && (
            <Link
              href="/rapprochement"
              role="menuitem"
              className="user-dropdown-item"
              onClick={() => setOpen(false)}
            >
              Rapprochement
            </Link>
          )}
          <div className="user-dropdown-sep" />
          <a
            href="/docs/guide-utilisateur.html"
            target="_blank"
            rel="noopener"
            role="menuitem"
            className="user-dropdown-item"
            onClick={() => setOpen(false)}
          >
            Guide utilisateur
          </a>
          <a
            href="/docs/documentation.html"
            target="_blank"
            rel="noopener"
            role="menuitem"
            className="user-dropdown-item"
            onClick={() => setOpen(false)}
          >
            Documentation détaillée
          </a>
          <div className="user-dropdown-sep" />
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className="user-dropdown-item danger">
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
