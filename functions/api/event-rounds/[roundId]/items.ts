import type { Env } from '../../../types';
import { jsonOk } from '../../../responses';
import { queryAll } from '../../../db';
import { requireHostOrAdmin, requireRoundAccess } from '../../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
  if (access.response) return access.response;
  const rows = await queryAll(
    env,
    `SELECT
      ei.id,
      ei.edition_id,
      COALESCE(eri.overridden_prompt, ei.prompt) AS prompt,
      COALESCE(eri.overridden_answer, ei.answer) AS answer,
      ei.answer_a,
      ei.answer_b,
      ei.answer_a_label,
      ei.answer_b_label,
      COALESCE(eri.overridden_fun_fact, ei.fun_fact) AS fun_fact,
      eri.ordinal AS ordinal,
     ei.media_type,
     ei.media_key,
     ei.media_caption,
     ei.created_at
    FROM event_round_items eri
    JOIN edition_items ei ON ei.id = eri.edition_item_id
    WHERE eri.event_round_id = ? AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0
    ORDER BY eri.ordinal ASC`,
    [params.roundId]
  );

  return jsonOk(rows);
};
