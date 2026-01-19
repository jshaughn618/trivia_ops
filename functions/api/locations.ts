import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { locationCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll } from '../db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await queryAll(env, 'SELECT * FROM locations WHERE COALESCE(deleted, 0) = 0 ORDER BY created_at DESC');
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = await parseJson(request);
  const parsed = locationCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid location', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const data = parsed.data;

  await execute(
    env,
    `INSERT INTO locations (id, name, address, city, state, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      data.name,
      data.address ?? null,
      data.city ?? null,
      data.state ?? null,
      data.notes ?? null,
      createdAt
    ]
  );

  const rows = await queryAll(env, 'SELECT * FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0', [id]);
  return jsonOk(rows[0]);
};
