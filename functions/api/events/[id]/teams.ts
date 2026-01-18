import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { teamCreateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll } from '../../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const rows = await queryAll(env, 'SELECT * FROM teams WHERE event_id = ? ORDER BY created_at ASC', [params.id]);
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = teamCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid team', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const data = parsed.data;

  await execute(
    env,
    `INSERT INTO teams (id, event_id, name, table_label, created_at)
     VALUES (?, ?, ?, ?, ?)`
    ,
    [id, params.id, data.name, data.table_label ?? null, createdAt]
  );

  const rows = await queryAll(env, 'SELECT * FROM teams WHERE id = ?', [id]);
  return jsonOk(rows[0]);
};
