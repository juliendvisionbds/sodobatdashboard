"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type {
  AnalyseDetail,
  AnalyseFigures,
  ChantierSignal,
  ObjectifAnalyse,
  Redaction,
  Variation,
} from "@/lib/analyse-mensuelle";
import { STATUT_CLASS } from "@/lib/objectifs";
import { fmtEurAuto, fmtPct, monthLabelLong } from "@/lib/format";
import {
  enregistrerAnalyseAction,
  genererAnalyseAction,
  publierAnalyseAction,
} from "./actions";

// Analyses mensuelles de performance : lancées par la DAF sur un mois validé,
// listées sous le tableau des objectifs. Un clic sur une ligne ouvre l'analyse
// détaillée ; l'adresse (?analyse=AAAA-MM) permet d'envoyer le lien d'un mois.

// Un montant ou un taux ne se coupe pas entre le nombre et son unité : dans une
// carte étroite, « 401 k€ » partait sinon sur deux lignes.
const nb = (s: string) => s.replace(/ /g, "\u00A0");
const eur = (n: number) => nb(fmtEurAuto(n));
const pct = (n: number | null) => nb(fmtPct(n));

const toParam = (period: string) => period.slice(0, 7);
const fromParam = (p: string | null) => (p && /^\d{4}-\d{2}$/.test(p) ? `${p}-01` : null);

