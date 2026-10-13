// Entité de démonstration : données fictives, compte dédié, fichiers Excel.
//
//   npm run demo:installer                         → génère les fichiers dans demo/, rapport, rien en base
//   npm run demo:installer -- --apply              → installe l'entité Demo en base (PGlite locale)
//   npm run demo:installer -- --apply --reset      → efface d'abord ce que l'entité Demo avait
//   npm run demo:installer -- --apply --password 'mot-de-passe-choisi'
//   npm run demo:installer -- --apply --avec-septembre   → importe aussi le mois de la démonstration (répétition)
//   DOTENV_CONFIG_PATH=.env.local npm run demo:installer -- --apply --password '…'   → production
//
// Ce que le script fait, dans cet ordre :
//   1. génère un jeu de données fictif et déterministe (scripts/demo/donnees.ts)
//      et l'écrit en fichiers Excel au format Cegid, dans demo/ :
//        · demo/historique/ : balances des exercices clos et des mois déjà en base ;
//        · demo/a-importer/ : les deux balances du mois à importer pendant la
//          démonstration (ventilée jusqu'à septembre 2026, analytique de septembre) ;
//   2. crée (ou ouvre) l'entité « demo » et le compte demo@visionbds.com, rôle
//      DAF rattaché à cette seule entité ;
//   3. rejoue le cycle réel : exercices clos importés en une fois, puis, mois
//      après mois de novembre 2025 à août 2026, balance ventilée, balance
//      analytique, saisies (prévisions, notes, reports d'ouverture, objectifs)
//      et validation du mois par la DAF — avec les mêmes fonctions que l'écran
//      Imports et le bouton « Valider le mois ». Les dates sont celles qu'aurait
//      eues un vrai cycle (fichiers reçus vers le 24 du mois suivant).
//
// Tout est rattaché à l'entité Demo : rien d'une autre entité n'est lu ni écrit,
// hors la table users (le compte) et la table entities (la ligne demo).
// Les imports portent le mois de septembre 2026 en réserve : il n'est pas
// importé (sauf --avec-septembre), c'est le geste de la démonstration.

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { db, tables } from "../src/db";
import { describeTarget, requireEnvTarget } from "../src/lib/env-target";
import { createImportPreview, validateImport, type ImportSummary } from "../src/lib/import-service";
import { getPrevisionControl, type Entity } from "../src/lib/finance";
import { fmtEur } from "../src/lib/format";
import {
  DERNIER_MOIS,
  DERNIER_MOIS_VALIDE,
  OUVERTURE_EXERCICE_COURANT,
  balanceAnalytique,
  balanceVentilee,
  exerciceDe,
  genererJeu,
  moisExercice,
  moisPlus,
  reportsOuverture,
  type JeuDemo,
  type Mois,
} from "./demo/donnees";
import { ecrireAnalytique, ecrireVentilee } from "./demo/cegid";

const ENTITE = { code: "demo", name: "Demo" };
const COMPTE = { email: "demo@visionbds.com", name: "Démo", role: "daf" as const };
/** Exercices clos importés en une fois : balance ventilée, et analytique pour les deux derniers (N-1, N-2). */
const EXERCICES_VENTILEE = [2021, 2022, 2023, 2024];
const EXERCICES_ANALYTIQUE = [2023, 2024];
/** Date d'installation de l'historique dans l'application. */
const DATE_INSTALLATION = "2025-12-15";

const has = (flag: string) => process.argv.includes(flag);
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** « 2026-03-01 », 24 → 24 mars 2026, 9 h 30 (heure de Paris, à peu près). */
function dateDu(mois: Mois, jour: number, heure = 9, minute = 30): Date {
  const [y, m] = mois.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, jour, heure - 2, minute));
}
/** Les fichiers d'un mois arrivent vers le 24 du mois suivant. */
const dateReception = (mois: Mois, jour = 24, heure = 9) => dateDu(moisPlus(mois, 1), jour, heure);

