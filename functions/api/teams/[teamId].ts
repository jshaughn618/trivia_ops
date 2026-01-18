import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { teamUpdateSchema } from '../../../shared/validators';
import { execute, queryFirst } from '../../db';

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = teamUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid team update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM teams WHERE id = ?', [params.teamId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE teams SET name = ?, table_label = ? WHERE id = ?`,
    [data.name, data.table_label ?? null, params.teamId]
  );

  const row = await queryFirst(env, 'SELECT * FROM teams WHERE id = ?', [params.teamId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  await execute(env, 'DELETE FROM teams WHERE id = ?', [params.teamId]);
  return jsonOk({ ok: true });
};
