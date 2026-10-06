// Réponses de la DAF du 5 octobre 2026 (page Rapprochement), à appliquer une
// fois sur la base visée :
//
//   DOTENV_CONFIG_PATH=.env.local node --import=tsx scripts/reponses-daf-6-octobre.ts           (rapport seul)
//   DOTENV_CONFIG_PATH=.env.local node --import=tsx scripts/reponses-daf-6-octobre.ts --apply
//
// 1. Frais généraux : la ligne d'exception (indemnités d'assurance, 75870000)
//    vient en déduction du TOTAL 2 au lieu de s'y ajouter — la formule de la
//    ligne « TOTAL 2 — Frais généraux » est alignée sur le code (sodobat.ts).
// 2. Centre FORMA, créé par Cegid à l'import ASCII d'août 2026 : « Affecter
//    FORMA aux FX ». Il est lu comme FX par l'application, et l'alerte ouverte
//    à son sujet est refermée.
// 3. Compte 79150000 (remboursement de sinistre, sur le chantier 766D en mars) :
//    règle vers « Autres produits chantier » si elle manque encore. Celle créée
//    depuis l'écran Mapping le 6 octobre suffit : rien n'est alors écrit.
//
// Pourquoi pas `npm run db:nomenclature` : il remplace toute la nomenclature et
// efface les règles créées depuis l'écran Mapping. Idempotent : relancer le
// script ne change rien de plus. Aucune donnée importée n'est touchée ; les
// vues se recalculent à la volée.

import "dotenv/config";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, tables } from "../src/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
import { nomenclature } from "../src/lib/nomenclature/sodobat";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const ENTITE = "sodobat";
const TOTAL_FX = "fx_total_generaux";
const PRODUITS_CHANTIER = "cha_produits_divers";
const COMPTE_SINISTRE = "79150000";
const CENTRE_FORMA = "FORMA";
const CENTRE_FX = "FX";
const SIGNATURE = "reponses-daf-6-octobre";

