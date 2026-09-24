"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FrequentQuestion } from "@/lib/assistant-questions";

// Exemples proposés tant que le journal ne contient pas assez de questions.
const SUGGESTIONS = [
  "Quel est le CA cumulé de l'exercice et le résultat net ?",
  "La masse salariale pèse combien vs le CA ?",
  "Quels chantiers perdent de l'argent ce mois-ci ?",
  "Compare le CA de janvier et celui d'avril",
  "Y a-t-il des alertes ouvertes ?",
];

const TOOL_LABELS: Record<string, string> = {
  "tool-synthese": "Synthèse",
  "tool-chantiers": "Chantiers",
  "tool-frais_generaux": "Frais généraux",
  "tool-alertes": "Alertes",
  "tool-imports_disponibles": "Imports",
};

export default function Chat({
  frequent,
  recent,
}: {
  /** questions les plus posées, toutes personnes confondues */
  frequent: FrequentQuestion[];
  /** dernières questions posées, par qui que ce soit */
  recent: string[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  };

  // Les questions fréquentes prennent la place des exemples dès qu'il y en a ;
  // les exemples complètent jusqu'à cinq propositions.
  const frequentTexts = new Set(frequent.map((f) => f.question));
  const examples = SUGGESTIONS.filter((s) => !frequentTexts.has(s)).slice(
    0,
    Math.max(0, 5 - frequent.length)
  );
  const recentOnly = recent.filter((q) => !frequentTexts.has(q));

  return (
    <div className="chat">
      <div className="chat-thread">
        {messages.length === 0 && (
          <div className="chat-empty">
            {frequent.length > 0 && (
              <>
                <div className="card-label" style={{ border: "none", padding: 0 }}>
                  Questions les plus posées
                </div>
                <div className="chat-suggestions">
                  {frequent.map((f) => (
                    <button
                      key={f.question}
                      className="chat-chip"
                      onClick={() => ask(f.question)}
                      title={`Posée ${f.count} fois`}
                    >
                      {f.question}
                      {f.count > 1 && <span className="chat-chip-count">×{f.count}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            {recentOnly.length > 0 && (
              <>
                <div className="card-label" style={{ border: "none", padding: 0, marginTop: 18 }}>
                  Dernières questions posées
                </div>
                <div className="chat-suggestions">
                  {recentOnly.map((q) => (
                    <button key={q} className="chat-chip" onClick={() => ask(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}
            {examples.length > 0 && (
              <>
                <div
                  className="card-label"
                  style={{ border: "none", padding: 0, marginTop: frequent.length ? 18 : 0 }}
                >
                  {frequent.length ? "Autres exemples" : "Exemples de questions"}
                </div>
                <div className="chat-suggestions">
                  {examples.map((s) => (
                    <button key={s} className="chat-chip" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {messages.map((m) => {
          const toolsUsed = [
            ...new Set(
              m.parts
                .map((p) => TOOL_LABELS[p.type])
                .filter((v): v is string => !!v)
            ),
          ];
          return (
            <div key={m.id} className={`chat-msg ${m.role}`}>
              {m.role === "assistant" && toolsUsed.length > 0 && (
                <div className="chat-tools">
                  {toolsUsed.map((t) => (
                    <span key={t} className="tag blue">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="chat-bubble">
                {m.parts.map((p, i) =>
                  p.type === "text" ? (
                    <div key={i} className="chat-md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {p.text}
                      </ReactMarkdown>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          );
        })}

        {busy && messages.at(-1)?.role !== "assistant" && (
          <div className="chat-msg assistant">
            <div className="chat-bubble chat-typing">Consultation des données…</div>
          </div>
        )}
        {error && (
          <div className="alert neg" style={{ marginTop: 8 }}>
            <div className="alert-ico">✕</div>
            <div>
              <div className="alert-title">L&apos;assistant n&apos;a pas pu répondre</div>
              <div className="alert-desc">Réessayez. Si le problème persiste, contactez Vision BDS.</div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {messages.length > 0 && frequent.length > 0 && (
        <div className="chat-quick" aria-label="Questions les plus posées">
          {frequent.slice(0, 4).map((f) => (
            <button
              key={f.question}
              className="chat-chip chat-chip-sm"
              onClick={() => ask(f.question)}
              disabled={busy}
              title={`Posée ${f.count} fois`}
            >
              {f.question}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat-inputbar"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          className="field-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Posez votre question, ex. « quel était le CA d'avril vs octobre ? »"
          disabled={busy}
        />
        <button type="submit" className="btn" disabled={busy || !input.trim()}>
          {busy ? "…" : "Envoyer"}
        </button>
      </form>
    </div>
  );
}
