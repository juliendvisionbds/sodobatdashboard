"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FrequentQuestion } from "@/lib/assistant-questions";

// Exemples proposés tant que le journal ne contient pas assez de questions.
const SUGGESTIONS = [
  "Quel est le CA cumulé de l'exercice et le résultat net ?",
  "La masse salariale pèse combien vs le CA ?",
  "Quels chantiers perdent de l'argent ce mois-ci ?",
  "Compare le CA de janvier et celui d'avril",
  "Y a-t-il des alertes ouvertes ?",
  "Quels postes de frais généraux ont le plus augmenté vs N-1 ?",
];
const MAX_SUGGESTIONS = 6;

type ToolInput = { pole?: string; recherche?: string } | undefined;
type ToolOutput = { erreur?: string; mois?: string; dernierMoisImporte?: string } | undefined;

// Outils de l'assistant (src/lib/assistant-tools.ts) vus par l'utilisateur :
// ce qu'on affiche pendant la lecture, et l'écran d'où viennent les chiffres.
const TOOLS: Record<
  string,
  { label: string; href: string; doing: (input: ToolInput) => string; done: string }
> = {
  synthese: {
    label: "Synthèse",
    done: "Synthèse consultée",
    href: "/",
    doing: () => "Je consulte la Synthèse",
  },
  chantiers: {
    label: "Chantiers",
    done: "Chantiers consultés",
    href: "/chantiers",
    doing: (i) =>
      i?.recherche
        ? `Je cherche le chantier « ${i.recherche} »`
        : i?.pole
          ? `Je consulte les chantiers du pôle ${i.pole}`
          : "Je consulte les Chantiers",
  },
  frais_generaux: {
    label: "Frais généraux",
    done: "Frais généraux consultés",
    href: "/frais-generaux",
    doing: () => "Je consulte les Frais généraux",
  },
  alertes: {
    label: "Alertes",
    done: "Alertes vérifiées",
    href: "/alertes",
    doing: () => "Je vérifie les alertes ouvertes",
  },
  imports_disponibles: {
    label: "Imports",
    done: "Imports vérifiés",
    href: "/imports",
    doing: () => "Je vérifie les imports disponibles",
  },
};

type Part = UIMessage["parts"][number];
type ToolPart = Extract<Part, { toolCallId: string }> & {
  state: string;
  input?: unknown;
  output?: unknown;
};

function isToolPart(p: Part): p is ToolPart {
  return p.type.startsWith("tool-") && "toolCallId" in p;
}
const toolName = (p: ToolPart) => p.type.slice("tool-".length);
const isRunning = (p: ToolPart) => p.state === "input-streaming" || p.state === "input-available";
const textOf = (m: UIMessage) =>
  m.parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim();

/** Ce que l'assistant est en train de faire, d'après la dernière partie reçue. */
function currentActivity(m: UIMessage | undefined): string | null {
  const parts = (m?.parts ?? []).filter((p) => p.type !== "step-start");
  const last = parts.at(-1);
  if (!last) return "Je lis votre question";
  if (isToolPart(last)) {
    if (isRunning(last)) {
      const t = TOOLS[toolName(last)];
      return t ? t.doing(last.input as ToolInput) : "Je consulte les données";
    }
    return "J'analyse les chiffres";
  }
  if (last.type === "reasoning") return "Je réfléchis";
  if (last.type === "text") return last.text.trim() ? null : "Je rédige la réponse";
  return "Je travaille sur votre question";
}

/** Sources consultées pour une réponse : un lien par écran, avec le mois lu. */
function sourcesOf(m: UIMessage) {
  const out = new Map<string, { label: string; href: string; mois?: string; failed: boolean }>();
  for (const p of m.parts) {
    if (!isToolPart(p)) continue;
    const name = toolName(p);
    const t = TOOLS[name];
    if (!t) continue;
    const output = p.output as ToolOutput;
    const failed = p.state === "output-error" || !!output?.erreur;
    const mois = output?.mois ?? output?.dernierMoisImporte;
    const prev = out.get(name);
    out.set(name, {
      label: t.label,
      href: t.href,
      mois: mois ?? prev?.mois,
      failed: (prev?.failed ?? true) && failed,
    });
  }
  return [...out.values()];
}

