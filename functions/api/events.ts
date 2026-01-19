import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { eventCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll } from '../db';
import { generateEventCode } from '../public';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await queryAll(env, 'SELECT * FROM events ORDER BY starts_at DESC');
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = await parseJson(request);
  const parsed = eventCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid event', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const data = parsed.data;
  const publicCode = await generateEventCode(env);

  await execute(
    env,
    `INSERT INTO events (id, title, starts_at, location_id, status, notes, created_at, public_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      data.title,
      data.starts_at,
      data.location_id ?? null,
      data.status,
      data.notes ?? null,
      createdAt,
      publicCode
    ]
  );

  const rows = await queryAll(env, 'SELECT * FROM events WHERE id = ?', [id]);
  return jsonOk(rows[0]);
};
