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
  // Une seule lettre, celle du prénom : deux initiales forment vite un sigle
  // malheureux en français (« PD »), et le rond n'a pas à distinguer les comptes.
  const initial = (name.trim()[0] ?? "?").toUpperCase();

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
        {initial}
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
          <div className="user-dropdown-sep" />
          {/* Imports, Mapping, Alertes : le panneau de la DAF. Les autres profils
              n'en voient pas les liens, et ces pages les renvoient à l'accueil. */}
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
              <Link
                href="/alertes"
                role="menuitem"
                className="user-dropdown-item"
                onClick={() => setOpen(false)}
              >
                Alertes
              </Link>
              <div className="user-dropdown-sep" />
            </>
          )}
          <Link
            href="/guide"
            role="menuitem"
            className="user-dropdown-item"
            onClick={() => setOpen(false)}
          >
            Guide utilisateur
          </Link>
          <Link
            href="/documentation"
            role="menuitem"
            className="user-dropdown-item"
            onClick={() => setOpen(false)}
          >
            Documentation détaillée
          </Link>
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
