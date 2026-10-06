// Alertes du cycle mensuel et alertes des exercices clos.
//
// Les balances analytiques d'exercices clos (imports annuels, N-1 / N-2)
// lèvent elles aussi des alertes de comptes non mappés : elles disent ce qui
// reste hors des colonnes N-1 et N-2, mais n'appellent aucune action ce mois-ci.
// Elles sont donc rangées à part et ne comptent pas dans les compteurs.

import { fiscalMonths } from "./parsers";
import { latestValidatedImport } from "./finance";
import { debutExercice } from "./nomenclature/entites";

/** Premier mois de l'exercice en cours (celui de la dernière balance ventilée). */
export async function currentFiscalCutoff(entity: { id: number; code: string }): Promise<string | null> {
  const imp =
    (await latestValidatedImport(entity.id, "ventilee")) ??
    (await latestValidatedImport(entity.id, "analytique"));
  return imp ? fiscalMonths(imp.fiscalYearStart, debutExercice(entity.code))[0] : null;
}

/** Une alerte d'exercice clos : sa période précède l'exercice en cours. */
export function isClosedYearAlert(alert: { period: string | null }, cutoff: string | null) {
  return !!cutoff && !!alert.period && String(alert.period) < cutoff;
}

export function splitAlerts<T extends { period: string | null }>(rows: T[], cutoff: string | null) {
  return {
    current: rows.filter((a) => !isClosedYearAlert(a, cutoff)),
    closedYears: rows.filter((a) => isClosedYearAlert(a, cutoff)),
  };
}
