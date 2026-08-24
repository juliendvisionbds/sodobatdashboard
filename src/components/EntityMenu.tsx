"use client";

import { useEffect, useRef, useState } from "react";

const ENTITIES = [
  { name: "Sodobat", available: true },
  { name: "Easy Mat", available: false },
  { name: "Easy Home", available: false },
  { name: "VBTP", available: false },
  { name: "CovarBat", available: false },
];

export default function EntityMenu() {
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
    <div className="entity-menu" ref={rootRef}>
      <button
        type="button"
        className="entity-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Entités du Groupe SDG"
        onClick={() => setOpen((v) => !v)}
      >
        Sodobat
        <span style={{ fontSize: 10, color: "var(--gray3)" }}>▼</span>
      </button>

      {open && (
        <div className="entity-dropdown" role="menu">
          <div className="user-dropdown-meta">Entités du Groupe SDG</div>
          {ENTITIES.map((e) =>
            e.available ? (
              <div key={e.name} className="entity-dropdown-item current" role="menuitem">
                <span>{e.name}</span>
                <span className="entity-check">✓</span>
              </div>
            ) : (
              <div
                key={e.name}
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
