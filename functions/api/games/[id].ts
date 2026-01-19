import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { gameUpdateSchema } from '../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const row = await queryFirst(env, 'SELECT * FROM games WHERE id = ? AND deleted = 0', [params.id]);
  if (!row) {
    return jsonError({ code: 'not_found', message: 'Game not found' }, 404);
  }
  return jsonOk(row);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = gameUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid game update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM games WHERE id = ? AND deleted = 0', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Game not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE games SET name = ?, game_type_id = ?, description = ?, default_settings_json = ? WHERE id = ?`,
    [data.name, data.game_type_id, data.description ?? null, data.default_settings_json ?? null, params.id]
  );

  const row = await queryFirst(env, 'SELECT * FROM games WHERE id = ? AND deleted = 0', [params.id]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const existing = await queryFirst(env, 'SELECT id FROM games WHERE id = ? AND deleted = 0', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Game not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE games SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.id]
  );
  return jsonOk({ ok: true });
};
