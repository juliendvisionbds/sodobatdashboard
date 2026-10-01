"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { canFiger, getSession, ownsEntity } from "@/lib/auth";
import { genererAnalyse, type Redaction } from "@/lib/analyse-mensuelle";
import { getCurrentEntity } from "@/lib/entity";

const PERIOD = /^\d{4}-\d{2}-01$/;

// La DAF génère, relit et publie les analyses mensuelles. Les dirigeants les
// consultent une fois publiées.
async function requireDaf() {
  const session = await getSession();
  if (!session || !canFiger(session)) throw new Error("Seule la DAF peut gérer les analyses mensuelles.");
  const entity = await getCurrentEntity();
  if (!entity) throw new Error("Entité introuvable.");
  if (!ownsEntity(session, entity.id)) throw new Error("Accès refusé : autre entité.");
  return { session, entity };
}

export type AnalyseActionResult = { ok: true; warning?: string } | { ok: false; error: string };

export async function genererAnalyseAction(period: string): Promise<AnalyseActionResult> {
  try {
    const { session, entity } = await requireDaf();
    if (!PERIOD.test(period)) return { ok: false, error: "Mois invalide." };
    const { redactionError } = await genererAnalyse(entity, period, session.email);
    revalidatePath("/objectifs");
    return redactionError ? { ok: true, warning: redactionError } : { ok: true };
  } catch (e) {
    console.error("analyse mensuelle: génération impossible", e);
    return { ok: false, error: e instanceof Error ? e.message : "Génération impossible." };
  }
}

const clean = (lines: unknown) =>
  Array.isArray(lines) ? lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 8) : [];

export async function enregistrerAnalyseAction(
  period: string,
  redaction: Redaction,
  commentaire: string
): Promise<AnalyseActionResult> {
  const { entity } = await requireDaf();
  if (!PERIOD.test(period)) return { ok: false, error: "Mois invalide." };
  await db
    .update(tables.monthlyAnalyses)
    .set({
      redaction: {
        enBref: String(redaction.enBref ?? "").trim(),
        pointsForts: clean(redaction.pointsForts),
        pointsAttention: clean(redaction.pointsAttention),
        actions: clean(redaction.actions),
      },
      commentaire: commentaire.trim() || null,
    })
    .where(
      and(eq(tables.monthlyAnalyses.entityId, entity.id), eq(tables.monthlyAnalyses.period, period))
    );
  revalidatePath("/objectifs");
  return { ok: true };
}

export async function publierAnalyseAction(
  period: string,
  publier: boolean
): Promise<AnalyseActionResult> {
  const { session, entity } = await requireDaf();
  if (!PERIOD.test(period)) return { ok: false, error: "Mois invalide." };
  await db
    .update(tables.monthlyAnalyses)
    .set(
      publier
        ? { status: "published", publishedBy: session.email, publishedAt: new Date() }
        : { status: "draft", publishedBy: null, publishedAt: null }
    )
    .where(
      and(eq(tables.monthlyAnalyses.entityId, entity.id), eq(tables.monthlyAnalyses.period, period))
    );
  revalidatePath("/objectifs");
  return { ok: true };
}
