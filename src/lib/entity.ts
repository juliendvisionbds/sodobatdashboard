// Entité affichée : les tableaux portent sur une entité du groupe à la fois,
// choisie dans le menu de l'en-tête et retenue dans un cookie.
//
// Le cookie n'est qu'une préférence, lisible par le navigateur (l'écran
// d'attente y lit le nom à afficher) : le serveur ne s'y fie pas. Il ne sert
// une entité que si elle est active et que le compte y a droit — un compte
// rattaché à une entité ne voit qu'elle.

import { cookies } from "next/headers";
import { cache } from "react";
import { db, tables } from "@/db";
import { getSession, ownsEntity, type Session } from "@/lib/auth";
import type { Entity } from "@/lib/finance";
import { ENTITY_COOKIE } from "@/components/entity-cookie";

/** Entité servie quand rien n'est choisi : celle du compte, sinon l'entité pilote. */
const DEFAULT_ENTITY = "sodobat";

/** Toutes les entités du groupe, dans l'ordre de leur création. */
export const listEntities = cache(async function listEntities(): Promise<Entity[]> {
  return db.select().from(tables.entities).orderBy(tables.entities.id);
});

/** Entités que ce compte peut ouvrir : actives, et la sienne seulement s'il est rattaché. */
export async function allowedEntities(session: Session | null): Promise<Entity[]> {
  const all = await listEntities();
  return all.filter((e) => e.active && (!session || ownsEntity(session, e.id)));
}

/** Entité de la requête en cours, ou null si le compte n'a accès à aucune. */
export const getCurrentEntity = cache(async function getCurrentEntity(): Promise<Entity | null> {
  const [session, jar] = await Promise.all([getSession(), cookies()]);
  const allowed = await allowedEntities(session);
  const wanted = jar.get(ENTITY_COOKIE)?.value;
  return (
    allowed.find((e) => e.code === wanted) ??
    allowed.find((e) => e.code === DEFAULT_ENTITY) ??
    allowed[0] ??
    null
  );
});
