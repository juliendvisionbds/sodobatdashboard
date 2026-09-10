"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions";

export default function UserMenu({
  name,
  role,
  showAdminLinks,
}: {
  name: string;
  role: string;
  showAdminLinks: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M5.5 19.5c.8-3.2 3.1-5 6.5-5s5.7 1.8 6.5 5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
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
