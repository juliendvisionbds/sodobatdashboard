// Questions déjà posées à l'assistant, relues depuis son journal (assistant_logs).
//
// La DAF s'attend à ce que les mêmes questions reviennent d'un mois sur l'autre :
// l'écran propose donc les plus fréquentes. Elles sont propres à chaque
// personne : les dirigeants des différentes entités ne voient pas les
// questions des autres. Une question effacée (conversation supprimée) n'est
// plus proposée.
//
// Seule la question qui ouvre une conversation compte : les relances (« oui »,
// « et en juin ? ») n'ont pas de sens hors de leur fil. Une conversation compte
// une fois, même si la réponse a été régénérée. Deux formulations ne différant
// que par la casse, les espaces ou la ponctuation finale sont comptées
// ensemble ; la formulation la plus récente est affichée.

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
    with premieres as (
      -- première question de chaque conversation ; les lignes antérieures à
      -- l'historique (sans conversation) comptent chacune pour elle-même
      select distinct on (coalesce(conversation_id, id::text)) question, created_at
      from assistant_logs
      where entity_id = ${entityId} and user_email = ${userEmail}
      order by coalesce(conversation_id, id::text), id
    )
    select (array_agg(question order by created_at desc))[1] as question,
           count(*)::int as count
    from premieres
    where length(trim(question)) >= 6
    group by ${KEY}
    order by count(*) desc, max(created_at) desc
    limit ${limit}
  `);
  return r.rows;
}