type Fichier = {
  nom: string;
  sousDossier: "historique" | "a-importer";
  buffer: Buffer;
  type: "ventilee" | "analytique";
  /** mois de la balance analytique, ou dernier mois d'un exercice clos */
  period?: Mois;
  annual?: boolean;
  /** quand le fichier a été importé dans l'application */
  date: Date;
  lignes: number;
};

function construireFichiers(jeu: JeuDemo): { historiques: Fichier[]; mensuels: Map<Mois, Fichier[]> } {
  const historiques: Fichier[] = [];
  const installation = dateDu(DATE_INSTALLATION, 15, 14);
  for (const ex of EXERCICES_VENTILEE) {
    const mois = moisExercice(ex);
    const lignes = balanceVentilee(jeu, mois);
    historiques.push({
      nom: `DEMO_BALANCE VENTILEE ${ex} ${ex + 1}.xlsx`,
      sousDossier: "historique",
      buffer: ecrireVentilee(lignes, mois, installation),
      type: "ventilee",
      date: installation,
      lignes: lignes.length,
    });
  }
  for (const ex of EXERCICES_ANALYTIQUE) {
    const mois = moisExercice(ex);
    const lignes = balanceAnalytique(jeu, mois);
    historiques.push({
      nom: `DEMO_BALANCE ANALYTIQUE ${ex} ${ex + 1}.xlsx`,
      sousDossier: "historique",
      buffer: ecrireAnalytique(lignes),
      type: "analytique",
      period: mois[11],
      annual: true,
      date: new Date(installation.getTime() + 30 * 60_000),
      lignes: lignes.length,
    });
  }

  const mensuels = new Map<Mois, Fichier[]>();
  for (const m of jeu.mois.filter((x) => x >= OUVERTURE_EXERCICE_COURANT)) {
    const sousDossier = m === DERNIER_MOIS ? "a-importer" : "historique";
    const prefixe = `${m.slice(0, 4)} ${m.slice(5, 7)}_DEMO`;
    const moisExo = moisExercice(exerciceDe(m)).filter((x) => x <= m);
    const ventilee = balanceVentilee(jeu, moisExo);
    const analytique = balanceAnalytique(jeu, [m]);
    mensuels.set(m, [
      {
        nom: `${prefixe} BALANCE VENTILEE.xlsx`,
        sousDossier,
        buffer: ecrireVentilee(ventilee, moisExo, dateReception(m, 24, 8)),
        type: "ventilee",
        date: dateReception(m, 24, 9),
        lignes: ventilee.length,
      },
      {
        nom: `${prefixe} BALANCE ANALYTIQUE.xlsx`,
        sousDossier,
        buffer: ecrireAnalytique(analytique),
        type: "analytique",
        period: m,
        date: dateReception(m, 24, 10),
        lignes: analytique.length,
      },
    ]);
  }
  return { historiques, mensuels };
}

// ── Base ─────────────────────────────────────────────────────────────────────

async function entiteDemo(): Promise<Entity> {
  await db
    .insert(tables.entities)
    .values({ ...ENTITE, active: true })
    .onConflictDoUpdate({ target: tables.entities.code, set: { name: ENTITE.name, active: true } });
  const [e] = await db.select().from(tables.entities).where(eq(tables.entities.code, ENTITE.code));
  return e;
}

/** Efface tout ce que l'entité Demo possède. Rien d'une autre entité n'est touché. */
async function purger(entity: Entity) {
  const id = entity.id;
  await db.delete(tables.monthlyAnalyses).where(eq(tables.monthlyAnalyses.entityId, id));
  await db.delete(tables.monthValidations).where(eq(tables.monthValidations.entityId, id));
  await db.delete(tables.alerts).where(eq(tables.alerts.entityId, id));
  await db.delete(tables.manualEntries).where(eq(tables.manualEntries.entityId, id));
  await db.delete(tables.rapprochementDecisions).where(eq(tables.rapprochementDecisions.entityId, id));
  await db.delete(tables.assistantLogs).where(eq(tables.assistantLogs.entityId, id));
  await db.delete(tables.assistantConversations).where(eq(tables.assistantConversations.entityId, id));
  await db.delete(tables.analyticLines).where(eq(tables.analyticLines.entityId, id));
  await db.delete(tables.generalBalanceLines).where(eq(tables.generalBalanceLines.entityId, id));
  await db.delete(tables.imports).where(eq(tables.imports.entityId, id));
  await db.delete(tables.centres).where(eq(tables.centres.entityId, id));
}

