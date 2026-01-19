import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventUpdateSchema } from '../../../../shared/validators';
import { execute, queryFirst } from '../../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const row = await queryFirst(env, 'SELECT * FROM events WHERE id = ?', [params.id]);
  if (!row) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }
  return jsonOk(row);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = eventUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid event update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM events WHERE id = ?', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE events SET title = ?, starts_at = ?, location_id = ?, host_user_id = ?, status = ?, notes = ? WHERE id = ?`,
    [
      data.title,
      data.starts_at,
      data.location_id ?? null,
      data.host_user_id ?? null,
      data.status,
      data.notes ?? null,
      params.id
    ]
  );

  const row = await queryFirst(env, 'SELECT * FROM events WHERE id = ?', [params.id]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  await execute(env, 'DELETE FROM events WHERE id = ?', [params.id]);
  return jsonOk({ ok: true });
};
