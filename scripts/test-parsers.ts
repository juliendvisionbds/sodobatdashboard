import { readFileSync } from "fs";
import { parseBalanceFile } from "../src/lib/parsers";

const DOCS = "/Users/juliend/Desktop/vision/Groupe SDG/dashboard financier/docs";

for (const f of ["SODOBAT_BALANCE VENTILEE.xlsx", "SODOBAT_BALANCE ANALYTIQUE.xlsx"]) {
  const parsed = parseBalanceFile(readFileSync(`${DOCS}/${f}`));
  console.log(`\n=== ${f} → type détecté: ${parsed.type}`);
  if (parsed.type === "ventilee") {
    console.log(`lignes: ${parsed.lines.length}, comptes: ${parsed.accounts.length}`);
    console.log(`mois: ${parsed.months.join(", ")}`);
    console.log(`période: ${parsed.period}, exercice: ${parsed.fiscalYearStart}`);
    const ko = parsed.classTotals.filter((c) => !c.ok);
    console.log(`contrôles classes: ${parsed.classTotals.length} dont ${ko.length} KO`);
    for (const c of ko.slice(0, 10)) console.log("  KO:", c);
    console.log(`total général fichier: ${parsed.fileGrandTotal}`);
    const cls = (p: string) =>
      parsed.accounts.filter((a) => a.account.startsWith(p)).reduce((s, a) => s + a.total, 0);
    console.log(`classe 6 = ${cls("6").toFixed(2)}, classe 7 = ${cls("7").toFixed(2)}`);
  } else {
    console.log(`lignes: ${parsed.lines.length}, centres: ${parsed.centres.length}, comptes: ${parsed.accounts.length}`);
    console.log(`total solde: ${parsed.totalSolde}`);
    console.log("centres:", parsed.centres.map((c) => c.code).join(", "));
  }
}