/** Traduit une erreur reçue par le navigateur en message lisible. */
function errorText(error: Error): string {
  const msg = error.message ?? "";
  try {
    // Réponse JSON de la route (ex. session expirée).
    const body = JSON.parse(msg) as { error?: string };
    if (body.error === "Non authentifié")
      return "Votre session a expiré. Rechargez la page et reconnectez-vous.";
    if (body.error) return body.error;
  } catch {
    // Texte simple : message déjà rédigé par la route, ou erreur réseau.
  }
  if (/fetch|network|load failed/i.test(msg))
    return "La connexion a été interrompue. Vérifiez votre réseau puis réessayez.";
  return msg || "La réponse n'a pas pu aboutir. Réessayez.";
}

// Cellules de tableau : les montants et pourcentages à droite, le texte à gauche.
const NUMERIC = /^[-−+]?\s?[\d\s\u00a0\u202f.,]+\s?(€|k€|M€|%|pts?)?$/;
const cellText = (children: React.ReactNode): string =>
  Array.isArray(children)
    ? children.map(cellText).join("")
    : typeof children === "string" || typeof children === "number"
      ? String(children)
      : "";
const MD_COMPONENTS: Components = {
  td: ({ children, style }) => (
    <td className={NUMERIC.test(cellText(children).trim()) ? "num" : undefined} style={style}>
      {children}
    </td>
  ),
};

function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setSeconds(0);
    };
  }, [running]);
  return seconds;
}

