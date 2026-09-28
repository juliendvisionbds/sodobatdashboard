"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import type { UIMessage } from "ai";
import type { FrequentQuestion } from "@/lib/assistant-questions";
import { titleFrom, type ConversationSummary } from "@/lib/assistant-shared";
import { deleteConversationAction, renameConversationAction } from "./actions";
import Chat from "./Chat";

// Regroupement de l'historique par ancienneté, comme dans les messageries.
function groupOf(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return "7 derniers jours";
  if (diff < 30) return "30 derniers jours";
  return "Plus ancien";
}

export default function AssistantShell({
  chatId,
  savedId,
  initialMessages,
  conversations,
  frequent,
  dataMonth,
}: {
  /** identifiant du chat affiché (neuf pour une nouvelle conversation) */
  chatId: string;
  /** identifiant de la conversation enregistrée, null si elle est nouvelle */
  savedId: string | null;
  initialMessages: UIMessage[];
  conversations: ConversationSummary[];
  frequent: FrequentQuestion[];
  dataMonth: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Conversation démarrée ici et pas encore relue du serveur : affichée tout
  // de suite en tête de liste.
  const [started, setStarted] = useState<ConversationSummary | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [renamed, setRenamed] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeId = savedId ?? (started?.id === chatId ? chatId : null);

  const list = [
    ...(started && !conversations.some((c) => c.id === started.id) ? [started] : []),
    ...conversations,
  ]
    .filter((c) => !removed.has(c.id))
    .map((c) => (renamed[c.id] ? { ...c, title: renamed[c.id] } : c));

  const q = query.trim().toLowerCase();
  const visible = q ? list.filter((c) => c.title.toLowerCase().includes(q)) : list;
  const now = new Date();
  const groups: { label: string; items: ConversationSummary[] }[] = [];
  for (const c of visible) {
    const label = groupOf(c.updatedAt, now);
    const g = groups.at(-1);
    if (g?.label === label) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  // L'espace sous l'en-tête de l'app, dont la hauteur varie (retour à la
  // ligne sur petit écran) : on la mesure.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>(".header");
    const root = rootRef.current;
    if (!header || !root) return;
    const sync = () => root.style.setProperty("--header-h", `${header.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const onFirstQuestion = (question: string) => {
    // L'adresse devient celle de la conversation, sans recharger la page.
    window.history.replaceState(null, "", `/assistant/${chatId}`);
    setStarted({ id: chatId, title: titleFrom(question), updatedAt: new Date().toISOString() });
  };

  const onAnswered = () => startTransition(() => router.refresh());

  const remove = async (id: string) => {
    setRemoved((s) => new Set(s).add(id));
    await deleteConversationAction(id);
    if (id === activeId) router.push("/assistant");
    else startTransition(() => router.refresh());
  };

  const rename = async (id: string, title: string) => {
    const t = titleFrom(title);
    setRenamed((r) => ({ ...r, [id]: t }));
    await renameConversationAction(id, t);
    startTransition(() => router.refresh());
  };

  return (
    <div className={`assistant-shell${drawerOpen ? " drawer-open" : ""}`} ref={rootRef}>
      <aside className="assistant-side" aria-label="Historique des conversations">
        <div className="assistant-side-top">
          <Link
            href="/assistant"
            className="assistant-new"
            onClick={() => setDrawerOpen(false)}
          >
            <span aria-hidden>＋</span> Nouvelle conversation
          </Link>
          {list.length > 4 && (
            <input
              className="assistant-search"
              type="search"
              placeholder="Rechercher"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher une conversation"
            />
          )}
        </div>
        <nav className="assistant-list">
          {list.length === 0 && (
            <p className="assistant-list-empty">
              Vos conversations apparaîtront ici. Elles ne sont visibles que par vous.
            </p>
          )}
          {list.length > 0 && visible.length === 0 && (
            <p className="assistant-list-empty">Aucune conversation ne correspond.</p>
          )}
          {groups.map((g) => (
            <div key={g.label} className="assistant-group">
              <div className="assistant-group-label">{g.label}</div>
              {g.items.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  onOpen={() => setDrawerOpen(false)}
                  onRename={(t) => rename(c.id, t)}
                  onDelete={() => remove(c.id)}
                />
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="assistant-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />

      <Chat
        key={chatId}
        id={chatId}
        initialMessages={initialMessages}
        frequent={frequent}
        dataMonth={dataMonth}
        onFirstQuestion={onFirstQuestion}
        onAnswered={onAnswered}
        onOpenHistory={() => setDrawerOpen(true)}
      />
    </div>
  );
}

function ConversationItem({
  conversation,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<"view" | "menu" | "rename" | "confirm">("view");
  const [draft, setDraft] = useState(conversation.title);

  if (mode === "rename") {
    const submit = () => {
      if (draft.trim() && draft.trim() !== conversation.title) onRename(draft);
      setMode("view");
    };
    return (
      <form
        className="assistant-item editing"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(conversation.title);
              setMode("view");
            }
          }}
          aria-label="Nouveau titre"
        />
      </form>
    );
  }

  if (mode === "confirm") {
    return (
      <div className="assistant-item confirm" role="alertdialog" aria-label="Confirmer la suppression">
        <div className="assistant-confirm-text">Supprimer cette conversation ?</div>
        <div className="assistant-confirm-actions">
          <button type="button" className="danger" onClick={onDelete}>
            Supprimer
          </button>
          <button type="button" onClick={() => setMode("view")}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`assistant-item${active ? " active" : ""}${mode === "menu" ? " menu-open" : ""}`}
      onMouseLeave={() => mode === "menu" && setMode("view")}
    >
      <Link
        href={`/assistant/${conversation.id}`}
        className="assistant-item-link"
        title={conversation.title}
        aria-current={active ? "page" : undefined}
        onClick={onOpen}
      >
        {conversation.title}
      </Link>
      {mode === "menu" ? (
        <div className="assistant-item-menu">
          <button
            type="button"
            onClick={() => {
              setDraft(conversation.title);
              setMode("rename");
            }}
          >
            Renommer
          </button>
          <button type="button" className="danger" onClick={() => setMode("confirm")}>
            Supprimer
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="assistant-item-more"
          aria-label={`Actions pour « ${conversation.title} »`}
          onClick={() => setMode("menu")}
        >
          ⋯
        </button>
      )}
    </div>
  );
}
