import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { eventCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll } from '../db';
import { generateEventCode } from '../public';
import { requireAdmin, requireHostOrAdmin } from '../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const isAdmin = data.user?.user_type === 'admin';
  const params: unknown[] = [];
  let sql = 'SELECT * FROM events WHERE COALESCE(deleted, 0) = 0';
  if (!isAdmin) {
    sql += ' AND host_user_id = ?';
    params.push(data.user?.id ?? null);
  }
  sql += ' ORDER BY starts_at DESC';
  const rows = await queryAll(env, sql, params);
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
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
    `INSERT INTO events (id, title, starts_at, location_id, host_user_id, status, event_type, notes, created_at, public_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      data.title,
      data.starts_at,
      data.location_id ?? null,
      data.host_user_id ?? null,
      data.status,
      data.event_type ?? 'Pub Trivia',
      data.notes ?? null,
      createdAt,
      publicCode
    ]
  );

  const rows = await queryAll(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [id]);
  return jsonOk(rows[0]);
};
