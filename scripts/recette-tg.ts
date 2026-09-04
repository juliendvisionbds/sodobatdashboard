// Rapprochement du dashboard avec le tableau de gestion Excel de Sodobat.
//
//   npm run recette:tg
//
// Deux niveaux de contrôle :
//
//  1. Invariants durs (font échouer le script)
//     — l'écart de contrôle « Ctrl » doit être intégralement expliqué par les
//       retraitements DAP et VNC, que le résultat du TG exclut délibérément ;
//     — aucun compte ne doit rester non mappé ;
//     — chaque ligne doit exposer les 18 colonnes de la maquette.
//
//  2. Rapprochement avec le TG Excel de mai 2026 (informatif)
//     Le TG Excel est daté de l'export de mai, la base contient l'export de juin
//     avec les révisions du cabinet : seuls les mois non révisés peuvent coïncider
//     au centime. Les écarts de périmètre entre l'ancien TG et la maquette validée
//     sont chiffrés ligne à ligne pour être arbitrés avec la DAF.

import "dotenv/config";
import { getEntityByCode, getSynthese, TOTAL_COLUMN } from "@/lib/finance";

const eur = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s: string, n: number) => s.padStart(n);
const TOL = 0.02;

/** Onglet « Synthese 2026 » de SODOBAT_TABLEAU GESTION_2026 05. */
const TG = {
  caTotal: 10456133.18,
  totalExploitation: 7236116,
  totalPersonnel: 2396219.08,
  resultatExploitation: 823798.1,
  resultat: -306459.31,
  msFraisGeneraux: 83993.99,
  /** Ligne « Resultat BG Comptable », par mois. Nov et déc sont cumulés sur une
   *  seule colonne dans le TG (onglet « TG 11-12 2025 »), d'où l'absence de nov. */
  resultatBgParMois: {
    "2026-01-01": -26373.11,
    "2026-02-01": -188.54,
    "2026-03-01": 45603.63,
    "2026-04-01": -47240.56,
    "2026-05-01": -257703.59,
  } as Record<string, number>,
};

