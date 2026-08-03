"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { canWrite, getSession, login, logout } from "@/lib/auth";
import { getEntityByCode } from "@/lib/finance";
import {
  assignAccountToCategory,
  createImportPreview,
  rejectImport,
  validateImport,
} from "@/lib/import-service";

const ENTITY = "sodobat"; // phase 1 : entité pilote

async function requireWriter() {
  const session = await getSession();
  if (!session || !canWrite(session)) throw new Error("Accès en écriture refusé.");
  const entity = await getEntityByCode(ENTITY);
  if (!entity) throw new Error("Entité introuvable.");
  return { session, entity };
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const session = await login(email, password);
  if (!session) return { error: "Identifiants incorrects." };
  redirect(String(formData.get("next") || "/"));
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// ── Imports ──────────────────────────────────────────────────────────────────

export async function uploadImportAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const { session, entity } = await requireWriter();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Sélectionnez un fichier xlsx." };
  const periodRaw = String(formData.get("period") ?? "");
  const periodOverride = periodRaw ? `${periodRaw}-01` : undefined;

  let importId: number;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await createImportPreview({
      entity,
      buffer,
      fileName: file.name,
      createdBy: session.email,
      periodOverride,
    });
    importId = result.importId;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur de parsing." };
  }
  redirect(`/imports/${importId}`);
}

export async function validateImportAction(importId: number) {
  await requireWriter();
  await validateImport(importId);
  revalidatePath("/", "layout");
  redirect("/imports");
}

export async function rejectImportAction(importId: number) {
  await requireWriter();
  await rejectImport(importId);
  revalidatePath("/imports");
  redirect("/imports");
}

// ── Mapping ──────────────────────────────────────────────────────────────────

export async function assignAccountAction(formData: FormData) {
  const { session, entity } = await requireWriter();
  const account = String(formData.get("account") ?? "");
  const categoryId = Number(formData.get("categoryId"));
  const matchType = String(formData.get("matchType") ?? "exact") as "exact" | "prefix";
  if (!account || !categoryId) return;
  await assignAccountToCategory({
    entity,
    account,
    categoryId,
    matchType,
    createdBy: session.email,
  });
  revalidatePath("/", "layout");
}

export async function deleteRuleAction(formData: FormData) {
  await requireWriter();
  const id = Number(formData.get("ruleId"));
  if (!id) return;
  await db.delete(tables.accountRules).where(eq(tables.accountRules.id, id));
  revalidatePath("/", "layout");
}

// ── Saisies manuelles (brouillon / figé) ─────────────────────────────────────

export async function saveManualEntryAction(formData: FormData) {
  const { session, entity } = await requireWriter();
  const period = String(formData.get("period") ?? "");
  const centreCode = String(formData.get("centreCode") ?? "") || null;
  const field = String(formData.get("field") ?? "") as "tec_provision" | "note";
  const status = String(formData.get("status") ?? "draft") as "draft" | "final";
  const valueNumRaw = String(formData.get("valueNum") ?? "").replace(",", ".").trim();
  const valueText = String(formData.get("valueText") ?? "") || null;
  if (!period || !field) return;

  const valueNum = valueNumRaw === "" ? null : String(parseFloat(valueNumRaw));

  const existing = await db
    .select()
    .from(tables.manualEntries)
    .where(
      and(
        eq(tables.manualEntries.entityId, entity.id),
        eq(tables.manualEntries.period, period),
        centreCode
          ? eq(tables.manualEntries.centreCode, centreCode)
          : eq(tables.manualEntries.field, field), // clé sans centre
        eq(tables.manualEntries.field, field)
      )
    );

  if (existing[0]) {
    if (existing[0].status === "final" && status !== "final") {
      throw new Error("Enregistrement figé : modification impossible avant le mois suivant.");
    }
    await db
      .update(tables.manualEntries)
      .set({
        valueNum,
        valueText,
        status,
        updatedBy: session.email,
        updatedAt: new Date(),
      })
      .where(eq(tables.manualEntries.id, existing[0].id));
  } else {
    await db.insert(tables.manualEntries).values({
      entityId: entity.id,
      period,
      centreCode,
      field,
      valueNum,
      valueText,
      status,
      updatedBy: session.email,
    });
  }
  revalidatePath("/chantiers");
  revalidatePath("/");
}

// ── Alertes ──────────────────────────────────────────────────────────────────

export async function resolveAlertAction(formData: FormData) {
  const { session } = await requireWriter();
  const id = Number(formData.get("alertId"));
  if (!id) return;
  await db
    .update(tables.alerts)
    .set({ status: "resolved", resolvedBy: session.email, resolvedAt: new Date() })
    .where(eq(tables.alerts.id, id));
  revalidatePath("/", "layout");
}