async function compteDemo(entity: Entity, password: string | null) {
  const [existing] = await db.select().from(tables.users).where(eq(tables.users.email, COMPTE.email));
  const motDePasse = existing && !password ? null : (password ?? randomBytes(9).toString("base64url"));
  const hash = motDePasse ? await bcrypt.hash(motDePasse, 10) : null;
  if (existing) {
    await db
      .update(tables.users)
      .set({ name: COMPTE.name, role: COMPTE.role, entityId: entity.id, ...(hash ? { passwordHash: hash } : {}) })
      .where(eq(tables.users.id, existing.id));
  } else {
    await db.insert(tables.users).values({ ...COMPTE, entityId: entity.id, passwordHash: hash! });
  }
  return { cree: !existing, motDePasse };
}

async function importer(entity: Entity, f: Fichier): Promise<{ id: number; summary: ImportSummary }> {
  const { importId, summary } = await createImportPreview({
    entity,
    buffer: f.buffer,
    fileName: f.nom,
    createdBy: COMPTE.email,
    periodOverride: f.period,
    annual: f.annual,
  });
  if (summary.unmapped.length)
    throw new Error(
      `${f.nom} : ${summary.unmapped.length} compte(s) non mappé(s) (${summary.unmapped.map((u) => u.account).join(", ")}) — le jeu de données doit n'utiliser que des comptes de la nomenclature`
    );
  const ko = (summary.classChecks ?? []).filter((c) => !c.ok);
  if (ko.length) throw new Error(`${f.nom} : écart de contrôle sur les classes ${ko.map((c) => c.class).join(", ")}`);
  await validateImport(importId);
  // Dates du cycle réel plutôt que celles de ce script.
  await db
    .update(tables.imports)
    .set({ createdAt: f.date, validatedAt: new Date(f.date.getTime() + 7 * 60_000) })
    .where(eq(tables.imports.id, importId));
  await db.update(tables.alerts).set({ createdAt: f.date }).where(eq(tables.alerts.importId, importId));
  return { id: importId, summary };
}

type Saisie = typeof tables.manualEntries.$inferInsert;

async function saisir(valeurs: Saisie[]) {
  for (let i = 0; i < valeurs.length; i += 200) await db.insert(tables.manualEntries).values(valeurs.slice(i, i + 200));
}

