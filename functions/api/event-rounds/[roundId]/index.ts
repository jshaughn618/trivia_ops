import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventRoundUpdateSchema } from '../../../../shared/validators';
import { execute, queryFirst } from '../../../db';

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = eventRoundUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid round update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM event_rounds WHERE id = ?', [params.roundId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Round not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE event_rounds SET round_number = ?, label = ?, edition_id = ?, status = ? WHERE id = ?`,
    [data.round_number, data.label, data.edition_id, data.status, params.roundId]
  );

  const row = await queryFirst(env, 'SELECT * FROM event_rounds WHERE id = ?', [params.roundId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  await execute(env, 'DELETE FROM event_rounds WHERE id = ?', [params.roundId]);
  return jsonOk({ ok: true });
};
