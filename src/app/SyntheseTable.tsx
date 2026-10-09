"use client";

import { useMemo, useState, useTransition } from "react";
import type { NoteMensuelle, SyntheseData, SyntheseRow } from "@/lib/finance";
import { TOTAL_COLUMN } from "@/lib/nomenclature/columns";
import {
  SYNTHESE_CODES,
  classeEcart,
  estResultat,
  pourcentageEnAlerte,
  ratioEnAlerte,
} from "@/lib/nomenclature/codes";
import { VIDE, fmtNum, fmtPct, monthLabel } from "@/lib/format";
import { saveManualEntryAction } from "@/app/actions";

// Structure de référence : Intitulé · les 12 mois de l'exercice · Total exercice ·
// % / CA · N-1 Total · % N-1 · Écart N–N-1, soit 18 colonnes. Les mois sans données
// et les postes sans montant sont masqués par défaut (« Masquer les colonnes
// vides », « Masquer les lignes vides ») ; décocher les options restitue les
// 12 mois et toutes les lignes pour retrouver la structure complète de la maquette.
// Les montants sont en euros, l'unité est portée par l'en-tête « Intitulé (en €) ».

function pctBadge(pct: number | null, alerte = false) {
  return pct == null ? (
    <span className="muted">{VIDE}</span>
  ) : (
    <span className={`pct-badge${alerte ? " neg" : ""}`}>{fmtPct(pct)}</span>
  );
}

/** Moins de 50 centimes s'affiche « 0 » : autant le lire comme un vide, jamais « −0 ». */
const vide = (v: number | null | undefined) => v == null || Math.abs(v) < 0.5;

function money(v: number | null) {
  if (vide(v)) return <span className="muted">{VIDE}</span>;
  return fmtNum(v as number);
}

/** Un écart se lit avec son signe : « +219 280 », « −104 298 ». */
function ecart(v: number | null) {
  if (vide(v)) return <span className="muted">{VIDE}</span>;
  return `${(v as number) > 0 ? "+" : ""}${fmtNum(v as number)}`;
}

/**
 * Le rouge dit « défavorable » : dans les montants, il est réservé aux pertes
 * (un résultat négatif). Une annulation, un avoir ou un produit en déduction
 * sont négatifs par construction et se lisent à l'encre, avec leur signe.
 */
const lossClass = (code: string, v: number | null) =>
  v != null && v < 0 && estResultat(code) ? "neg" : "";

/**
 * Totaux de section et résultats : fond de ligne de total. Sous-totaux,
 * retraitements et contrôles : en gras, sans fond.
 */
const rowClass = ({ kind, code }: { kind: string; code: string }) => {
  if (kind === "total" || (kind === "computed" && estResultat(code))) return "total-row";
  if (kind === "subtotal" || kind === "computed") return "subtotal-row";
  return "";
};

/**
 * Lignes toujours affichées, même sans montant : la prévision et son annulation
 * sont le mécanisme de lecture du CA de la maquette, on doit voir qu'elles sont
 * à zéro.
 */
const LIGNES_TOUJOURS_VISIBLES = new Set<string>([
  SYNTHESE_CODES.tecProvision,
  SYNTHESE_CODES.annulation,
]);

