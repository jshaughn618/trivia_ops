import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { teamUpdateSchema } from '../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../db';
import { requireAdmin } from '../../access';

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = teamUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid team update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM teams WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.teamId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }

  const merged = { ...existing, ...parsed.data };
  const name = typeof merged.name === 'string' ? merged.name.trim() : '';
  if (!name) {
    return jsonError({ code: 'validation_error', message: 'Team name is required.' }, 400);
  }
  const duplicate = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM teams WHERE event_id = ? AND lower(name) = lower(?) AND COALESCE(deleted, 0) = 0 AND id != ?',
    [existing.event_id, name, params.teamId]
  );
  if (duplicate) {
    return jsonError({ code: 'conflict', message: 'Team name already exists for this event.' }, 409);
  }
  await execute(
    env,
    `UPDATE teams SET name = ?, table_label = ? WHERE id = ?`,
    [name, merged.table_label ?? null, params.teamId]
  );

  const row = await queryFirst(env, 'SELECT * FROM teams WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.teamId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const existing = await queryFirst(env, 'SELECT id FROM teams WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.teamId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE teams SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.teamId]
  );
  return jsonOk({ ok: true });
};
