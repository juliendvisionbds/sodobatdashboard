// Outils exposés au LLM de l'assistant. Tous en lecture seule, et tous branchés
// sur le moteur de calcul des écrans (finance.ts) : un chiffre retourné ici est
// par construction identique à celui affiché dans l'app. Le modèle ne calcule
// rien lui-même, il reformule.

import { tool } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { Entity, getChantiers, getFx, getSynthese } from "./finance";
import { monthLabelLong } from "./format";
import { CHANTIER_CODES } from "./nomenclature/codes";

const eur = (n: number) => Math.round(n); // euros entiers : suffisant pour le chat

/** Ne garde que les mois avec données, en clés lisibles ("Novembre 2025"). */
function monthlyReadable(
  monthly: Record<string, number>,
  monthsWithData: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of monthsWithData) out[monthLabelLong(m)] = eur(monthly[m] ?? 0);
  return out;
}

export function buildAssistantTools(entity: Entity) {
  return {
    synthese: tool({
      description:
        "Vue Synthèse de l'exercice en cours : CA, charges, résultats, totaux mensuels et cumulés, " +
        "par ligne de gestion et par section, avec % du CA et comparaison N-1 si disponible. " +
        "Source : balance générale ventilée (comptabilité). Montants en euros.",
      inputSchema: z.object({
        detail: z
          .enum(["totaux", "complet"])
          .describe(
            "'totaux' : uniquement les agrégats (CA, charges, résultats) par mois, suffisant pour la plupart des questions. " +
              "'complet' : ajoute chaque ligne de gestion (sous-traitance, intérim, masse salariale…)."
          ),
      }),
      execute: async ({ detail }) => {
        const data = await getSynthese(entity);
        if (!data) return { erreur: "Aucune balance ventilée validée. Aucune donnée disponible." };

        const agg = (v: { monthly: Record<string, number>; total: number }) => ({
          parMois: monthlyReadable(v.monthly, data.monthsWithData),
          cumulExercice: eur(v.total),
        });

        const base = {
          exercice: `${data.fiscalYearStart}/${data.fiscalYearStart + 1}`,
          dernierMoisImporte: monthLabelLong(data.period),
          moisAvecDonnees: data.monthsWithData.map(monthLabelLong),
          caTotal: agg(data.caTotal),
          chargesExploitation: agg(data.totalChargesExploitation),
          chargesPersonnel: agg(data.totalChargesPersonnel),
          fraisGenerauxEtAutres: agg(data.totalFx),
          resultatExploitation: agg(data.resultatExploitation),
          resultatNet: agg(data.resultatNet),
          comparaisonN1: data.hasPrevYear
            ? { caExercicePrecedent: eur(data.prevCaTotal ?? 0) }
            : "exercice précédent non importé, comparaison N-1 indisponible",
        };
        if (detail === "totaux") return base;

        return {
          ...base,
          sections: data.sections.map((s) => ({
            section: s.name,
            lignes: s.rows
              .filter((r) => r.total || r.prevTotal)
              .map((r) => ({
                ligne: r.category.label,
                nature: r.category.kind,
                parMois: monthlyReadable(
                  Object.fromEntries(
                    data.monthsWithData.map((m) => [m, r.cells[m] ?? 0])
                  ),
                  data.monthsWithData
                ),
                cumulExercice: eur(r.total ?? 0),
                pctDuCa: r.pctCa,
                cumulN1: r.prevTotal != null ? eur(r.prevTotal) : null,
                ecartN1: r.ecart != null ? eur(r.ecart) : null,
              })),
          })),
        };
      },
    }),

    chantiers: tool({
      description:
        "Activité chantier du dernier mois importé : par chantier, facturation, travaux en cours " +
        "(provision/annulation), achats, sous-traitance, autres charges et résultat du mois. " +
        "Source : balance analytique (delta entre les deux derniers snapshots). Montants en euros.",
      inputSchema: z.object({
        pole: z
          .string()
          .optional()
          .describe("Filtrer sur un pôle précis (optionnel)."),
        recherche: z
          .string()
          .optional()
          .describe("Filtrer les chantiers dont le nom ou la référence contient ce texte (optionnel)."),
      }),
      execute: async ({ pole, recherche }) => {
        const data = await getChantiers(entity);
        if (!data) return { erreur: "Aucune balance analytique validée. Aucune donnée chantier disponible." };

        let rows = data.rows;
        if (pole) rows = rows.filter((r) => r.pole?.toLowerCase() === pole.toLowerCase());
        if (recherche) {
          const q = recherche.toLowerCase();
          rows = rows.filter(
            (r) =>
              r.centreLabel.toLowerCase().includes(q) ||
              r.centreCode.toLowerCase().includes(q)
          );
        }

        return {
          mois: monthLabelLong(data.period),
          nature: data.prevPeriod
            ? `activité du mois (delta vs ${monthLabelLong(data.prevPeriod)})`
            : "cumul depuis l'ouverture des chantiers (premier snapshot)",
          poles: data.poles,
          nombreChantiers: rows.length,
          // Les postes suivent la nomenclature : on les expose tous, libellés en clair.
          chantiers: rows.map((r) => ({
            reference: r.centreCode,
            chantier: r.centreLabel,
            pole: r.pole,
            postes: Object.fromEntries(
              data.lines
                .filter((l) => l.kind !== "manual" && r.values[l.code])
                .map((l) => [l.label, eur(r.values[l.code] ?? 0)])
            ),
            resultatMois: eur(r.values[CHANTIER_CODES.resultat] ?? 0),
            cumulResultatChantier: eur(r.values[CHANTIER_CODES.cumulResultat] ?? 0),
            cumulFacturationChantier: eur(r.values[CHANTIER_CODES.cumulFacturation] ?? 0),
            statut: r.statut === "final" ? "figé" : "brouillon",
            note: r.note,
          })),
          totaux: {
            caHtTotal: eur(data.totals[CHANTIER_CODES.caTotal] ?? 0),
            chargesExploitation: eur(data.totals[CHANTIER_CODES.totalExploitation] ?? 0),
            chargesPersonnel: eur(data.totals[CHANTIER_CODES.totalPersonnel] ?? 0),
            resultatMois: eur(data.totals[CHANTIER_CODES.resultat] ?? 0),
          },
        };
      },
    }),

    frais_generaux: tool({
      description:
        "Frais généraux (centres de structure : FX, dépôt, siège) : par poste, cumul de " +
        "l'exercice en cours et des deux exercices précédents, poids en % du CA de chaque " +
        "exercice et écart N/N-1. Source : balance analytique. Montants en euros.",
      inputSchema: z.object({}),
      execute: async () => {
        const data = await getFx(entity);
        if (!data) return { erreur: "Aucune balance analytique validée. Frais généraux indisponibles." };

        const caN = data.caReference.n;
        return {
          mois: monthLabelLong(data.period),
          nbMoisEcoules: data.nbMois,
          caReferencePourRatios: caN != null ? eur(caN) : null,
          totalCumulExercice: eur(data.totalYtd),
          totalDuMois: eur(data.totalMois),
          ratioFxSurCa:
            caN ? Math.round((data.totalYtd / caN) * 1000) / 10 : null,
          historique: {
            n1: data.sources.n1 === "absent" ? "exercice non importé" : "disponible",
            n2: data.sources.n2 === "absent" ? "exercice non importé" : "disponible",
          },
          postes: data.sections.flatMap((s) =>
            s.rows.map((r) => ({
              section: s.name,
              poste: r.category.label,
              nature: r.category.kind,
              cumulExercice: r.cells.n != null ? eur(r.cells.n) : null,
              cumulN1: r.cells.n1 != null ? eur(r.cells.n1) : null,
              cumulN2: r.cells.n2 != null ? eur(r.cells.n2) : null,
              pctDuCa: r.pct.n,
              ecartN1: r.ecart != null ? eur(r.ecart) : null,
            }))
          ),
        };
      },
    }),

    alertes: tool({
      description:
        "Alertes de cohérence ouvertes : comptes non mappés, montants constants suspects, " +
        "mois sans données, écarts de contrôle. Montants en euros.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select()
          .from(tables.alerts)
          .where(
            and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "open"))
          )
          .orderBy(desc(tables.alerts.createdAt))
          .limit(50);

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
        "Liste des imports de données validés : type de balance, période couverte, date d'import. " +
        "Utile pour savoir jusqu'à quel mois les données vont, ou si un mois manque.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select()
          .from(tables.imports)
          .where(
            and(
              eq(tables.imports.entityId, entity.id),
              eq(tables.imports.status, "validated")
            )
          )
          .orderBy(desc(tables.imports.period));

        return {
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