async function main() {
  requireEnvTarget();
  const apply = process.argv.includes("--apply");
  console.log(`Base : ${describeTarget()}${apply ? "" : " — rapport seul, aucune écriture"}\n`);

  const [entity] = await db.select().from(tables.entities).where(eq(tables.entities.code, ENTITE));
  if (!entity) throw new Error(`entité ${ENTITE} absente`);
  // Chaque écriture passe par la transaction qui l'exécute, jamais par `db` :
  // sur PGlite, une seule connexion, un appel à `db` depuis la transaction bloquerait.
  const actions: ((tx: Tx) => Promise<void>)[] = [];

  // 1. Formule du total des frais généraux
  const ligne = nomenclature.find((l) => l.code === TOTAL_FX);
  if (!ligne || !ligne.formula) throw new Error(`${TOTAL_FX} n'a pas de formule dans le code`);
  const [total] = await db.select().from(tables.categories).where(eq(tables.categories.code, TOTAL_FX));
  if (!total) throw new Error(`${TOTAL_FX} absente de la base : installer la nomenclature d'abord`);
  if (JSON.stringify(total.formula) === JSON.stringify(ligne.formula)) {
    console.log(`« ${total.label} » : formule déjà celle du code`);
  } else {
    // On dit exactement ce qui change dans la formule : le signe attendu, et
    // tout écart accumulé entre la base et le code (une ligne ajoutée au code
    // après l'installation, par exemple).
    type Operande = { code: string; sign?: number };
    const operandes = (formule: unknown): Map<string, number> =>
      new Map(
        (formule && typeof formule === "object" && "operands" in formule
          ? (formule as { operands: Operande[] }).operands
          : []
        ).map((o) => [o.code, o.sign ?? 1])
      );
    const avant = operandes(total.formula);
    const apres = operandes(ligne.formula);
    console.log(`« ${total.label} » : formule alignée sur le code`);
    for (const [code, sign] of apres) {
      if (!avant.has(code)) console.log(`   + opérande ${code} (signe ${sign})`);
      else if (avant.get(code) !== sign) console.log(`   ± ${code} : signe ${avant.get(code)} → ${sign}`);
    }
    for (const code of avant.keys()) if (!apres.has(code)) console.log(`   − opérande ${code}`);
    actions.push(async (tx) => {
      await tx.update(tables.categories).set({ formula: ligne.formula }).where(eq(tables.categories.id, total.id));
    });
  }

  // 2. FORMA lu comme FX, alerte refermée
  const [forma] = await db
    .select()
    .from(tables.centres)
    .where(and(eq(tables.centres.entityId, entity.id), eq(tables.centres.code, CENTRE_FORMA)));
  if (!forma) {
    console.log(`centre ${CENTRE_FORMA} : absent du référentiel (aucune balance ne le porte), rien à faire`);
  } else if (forma.aliasOf === CENTRE_FX) {
    console.log(`centre ${CENTRE_FORMA} : déjà lu comme ${CENTRE_FX}`);
  } else {
    console.log(`centre ${CENTRE_FORMA} « ${forma.name} » : lu comme ${CENTRE_FX}`);
    actions.push(async (tx) => {
      await tx.update(tables.centres).set({ aliasOf: CENTRE_FX }).where(eq(tables.centres.id, forma.id));
    });
  }
  const alertes = await db
    .select({ id: tables.alerts.id, title: tables.alerts.title })
    .from(tables.alerts)
    .where(
      and(
        eq(tables.alerts.entityId, entity.id),
        eq(tables.alerts.type, "centre_import_ascii"),
        eq(tables.alerts.account, CENTRE_FORMA),
        eq(tables.alerts.status, "open")
      )
    );
  for (const a of alertes) console.log(`alerte refermée : « ${a.title} »`);
  if (alertes.length)
    actions.push(async (tx) => {
      await tx
        .update(tables.alerts)
        .set({ status: "resolved", resolvedBy: SIGNATURE, resolvedAt: new Date() })
        .where(inArray(tables.alerts.id, alertes.map((a) => a.id)));
    });

  // 3. Règle 79150000 → Autres produits chantier
  const [produits] = await db.select().from(tables.categories).where(eq(tables.categories.code, PRODUITS_CHANTIER));
  if (!produits) throw new Error(`${PRODUITS_CHANTIER} absente de la base`);
  const regles = await db
    .select({ id: tables.accountRules.id, createdBy: tables.accountRules.createdBy, categoryId: tables.accountRules.categoryId })
    .from(tables.accountRules)
    .innerJoin(tables.categories, eq(tables.categories.id, tables.accountRules.categoryId))
    .where(
      and(
        eq(tables.accountRules.pattern, COMPTE_SINISTRE),
        eq(tables.accountRules.matchType, "exact"),
        eq(tables.accountRules.active, true),
        eq(tables.categories.view, "chantier"),
        or(isNull(tables.accountRules.entityId), eq(tables.accountRules.entityId, entity.id))
      )
    );
  if (regles.length) {
    const r = regles[0];
    console.log(
      `règle ${COMPTE_SINISTRE} (vue Chantiers) : déjà en place${r.createdBy ? `, créée par ${r.createdBy}` : ""}` +
        (r.categoryId === produits.id ? "" : " — sur une autre ligne que « Autres produits chantier », laissée telle quelle")
    );
  } else {
    console.log(`règle ${COMPTE_SINISTRE} → « ${produits.label} » créée`);
    actions.push(async (tx) => {
      await tx.insert(tables.accountRules).values({
        categoryId: produits.id,
        entityId: null,
        pattern: COMPTE_SINISTRE,
        matchType: "exact",
        createdBy: SIGNATURE,
      });
    });
  }

  if (!actions.length) {
    console.log("\nRien à faire : tout est déjà appliqué.");
    process.exit(0);
  }
  if (!apply) {
    console.log(`\n${actions.length} écriture(s). Relancer avec --apply pour écrire.`);
    process.exit(0);
  }
  await db.transaction(async (tx) => {
    for (const a of actions) await a(tx);
  });
  console.log(`\n✓ ${actions.length} écriture(s) appliquée(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
