// Reports d'ouverture CovarBat : sept chantiers corrigés d'après les balances
// analytiques Quadra 2021/22 → 2024/25 (archives transmises par la DAF le
// 6 octobre 2026), à appliquer une fois sur la base visée :
//
//   DOTENV_CONFIG_PATH=.env.local node --import=tsx scripts/reports-covarbat-quadra.ts           (rapport seul)
//   DOTENV_CONFIG_PATH=.env.local node --import=tsx scripts/reports-covarbat-quadra.ts --apply
//
// Dans l'onglet « COVARBAT 30 11 25 » du tableau de gestion, les reports de
// ces chantiers recopient la valeur d'une colonne voisine (745, 748, 749 et
// 750 portent le même résultat ; 723 partage le sien avec quatre autres
// colonnes). Le cumul Quadra des quatre exercices clos reproduit à l'euro les
// reports de tous les autres chantiers récents : c'est lui qui est retenu ici,
// convention comptable, prévisions en cours comprises, comme les cumuls de
// l'application. Les chantiers sans historique Quadra repartent de zéro.
//
// Relancer `init:reports` depuis le tableau de gestion annulerait ces
// corrections : ne le refaire qu'une fois l'onglet de novembre corrigé.
// N'écrit que dans manual_entries (champ report_ouverture).

import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db, tables } from "../src/db";
import { getEntityByCode } from "../src/lib/finance";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const PERIOD = "2025-11-01"; // reports arrêtés à la veille de novembre 2025
const SIGNATURE = "reports-covarbat-quadra";

/** Cumul Quadra 2021/22 → 2024/25 : classe 70 (facturation) et classes 7 − 6 (résultat). */
const CORRECTIONS: { centre: string; label: string; facturation: number; resultat: number; note: string }[] = [
  { centre: "723", label: "CHATEAU ROUBINE", facturation: 113894.73, resultat: 17364.42, note: "le tableau portait 112 982,99 / 48 467,71, valeurs partagées avec 703, 716, 720 et 721" },
  { centre: "726", label: "M MME MODICA", facturation: 11352.19, resultat: 4381.34, note: "résultat 2 381,34 au tableau, 2 000 de moins que la comptabilité" },
  { centre: "728", label: "PRETARI CONSTRUCTION", facturation: 134773.4, resultat: 23698.06, note: "facturation 106 943,67 au tableau ; le résultat concorde" },
  { centre: "744", label: "M DONAT", facturation: -0.45, resultat: -0.45, note: "résultat 31 475,55 au tableau pour un chantier sans charge ni vente" },
  { centre: "745", label: "MR. TOREN", facturation: 0, resultat: 0, note: "aucun historique avant novembre 2025 ; 2 054,51 recopié de 748" },
  { centre: "748", label: "M MME LAURENT", facturation: -0.23, resultat: -1015.49, note: "résultat 2 054,51 au tableau" },
  { centre: "749", label: "M. MME BECCHETTI", facturation: 0, resultat: 0, note: "aucun historique avant novembre 2025 ; 2 054,51 recopié de 748" },
  { centre: "750", label: "LAURENT SA", facturation: 0, resultat: 0, note: "aucun historique avant novembre 2025 ; 2 054,51 recopié de 748" },
];

const eur = (x: number) =>
  x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(13);

async function main() {
  requireEnvTarget();
  const apply = process.argv.includes("--apply");
  console.log(`Base : ${describeTarget()}${apply ? "" : " — rapport seul, aucune écriture"}\n`);
  const entity = await getEntityByCode("covarbat");
  if (!entity) throw new Error("entité covarbat absente");

  const existants = await db
    .select()
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entity.id),
        eq(tables.manualEntries.field, "report_ouverture"),
        eq(tables.manualEntries.period, PERIOD)
      )
    );
  const trouve = (centre: string, subKey: string) =>
    existants.find((e) => e.centreCode === centre && e.subKey === subKey);

  type Ecriture = { centre: string; subKey: "facturation" | "resultat"; valeur: number; id: number | null; label: string };
  const ecritures: Ecriture[] = [];
  console.log(`${"centre".padEnd(7)}${"chantier".padEnd(24)}${"facturation : avant → après".padStart(32)}${"résultat : avant → après".padStart(32)}`);
  for (const c of CORRECTIONS) {
    const cells = (["facturation", "resultat"] as const).map((subKey) => {
      const e = trouve(c.centre, subKey);
      const avant = e ? Number(e.valueNum) : null;
      const apres = c[subKey];
      if (avant == null || Math.abs(avant - apres) > 0.005)
        ecritures.push({ centre: c.centre, subKey, valeur: apres, id: e?.id ?? null, label: c.label });
      return `${avant == null ? "absent".padStart(13) : eur(avant)} → ${eur(apres)}`;
    });
    console.log(`${c.centre.padEnd(7)}${c.label.slice(0, 23).padEnd(24)}${cells[0].padStart(32)}${cells[1].padStart(32)}`);
    console.log(`       ${c.note}`);
  }

  if (!ecritures.length) {
    console.log("\nRien à faire : tout est déjà appliqué.");
    process.exit(0);
  }
  if (!apply) {
    console.log(`\n${ecritures.length} valeur(s) à écrire. Relancer avec --apply pour écrire.`);
    process.exit(0);
  }
  await db.transaction(async (tx) => {
    for (const e of ecritures) {
      if (e.id != null)
        await tx
          .update(tables.manualEntries)
          .set({ valueNum: e.valeur.toFixed(2), updatedBy: SIGNATURE, updatedAt: new Date() })
          .where(eq(tables.manualEntries.id, e.id));
      else
        await tx.insert(tables.manualEntries).values({
          entityId: entity.id,
          period: PERIOD,
          centreCode: e.centre,
          field: "report_ouverture",
          subKey: e.subKey,
          valueNum: e.valeur.toFixed(2),
          valueText: e.label,
          status: "final",
          updatedBy: SIGNATURE,
        });
    }
  });
  console.log(`\n✓ ${ecritures.length} valeur(s) écrite(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
