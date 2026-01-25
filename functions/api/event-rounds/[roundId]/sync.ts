import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { execute, nowIso, queryAll, queryFirst } from '../../../db';
import { requireAdmin } from '../../../access';

export const onRequestPost: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const round = await queryFirst<{ id: string; edition_id: string }>(
    env,
    'SELECT id, edition_id FROM event_rounds WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [params.roundId]
  );
  if (!round) {
    return jsonError({ code: 'not_found', message: 'Round not found' }, 404);
  }

  const missing = await queryAll<{ id: string; ordinal: number }>(
    env,
    `SELECT ei.id, ei.ordinal
     FROM edition_items ei
     WHERE ei.edition_id = ?
       AND COALESCE(ei.deleted, 0) = 0
       AND NOT EXISTS (
         SELECT 1
         FROM event_round_items eri
         WHERE eri.event_round_id = ?
           AND eri.edition_item_id = ei.id
           AND COALESCE(eri.deleted, 0) = 0
       )
     ORDER BY ei.ordinal ASC`,
    [round.edition_id, round.id]
  );

  if (missing.length === 0) {
    return jsonOk({ inserted: 0 });
  }

  const createdAt = nowIso();
  for (const item of missing) {
    await execute(
      env,
      `INSERT INTO event_round_items
       (id, event_round_id, edition_item_id, ordinal, overridden_prompt, overridden_answer, overridden_fun_fact, created_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      [crypto.randomUUID(), round.id, item.id, item.ordinal, createdAt]
    );
  }

  return jsonOk({ inserted: missing.length });
};