function signed(n: number | null, unit = "\u00A0%") {
  if (n == null) return "-";
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}${unit}`;
}

function signedEur(n: number | null) {
  if (n == null) return "-";
  return `${n > 0 ? "+" : ""}${eur(n)}`;
}

function StatusTag({ a }: { a: Pick<AnalyseDetail, "status" | "caduque"> }) {
  if (a.caduque) return <span className="tag gray">Caduque</span>;
  return a.status === "published" ? (
    <span className="tag green">Publiée</span>
  ) : (
    <span className="tag amber">Brouillon</span>
  );
}

export default function AnalysesMensuelles({
  analyses,
  moisAnalysables,
  canEdit,
  initialPeriod,
}: {
  analyses: AnalyseDetail[];
  moisAnalysables: string[];
  canEdit: boolean;
  initialPeriod: string | null;
}) {
  const [open, setOpen] = useState<string | null>(
    initialPeriod && analyses.some((a) => a.period === initialPeriod) ? initialPeriod : null
  );

  // L'analyse ouverte se lit dans l'adresse, pour partager le lien d'un mois.
  const show = useCallback((period: string | null) => {
    setOpen(period);
    const url = new URL(window.location.href);
    if (period) url.searchParams.set("analyse", toParam(period));
    else url.searchParams.delete("analyse");
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const onPop = () => setOpen(fromParam(new URL(window.location.href).searchParams.get("analyse")));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const current = analyses.find((a) => a.period === open) ?? null;

  return (
    <section className="am-section">
      <div className="am-section-head">
        <div>
          <h2>Analyses mensuelles</h2>
          <p>
            Performance du mois au regard des objectifs : fortes variations, charges face au CA,
            chantiers à regarder. Une analyse par mois validé par la DAF.
          </p>
        </div>
        {canEdit && (
          <Launcher
            moisAnalysables={moisAnalysables}
            analysed={new Set(analyses.map((a) => a.period))}
            onDone={show}
          />
        )}
      </div>

      {analyses.length === 0 ? (
        <div className="am-empty">
          {canEdit
            ? moisAnalysables.length
              ? "Aucune analyse pour l'instant. Choisissez un mois validé et lancez la première."
              : "Aucun mois validé pour l'instant : la DAF valide le mois depuis la vue Chantiers, puis lance son analyse ici."
            : "Aucune analyse publiée pour l'instant."}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="ct am-history">
            <thead>
              <tr>
                <th className="left">Mois</th>
                <th className="left">Statut</th>
                <th>CA du mois</th>
                <th className="pct-col">Marge expl. cumulée</th>
                <th>Objectifs en mauvais</th>
                <th>Alertes</th>
                <th className="left">Publiée / générée</th>
                <th aria-label="Ouvrir" />
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => (
                <tr
                  key={a.period}
                  className="am-row"
                  tabIndex={0}
                  onClick={() => show(a.period)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      show(a.period);
                    }
                  }}
                >
                  <td className="label-cell">{monthLabelLong(a.period)}</td>
                  <td className="left">
                    <StatusTag a={a} />
                  </td>
                  <td>{eur(a.caMois)}</td>
                  <td className="pct-col">
                    <span className={a.margeCumul != null && a.margeCumul < 0 ? "neg" : undefined}>
                      {pct(a.margeCumul)}
                    </span>
                  </td>
                  <td>
                    {a.objectifsMauvais ? (
                      <span className="tag red">{a.objectifsMauvais}</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                  <td>
                    {a.alertes ? (
                      <span className="tag amber">{a.alertes}</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                  <td className="left muted">
                    {a.publishedAt
                      ? `Publiée le ${a.publishedAt}`
                      : `Générée le ${a.generatedAt} par ${a.generatedBy}`}
                  </td>
                  <td className="am-open">Ouvrir ›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {current && (
        <AnalyseModal
          key={current.period}
          a={current}
          canEdit={canEdit}
          prev={analyses[analyses.indexOf(current) + 1]?.period ?? null}
          next={analyses[analyses.indexOf(current) - 1]?.period ?? null}
          onNavigate={show}
          onClose={() => show(null)}
        />
      )}
    </section>
  );
}

// ── Lancement ────────────────────────────────────────────────────────────────

function Launcher({
  moisAnalysables,
  analysed,
  onDone,
}: {
  moisAnalysables: string[];
  analysed: Set<string>;
  onDone: (period: string) => void;
}) {
  const [period, setPeriod] = useState(moisAnalysables[0] ?? "");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "warning"; text: string } | null>(null);

  if (!moisAnalysables.length) return null;
  const relance = analysed.has(period);

  const run = () => {
    setMessage(null);
    start(async () => {
      const r = await genererAnalyseAction(period);
      if (!r.ok) setMessage({ kind: "error", text: r.error });
      else {
        if (r.warning) setMessage({ kind: "warning", text: r.warning });
        onDone(period);
      }
    });
  };

  return (
    <div className="am-launcher">
      <div className="am-launcher-row">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          disabled={pending}
          aria-label="Mois à analyser"
        >
          {moisAnalysables.map((m) => (
            <option key={m} value={m}>
              {monthLabelLong(m)}
              {analysed.has(m) ? " · déjà analysé" : ""}
            </option>
          ))}
        </select>
        <button className="btn" onClick={run} disabled={pending}>
          {pending && <span className="am-spinner" aria-hidden />}
          {pending ? "Analyse en cours…" : relance ? "Relancer l'analyse" : "Analyser le mois"}
        </button>
      </div>
      {pending && <div className="am-launcher-note">Calcul des chiffres puis rédaction : 20 à 40 secondes.</div>}
      {!pending && relance && (
        <div className="am-launcher-note">Relancer remplace le texte et repasse l&apos;analyse en brouillon.</div>
      )}
      {message && <div className={`am-launcher-msg ${message.kind}`}>{message.text}</div>}
    </div>
  );
}

// ── Analyse détaillée ────────────────────────────────────────────────────────

const noop = () => () => {};

function AnalyseModal({
  a,
  canEdit,
  prev,
  next,
  onNavigate,
  onClose,
}: {
  a: AnalyseDetail;
  canEdit: boolean;
  prev: string | null;
  next: string | null;
  onNavigate: (p: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Le portail vise document.body : rendu côté navigateur seulement (une
  // analyse ouverte par le lien arrive aussi au rendu serveur).
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const f = a.figures;

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && prev) onNavigate(prev);
      else if (e.key === "ArrowRight" && next) onNavigate(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, prev, next, onClose, onNavigate]);

  const print = () => {
    document.documentElement.classList.add("am-print");
    const done = () => {
      document.documentElement.classList.remove("am-print");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };

  if (!mounted) return null;

  return createPortal(
    <div className="am-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="am-modal" role="dialog" aria-modal="true" aria-labelledby="am-title">
        <header className="am-head">
          <div className="am-head-main">
            <div className="am-title-row">
              <h2 id="am-title">Analyse · {monthLabelLong(a.period)}</h2>
              <StatusTag a={a} />
            </div>
            <div className="am-meta">
              Mois validé par {f.fiabilite.valideePar} le {f.fiabilite.valideeLe} · générée le{" "}
              {a.generatedAt} par {a.generatedBy}
              {a.publishedAt && ` · publiée le ${a.publishedAt}`}
            </div>
          </div>
          <div className="am-head-nav">
            <IconButton label="Mois précédent" disabled={!prev} onClick={() => prev && onNavigate(prev)}>
              <path d="M15 18l-6-6 6-6" />
            </IconButton>
            <IconButton label="Mois suivant" disabled={!next} onClick={() => next && onNavigate(next)}>
              <path d="M9 18l6-6-6-6" />
            </IconButton>
            <IconButton label="Fermer" onClick={onClose}>
              <path d="M18 6L6 18M6 6l12 12" />
            </IconButton>
          </div>
        </header>

        <div className="am-body">
          {a.caduque && (
            <div className="am-banner">
              Cette analyse est caduque : le mois a été rouvert ou sa balance analytique réimportée
              depuis. Les chiffres ci-dessous ne sont plus ceux de l&apos;application.
            </div>
          )}

          <Kpis f={f} />

          {editing ? (
            <EditRedaction a={a} onDone={() => setEditing(false)} />
          ) : (
            <RedactionView a={a} />
          )}

          <div className="am-cols">
            <div className="am-col">
              <Alertes f={f} />
              <Ciseau f={f} />
            </div>
            <div className="am-col">
              <Objectifs f={f} />
              <FraisGeneraux f={f} />
            </div>
          </div>
          <Chantiers f={f} />
        </div>

        <footer className="am-foot">
          <Fiabilite f={f} />
          <div className="am-foot-actions">
            <button className="btn secondary am-sm" onClick={print}>
              Imprimer
            </button>
            {canEdit && !editing && <DafActions a={a} onEdit={() => setEditing(true)} />}
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className="am-icon" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function DafActions({ a, onEdit }: { a: AnalyseDetail; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Action impossible.");
    });
  };
  return (
    <>
      {error && <span className="am-foot-error">{error}</span>}
      <button className="btn secondary am-sm" onClick={onEdit} disabled={pending}>
        Modifier le texte
      </button>
      <button
        className="btn secondary am-sm"
        disabled={pending}
        onClick={() => run(() => genererAnalyseAction(a.period))}
      >
        {pending ? "…" : "Relancer"}
      </button>
      {a.status === "published" ? (
        <button
          className="btn secondary am-sm"
          disabled={pending}
          onClick={() => run(() => publierAnalyseAction(a.period, false))}
        >
          Repasser en brouillon
        </button>
      ) : (
        <button
          className="btn am-sm"
          disabled={pending || a.caduque}
          title={a.caduque ? "Relancez d'abord l'analyse" : "Rendre l'analyse visible des dirigeants"}
          onClick={() => run(() => publierAnalyseAction(a.period, true))}
        >
          Publier
        </button>
      )}
    </>
  );
}

// ── Blocs ────────────────────────────────────────────────────────────────────

function Kpis({ f }: { f: AnalyseFigures }) {
  const x = f.flash;
  const o = f.objectifs;
  const deltaMarge =
    x.margeCumul != null && x.margeCumulPrecedente != null ? x.margeCumul - x.margeCumulPrecedente : null;
  return (
    <div className="am-kpis">
      <Kpi label="CA du mois" value={eur(x.caMois)} sub={vsN1(x.caMois, x.caMoisN1)} />
      <Kpi label="CA cumulé" value={eur(x.caCumul)} sub={vsN1(x.caCumul, x.caCumulN1)} />
      <Kpi
        label="Marge expl. cumulée"
        value={pct(x.margeCumul)}
        sub={
          deltaMarge == null
            ? { text: `mois seul : ${pct(x.margeMois)}` }
            : {
                text: `${deltaMarge >= 0 ? "+" : "−"}${pct(Math.abs(deltaMarge)).replace("%", "pt")} sur le mois`,
                tone: deltaMarge >= 0 ? "pos" : "neg",
              }
        }
      />
      <Kpi
        label="Objectifs tenus"
        value={o.renseignes ? `${o.tenus} / ${o.renseignes}` : "-"}
        sub={
          o.renseignes
            ? {
                text: `${o.mauvais} en mauvais · ${o.surveiller} à surveiller`,
                tone: o.mauvais ? "neg" : o.surveiller ? "warn" : "pos",
              }
            : { text: "aucun objectif saisi" }
        }
      />
    </div>
  );
}

function vsN1(v: number, n1: number | null): { text: string; tone?: "pos" | "neg" } {
  if (n1 == null || n1 === 0) return { text: "N-1 indisponible" };
  const e = ((v - n1) / Math.abs(n1)) * 100;
  return { text: `${signed(e)} vs N-1`, tone: e >= 0 ? "pos" : "neg" };
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: { text: string; tone?: "pos" | "neg" | "warn" };
}) {
  return (
    <div className="am-kpi">
      <div className="am-kpi-label">{label}</div>
      <div className="am-kpi-value">{value}</div>
      <div className={`am-kpi-sub ${sub.tone ?? ""}`}>{sub.text}</div>
    </div>
  );
}

function RedactionView({ a }: { a: AnalyseDetail }) {
  const r = a.redaction;
  const actions = r?.actions ?? [];
  // Le constat se lit à gauche, ce qu'il appelle à droite ; sans action ni
  // commentaire, le texte prend toute la largeur.
  const aside = actions.length > 0 || !!a.commentaire;
  return (
    <div className={`am-synth${aside ? "" : " solo"}`}>
      <section className="am-card am-read">
        <div className="am-brief">
          <div className="am-label">En bref</div>
          {r?.enBref ? (
            <p className="am-brief-text">
              <Chiffres text={r.enBref} />
            </p>
          ) : (
            <p className="am-brief-text muted">
              Le texte n&apos;a pas été rédigé. Les chiffres ci-dessous sont complets ; relancez
              l&apos;analyse pour obtenir la synthèse.
            </p>
          )}
        </div>
        {r && <Points title="Points forts" tone="pos" items={r.pointsForts} />}
        {r && <Points title="Points d'attention" tone="neg" items={r.pointsAttention} />}
        {a.model && (
          <div className="am-ai-note">
            Texte rédigé par l&apos;IA à partir des chiffres de l&apos;analyse, relu par la DAF.
          </div>
        )}
      </section>
      {aside && (
        <div className="am-col">
          {actions.length > 0 && <Actions items={actions} />}
          {a.commentaire && (
            <section className="am-card am-comment">
              <div className="am-label">Commentaire de la DAF</div>
              <p>{a.commentaire}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// Montants et pourcentages du texte rédigé (« 711 k€ », « −48,2 % ») : mis en
// valeur pour que l'œil les retrouve, et jamais coupés de leur unité en fin de
// ligne. Le premier groupe est le caractère qui précède, laissé tel quel.
const CHIFFRE =
  /(^|[^\w.,])([+−–-]?(?:\d{1,3}(?:[\s\u00A0\u202F]\d{3})+|\d+)(?:[.,]\d+)?[\s\u00A0\u202F]?(?:k€|M€|€|%|points?\b|pts?\b))/g;

function Chiffres({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CHIFFRE)) {
    const at = m.index + m[1].length;
    parts.push(text.slice(last, at));
    parts.push(
      <b key={at} className="am-num">
        {m[2]}
      </b>
    );
    last = at + m[2].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function Points({ title, tone, items }: { title: string; tone: "pos" | "neg"; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className={`am-pts ${tone}`}>
      <h3 className="am-pts-title">{title}</h3>
      <ul>
        {items.map((t, i) => (
          <li key={i}>
            <Chiffres text={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** « DAF : vérifier… » → qui s'en charge, puis quoi ; sinon l'action telle quelle. */
function quiFaitQuoi(action: string): [string | null, string] {
  const m = action.match(/^([^:\d]{2,48}?)\s*:\s+(\S[\s\S]*)$/);
  return m ? [m[1].trim(), m[2]] : [null, action];
}

function Actions({ items }: { items: string[] }) {
  return (
    <section className="am-card am-actions">
      <div className="am-label">Actions suggérées</div>
      <ol>
        {items.map((t, i) => {
          const [qui, quoi] = quiFaitQuoi(t);
          return (
            <li key={i}>
              <span className="am-action-n" aria-hidden>
                {i + 1}
              </span>
              <span className="am-action-body">
                {qui && <span className="am-action-who">{qui}</span>}
                <span className="am-action-what">
                  <Chiffres text={quoi} />
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function EditRedaction({ a, onDone }: { a: AnalyseDetail; onDone: () => void }) {
  const r = a.redaction ?? { enBref: "", pointsForts: [], pointsAttention: [], actions: [] };
  const [enBref, setEnBref] = useState(r.enBref);
  const [forts, setForts] = useState(r.pointsForts.join("\n"));
  const [attention, setAttention] = useState(r.pointsAttention.join("\n"));
  const [actions, setActions] = useState(r.actions.join("\n"));
  const [commentaire, setCommentaire] = useState(a.commentaire ?? "");
  const [pending, start] = useTransition();
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

  const save = () =>
    start(async () => {
      const redaction: Redaction = {
        enBref,
        pointsForts: lines(forts),
        pointsAttention: lines(attention),
        actions: lines(actions),
      };
      const res = await enregistrerAnalyseAction(a.period, redaction, commentaire);
      if (res.ok) onDone();
    });

  return (
    <div className="am-synth am-edit">
      <section className="am-card">
        <label>
          <span className="am-label">En bref</span>
          <textarea rows={4} value={enBref} onChange={(e) => setEnBref(e.target.value)} />
        </label>
        <label>
          <span className="am-label">Points forts · un par ligne</span>
          <textarea rows={5} value={forts} onChange={(e) => setForts(e.target.value)} />
        </label>
        <label>
          <span className="am-label">Points d&apos;attention · un par ligne</span>
          <textarea rows={8} value={attention} onChange={(e) => setAttention(e.target.value)} />
        </label>
      </section>
      <section className="am-card">
        <label>
          <span className="am-label">Actions suggérées · une par ligne</span>
          <textarea rows={9} value={actions} onChange={(e) => setActions(e.target.value)} />
        </label>
        <label>
          <span className="am-label">Commentaire de la DAF</span>
          <textarea
            rows={5}
            value={commentaire}
            placeholder="Contexte que les chiffres ne disent pas : retard de facturation connu, chantier exceptionnel…"
            onChange={(e) => setCommentaire(e.target.value)}
          />
        </label>
        <div className="am-edit-actions">
          <button className="btn secondary am-sm" onClick={onDone} disabled={pending}>
            Annuler
          </button>
          <button className="btn am-sm" onClick={save} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Section({
  title,
  count,
  countTone,
  hint,
  aside,
  children,
}: {
  title: string;
  count?: number;
  countTone?: "red" | "amber";
  /** précision de lecture, à la suite du titre */
  hint?: string;
  /** lien ou repère calé à droite du titre */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="am-card">
      <div className="am-card-head">
        <h3>
          {title}
          {count != null && <span className={`am-count ${count ? (countTone ?? "") : ""}`}>{count}</span>}
        </h3>
        {hint && <span className="am-card-hint">{hint}</span>}
        {aside && <span className="am-card-aside">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function refLabel(f: AnalyseFigures) {
  if (!f.moisReference.length) return "";
  return `moyenne ${f.moisReference.map((m) => monthLabelLong(m).split(" ")[0].toLowerCase()).join(", ")}`;
}

function Alertes({ f }: { f: AnalyseFigures }) {
  const vs = f.variations;
  return (
    <Section
      title="Alertes du mois"
      count={vs.length}
      countTone={vs.some((v) => v.niveau === "critique") ? "red" : "amber"}
    >
      {f.moisReference.length < 2 ? (
        <p className="am-muted">Pas assez de mois antérieurs pour comparer.</p>
      ) : vs.length === 0 ? (
        <p className="am-muted">
          Aucune variation au-delà des seuils ({refLabel(f)}). Seuils : +{f.seuils.alerte.pct}&nbsp;% et{" "}
          {eur(f.seuils.alerte.eur)} au moins.
        </p>
      ) : (
        <>
          <ul className="am-alerts">
            {vs.map((v) => (
              <AlerteRow key={v.code} v={v} />
            ))}
          </ul>
          <p className="am-foot-note">
            Mois comparé à la {refLabel(f)}. Alerte : écart d&apos;au moins {f.seuils.alerte.pct}&nbsp;% et{" "}
            {eur(f.seuils.alerte.eur)} ; critique : {f.seuils.critique.pct}&nbsp;% et{" "}
            {eur(f.seuils.critique.eur)}.
          </p>
        </>
      )}
    </Section>
  );
}

function AlerteRow({ v }: { v: Variation }) {
  const tone = v.niveau === "critique" ? "red" : "amber";
  return (
    <li className="am-alert">
      <span className={`am-dot ${tone}`} aria-hidden />
      <span className="am-alert-label">
        {v.label}
        <span className="am-alert-sub">
          {v.sens === "absent"
            ? `à zéro ce mois, ${eur(v.reference)} d'habitude : écriture oubliée ?`
            : `${eur(v.mois)} contre ${eur(v.reference)} en moyenne`}
          {v.n1 != null && v.sens !== "absent" && ` · N-1 : ${eur(v.n1)}`}
        </span>
      </span>
      <span className="am-alert-delta">{signedEur(v.ecart)}</span>
      <span className={`tag ${tone}`}>{v.sens === "absent" ? "absent" : signed(v.ecartPct)}</span>
    </li>
  );
}

