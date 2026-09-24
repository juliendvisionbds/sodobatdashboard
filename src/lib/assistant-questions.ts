// Questions déjà posées à l'assistant, relues depuis son journal (assistant_logs).
//
// La DAF s'attend à ce que les mêmes questions reviennent d'un mois sur l'autre :
// l'écran propose donc les plus fréquentes et les dernières posées, par tout le
// monde — le journal est commun, pas propre à chaque personne. Deux
// formulations ne diffèrent que par la casse, les espaces ou la ponctuation
// finale sont comptées ensemble ; la formulation la plus récente est affichée.

import { sql } from "drizzle-orm";
import { db } from "@/db";

export type FrequentQuestion = { question: string; count: number };

// Clé de regroupement : minuscules, espaces réduits, ponctuation finale retirée.
const KEY = sql`lower(regexp_replace(regexp_replace(trim(question), '\\s+', ' ', 'g'), '[\\s?.!]+$', ''))`;

export async function getFrequentQuestions(
  entityId: number,
  limit = 6
): Promise<FrequentQuestion[]> {
  const r = await db.execute<{ question: string; count: number }>(sql`
    select (array_agg(question order by created_at desc))[1] as question,
           count(*)::int as count
    from assistant_logs
    where entity_id = ${entityId} and length(trim(question)) > 0
    group by ${KEY}
    order by count(*) desc, max(created_at) desc
    limit ${limit}
  `);
  return r.rows;
}

/** Dernières questions distinctes, toutes personnes confondues, la plus récente en premier. */
export async function getRecentQuestions(entityId: number, limit = 5): Promise<string[]> {
  const r = await db.execute<{ question: string }>(sql`
    select (array_agg(question order by created_at desc))[1] as question
    from assistant_logs
    where entity_id = ${entityId} and length(trim(question)) > 0
    group by ${KEY}
    order by max(created_at) desc
    limit ${limit}
  `);
  return r.rows.map((x) => x.question);
}
