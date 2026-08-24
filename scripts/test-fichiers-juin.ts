// Vérifie que les exports de juin (nouveau format ?) passent dans les parsers.
import { readFileSync } from "fs";
import { parseBalanceFile } from "../src/lib/parsers";

const DIR = "/Users/juliend/Desktop/vision/Groupe SDG/dashboard financier/docs/balances juin/";

for (const f of ["BA 06.2026.xlsx", "CEG 06.2026.xlsx"]) {
  const buf = readFileSync(DIR + f);
  try {
    const p = parseBalanceFile(buf);
    if (p.type === "ventilee") {
      console.log(
        `${f} → VENTILÉE · ${p.lines.length} lignes · ${p.months.length} mois · ${p.months[0]} → ${p.months[p.months.length - 1]} · période ${p.period}`
      );
      const ko = p.classTotals.filter((c) => !c.ok);
      console.log(`  contrôles de classes : ${p.classTotals.length - ko.length}/${p.classTotals.length} OK`);
    } else {
      console.log(`${f} → ANALYTIQUE · ${p.lines.length} lignes · ${p.centres.length} centres`);
      console.log(`  centre FX présent : ${p.centres.some((c) => c.code === "FX")}`);
    }
  } catch (e) {
    console.log(`${f} → ERREUR : ${(e as Error).message}`);
  }
}
process.exit(0);
