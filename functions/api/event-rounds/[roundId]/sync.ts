import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { execute, nowIso, queryAll, queryFirst } from '../../../db';
import { requireAdmin } from '../../../access';

export const onRequestPost: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const round = await queryFirst<{ id: string; event_id: string; edition_id: string; timer_seconds: number | null }>(
    env,
    `SELECT er.id, er.event_id, er.edition_id, ed.timer_seconds
     FROM event_rounds er
     JOIN editions ed ON ed.id = er.edition_id
     WHERE er.id = ? AND COALESCE(er.deleted, 0) = 0`,
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

  const live = await queryFirst<{ id: string; active_round_id: string | null; timer_started_at: string | null }>(
    env,
    'SELECT id, active_round_id, timer_started_at FROM event_live_state WHERE event_id = ? AND COALESCE(deleted, 0) = 0',
    [round.event_id]
  );
  if (live && live.active_round_id === round.id && !live.timer_started_at) {
    await execute(
      env,
      'UPDATE event_live_state SET timer_duration_seconds = ?, updated_at = ? WHERE id = ?',
      [round.timer_seconds ?? 15, nowIso(), live.id]
    );
  }

  return jsonOk({ inserted: missing.length });
};