async function main() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité sodobat absente");
  const data = await getSynthese(entity, { period: "2026-05-01" });
  if (!data) throw new Error("aucune balance ventilée validée");

  const v = (code: string) => data.byCode[code]?.total ?? 0;
  const failures: string[] = [];

  console.log(
    `Exercice ${data.fiscalYearStart}/${data.fiscalYearStart + 1} · arrêté ${data.period} · ` +
      `${data.monthsWithData.length} mois de données\n`
  );

  // ── 1. Invariants ──────────────────────────────────────────────────────────
  console.log("INVARIANTS");
  // Le résultat du TG exclut les dotations et la VNC : l'écart avec le résultat
  // comptable doit être exactement égal à ces retraitements, et rien d'autre.
  const ctrl = v("syn_ctrl");
  const dap = v("syn_retraitement_dap");
  const vnc = v("syn_retraitement_vnc");
  const inexplique = ctrl - dap - vnc;
  console.log(`  Résultat net (nomenclature)   ${pad(eur(v("syn_resultat_net")), 16)}`);
  console.log(`  Résultat BG comptable         ${pad(eur(v("syn_resultat_bg")), 16)}`);
  console.log(`  Ctrl                          ${pad(eur(ctrl), 16)}`);
  console.log(`    dont retraitement DAP       ${pad(eur(dap), 16)}`);
  console.log(`    dont retraitement VNC       ${pad(eur(vnc), 16)}`);
  console.log(`    inexpliqué (doit être nul)  ${pad(eur(inexplique), 16)}`);
  if (Math.abs(inexplique) > TOL)
    failures.push(
      `écart de contrôle inexpliqué (${eur(inexplique)}) : la nomenclature ne boucle pas`
    );

  console.log(`  Comptes non mappés            ${pad(String(data.unmapped.length), 16)}`);
  for (const u of data.unmapped) console.log(`      ${u.account} ${u.label} ${eur(u.total)}`);
  if (data.unmapped.length > 0)
    failures.push(`${data.unmapped.length} compte(s) non mappé(s)`);

  // Contrat de colonnes : 12 mois + total sur chaque ligne, y compris vides.
  const rows = data.sections.flatMap((s) => s.rows);
  const expected = data.months.length + 1;
  const badRows = rows.filter((r) => Object.keys(r.cells).length !== expected);
  console.log(
    `  Lignes affichées              ${pad(String(rows.length), 16)}` +
      ` (${expected} colonnes de valeurs attendues)`
  );
  if (data.months.length !== 12) failures.push(`${data.months.length} mois d'exercice au lieu de 12`);
  if (badRows.length)
    failures.push(
      `${badRows.length} ligne(s) n'exposent pas les ${expected} colonnes : ` +
        badRows.map((r) => r.category.code).join(", ")
    );
  if (rows.some((r) => r.cells[TOTAL_COLUMN] === undefined))
    failures.push("colonne « Total exercice » absente sur certaines lignes");

  // ── 2. Rapprochement mensuel avec le TG Excel ──────────────────────────────
  console.log("\nRÉSULTAT BG PAR MOIS · dashboard vs TG Excel mai 2026");
  const bg = data.byCode["syn_resultat_bg"]?.cells ?? {};
  let matched = 0;
  for (const [month, want] of Object.entries(TG.resultatBgParMois)) {
    const got = bg[month] ?? null;
    const ok = got != null && Math.abs(got - want) <= TOL;
    if (ok) matched++;
    console.log(
      `  ${month.slice(0, 7)}  ${pad(eur(got), 16)} ${pad(eur(want), 16)}` +
        `  ${ok ? "identique" : "révisé depuis l'export de mai"}`
    );
  }
  console.log(
    `  → ${matched}/${Object.keys(TG.resultatBgParMois).length} mois identiques au centime ; ` +
      `les autres ont été révisés par le cabinet entre l'export de mai et celui de juin.`
  );
  if (matched === 0)
    failures.push("aucun mois ne coïncide avec le TG Excel : vérifier le calcul du résultat");

  // ── 3. Écarts de périmètre entre l'ancien TG et la maquette ────────────────
  console.log("\nÉCARTS DE PÉRIMÈTRE (cumul exercice) — à arbitrer avec la DAF");
  const line = (label: string, got: number, want: number) =>
    console.log(
      `  ${label.padEnd(30)} ${pad(eur(got), 16)} ${pad(eur(want), 16)} ${pad(eur(got - want), 15)}`
    );
  console.log(`  ${"".padEnd(30)} ${pad("dashboard", 16)} ${pad("TG Excel", 16)} ${pad("écart", 15)}`);
  line("CA TOTAL", v("syn_ca_total"), TG.caTotal);
  line("TOTAL CHARGES EXPLOITATION", v("syn_total_exploitation"), TG.totalExploitation);
  line("TOTAL CHARGES PERSONNEL", v("syn_total_personnel"), TG.totalPersonnel);
  line("RÉSULTAT D'EXPLOITATION", v("syn_resultat_exploitation"), TG.resultatExploitation);

  const autresProduits =
    v("syn_cession_immo") + v("syn_produits_gestion") + v("syn_produits_financiers");
  console.log(
    `\n  1) CA : la maquette intègre au CA les produits que le TG Excel isolait en` +
      `\n     « Total Autres Produits » — cession immo ${eur(v("syn_cession_immo"))}, produits de` +
      `\n     gestion courante ${eur(v("syn_produits_gestion"))}, produits financiers` +
      `\n     ${eur(v("syn_produits_financiers"))}, soit ${eur(autresProduits)}.`
  );
  const persEcart = v("syn_total_personnel") - TG.totalPersonnel;
  console.log(
    `\n  2) Personnel : la Synthèse est bâtie sur la balance ventilée, qui n'a pas` +
      `\n     d'axe analytique — la masse salariale du siège reste donc en charges de` +
      `\n     personnel, alors que le TG Excel la basculait en frais généraux` +
      `\n     (${eur(TG.msFraisGeneraux)} ; écart constaté ${eur(persEcart)}).`
  );
  console.log(
    `\n  3) Exploitation : même cause — carburant, entretien et fournitures imputés au` +
      `\n     siège restent en charges d'exploitation (écart ${eur(v("syn_total_exploitation") - TG.totalExploitation)}).`
  );
  console.log(
    `\n     → Question à trancher : ventiler la Synthèse sur l'axe analytique comme le` +
      `\n       TG Excel, ou conserver la lecture entité de la maquette validée ?` +
      `\n       Le résultat net est identique dans les deux cas, seule la répartition change.`
  );

  if (failures.length) {
    console.log("\nÉCHEC");
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("\n✓ Bouclage comptable vérifié, aucun compte non mappé, contrat de colonnes respecté.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
