// Cycle de vie des alertes : traiter → réimporter (ne revient pas) →
// réactiver la surveillance → réimporter (revient). Restaure l'état à la fin.
import "dotenv/config";
import { readFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { db, tables } from "../src/db";
import { createImportPreview, validateImport } from "../src/lib/import-service";
import { getEntityByCode } from "../src/lib/finance";

const FILE =
  "/Users/juliend/Desktop/vision/Groupe SDG/dashboard financier/docs/balances juin/CEG 06.2026.xlsx";

let failures = 0;
const check = (label: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? "  ✓" : "  ✗ ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function reimport(entity: NonNullable<Awaited<ReturnType<typeof getEntityByCode>>>) {
  const v = await createImportPreview({
    entity,
    buffer: readFileSync(FILE),
    fileName: "CEG 06.2026.xlsx",
    createdBy: "test-alertes",
  });
  await validateImport(v.importId);
}

async function openConstant(entityId: number, account: string) {
  return db
    .select()
    .from(tables.alerts)
    .where(
      and(
        eq(tables.alerts.entityId, entityId),
        eq(tables.alerts.type, "montant_constant"),
        eq(tables.alerts.account, account),
        eq(tables.alerts.status, "open")
      )
    );
}

async function main() {
  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité absente");
  const ACCOUNT = "61323000"; // loyer SCI Capitou, montant fixe → alerte connue

  const [before] = await openConstant(entity.id, ACCOUNT);
  check("alerte montant_constant ouverte au départ", !!before, before?.title);
  if (!before) process.exit(1);

  // 1) marquer comme normal
  await db
    .update(tables.alerts)
    .set({ status: "resolved", resolvedBy: "test", resolvedAt: new Date() })
    .where(eq(tables.alerts.id, before.id));

  // 2) réimport → ne doit PAS revenir
  await reimport(entity);
  const afterResolve = await openConstant(entity.id, ACCOUNT);
  check("après réimport : l'alerte traitée ne revient pas", afterResolve.length === 0);

  // vérifie qu'aucun doublon d'alertes ouvertes n'est apparu globalement
  const allOpen = await db
    .select()
    .from(tables.alerts)
    .where(and(eq(tables.alerts.entityId, entity.id), eq(tables.alerts.status, "open")));
  const keys = allOpen.map((a) => `${a.type}|${a.account}|${a.amount}|${a.period}`);
  check("aucun doublon d'alerte ouverte", new Set(keys).size === keys.length);

  // 3) réactiver la surveillance (= oublier la décision)
  await db
    .delete(tables.alerts)
    .where(and(eq(tables.alerts.id, before.id), eq(tables.alerts.status, "resolved")));

  // 4) réimport → doit revenir
  await reimport(entity);
  const afterForget = await openConstant(entity.id, ACCOUNT);
  check("après réactivation + réimport : l'alerte revient", afterForget.length === 1);

  console.log(failures === 0 ? "\nCycle de vie des alertes : OK" : `\n${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