function Ciseau({ f }: { f: AnalyseFigures }) {
  const c = f.ciseau;
  const scale = Math.max(20, Math.abs(c.chargesEvolPct ?? 0), Math.abs(c.caEvolPct ?? 0));
  return (
    <Section title="Charges directes face au CA">
      {c.signal ? (
        <div className="am-callout">
          <b>{c.signal === "ciseau" ? "Effet ciseau." : "Marge du mois en recul."}</b>{" "}
          <Chiffres text={c.lectures.join(" ")} />
        </div>
      ) : (
        <div className="am-callout ok">Charges et CA évoluent de concert ce mois-ci.</div>
      )}
      <div className="am-bars">
        <Diverging label="Charges directes" value={c.chargesEvolPct} scale={scale} bad={(c.chargesEvolPct ?? 0) > 0} />
        <Diverging label="CA" value={c.caEvolPct} scale={scale} bad={(c.caEvolPct ?? 0) < 0} />
        <Diverging label="dont facturation" value={c.facturationEvolPct} scale={scale} bad={(c.facturationEvolPct ?? 0) < 0} light />
        <div className="am-bars-caption">évolution du mois par rapport à la {refLabel(f)}</div>
      </div>
      <div className="am-rates">
        <div className="am-rate-row">
          <Rate label="Taux du mois" value={c.tauxMois} strong />
          <Rate label="Cumul" value={c.tauxCumul} />
          <Rate label="Cumul N-1" value={c.tauxCumulN1} />
        </div>
        <div className="am-small">
          Charges d&apos;exploitation et de personnel en % du CA. Prévision (TEC) du mois :{" "}
          <b>{eur(c.provisionMois)}</b>
          {c.annulationMois !== 0 && `, reprise de M-1 : ${eur(c.annulationMois)}`}.
        </div>
      </div>
    </Section>
  );
}

