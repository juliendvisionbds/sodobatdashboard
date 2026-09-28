// Outils exposés au LLM de l'assistant. Tous en lecture seule, et tous branchés
// sur le moteur de calcul des écrans (finance.ts) : un chiffre retourné ici est
// par construction identique à celui affiché dans l'app. Les ratios (% du CA,
// écarts) sont calculés ici, pas par le modèle, qui reformule.
//
// La route passe les vues mises en cache (views.ts) ; les scripts de recette,
// qui tournent hors de Next, utilisent directement finance.ts.

import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import * as finance from "./finance";
import type { Entity } from "./finance";
import { currentFiscalCutoff, splitAlerts } from "./alerts";
import { monthLabelLong } from "./format";
import { CHANTIER_CODES } from "./nomenclature/codes";

/** Fonctions de calcul utilisées par les outils : directes ou mises en cache. */
export type AssistantDataSource = {
  getSynthese: typeof finance.getSynthese;
  getChantiers: typeof finance.getChantiers;
  getFx: typeof finance.getFx;
  getFxMensuel: typeof finance.getFxMensuel;
  getObjectifs: typeof finance.getObjectifs;
  listAccounts: typeof finance.listAccounts;
  getAccountDetail: typeof finance.getAccountDetail;
  listAnalytiquePeriods: (entity: Entity) => Promise<string[]>;
  listVentileePeriods: (entity: Entity) => Promise<string[]>;
};

const DIRECT: AssistantDataSource = {
  getSynthese: finance.getSynthese,
  getChantiers: finance.getChantiers,
  getFx: finance.getFx,
  getFxMensuel: finance.getFxMensuel,
  getObjectifs: finance.getObjectifs,
  listAccounts: finance.listAccounts,
  getAccountDetail: finance.getAccountDetail,
  listAnalytiquePeriods: (e) => finance.listAnalytiquePeriods(e.id),
  listVentileePeriods: (e) => finance.listVentileePeriods(e.id),
};

const eur = (n: number) => Math.round(n); // euros entiers : suffisant pour le chat

/** Part en % avec une décimale, null si le dénominateur est nul. */
const pct = (n: number | null | undefined, base: number | null | undefined) =>
  n == null || !base ? null : Math.round((n / base) * 1000) / 10;

/** Ne garde que les mois avec données, en clés lisibles ("Novembre 2025"). */
function monthlyReadable(
  monthly: Record<string, number | null>,
  months: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of months) out[monthLabelLong(m)] = eur(monthly[m] ?? 0);
  return out;
}

/** % du CA de chaque mois, mêmes clés lisibles. */
function monthlyPct(
  monthly: Record<string, number | null>,
  ca: Record<string, number | null>,
  months: string[]
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const m of months) out[monthLabelLong(m)] = pct(monthly[m] ?? 0, ca[m]);
  return out;
}

/** Comparaison sans casse ni accents. */
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const MOIS_SCHEMA = z
  .string()
  .optional()
  .describe("Mois au format AAAA-MM (ex. 2026-03). Laisser vide pour le dernier mois importé.");

/**
 * Traduit le mois demandé ("2026-03" ou "2026-03-01") en période d'import, et
 * vérifie qu'elle existe. Renvoie une erreur lisible sinon.
 */
function resolveMois(
  mois: string | undefined,
  periods: string[]
): { period?: string; erreur?: string } {
  if (!mois) return {};
  const m = /^(\d{4})-(\d{2})/.exec(mois.trim());
  const period = m ? `${m[1]}-${m[2]}-01` : null;
  if (period && periods.includes(period)) return { period };
  return {
    erreur:
      `Mois « ${mois} » non disponible. Mois disponibles : ` +
      (periods.length ? periods.map(monthLabelLong).join(", ") : "aucun") +
      ".",
  };
}

