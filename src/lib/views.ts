// Vues mises en cache pour les pages.
//
// Les tableaux sont recalculés à la volée depuis les lignes de balance brutes
// (README : « aucun agrégat n'est stocké »). Ce calcul enchaîne plusieurs
// dizaines de requêtes vers une base distante : plusieurs secondes par page.
// Or les données ne bougent qu'à un import, une règle de mapping, une saisie
// ou une modification de centre. On garde donc le résultat de chaque vue d'une
// requête à l'autre, et on l'invalide dès que l'état de la base a changé.
//
// L'invalidation ne repose pas sur les actions d'écriture (un script de
// maintenance qui écrit directement en base la contournerait) : chaque appel
// relit une empreinte de l'état des tables sources — une seule requête, légère —
// qui fait partie de la clé de cache. Une empreinte nouvelle, c'est un recalcul.
//
// La logique métier reste dans finance.ts, qui garde ses fonctions non mises en
// cache pour les scripts (recette, rapprochement, diagnostics).

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as finance from "./finance";
import type { Entity } from "./finance";

export type { Entity };

/**
 * Empreinte de l'état des données d'une entité : imports (et donc lignes de
 * balance, supprimées en cascade), saisies manuelles, règles de mapping,
 * nomenclature, centres. Mémoïsée par requête : une page ne la lit qu'une fois.
 */
export const dataVersion = cache(async (entityId: number): Promise<string> => {
  const r = await db.execute<{ v: string }>(sql`
    select md5(concat_ws('|',
      (select coalesce(string_agg(t::text, ',' order by t.id), '') from imports t where t.entity_id = ${entityId}),
      (select coalesce(string_agg(t::text, ',' order by t.id), '') from manual_entries t where t.entity_id = ${entityId}),
      (select coalesce(string_agg(t::text, ',' order by t.id), '') from account_rules t where t.entity_id is null or t.entity_id = ${entityId}),
      (select coalesce(string_agg(t::text, ',' order by t.id), '') from categories t),
      (select coalesce(string_agg(t::text, ',' order by t.id), '') from centres t where t.entity_id = ${entityId})
    )) as v
  `);
  return r.rows[0]?.v ?? String(Date.now());
});

// Les entrées d'une version périmée ne sont plus jamais lues : on les laisse
// expirer d'elles-mêmes au bout d'un jour.
const TTL_SECONDS = 24 * 3600;

/**
 * Enveloppe une fonction de finance.ts : son résultat est conservé entre les
 * requêtes, sous une clé qui comprend l'empreinte des données. Les arguments
 * et le résultat doivent être sérialisables en JSON (vérifié pour chaque vue).
 */
function cached<A extends unknown[], R>(
  name: string,
  fn: (entity: Entity, ...args: A) => Promise<R>
): (entity: Entity, ...args: A) => Promise<R> {
  const inner = unstable_cache(
    (_version: string, entity: Entity, ...args: A) => fn(entity, ...args),
    ["views", name],
    { revalidate: TTL_SECONDS, tags: ["views"] }
  );
  return async (entity, ...args) => inner(await dataVersion(entity.id), entity, ...args);
}

/** L'entité change à la création seulement : lecture directe, mémoïsée par requête. */
export const getEntityByCode = cache(finance.getEntityByCode);

export const getSynthese = cached("synthese", finance.getSynthese);
export const getChantiers = cached("chantiers", finance.getChantiers);
export const getFx = cached("fx", finance.getFx);
export const getFxMensuel = cached("fx-mensuel", finance.getFxMensuel);
export const getObjectifs = cached("objectifs", finance.getObjectifs);
export const listAccounts = cached("comptes", finance.listAccounts);
export const getAccountDetail = cached("compte", finance.getAccountDetail);

const periodsOf = (type: "analytique" | "ventilee") =>
  cached(`periodes-${type}`, (entity: Entity) =>
    type === "analytique"
      ? finance.listAnalytiquePeriods(entity.id)
      : finance.listVentileePeriods(entity.id)
  );
export const listAnalytiquePeriods = periodsOf("analytique");
export const listVentileePeriods = periodsOf("ventilee");