function Diverging({
  label,
  value,
  scale,
  bad,
  light,
}: {
  label: string;
  value: number | null;
  scale: number;
  bad: boolean;
  light?: boolean;
}) {
  const w = value == null ? 0 : Math.min(50, (Math.abs(value) / scale) * 50);
  return (
    <div className={`am-div ${light ? "light" : ""}`}>
      <span className="am-div-label">{label}</span>
      <span className="am-div-track">
        <span className="am-div-axis" />
        <span
          className={`am-div-bar ${bad ? "bad" : "good"}`}
          style={value != null && value < 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }}
        />
      </span>
      <span className={`am-div-value ${bad ? "neg" : "pos"}`}>{signed(value)}</span>
    </div>
  );
}

function Rate({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div className={`am-rate ${strong ? "strong" : ""}`}>
      <div className="am-rate-value">{pct(value)}</div>
      <div className="am-rate-label">{label}</div>
    </div>
  );
}

const ORDRE_STATUT: Record<string, number> = { MAUVAIS: 0, "À SURVEILLER": 1, BIEN: 2, BON: 3 };

function Objectifs({ f }: { f: AnalyseFigures }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(
    () =>
      [...f.objectifs.rows].sort(
        (a, b) => (ORDRE_STATUT[a.statut ?? ""] ?? 4) - (ORDRE_STATUT[b.statut ?? ""] ?? 4)
      ),
    [f]
  );
  const enDerive = rows.filter((r) => r.statut === "MAUVAIS" || r.statut === "À SURVEILLER");
  const visibles = all ? rows : enDerive.length ? enDerive : rows.slice(0, 4);
  const scale = Math.max(
    1,
    ...rows.flatMap((r) => [r.realiseCumul ?? 0, r.objectif ?? 0, r.realiseMois ?? 0])
  ) * 1.1;

  return (
    <Section title="Objectifs de Fred" hint="réalisé cumulé face à l'objectif">
      {f.objectifs.renseignes === 0 ? (
        <p className="am-muted">Aucun objectif annuel saisi : les statuts ne peuvent pas être calculés.</p>
      ) : null}
      <ul className="am-obj">
        {visibles.map((r) => (
          <ObjectifRow key={r.key} r={r} scale={scale} />
        ))}
      </ul>
      <div className="am-obj-foot">
        <span className="am-legend">
          <span className="am-legend-mark" /> objectif · <span className="am-legend-dot" /> mois seul
        </span>
        {rows.length > visibles.length || all ? (
          <button className="am-link" onClick={() => setAll(!all)}>
            {all ? "Ne montrer que les indicateurs en dérive" : `Voir les ${rows.length - visibles.length} autres indicateurs`}
          </button>
        ) : null}
      </div>
    </Section>
  );
}

