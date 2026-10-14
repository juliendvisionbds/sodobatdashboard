import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// Mise en page des deux documents de l'application, le Guide utilisateur et la
// Documentation détaillée : un sommaire à gauche, qui reste en vue au
// défilement, et une colonne de lecture. Pages serveur sans état ; le contenu
// rédigé est dans app/guide et app/documentation.

export type DocTocItem = { id: string; label: string };

export function DocPage({
  title,
  lead,
  updated,
  toc,
  other,
  children,
}: {
  title: string;
  lead: React.ReactNode;
  /** date de la dernière relecture du contenu, « 14 octobre 2026 » */
  updated: string;
  toc: DocTocItem[];
  /** lien vers l'autre document */
  other: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <>
      <AppHeader active="docs" />
      <div className="page">
        <div className="doc-layout">
          <nav className="doc-toc" aria-label="Sommaire">
            <div className="doc-toc-label">Sommaire</div>
            <ol>
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`}>
                    <span className="doc-toc-num">{String(i + 1).padStart(2, "0")}</span>
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
            <Link className="doc-toc-other" href={other.href}>
              {other.label} ›
            </Link>
          </nav>
          <article className="doc">
            <div className="page-header doc-header">
              <h1>{title}</h1>
              <p>{lead}</p>
              <p className="doc-updated">Mis à jour le {updated}</p>
            </div>
            {children}
          </article>
        </div>
      </div>
    </>
  );
}

/** Une partie du document ; `num` reprend sa place dans le sommaire. */
export function DocSection({
  id,
  num,
  title,
  lead,
  children,
}: {
  id: string;
  num: number;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="doc-section">
      <div className="doc-kicker">{String(num).padStart(2, "0")}</div>
      <h2>{title}</h2>
      {lead && <p className="doc-lead">{lead}</p>}
      {children}
    </section>
  );
}

/** Bloc encadré : un écran, une règle, une notion. */
export function DocBlock({
  title,
  aside,
  children,
}: {
  title?: React.ReactNode;
  /** précision calée à droite du titre (accès, source) */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="doc-block">
      {(title || aside) && (
        <div className="doc-block-head">
          {title && <h3>{title}</h3>}
          {aside && <span className="doc-block-aside">{aside}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Enchaînement d'étapes, de gauche à droite (de haut en bas sur mobile). */
export function DocFlow({ steps }: { steps: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="doc-flow">
      {steps.map((s, i) => (
        <li key={s.title} className="doc-flow-step">
          <span className="doc-flow-num">{i + 1}</span>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Marche à suivre numérotée. */
export function DocSteps({ steps }: { steps: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="doc-steps">
      {steps.map((s, i) => (
        <li key={s.title} className="doc-step">
          <span className="doc-step-num">{String(i + 1).padStart(2, "0")}</span>
          <div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Encadré de lecture : à retenir (marque), à savoir (ambre). */
export function DocNote({
  tone = "brand",
  title,
  children,
}: {
  tone?: "brand" | "warn";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`doc-note ${tone}`}>
      {title && <b>{title} </b>}
      {children}
    </div>
  );
}

/** Questions fréquentes, dépliables une à une. */
export function DocFaq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="doc-faq">
      {items.map((it) => (
        <details key={it.q}>
          <summary>{it.q}</summary>
          <div className="doc-faq-a">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
