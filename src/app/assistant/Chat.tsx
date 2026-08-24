"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

export default function Chat() {
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

  return (
    <div className="chat">
      <div className="chat-thread">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="card-label" style={{ border: "none", padding: 0 }}>
              Exemples de questions
            </div>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chat-chip" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
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