function ObjectifRow({ r, scale }: { r: ObjectifAnalyse; scale: number }) {
  const tone = r.statut ? STATUT_CLASS[r.statut] : "gray";
  const change = r.statutPrecedent && r.statut && r.statutPrecedent !== r.statut;
  const pos = (v: number) => `${Math.min(100, (Math.max(0, v) / scale) * 100)}%`;
  return (
    <li className="am-obj-row">
      <span className="am-obj-label" title={r.label}>
        {r.label}
        {change && (
          <span className="am-obj-change">
            était {r.statutPrecedent?.toLowerCase()} fin du mois précédent
          </span>
        )}
      </span>
      <span className="am-obj-track">
        {r.realiseCumul != null && <span className={`am-obj-bar ${tone}`} style={{ width: pos(r.realiseCumul) }} />}
        {r.objectif != null && <span className="am-obj-target" style={{ left: pos(r.objectif) }} />}
        {r.realiseMois != null && (
          <span
            className="am-obj-month"
            style={{ left: pos(r.realiseMois) }}
            title={`Mois seul : ${pct(r.realiseMois)}`}
          />
        )}
      </span>
      <span className="am-obj-values">
        <b>{pct(r.realiseCumul)}</b>{" "}
        <span className="muted">/ {r.objectif == null ? "-" : pct(r.objectif)}</span>
      </span>
      <span className="am-obj-status">
        {r.statut ? <span className={`tag ${tone}`}>{r.statut}</span> : <span className="muted">-</span>}
      </span>
    </li>
  );
}

