import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { liveStateUpdateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const row = await queryFirst(
    env,
    `SELECT id, event_id, active_round_id, current_item_ordinal, reveal_answer, reveal_fun_fact, updated_at
     FROM event_live_state WHERE event_id = ? AND deleted = 0`,
    [params.id]
  );
  return jsonOk(row);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = liveStateUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid live state', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM event_live_state WHERE event_id = ? AND deleted = 0',
    [params.id]
  );

  const now = nowIso();
  const data = parsed.data;

  if (existing) {
    await execute(
      env,
      `UPDATE event_live_state
       SET active_round_id = COALESCE(?, active_round_id),
           current_item_ordinal = COALESCE(?, current_item_ordinal),
           reveal_answer = COALESCE(?, reveal_answer),
           reveal_fun_fact = COALESCE(?, reveal_fun_fact),
           updated_at = ?
       WHERE event_id = ?`,
      [
        data.active_round_id ?? null,
        data.current_item_ordinal ?? null,
        data.reveal_answer === undefined ? null : data.reveal_answer ? 1 : 0,
        data.reveal_fun_fact === undefined ? null : data.reveal_fun_fact ? 1 : 0,
        now,
        params.id
      ]
    );
  } else {
    const id = crypto.randomUUID();
    await execute(
      env,
      `INSERT INTO event_live_state
       (id, event_id, active_round_id, current_item_ordinal, reveal_answer, reveal_fun_fact, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.id,
        data.active_round_id ?? null,
        data.current_item_ordinal ?? null,
        data.reveal_answer ? 1 : 0,
        data.reveal_fun_fact ? 1 : 0,
        now,
        now
      ]
    );
  }

  const row = await queryFirst(
    env,
    `SELECT id, event_id, active_round_id, current_item_ordinal, reveal_answer, reveal_fun_fact, updated_at
     FROM event_live_state WHERE event_id = ? AND deleted = 0`,
    [params.id]
  );

  return jsonOk(row);
};