async function main() {
  requireEnvTarget();
  const apply = has("--apply");
  const reset = has("--reset");
  const avecDemoMois = has("--avec-septembre");
  const dossier = resolve(arg("--dossier") ?? "demo");
  console.log(`Base : ${describeTarget()}${apply ? "" : " — rapport seul, rien n'est écrit en base"}\n`);

  // 1 — Jeu de données et fichiers
  const jeu = genererJeu();
  const { historiques, mensuels } = construireFichiers(jeu);
  const tous = [...historiques, ...[...mensuels.values()].flat()];
  for (const f of tous) {
    mkdirSync(join(dossier, f.sousDossier), { recursive: true });
    writeFileSync(join(dossier, f.sousDossier, f.nom), f.buffer);
  }
  const moisEnBase = [...mensuels.keys()].filter((m) => m <= DERNIER_MOIS_VALIDE || (avecDemoMois && m <= DERNIER_MOIS));
  console.log(`Fichiers écrits dans ${dossier}/ :`);
  console.log(`  historique/   ${tous.filter((f) => f.sousDossier === "historique").length} fichiers (exercices clos, mois de ${moisEnBase[0].slice(0, 7)} à ${DERNIER_MOIS_VALIDE.slice(0, 7)})`);
  for (const f of tous.filter((f) => f.sousDossier === "a-importer")) console.log(`  a-importer/   ${f.nom}  (${f.lignes} lignes)`);
  const chantiersActifs = new Set((jeu.lignes.get(DERNIER_MOIS_VALIDE) ?? []).filter((l) => /^\d/.test(l.centre)).map((l) => l.centre));
  console.log(`\nJeu : ${jeu.chantiers.length} chantiers sur ${jeu.mois.length} mois, ${chantiersActifs.size} actifs en ${DERNIER_MOIS_VALIDE.slice(0, 7)}.`);

  if (!apply) {
    console.log("\nAvec --apply : entité « Demo », compte demo@visionbds.com, " +
      `${historiques.length} imports d'exercices clos, ${moisEnBase.length} mois importés et validés (sauf le dernier avec --avec-septembre).`);
    process.exit(0);
  }

  // 2 — Entité et compte
  const entity = await entiteDemo();
  const dejaLa = await db.select({ id: tables.imports.id }).from(tables.imports).where(eq(tables.imports.entityId, entity.id));
  if (dejaLa.length && !reset) {
    console.error(`✗ L'entité Demo a déjà ${dejaLa.length} import(s). Relancer avec --reset pour repartir de zéro.`);
    process.exit(1);
  }
  if (reset) {
    await purger(entity);
    console.log("Données précédentes de l'entité Demo effacées.");
  }
  const compte = await compteDemo(entity, arg("--password") ?? null);
  console.log(`Compte ${compte.cree ? "créé" : "mis à jour"} : ${COMPTE.email} · ${COMPTE.role} · entité Demo seule`);

  // 3 — Exercices clos
  console.log("\nExercices clos");
  for (const f of historiques) {
    const { summary } = await importer(entity, f);
    console.log(`  ✓ ${f.nom}  ${summary.lineCount} lignes${summary.annual ? " · annuel" : ""}`);
  }

  // 4 — Cycle mensuel
  console.log("\nCycle mensuel");
  const reports = reportsOuverture(jeu, OUVERTURE_EXERCICE_COURANT);
  let nbSaisies = 0;
  let nbValidations = 0;
  for (const m of moisEnBase) {
    const [ventilee, analytique] = mensuels.get(m)!;
    await importer(entity, ventilee);
    await importer(entity, analytique);
    const aValider = m <= DERNIER_MOIS_VALIDE;
    if (!aValider) {
      console.log(`  ${m.slice(0, 7)}  balances importées, mois laissé à valider (démonstration)`);
      continue;
    }

    const quand = dateReception(m, 26, 11);
    const base = { entityId: entity.id, period: m, updatedBy: COMPTE.email, updatedAt: quand, status: "final" as const };
    const saisies: Saisie[] = [];
    // Prévisions de travaux en cours : la DAF saisit celle de chaque chantier
    // qui en porte une, et un zéro quand elle se solde.
    const prov = jeu.provisions.get(m) ?? new Map<string, number>();
    const avant = jeu.provisions.get(moisPlus(m, -1)) ?? new Map<string, number>();
    const centres = [...new Set([...prov.keys(), ...avant.keys()])].filter((c) => (prov.get(c) ?? 0) > 0 || (avant.get(c) ?? 0) > 0);
    for (const centre of centres.sort()) {
      saisies.push({ ...base, centreCode: centre, field: "tec_provision", valueNum: String(prov.get(centre) ?? 0) });
      // Une partie des chantiers a été figée à la main avant la validation.
      if (centre.charCodeAt(0) % 2 === 0) saisies.push({ ...base, centreCode: centre, field: "statut", valueText: "final" });
    }
    for (const [centre, texte] of jeu.notesChantier.get(m) ?? [])
      saisies.push({ ...base, centreCode: centre, field: "note", valueText: texte });
    const noteEntite = jeu.notesEntite.get(m);
    if (noteEntite) saisies.push({ ...base, centreCode: null, field: "note", valueText: noteEntite });
    if (m === OUVERTURE_EXERCICE_COURANT) {
      const quandReports = dateDu(DATE_INSTALLATION, 15, 15);
      for (const r of reports) {
        saisies.push({ ...base, updatedAt: quandReports, centreCode: r.centre, field: "report_ouverture", subKey: "facturation", valueNum: String(r.facturation), valueText: r.label });
        saisies.push({ ...base, updatedAt: quandReports, centreCode: r.centre, field: "report_ouverture", subKey: "resultat", valueNum: String(r.resultat), valueText: r.label });
      }
      for (const [key, value] of Object.entries(jeu.objectifs))
        saisies.push({ ...base, updatedAt: quandReports, status: "draft", centreCode: null, field: "objectif_annuel", subKey: key, valueNum: String(value) });
    }
    await saisir(saisies);
    nbSaisies += saisies.length;

    // Validation du mois, comme le bouton de la vue Chantiers.
    const control = await getPrevisionControl(entity, m);
    if (!control.analytiqueImportId || !control.ventileeCovers) throw new Error(`${m} : balances incomplètes, validation impossible`);
    if (control.ecart !== 0) throw new Error(`${m} : écart prévisions saisies − comptabilisées de ${control.ecart} €`);
    const validatedAt = dateReception(m, 29, 17);
    await db.insert(tables.monthValidations).values({
      entityId: entity.id,
      period: m,
      validatedBy: COMPTE.email,
      validatedAt,
      analytiqueImportId: control.analytiqueImportId,
      ventileeImportId: control.ventileeImportId,
      ecart: String(control.ecart),
      resultatComptable: control.resultatComptable == null ? null : String(control.resultatComptable),
      resultatGestion: control.resultatGestion == null ? null : String(control.resultatGestion),
      snapshot: control,
    });
    nbValidations++;
    console.log(
      `  ${m.slice(0, 7)}  ${centres.length} prévisions (${fmtEur(control.totalComptabilise)}) · résultat du mois ${fmtEur(control.resultatComptable ?? 0)} · validé`
    );
  }

  // 5 — Deux alertes de montant fixe traitées par la DAF (loyer, crédit-bail) :
  //     le reste est laissé ouvert, c'est la matière de la démonstration.
  const traitees = await db
    .select({ id: tables.alerts.id })
    .from(tables.alerts)
    .where(
      and(
        eq(tables.alerts.entityId, entity.id),
        eq(tables.alerts.type, "montant_constant"),
        eq(tables.alerts.status, "open"),
        inArray(tables.alerts.account, ["61323000", "61200000"])
      )
    );
  if (traitees.length)
    await db
      .update(tables.alerts)
      .set({ status: "resolved", resolvedBy: COMPTE.email, resolvedAt: dateDu("2026-01-05", 5, 10) })
      .where(inArray(tables.alerts.id, traitees.map((a) => a.id)));

  const [imports, alertes] = await Promise.all([
    db.select({ id: tables.imports.id, status: tables.imports.status }).from(tables.imports).where(eq(tables.imports.entityId, entity.id)),
    db.select({ status: tables.alerts.status }).from(tables.alerts).where(eq(tables.alerts.entityId, entity.id)),
  ]);
  console.log(
    `\n✓ Entité Demo installée : ${imports.filter((i) => i.status === "validated").length} imports validés` +
      ` (${imports.filter((i) => i.status === "replaced").length} remplacés), ${nbValidations} mois validés, ${nbSaisies} saisies,` +
      ` ${alertes.filter((a) => a.status === "open").length} alertes ouvertes.`
  );
  console.log(`  À importer pendant la démonstration : ${dossier}/a-importer/ (mois de ${DERNIER_MOIS.slice(0, 7)}).`);
  if (compte.motDePasse)
    console.log(`\nConnexion : ${COMPTE.email}\nMot de passe : ${compte.motDePasse}\n(à noter maintenant : il n'est pas conservé en clair ; rotation : npm run db:password -- --email ${COMPTE.email})`);
  else console.log(`\nConnexion : ${COMPTE.email} (mot de passe inchangé ; pour le changer : --password, ou npm run db:password)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