function Chantiers({ f }: { f: AnalyseFigures }) {
  const c = f.chantiers;
  const mois = `/chantiers?mois=${f.period}`;
  if (!c.disponible)
    return (
      <Section title="Chantiers à regarder">
        <p className="am-muted">Pas de balance analytique pour ce mois : le détail par chantier manque.</p>
      </Section>
    );
  const empty = !c.sansFacturation.length && !c.resultatsNegatifs.length;
  return (
    <Section
      title="Chantiers à regarder"
      hint={`sur ${c.mouvementes} chantiers mouvementés`}
      aside={
        <Link href={mois} className="am-link">
          Ouvrir la vue Chantiers de {monthLabelLong(f.period).toLowerCase()} ›
        </Link>
      }
    >
      {empty ? (
        <p className="am-muted">Aucun chantier sans facturation ni résultat négatif ce mois.</p>
      ) : (
        <div className="am-chantiers">
          <div>
            <div className="am-sub-title">
              Charges sans facturation ni prévision <span className="muted">· au moins {eur(f.seuils.chantierCharges)}</span>
            </div>
            {c.sansFacturation.length > 0 ? (
              <ul className="am-list">
                {c.sansFacturation.map((s) => (
                  <li key={s.code}>
                    <span className="am-ch-name">
                      <span className="am-ch-line">
                        <span className="am-ch-code">{s.code}</span> {s.label}
                      </span>
                    </span>
                    <span>{eur(s.chargesMois)} de charges</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="am-muted">Aucun chantier dans ce cas ce mois.</p>
            )}
          </div>
          <div>
            <div className="am-sub-title">Résultat du mois négatif</div>
            {c.resultatsNegatifs.length > 0 ? (
              <ul className="am-list">
                {c.resultatsNegatifs.map((s) => (
                  <li key={s.code}>
                    <span className="am-ch-name">
                      <span className="am-ch-line">
                        <span className="am-ch-code">{s.code}</span> {s.label}
                      </span>
                      {repriseDominante(s) && (
                        <span className="am-ch-sub">
                          reprise de la prévision M-1 : {eur(s.annulationMois)}
                        </span>
                      )}
                    </span>
                    <span className="neg">{eur(s.resultatMois)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="am-muted">Aucun chantier au résultat négatif ce mois.</p>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

/** Le résultat négatif vient surtout de la reprise de la prévision du mois précédent. */
const repriseDominante = (s: ChantierSignal) =>
  s.annulationMois < 0 && Math.abs(s.annulationMois) >= Math.abs(s.resultatMois) / 2;

function FraisGeneraux({ f }: { f: AnalyseFigures }) {
  const x = f.fraisGeneraux;
  const bad = (x.evolPct ?? 0) >= f.seuils.alerte.pct;
  return (
    <Section title="Frais généraux">
      <div className="am-fx">
        <span>
          <b className="am-fx-value">{eur(x.mois)}</b> ce mois
          {x.reference != null && (
            <>
              {" "}contre {eur(x.reference)} en moyenne{" "}
              <span className={bad ? "neg" : "muted"}>({signed(x.evolPct)})</span>
            </>
          )}
        </span>
        <span className="muted">
          {pct(x.pctCaMois)} du CA du mois · {pct(x.pctCaCumul)} en cumul
        </span>
      </div>
    </Section>
  );
}

function Fiabilite({ f }: { f: AnalyseFigures }) {
  const x = f.fiabilite;
  const problemes = [
    x.alertesOuvertes ? `${x.alertesOuvertes} alerte${x.alertesOuvertes > 1 ? "s" : ""} ouverte${x.alertesOuvertes > 1 ? "s" : ""}` : null,
    x.comptesNonMappes ? `${x.comptesNonMappes} compte${x.comptesNonMappes > 1 ? "s" : ""} non mappé${x.comptesNonMappes > 1 ? "s" : ""}` : null,
    !x.analytiquePresente ? "analytique absente" : null,
  ].filter(Boolean);
  const ok = problemes.length === 0;
  return (
    <div className={`am-trust ${ok ? "ok" : "warn"}`}>
      <span className="am-trust-dot" aria-hidden />
      {ok
        ? "Données fiables : mois validé, aucun compte non mappé, analytique présente"
        : `À lire avec prudence : ${problemes.join(", ")}`}
    </div>
  );
}