export default function Chat({
  id,
  initialMessages,
  frequent,
  dataMonth,
  onFirstQuestion,
  onAnswered,
  onOpenHistory,
}: {
  /** identifiant de la conversation */
  id: string;
  /** messages déjà enregistrés */
  initialMessages: UIMessage[];
  /** questions les plus posées par la personne connectée */
  frequent: FrequentQuestion[];
  /** dernier mois importé, en toutes lettres */
  dataMonth: string | null;
  /** première question d'une nouvelle conversation */
  onFirstQuestion: (question: string) => void;
  /** réponse terminée (l'historique peut être relu) */
  onAnswered: () => void;
  /** ouvrir l'historique (petit écran) */
  onOpenHistory: () => void;
}) {
  const [input, setInput] = useState("");
  const [stoppedId, setStoppedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { messages, sendMessage, regenerate, stop, clearError, status, error } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/assistant",
      // L'historique est enregistré côté serveur : on n'envoie que la question.
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { id, message: messages.at(-1) },
      }),
    }),
    onFinish: () => onAnswered(),
  });

  const busy = status === "submitted" || status === "streaming";
  const elapsed = useElapsed(busy);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Défilement automatique tant que l'utilisateur est en bas du fil ; s'il
  // remonte relire, on ne le ramène pas de force.
  const stickRef = useRef(true);

  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Zone de saisie qui grandit avec le texte, jusqu'à environ 8 lignes.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    stickRef.current = true;
    setStoppedId(null);
    if (error) clearError();
    if (messages.length === 0) onFirstQuestion(t);
    sendMessage({ text: t });
    setInput("");
    inputRef.current?.focus();
  };

  const onStop = () => {
    const last = messages.at(-1);
    if (last?.role === "assistant") setStoppedId(last.id);
    stop();
  };

  const retry = () => {
    stickRef.current = true;
    setStoppedId(null);
    regenerate();
  };

  const copy = async (m: UIMessage) => {
    try {
      await navigator.clipboard.writeText(textOf(m));
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1500);
    } catch {
      // Presse-papiers refusé par le navigateur : rien à faire.
    }
  };

  // Questions fréquentes d'abord, complétées par les exemples.
  const frequentTexts = new Set(frequent.map((f) => f.question));
  const suggestions = [
    ...frequent.slice(0, MAX_SUGGESTIONS).map((f) => ({ text: f.question, count: f.count })),
    ...SUGGESTIONS.filter((s) => !frequentTexts.has(s)).map((text) => ({ text, count: 0 })),
  ].slice(0, MAX_SUGGESTIONS);

  const last = messages.at(-1);
  // L'assistant n'a encore rien renvoyé : on affiche une bulle d'attente.
  const pending = busy && last?.role !== "assistant";

  return (
    <div className="chat">
      <div className="chat-top">
        <button
          type="button"
          className="chat-history-btn"
          onClick={onOpenHistory}
          aria-label="Afficher l'historique des conversations"
        >
          ☰
        </button>
        <div className="chat-top-text">
          <h1>Assistant IA</h1>
          <p>
            Les chiffres cités proviennent des balances importées.
            {dataMonth && <> Données à jour : {dataMonth}.</>}
          </p>
        </div>
      </div>

      <div
        className="chat-thread"
        ref={threadRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        <div className="chat-thread-inner">
          {messages.length === 0 && (
            <div className="chat-empty">
              <h2>Que voulez-vous savoir ?</h2>
              <p>
                Chiffre d&apos;affaires, résultat, chantiers, frais généraux, alertes : posez
                votre question comme vous la poseriez à un contrôleur de gestion.
              </p>
              <div className="chat-suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    className="chat-suggestion"
                    onClick={() => ask(s.text)}
                  >
                    <span>{s.text}</span>
                    {s.count > 1 && (
                      <span className="chat-suggestion-count" title={`Posée ${s.count} fois`}>
                        ×{s.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="chat-msg user">
                  <div className="chat-bubble">{textOf(m)}</div>
                </div>
              );
            }
            const active = busy && i === messages.length - 1;
            const activity = active ? currentActivity(m) : null;
            const steps = m.parts.filter(isToolPart);
            const sources = sourcesOf(m);
            const text = textOf(m);
            const isLast = i === messages.length - 1;
            return (
              <div key={m.id} className="chat-msg assistant">
                <div className="chat-answer">
                  {active && steps.length > 0 && (
                    <ul className="chat-steps">
                      {steps.map((p) => {
                        const t = TOOLS[toolName(p)];
                        const running = isRunning(p);
                        const failed = p.state === "output-error";
                        return (
                          <li key={p.toolCallId} className={running ? "running" : failed ? "failed" : "done"}>
                            <span className="chat-step-ico" aria-hidden>
                              {running ? <span className="chat-spinner" /> : failed ? "!" : "✓"}
                            </span>
                            {running
                              ? `${t?.doing(p.input as ToolInput) ?? "Lecture des données"}…`
                              : failed
                                ? `${t?.label ?? "Données"} : lecture impossible`
                                : (t?.done ?? "Données consultées")}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {text && (
                    <div className="chat-md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                        {text}
                      </ReactMarkdown>
                    </div>
                  )}

                  {activity && (
                    <Activity label={activity} seconds={elapsed} />
                  )}

                  {!active && stoppedId === m.id && (
                    <div className="chat-note">Réponse interrompue.</div>
                  )}

                  {!active && (sources.length > 0 || text) && (
                    <div className="chat-footer">
                      {sources.length > 0 && (
                        <div className="chat-sources">
                          <span className="chat-sources-label">Sources</span>
                          {sources.map((s) => (
                            <Link
                              key={s.href}
                              href={s.href}
                              className={`chat-source${s.failed ? " failed" : ""}`}
                              title={s.failed ? "Données indisponibles" : "Ouvrir l'écran"}
                            >
                              {s.label}
                              {s.mois && <span className="chat-source-month">{s.mois}</span>}
                              <span aria-hidden>↗</span>
                            </Link>
                          ))}
                        </div>
                      )}
                      <div className="chat-actions">
                        {text && (
                          <button type="button" className="chat-action" onClick={() => copy(m)}>
                            {copiedId === m.id ? "Copié ✓" : "Copier"}
                          </button>
                        )}
                        {isLast && !busy && (
                          <button type="button" className="chat-action" onClick={retry}>
                            Régénérer
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {pending && (
            <div className="chat-msg assistant">
              <div className="chat-answer">
                <Activity label="Je lis votre question" seconds={elapsed} />
              </div>
            </div>
          )}

          {error && !busy && (
            <div className="chat-error" role="alert">
              <div>
                <div className="chat-error-title">L&apos;assistant n&apos;a pas pu répondre</div>
                <div className="chat-error-desc">{errorText(error)}</div>
              </div>
              <button type="button" className="btn secondary" onClick={retry}>
                Réessayer
              </button>
            </div>
          )}
        </div>
      </div>

      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="chat-composer-box">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="Posez votre question, ex. « quel était le CA d'avril vs octobre ? »"
            aria-label="Votre question"
            autoFocus
          />
          {busy ? (
            <button type="button" className="chat-send stop" onClick={onStop} title="Arrêter la réponse">
              <span className="chat-stop-ico" aria-hidden />
              Arrêter
            </button>
          ) : (
            <button type="submit" className="chat-send" disabled={!input.trim()}>
              Envoyer
            </button>
          )}
        </div>
        <div className="chat-hint">
          Entrée pour envoyer · Maj + Entrée pour aller à la ligne · Vérifiez les chiffres
          importants dans l&apos;écran source.
        </div>
      </form>
    </div>
  );
}

function Activity({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="chat-activity" role="status" aria-live="polite">
      <span className="chat-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {label}…
      {seconds >= 5 && <span className="chat-elapsed">{seconds} s</span>}
    </div>
  );
}
