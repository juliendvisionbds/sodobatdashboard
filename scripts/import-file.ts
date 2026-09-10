// Import d'une balance en ligne de commande : prévisualisation puis validation,
// exactement comme l'écran Imports, avec les mêmes contrôles.
//
//   npm run import:file -- "<fichier ventilée>"
//   npm run import:file -- "<fichier analytique>" --period 2026-06
//
// Préfixer par DOTENV_CONFIG_PATH=.env.prod.local pour viser la production.
// La période est obligatoire pour une balance analytique : le fichier ne la porte
// pas, c'est le mois du snapshot. Les imports faits ici sont signés « import-cli » :
// ce sont de vrais arrêtés, que purge:imports ne supprime jamais.

import "dotenv/config";
import { readFileSync } from "fs";
import { basename } from "path";
import { getEntityByCode } from "../src/lib/finance";
import { createImportPreview, validateImport } from "../src/lib/import-service";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  requireEnvTarget();
  const file = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));
  if (!file) {
    console.error('Usage : npm run import:file -- "<fichier.xlsx>" [--period AAAA-MM]');
    process.exit(1);
  }
  const period = arg("--period");
  if (period && !/^\d{4}-\d{2}$/.test(period)) {
    console.error(`Période « ${period} » invalide : format attendu AAAA-MM, par exemple 2026-06.`);
    process.exit(1);
  }

  const entity = await getEntityByCode("sodobat");
  if (!entity) throw new Error("entité sodobat absente");

  console.log(`Base    : ${describeTarget()}`);
  console.log(`Fichier : ${basename(file)}`);

  const { importId, summary } = await createImportPreview({
    entity,
    buffer: readFileSync(file),
    fileName: basename(file),
    createdBy: "import-cli",
    periodOverride: period ? `${period}-01` : undefined,
  });

  const nature =
    summary.type === "ventilee"
      ? `ventilée · exercice ${summary.fiscalYearStart}/${summary.fiscalYearStart + 1} · jusqu'à ${summary.period.slice(0, 7)}`
      : `analytique · snapshot ${summary.period.slice(0, 7)} · ${summary.centreCount} centres`;
  console.log(`Nature  : ${nature} · ${summary.lineCount} lignes`);
  if (summary.replaces)
    console.log(`Remplace : ${summary.replaces.fileName} (${summary.replaces.period.slice(0, 7)})`);
  if (summary.unmapped.length) {
    console.log(`⚠ ${summary.unmapped.length} compte(s) non mappé(s), une alerte sera levée pour chacun :`);
    for (const u of summary.unmapped.slice(0, 8)) console.log(`     ${u.account}  ${u.label}`);
  }

  await validateImport(importId);
  console.log("✓ Validé");
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
