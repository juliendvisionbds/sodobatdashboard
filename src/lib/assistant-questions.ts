// Questions déjà posées à l'assistant, relues depuis son journal (assistant_logs).
//
// La DAF s'attend à ce que les mêmes questions reviennent d'un mois sur l'autre :
// l'écran propose donc les plus fréquentes. Elles sont propres à chaque
// personne : les dirigeants des différentes entités ne voient pas les
// questions des autres. Une question effacée (conversation supprimée) n'est
// plus proposée. Deux
// formulations ne diffèrent que par la casse, les espaces ou la ponctuation
// finale sont comptées ensemble ; la formulation la plus récente est affichée.

import { sql } from "drizzle-orm";
import { db } from "@/db";

export type FrequentQuestion = { question: string; count: number };

// Clé de regroupement : minuscules, espaces réduits, ponctuation finale retirée.
const KEY = sql`lower(regexp_replace(regexp_replace(trim(question), '\\s+', ' ', 'g'), '[\\s?.!]+$', ''))`;

export async function getFrequentQuestions(
  entityId: number,
  userEmail: string,
  limit = 6
): Promise<FrequentQuestion[]> {
  const r = await db.execute<{ question: string; count: number }>(sql`
    select (array_agg(question order by created_at desc))[1] as question,
           count(*)::int as count
    from assistant_logs
    where entity_id = ${entityId} and user_email = ${userEmail}
      and length(trim(question)) > 0
    group by ${KEY}
    order by count(*) desc, max(created_at) desc
    limit ${limit}
  `);
  return r.rows;
}
