"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { switchEntityAction } from "@/app/actions";
import { ENTITY_COOKIE, GROUP_ENTITIES } from "@/components/entity-cookie";

export type EntityChoice = { code: string; name: string; available: boolean };

// Écran d'attente : l'en-tête est rendu dans le navigateur, sans la liste que
// le serveur fournit. Le nom affiché se lit dans le cookie de préférence.
const noSubscription = () => () => {};
function entityNameFromCookie(): string {
  const code = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${ENTITY_COOKIE}=`))
    ?.split("=")[1];
  return (GROUP_ENTITIES.find((e) => e.code === code) ?? GROUP_ENTITIES[0]).name;
}

export default function EntityMenu({
  current,
  entities,
}: {
  /** code de l'entité affichée ; absent sur l'écran d'attente */
  current?: string;
  entities?: EntityChoice[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const waitingName = useSyncExternalStore(noSubscription, entityNameFromCookie, () => "");

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

  const name = entities?.find((e) => e.code === current)?.name ?? waitingName;

  return (
    <div className="entity-menu" ref={rootRef}>
      <button
        type="button"
        className="entity-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Entités du Groupe SDG"
        onClick={() => setOpen((v) => !v)}
      >
        {name}
        <span style={{ fontSize: 10, color: "var(--gray3)" }}>▼</span>
      </button>

      {open && entities && (
        <div className="entity-dropdown" role="menu">
          <div className="user-dropdown-meta">Entités du Groupe SDG</div>
          {entities.map((e) =>
            e.code === current ? (
              <div key={e.code} className="entity-dropdown-item current" role="menuitem">
                <span>{e.name}</span>
                <span className="entity-check">✓</span>
              </div>
            ) : e.available ? (
              <form key={e.code} action={switchEntityAction} onSubmit={() => setOpen(false)}>
                <input type="hidden" name="entity" value={e.code} />
                <button type="submit" className="entity-dropdown-item entity-switch" role="menuitem">
                  <span>{e.name}</span>
                </button>
              </form>
            ) : (
              <div
                key={e.code}
                className="entity-dropdown-item disabled"
                role="menuitem"
                aria-disabled="true"
              >
                <span>{e.name}</span>
                <span className="entity-soon">Coming soon</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