export default function SyntheseTable({
  data,
  notes,
  canEdit,
  lockedMonths,
}: {
  data: SyntheseData;
  /** note mensuelle de l'entité, par mois */
  notes: Record<string, NoteMensuelle>;
  /** peut saisir la note (entité, DAF, admin) */
  canEdit: boolean;
  /** mois validés par la DAF : la note y est figée */
  lockedMonths: string[];
}) {
  const { moisSansAnalytique } = data;
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  // La maquette est commune au groupe : chaque entité y a des postes qu'elle
  // n'utilise pas. Ils sont masqués par défaut, jamais supprimés.
  const [hideEmpty, setHideEmpty] = useState(true);
  // Masquer les mois vides est l'affichage par défaut : en cours d'exercice, la
  // moitié des colonnes est encore à zéro.
  const [hideEmptyCols, setHideEmptyCols] = useState(true);
  // Mensuel : le mouvement de chaque mois. Cumulé : l'exercice à date à la fin de
  // chaque mois, la dernière colonne rejoignant alors le total de l'exercice.
  const [cumul, setCumul] = useState(false);
  const months = data.months;
  const filtering = section !== "" || search.trim() !== "";

  // Un mois est vide si aucune ligne n'y porte de valeur. Calculé sur l'ensemble
  // des sections, jamais sur les lignes filtrées : les colonnes ne doivent pas
  // bouger pendant qu'on tape une recherche.
  const monthsShown = useMemo(() => {
    if (!hideEmptyCols) return months;
    const kept = months.filter((m) =>
      data.sections.some((s) =>
        s.rows.some((r) => {
          const v = r.cells[m];
          return v != null && v !== 0;
        }),
      ),
    );
    return kept.length > 0 ? kept : months;
  }, [months, data.sections, hideEmptyCols]);

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.sections
      .filter((s) => !section || s.name === section)
      .map((s) => ({
        ...s,
        rows: s.rows.filter((r) => {
          // Les lignes calculées structurent le tableau : jamais masquées.
          const isStructural =
            r.category.kind !== "poste" || LIGNES_TOUJOURS_VISIBLES.has(r.category.code);
          if (hideEmpty && !isStructural && vide(r.total) && vide(r.prevTotal)) return false;
          if (!q) return true;
          return `${r.category.label} ${r.category.section}`.toLowerCase().includes(q);
        }),
      }))
      .filter((s) => s.rows.length > 0);
  }, [data.sections, section, search, hideEmpty]);

  const colCount = monthsShown.length + 6;

  return (
    <div className="card flush">
      <div className="card-head">
        <div className="card-head-group">
          <div className="card-label">Tableau de synthèse</div>
          <div className="view-switch" role="group" aria-label="Lecture des colonnes de mois">
            <button type="button" className={cumul ? undefined : "active"} onClick={() => setCumul(false)}>
              Mensuel
            </button>
            <button type="button" className={cumul ? "active" : undefined} onClick={() => setCumul(true)}>
              Cumulé
            </button>
          </div>
        </div>
        <div className="table-controls">
          <select
            className="tctl-select"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="">Toutes les sections</option>
            {data.sections.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            className="tctl-input"
            placeholder="Rechercher une ligne…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="check-chip">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />
            Masquer les lignes vides
          </label>
          <label className="check-chip">
            <input
              type="checkbox"
              checked={hideEmptyCols}
              onChange={(e) => setHideEmptyCols(e.target.checked)}
            />
            Masquer les colonnes vides
          </label>
        </div>
      </div>
      <div className="table-wrap bare">
        <table className="ct tree-ct synthese-ct">
          <thead>
            <tr>
              <th className="left">
                Intitulé <span className="th-unit">(en €)</span>
              </th>
              {monthsShown.map((m) => (
                <th
                  key={m}
                  className={data.monthsWithData.includes(m) ? "" : "muted"}
                  title={cumul ? `Cumul de l'exercice à fin ${monthLabel(m)}` : undefined}
                >
                  {cumul ? `→ ${monthLabel(m)}` : monthLabel(m)}
                </th>
              ))}
              <th className="sum-col sum-first">Total exercice</th>
              <th className="sum-col pct-col">% / CA</th>
              <th className="sum-col">N-1 Total</th>
              <th className="sum-col pct-col">% N-1</th>
              <th className="sum-col">Écart N–N-1</th>
            </tr>
          </thead>
          <tbody>
            {visibleSections.length === 0 && (
              <tr>
                <td colSpan={colCount} className="muted" style={{ textAlign: "center", padding: 20 }}>
                  Aucune ligne ne correspond au filtre.
                </td>
              </tr>
            )}
            {visibleSections.map((s) => (
              <SectionRows
                key={s.name}
                name={s.name}
                rows={s.rows}
                months={monthsShown}
                colCount={colCount}
                cumul={cumul}
                notes={notes}
                canEdit={canEdit}
                lockedMonths={lockedMonths}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-foot">
        Chiffres recalculés à la volée depuis les lignes de balance importées (aucun
        agrégat stocké). Le total N-1 est arrêté au même rang de mois que l&apos;exercice
        en cours, pour une comparaison à périmètre égal. Écart :{" "}
        <span className="pos">vert = favorable</span>, <span className="neg">rouge = défavorable</span>.
        Les charges partagées entre
        chantiers et siège (achats, locations, entretien, carburant, EDF/eau, masse
        salariale) sont découpées d&apos;après la balance analytique du mois : la part
        imputée aux centres de structure figure en frais généraux.
        {moisSansAnalytique.length > 0 &&
          ` ${moisSansAnalytique.map(monthLabel).join(", ")} : pas de balance analytique, ces charges y restent groupées sur l'exploitation.`}
        {cumul &&
          " Lecture cumulée : chaque colonne donne l'exercice à date à la fin du mois, ratios recalculés sur ce cumul."}
        {filtering && " Filtre actif : les totaux restent ceux de la section complète."}
      </p>
    </div>
  );
}

function SectionRows({
  name,
  rows,
  months,
  colCount,
  cumul,
  notes,
  canEdit,
  lockedMonths,
}: {
  name: string;
  rows: SyntheseRow[];
  months: string[];
  colCount: number;
  cumul: boolean;
  notes: Record<string, NoteMensuelle>;
  canEdit: boolean;
  lockedMonths: string[];
}) {
  return (
    <>
      <tr className="section-row">
        <td colSpan={colCount}>
          <span className="section-name">{name}</span>
        </td>
      </tr>
      {rows.map((r) => {
        if (r.category.code === SYNTHESE_CODES.notes)
          return (
            <NotesTr
              key={r.category.code}
              label={r.category.label}
              months={months}
              notes={notes}
              canEdit={canEdit}
              lockedMonths={lockedMonths}
            />
          );
        const isRatio = r.category.kind === "ratio";
        const ecartClass = classeEcart(r.category, r.ecart);
        return (
          <tr key={r.category.code} className={rowClass(r.category)}>
            <td className="label-cell" title={r.category.notes ?? undefined}>
              {r.category.label}
            </td>
            {months.map((m) => {
              const v = (cumul ? r.cumulCells : r.cells)[m] ?? null;
              if (isRatio)
                return (
                  <td key={m} className={v == null ? "muted" : ""}>
                    {pctBadge(v, ratioEnAlerte(r.category.code, v))}
                  </td>
                );
              return (
                <td key={m} className={v ? lossClass(r.category.code, v) : "muted"}>
                  {money(v)}
                </td>
              );
            })}
            {isRatio ? (
              // Le ratio de l'exercice figure déjà dans la colonne % / CA de la
              // ligne de total juste au-dessus, pour N comme pour N-1 : la ligne
              // ratio ne le répète pas. Elle garde le mois par mois et l'écart,
              // en points.
              <>
                <td className="sum-col sum-first" />
                <td className="sum-col pct-col" />
                <td className="sum-col" />
                <td className="sum-col pct-col" />
                <td className={`sum-col ${ecartClass === "muted" ? "muted" : ""}`}>
                  {pctBadge(r.ecart, ecartClass === "neg")}
                </td>
              </>
            ) : (
              <>
                <td className={`sum-col sum-first ${lossClass(r.category.code, r.total)}`}>
                  {money(r.cells[TOTAL_COLUMN] ?? r.total)}
                </td>
                <td className="sum-col pct-col">
                  {pctBadge(r.pctCa, pourcentageEnAlerte(r.category, r.pctCa))}
                </td>
                <td className={`sum-col ${r.prevTotal != null ? lossClass(r.category.code, r.prevTotal) : "muted"}`}>
                  {money(r.prevTotal)}
                </td>
                <td className="sum-col pct-col">
                  {pctBadge(r.pctPrev, pourcentageEnAlerte(r.category, r.pctPrev))}
                </td>
                <td className={`sum-col ${ecartClass}`}>{ecart(r.ecart)}</td>
              </>
            )}
          </tr>
        );
      })}
    </>
  );
}

/**
 * Note mensuelle de l'entité : une saisie par colonne de mois, au niveau de
 * l'entité (sans centre). Elle suit le verrou de la validation : un mois validé
 * par la DAF se lit, ne se modifie plus. Les colonnes de totaux restent vides,
 * une note ne se cumule pas.
 */
function NotesTr({
  label,
  months,
  notes,
  canEdit,
  lockedMonths,
}: {
  label: string;
  months: string[];
  notes: Record<string, NoteMensuelle>;
  canEdit: boolean;
  lockedMonths: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const save = (month: string, text: string) => {
    const fd = new FormData();
    fd.set("period", month);
    fd.set("field", "note");
    fd.set("valueText", text);
    fd.set("status", "draft");
    startTransition(() => {
      void saveManualEntryAction(fd);
    });
  };
  return (
    <tr style={isPending ? { opacity: 0.5 } : undefined}>
      <td className="label-cell">
        {label}
        {canEdit && <span className="manual-dot" title="Ligne saisie à la main" />}
      </td>
      {months.map((m) => {
        const note = notes[m];
        const locked = lockedMonths.includes(m);
        const trace = note?.by ? `${note.by}${note.at ? ` · ${note.at}` : ""}` : null;
        if (!canEdit || locked)
          return (
            <td
              key={m}
              className="left"
              title={[locked ? "Mois validé" : null, trace].filter(Boolean).join(" · ") || undefined}
            >
              <span className="cell-note">{note?.text ?? ""}</span>
            </td>
          );
        return (
          <td key={m} className="left">
            <input
              className="inline-num cell-note-input"
              defaultValue={note?.text ?? ""}
              placeholder="note…"
              title={trace ?? "Note du mois, visible de tous"}
              onBlur={(e) => {
                if (e.target.value !== (note?.text ?? "")) save(m, e.target.value);
              }}
            />
          </td>
        );
      })}
      <td colSpan={5} className="sum-col sum-first" />
    </tr>
  );
}
