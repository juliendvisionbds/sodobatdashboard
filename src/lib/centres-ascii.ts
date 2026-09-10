// Centres analytiques créés à la volée par Cegid lors d'un import ASCII.
//
// Quand une écriture importée cite un code centre qui n'existe pas, Cegid ne la
// rejette pas : il crée le centre, avec le libellé « Créé par Import ASCII ».
// C'est presque toujours une faute de frappe sur le code chantier — 52MF pour 52,
// 1036C pour 1036A — : de l'argent réel, rangé sur un centre fantôme au lieu du
// bon chantier, dont la marge est faussée d'autant.
//
// On détecte ces centres et on propose le jumeau le plus probable : un centre
// connu portant le même numéro. Module sans accès base, pour être testé
// directement sur les fichiers d'export.

const LIBELLE_ASCII = /import\s+ascii/i;

/** Libellé attribué par Cegid à un centre qu'il a créé lui-même. */
export function isAsciiCentre(label: string): boolean {
  return LIBELLE_ASCII.test(label);
}

export type CentreConnu = { code: string; name: string };

export type CentreAscii = {
  code: string;
  lignes: number;
  /** produits imputés (classe 7), en positif */
  produits: number;
  /** charges imputées (classe 6) */
  charges: number;
  /** centres connus de même numéro : le vrai chantier est parmi eux */
  jumeaux: CentreConnu[];
};

/** Numéro d'un code centre : « 52MF » → « 52 », « 1036C » → « 1036 ». */
const numeroOf = (code: string) => code.trim().match(/^\d+/)?.[0] ?? null;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param lines  lignes de la balance analytique importée
 * @param connus référentiel des centres de l'entité, tous exercices confondus :
 *               le jumeau peut ne pas avoir bougé ce mois-ci
 */
export function detectAsciiCentres(
  lines: { centreCode: string; centreLabel: string; account: string; solde: number }[],
  connus: CentreConnu[]
): CentreAscii[] {
  const parCentre = new Map<string, CentreAscii>();
  for (const l of lines) {
    if (!isAsciiCentre(l.centreLabel)) continue;
    const e = parCentre.get(l.centreCode) ?? {
      code: l.centreCode,
      lignes: 0,
      produits: 0,
      charges: 0,
      jumeaux: [],
    };
    e.lignes++;
    // Les produits ont un solde créditeur (négatif) : on les remet en positif.
    if (l.account.startsWith("7")) e.produits -= l.solde;
    else if (l.account.startsWith("6")) e.charges += l.solde;
    parCentre.set(l.centreCode, e);
  }

  // Un centre fantôme ne peut pas être le jumeau d'un autre.
  const vrais = connus.filter((c) => !isAsciiCentre(c.name));
  for (const e of parCentre.values()) {
    const n = numeroOf(e.code);
    e.jumeaux = n
      ? vrais
          .filter((c) => c.code !== e.code && numeroOf(c.code) === n)
          .sort((a, b) => a.code.localeCompare(b.code))
      : [];
    e.produits = round2(e.produits);
    e.charges = round2(e.charges);
  }

  // Les plus gros montants en premier : ce sont eux qui faussent le plus une marge.
  const poids = (e: CentreAscii) => Math.abs(e.produits) + Math.abs(e.charges);
  return [...parCentre.values()].sort((a, b) => poids(b) - poids(a));
}
