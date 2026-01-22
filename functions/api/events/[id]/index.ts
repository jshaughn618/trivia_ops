import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventUpdateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../../db';
import { requireAdmin, requireEventAccess, requireHostOrAdmin } from '../../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const { response } = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (response) return response;
  const row = await queryFirst(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  return jsonOk(row);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = eventUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid event update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [
    params.id
  ]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE events
     SET title = ?,
         starts_at = ?,
         location_id = ?,
         host_user_id = ?,
         status = ?,
         event_type = ?,
         notes = ?,
         scoresheet_key = ?,
         scoresheet_name = ?,
         answersheet_key = ?,
         answersheet_name = ?
     WHERE id = ?`,
    [
      data.title,
      data.starts_at,
      data.location_id ?? null,
      data.host_user_id ?? null,
      data.status,
      data.event_type ?? 'Pub Trivia',
      data.notes ?? null,
      data.scoresheet_key ?? null,
      data.scoresheet_name ?? null,
      data.answersheet_key ?? null,
      data.answersheet_name ?? null,
      params.id
    ]
  );

  const row = await queryFirst(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const existing = await queryFirst(env, 'SELECT id FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [
    params.id
  ]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE events SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.id]
  );
  return jsonOk({ ok: true });
};