export function buildAssistantTools(entity: Entity, src: AssistantDataSource = DIRECT) {
  return {
    synthese: tool({
      description:
        "Vue Synthèse d'un exercice : CA, charges, résultats, totaux mensuels et cumulés, " +
        "par ligne de gestion et par section, avec % du CA (par mois et en cumul) et comparaison N-1. " +
        "Source : balance générale ventilée (comptabilité). Montants en euros.",
      inputSchema: z.object({
        detail: z
          .enum(["totaux", "complet"])
          .describe(
            "'totaux' : uniquement les agrégats (CA, charges, résultats) par mois, suffisant pour la plupart des questions. " +
              "'complet' : ajoute chaque ligne de gestion (sous-traitance, intérim, masse salariale…)."
          ),
        recherche: z
          .string()
          .optional()
          .describe(
            "Avec 'complet' : ne garder que les lignes dont le libellé contient ce texte (ex. 'masse salariale', 'intérim'). Optionnel."
          ),
        exercice: z
          .number()
          .int()
          .optional()
          .describe(
            "Année de début de l'exercice (ex. 2024 pour l'exercice 2024/2025). Laisser vide pour l'exercice en cours."
          ),
      }),
      execute: async ({ detail, recherche, exercice }) => {
        const data = await src.getSynthese(entity, { fiscalYearStart: exercice });
        if (!data)
          return {
            erreur: exercice
              ? `Aucune balance ventilée validée pour l'exercice ${exercice}/${exercice + 1}.`
              : "Aucune balance ventilée validée. Aucune donnée disponible.",
          };

        const months = data.monthsWithData;
        const ca = data.caTotal.monthly;
        const agg = (v: { monthly: Record<string, number>; total: number }) => ({
          parMois: monthlyReadable(v.monthly, months),
          cumulExercice: eur(v.total),
          pctDuCaParMois: monthlyPct(v.monthly, ca, months),
          pctDuCaCumul: pct(v.total, data.caTotal.total),
        });

        const base = {
          exercice: `${data.fiscalYearStart}/${data.fiscalYearStart + 1}`,
          periode: data.period,
          dernierMoisImporte: monthLabelLong(data.period),
          moisAvecDonnees: months.map(monthLabelLong),
          caTotal: {
            parMois: monthlyReadable(ca, months),
            cumulExercice: eur(data.caTotal.total),
          },
          chargesExploitation: agg(data.totalChargesExploitation),
          chargesPersonnel: agg(data.totalChargesPersonnel),
          fraisGenerauxEtAutres: agg(data.totalFx),
          resultatExploitation: agg(data.resultatExploitation),
          resultatNet: agg(data.resultatNet),
          comparaisonN1: data.hasPrevYear
            ? {
                caExercicePrecedentMemesMois: eur(data.prevCaTotal ?? 0),
                evolutionCaPct:
                  data.prevCaTotal ? pct(data.caTotal.total - data.prevCaTotal, data.prevCaTotal) : null,
              }
            : "exercice précédent non importé, comparaison N-1 indisponible",
        };
        if (detail === "totaux") return base;

        const q = recherche ? norm(recherche) : null;
        const sections = data.sections
          .map((s) => ({
            section: s.name,
            lignes: s.rows
              .filter((r) => r.total || r.prevTotal)
              .filter((r) => !q || norm(r.category.label).includes(q))
              .map((r) => ({
                ligne: r.category.label,
                nature: r.category.kind,
                parMois: monthlyReadable(r.cells, months),
                pctDuCaParMois: monthlyPct(r.cells, ca, months),
                cumulExercice: eur(r.total ?? 0),
                pctDuCa: r.pctCa,
                cumulN1MemesMois: r.prevTotal != null ? eur(r.prevTotal) : null,
                ecartN1: r.ecart != null ? eur(r.ecart) : null,
              })),
          }))
          .filter((s) => s.lignes.length > 0);
        return {
          ...base,
          sections,
          ...(q && sections.length === 0
            ? { remarque: `Aucune ligne ne contient « ${recherche} ».` }
            : {}),
        };
      },
    }),

    chantiers: tool({
      description:
        "Activité chantier d'un mois : par chantier, facturation et résultat du mois, cumuls sur la vie du chantier, " +
        "triés du résultat du mois le plus faible au plus élevé. Avec 'recherche', ajoute le détail des postes " +
        "(travaux en cours, achats, sous-traitance…) des chantiers trouvés. " +
        "Source : balance analytique du mois (chaque fichier porte les mouvements de son mois). Montants en euros.",
      inputSchema: z.object({
        mois: MOIS_SCHEMA,
        pole: z.string().optional().describe("Filtrer sur un pôle (lettre A à F). Optionnel."),
        recherche: z
          .string()
          .optional()
          .describe(
            "Nom ou référence de chantier (ex. '1003' ou 'Vallauris'). Renvoie alors le détail des postes. Optionnel."
          ),
      }),
      execute: async ({ mois, pole, recherche }) => {
        const periods = await src.listAnalytiquePeriods(entity);
        const r = resolveMois(mois, periods);
        if (r.erreur) return { erreur: r.erreur };
        const data = await src.getChantiers(entity, { period: r.period });
        if (!data) return { erreur: "Aucune balance analytique validée. Aucune donnée chantier disponible." };

        let rows = data.rows;
        if (pole) rows = rows.filter((x) => x.pole?.toLowerCase() === pole.toLowerCase());
        if (recherche) {
          const q = norm(recherche);
          rows = rows.filter(
            (x) => norm(x.centreLabel).includes(q) || norm(x.centreCode).includes(q)
          );
        }
        const v = (x: (typeof rows)[number], code: string) => eur(x.values[code] ?? 0);
        rows = [...rows].sort(
          (a, b) => v(a, CHANTIER_CODES.resultat) - v(b, CHANTIER_CODES.resultat)
        );
        const detail = !!recherche && rows.length <= 10;

        return {
          mois: monthLabelLong(data.period),
          periode: data.period,
          nature: "activité du mois (mouvements de la balance analytique du mois)",
          ordre: "du résultat du mois le plus faible au plus élevé",
          poles: data.poles,
          nombreChantiers: rows.length,
          nombreEnPerteCeMois: rows.filter((x) => v(x, CHANTIER_CODES.resultat) < 0).length,
          chantiers: rows.map((x) => ({
            reference: x.centreCode,
            chantier: x.centreLabel,
            pole: x.pole,
            facturationMois: v(x, CHANTIER_CODES.caTotal),
            resultatMois: v(x, CHANTIER_CODES.resultat),
            margeMoisPct: pct(x.values[CHANTIER_CODES.resultat], x.values[CHANTIER_CODES.caTotal]),
            cumulFacturationChantier: v(x, CHANTIER_CODES.cumulFacturation),
            cumulResultatChantier: v(x, CHANTIER_CODES.cumulResultat),
            margeCumulPct: pct(
              x.values[CHANTIER_CODES.cumulResultat],
              x.values[CHANTIER_CODES.cumulFacturation]
            ),
            statut: x.statut === "final" ? "figé" : "brouillon",
            ...(x.note ? { note: x.note } : {}),
            // Le détail des postes n'est envoyé que pour un chantier recherché :
            // la liste complète resterait sinon très longue à lire.
            ...(detail
              ? {
                  postes: Object.fromEntries(
                    data.lines
                      .filter((l) => l.kind !== "manual" && x.values[l.code])
                      .map((l) => [l.label, eur(x.values[l.code] ?? 0)])
                  ),
                }
              : {}),
          })),
          totaux: {
            caHtTotal: eur(data.totals[CHANTIER_CODES.caTotal] ?? 0),
            chargesExploitation: eur(data.totals[CHANTIER_CODES.totalExploitation] ?? 0),
            chargesPersonnel: eur(data.totals[CHANTIER_CODES.totalPersonnel] ?? 0),
            resultatMois: eur(data.totals[CHANTIER_CODES.resultat] ?? 0),
            margeMoisPct: pct(data.totals[CHANTIER_CODES.resultat], data.totals[CHANTIER_CODES.caTotal]),
          },
          ...(recherche && !detail
            ? { remarque: "Plus de 10 chantiers trouvés : précisez la recherche pour obtenir le détail des postes." }
            : {}),
        };
      },
    }),

    historique_chantier: tool({
      description:
        "Évolution mois par mois d'un chantier : facturation, résultat du mois et cumuls, sur tous les mois importés. " +
        "Source : balances analytiques mensuelles. Montants en euros.",
      inputSchema: z.object({
        recherche: z
          .string()
          .describe("Nom ou référence du chantier (ex. '1003B' ou 'Vallauris')."),
      }),
      execute: async ({ recherche }) => {
        const periods = (await src.listAnalytiquePeriods(entity)).slice(0, 12).reverse();
        if (periods.length === 0) return { erreur: "Aucune balance analytique validée." };
        const q = norm(recherche);
        const months = await Promise.all(
          periods.map(async (p) => ({ p, data: await src.getChantiers(entity, { period: p }) }))
        );
        const matches = new Map<string, string>();
        for (const { data } of months)
          for (const x of data?.rows ?? [])
            if (norm(x.centreLabel).includes(q) || norm(x.centreCode).includes(q))
              matches.set(x.centreCode, x.centreLabel);
        if (matches.size === 0) return { erreur: `Aucun chantier ne correspond à « ${recherche} ».` };
        if (matches.size > 3)
          return {
            remarque: "Plusieurs chantiers correspondent : précisez la référence.",
            chantiers: [...matches].slice(0, 25).map(([reference, chantier]) => ({ reference, chantier })),
          };

        return {
          chantiers: [...matches].map(([code, label]) => ({
            reference: code,
            chantier: label,
            parMois: months.map(({ p, data }) => {
              const x = data?.rows.find((r) => r.centreCode === code);
              const val = (c: string) => eur(x?.values[c] ?? 0);
              return {
                mois: monthLabelLong(p),
                facturationMois: val(CHANTIER_CODES.caTotal),
                resultatMois: val(CHANTIER_CODES.resultat),
                cumulFacturationChantier: val(CHANTIER_CODES.cumulFacturation),
                cumulResultatChantier: val(CHANTIER_CODES.cumulResultat),
                ...(x ? {} : { remarque: "pas de mouvement ce mois" }),
              };
            }),
          })),
        };
      },
    }),

    frais_generaux: tool({
      description:
        "Frais généraux (centres de structure : FX, dépôt, siège) : par poste, cumul de " +
        "l'exercice à fin du mois choisi et des deux exercices précédents sur la même période, " +
        "poids en % du CA de chaque exercice et écart N/N-1. Source : balance analytique. Montants en euros.",
      inputSchema: z.object({ mois: MOIS_SCHEMA }),
      execute: async ({ mois }) => {
        const periods = await src.listAnalytiquePeriods(entity);
        const r = resolveMois(mois, periods);
        if (r.erreur) return { erreur: r.erreur };
        const data = await src.getFx(entity, { period: r.period });
        if (!data) return { erreur: "Aucune balance analytique validée. Frais généraux indisponibles." };

        const caN = data.caReference.n;
        return {
          mois: monthLabelLong(data.period),
          periode: data.period,
          nbMoisEcoules: data.nbMois,
          caReferencePourRatios: caN != null ? eur(caN) : null,
          totalCumulExercice: eur(data.totalYtd),
          totalDuMois: eur(data.totalMois),
          ratioFxSurCa: pct(data.totalYtd, caN),
          historique: {
            n1: data.sources.n1 === "absent" ? "exercice non importé" : "disponible",
            n2: data.sources.n2 === "absent" ? "exercice non importé" : "disponible",
          },
          postes: data.sections.flatMap((s) =>
            s.rows.map((x) => ({
              section: s.name,
              poste: x.category.label,
              nature: x.category.kind,
              cumulExercice: x.cells.n != null ? eur(x.cells.n) : null,
              cumulN1: x.cells.n1 != null ? eur(x.cells.n1) : null,
              cumulN2: x.cells.n2 != null ? eur(x.cells.n2) : null,
              pctDuCa: x.pct.n,
              ecartN1: x.ecart != null ? eur(x.ecart) : null,
              evolutionN1Pct: x.ecartPct != null ? Math.round(x.ecartPct * 10) / 10 : null,
            }))
          ),
        };
      },
    }),

    frais_generaux_mensuels: tool({
      description:
        "Frais généraux mois par mois sur l'exercice en cours, jusqu'au mois choisi : montant de chaque poste " +
        "chaque mois, cumul et poids du cumul dans le CA. Utile pour repérer un mois atypique. " +
        "Source : balances analytiques mensuelles. Montants en euros.",
      inputSchema: z.object({
        mois: MOIS_SCHEMA,
        recherche: z
          .string()
          .optional()
          .describe("Ne garder que les postes dont le libellé contient ce texte (ex. 'loyer'). Optionnel."),
      }),
      execute: async ({ mois, recherche }) => {
        const periods = await src.listAnalytiquePeriods(entity);
        const r = resolveMois(mois, periods);
        if (r.erreur) return { erreur: r.erreur };
        const data = await src.getFxMensuel(entity, { period: r.period });
        if (!data) return { erreur: "Aucune balance analytique validée. Frais généraux indisponibles." };

        const q = recherche ? norm(recherche) : null;
        const postes = data.sections.flatMap((s) =>
          s.rows
            .filter((x) => !q || norm(x.category.label).includes(q))
            .map((x) => ({
              section: s.name,
              poste: x.category.label,
              nature: x.category.kind,
              parMois: monthlyReadable(x.cells, data.months),
              cumul: eur(x.cells[finance.TOTAL_COLUMN] ?? 0),
              pctDuCaCumul: x.pctCumul,
            }))
        );
        return {
          mois: monthLabelLong(data.period),
          periode: data.period,
          moisCouverts: data.months.map(monthLabelLong),
          moisSansDonnees: data.missing.map(monthLabelLong),
          caParMois: monthlyReadable(data.caReference, data.months),
          postes,
          ...(q && postes.length === 0
            ? {
                remarque: `Aucun poste ne contient « ${recherche} ». Postes disponibles : ${data.sections
                  .flatMap((x) => x.rows.map((r) => r.category.label))
                  .join(", ")}.`,
              }
            : {}),
        };
      },
    }),

    objectifs: tool({
      description:
        "Objectifs de l'exercice fixés par la direction, comparés au réalisé : pour chaque indicateur " +
        "(achats, location matériel, salaires production…), montant cumulé, réalisé en % du CA, objectif en % du CA, " +
        "écart en points et statut (BON, BIEN, À SURVEILLER, MAUVAIS). Montants en euros.",
      inputSchema: z.object({ mois: MOIS_SCHEMA }),
      execute: async ({ mois }) => {
        const periods = await src.listVentileePeriods(entity);
        const r = resolveMois(mois, periods);
        if (r.erreur) return { erreur: r.erreur };
        const data = await src.getObjectifs(entity, { period: r.period });
        if (!data) return { erreur: "Aucune balance ventilée validée. Objectifs indisponibles." };
        return {
          exercice: `${data.fiscalYearStart}/${data.fiscalYearStart + 1}`,
          mois: monthLabelLong(data.period),
          periode: data.period,
          caCumul: eur(data.caTotal),
          chargesDirectesPctCa: data.chargesDirectes,
          margeExploitationPctCa: data.margeExploitation,
          indicateurs: data.rows.map((x) => ({
            indicateur: x.label,
            montantCumul: x.montant != null ? eur(x.montant) : null,
            realisePctCa: x.realise,
            objectifPctCa: x.objectif,
            ecartPoints: x.ecart,
            statut: x.statut ?? (x.objectif == null ? "objectif non saisi" : null),
            ...(x.notes ? { notes: x.notes } : {}),
          })),
        };
      },
    }),

    compte: tool({
      description:
        "Consultation d'un compte comptable (plan de comptes Cegid) : montants mois par mois sur l'exercice, " +
        "cumul, rattachement dans les vues et ventilation par chantier ou centre. Accepte un numéro de compte " +
        "(ou son début, ex. '6135') ou un libellé (ex. 'loyer'). Montants en euros.",
      inputSchema: z.object({
        recherche: z.string().describe("Numéro de compte, début de numéro ou mot du libellé."),
      }),
      execute: async ({ recherche }) => {
        const all = await src.listAccounts(entity);
        const q = norm(recherche);
        const found = /^\d+$/.test(q)
          ? all.filter((a) => a.account.startsWith(q))
          : all.filter((a) => norm(a.label).includes(q));
        if (found.length === 0) return { erreur: `Aucun compte ne correspond à « ${recherche} ».` };
        const exact = found.find((a) => a.account === q);
        if (!exact && found.length > 1)
          return {
            remarque:
              found.length > 25
                ? `${found.length} comptes correspondent, voici les 25 premiers : précisez.`
                : "Plusieurs comptes correspondent : précisez le numéro pour le détail.",
            comptes: found.slice(0, 25).map((a) => ({
              compte: a.account,
              libelle: a.label,
              cumulExercice: eur(a.total),
            })),
          };

        const [d, importedMonths] = await Promise.all([
          src.getAccountDetail(entity, (exact ?? found[0]).account),
          src.listVentileePeriods(entity),
        ]);
        if (!d) return { erreur: "Détail du compte indisponible." };
        // Les mois de l'exercice pas encore importés ne sont pas des zéros.
        const months = d.months.filter((m) => importedMonths.includes(m));
        const ventilation = [...d.ventilation]
          .sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde))
          .slice(0, 20);
        return {
          compte: d.account,
          libelle: d.label,
          exercice: `${d.fiscalYearStart}/${d.fiscalYearStart + 1}`,
          rattachement: d.postes.map((p) => ({
            vue: p.view,
            poste: p.label ?? "non rattaché",
            section: p.section,
          })),
          parMois: monthlyReadable(d.monthly, months),
          cumulExercice: eur(d.total),
          ventilationParCentre: d.analytiquePeriod
            ? {
                auMois: monthLabelLong(d.analytiquePeriod),
                principauxCentres: ventilation.map((v) => ({
                  centre: v.centreCode,
                  libelle: v.centreLabel,
                  type: v.kind,
                  soldeCumule: eur(v.solde),
                  mouvementDuMois: v.mois != null ? eur(v.mois) : null,
                })),
                ...(d.ventilation.length > ventilation.length
                  ? { remarque: `${d.ventilation.length} centres au total, les 20 plus importants sont listés.` }
                  : {}),
              }
            : "aucune balance analytique pour ventiler ce compte",
        };
      },
    }),

    validation_mois: tool({
      description:
        "État de clôture d'un mois : validé ou non par la DAF (et par qui), contrôle des prévisions de travaux " +
        "en cours saisies vs comptabilisées, résultat comptable et résultat de gestion du mois. Montants en euros.",
      inputSchema: z.object({ mois: MOIS_SCHEMA }),
      execute: async ({ mois }) => {
        const periods = await src.listAnalytiquePeriods(entity);
        const r = resolveMois(mois, periods);
        if (r.erreur) return { erreur: r.erreur };
        const period = r.period ?? periods[0];
        if (!period) return { erreur: "Aucune balance analytique validée." };
        const control = await finance.getPrevisionControl(entity, period);
        const validation = await finance.getMonthValidation(entity, control);
        return {
          mois: monthLabelLong(period),
          periode: period,
          valide: !!validation,
          ...(validation
            ? {
                validePar: validation.validatedBy,
                valideLe: validation.validatedAt,
                toujoursValable: validation.current,
                ...(validation.staleReason ? { aRevaliderCar: validation.staleReason } : {}),
              }
            : {}),
          balanceVentileeCouvreLeMois: control.ventileeCovers,
          previsions: {
            totalSaisi: eur(control.totalSaisi),
            totalComptabilise: eur(control.totalComptabilise),
            ecart: eur(control.ecart),
            chantiersAvecPrevision: control.rows.length,
            principauxEcarts: control.rows
              .filter((x) => x.ecart !== 0)
              .slice(0, 10)
              .map((x) => ({
                chantier: `${x.centreCode} ${x.centreLabel}`,
                saisie: eur(x.saisie),
                comptabilisee: eur(x.comptabilisee),
                ecart: eur(x.ecart),
              })),
          },
          resultatComptableDuMois: control.resultatComptable != null ? eur(control.resultatComptable) : null,
          resultatGestionDuMois: control.resultatGestion != null ? eur(control.resultatGestion) : null,
        };
      },
    }),

    alertes: tool({
      description:
        "Alertes de cohérence ouvertes : comptes non mappés, montants constants suspects, " +
        "mois sans données, écarts de contrôle. Montants en euros.",
      inputSchema: z.object({}),
      execute: async () => {
        const cutoff = await currentFiscalCutoff(entity.id);
        const rows = splitAlerts(
          await db
            .select()
            .from(tables.alerts)
            .where(
              and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "open"))
            )
            .orderBy(desc(tables.alerts.createdAt)),
          cutoff
        ).current.slice(0, 50);

        if (rows.length === 0) return { alertesOuvertes: 0, detail: [] };
        return {
          alertesOuvertes: rows.length,
          detail: rows.map((a) => ({
            type: a.type,
            titre: a.title,
            description: a.description,
          })),
        };
      },
    }),

    imports_disponibles: tool({
      description:
        "Mois disponibles pour chaque vue et liste des imports validés (type de balance, période, date d'import). " +
        "Utile pour savoir jusqu'à quel mois les données vont, ou si un mois manque.",
      inputSchema: z.object({}),
      execute: async () => {
        const [rows, analytique, ventilee] = await Promise.all([
          db
            .select()
            .from(tables.imports)
            .where(
              and(
                eq(tables.imports.entityId, entity.id),
                eq(tables.imports.status, "validated")
              )
            )
            .orderBy(desc(tables.imports.period)),
          src.listAnalytiquePeriods(entity),
          src.listVentileePeriods(entity),
        ]);

        return {
          moisDisponibles: {
            syntheseEtObjectifs: ventilee.map(monthLabelLong),
            chantiersEtFraisGeneraux: analytique.map(monthLabelLong),
          },
          imports: rows.map((r) => ({
            type: r.type === "ventilee" ? "balance ventilée (synthèse)" : "balance analytique (chantiers + FX)",
            periode: monthLabelLong(r.period),
            exercice: `${r.fiscalYearStart}/${r.fiscalYearStart + 1}`,
            importeLe: r.createdAt.toLocaleDateString("fr-FR"),
          })),
        };
      },
    }),
  };
}

