import type { Env } from '../../../types';
import { jsonOk } from '../../../responses';
import { queryAll, queryFirst } from '../../../db';
import { requireHostOrAdmin, requireRoundAccess } from '../../../access';
import { buildRuntimeGameExampleItem } from '../../../game-example-item';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data, request }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
  if (access.response) return access.response;
  const url = new URL(request.url);
  const includeExample = url.searchParams.get('include_example') === '1';
  const rows = await queryAll(
    env,
    `SELECT
      ei.id,
      ei.edition_id,
      ei.question_type,
      ei.choices_json,
      COALESCE(eri.overridden_prompt, ei.prompt) AS prompt,
      COALESCE(eri.overridden_answer, ei.answer) AS answer,
      ei.answer_a,
      ei.answer_b,
      ei.answer_a_label,
      ei.answer_b_label,
      ei.answer_parts_json,
      COALESCE(eri.overridden_fun_fact, ei.fun_fact) AS fun_fact,
      eri.ordinal AS ordinal,
      ei.media_type,
      ei.media_key,
      ei.audio_answer_key,
      ei.media_caption,
      ei.created_at,
      0 AS is_example_item
    FROM event_round_items eri
    JOIN edition_items ei ON ei.id = eri.edition_item_id
    WHERE eri.event_round_id = ? AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0
    ORDER BY eri.ordinal ASC`,
    [params.roundId]
  );

  if (!includeExample) {
    return jsonOk(rows);
  }

  const round = await queryFirst<{ game_id: string; example_item_json: string | null }>(
    env,
    `SELECT g.id AS game_id, g.example_item_json
     FROM event_rounds er
     JOIN editions ed ON ed.id = er.edition_id AND COALESCE(ed.deleted, 0) = 0
     JOIN games g ON g.id = ed.game_id AND COALESCE(g.deleted, 0) = 0
     WHERE er.id = ? AND COALESCE(er.deleted, 0) = 0`,
    [params.roundId]
  );

  const exampleItem = round ? buildRuntimeGameExampleItem(round.game_id, round.example_item_json) : null;
  return jsonOk(exampleItem ? [exampleItem, ...rows] : rows);
};
