import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { gameCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll } from '../db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await queryAll(env, 'SELECT * FROM games ORDER BY created_at DESC');
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = await parseJson(request);
  const parsed = gameCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid game', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const data = parsed.data;

  await execute(
    env,
    `INSERT INTO games (id, name, description, default_settings_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
    ,
    [id, data.name, data.description ?? null, data.default_settings_json ?? null, createdAt]
  );

  const rows = await queryAll(env, 'SELECT * FROM games WHERE id = ?', [id]);
  return jsonOk(rows[0]);
};
