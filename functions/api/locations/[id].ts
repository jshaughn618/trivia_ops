import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { locationUpdateSchema } from '../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../db';
import { requireAdmin } from '../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const row = await queryFirst(env, 'SELECT * FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  if (!row) {
    return jsonError({ code: 'not_found', message: 'Location not found' }, 404);
  }
  return jsonOk(row);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = locationUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid location update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Location not found' }, 404);
  }

  const merged = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE locations SET name = ?, address = ?, city = ?, state = ?, notes = ? WHERE id = ?`,
    [merged.name, merged.address ?? null, merged.city ?? null, merged.state ?? null, merged.notes ?? null, params.id]
  );

  const row = await queryFirst(env, 'SELECT * FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const existing = await queryFirst(env, 'SELECT id FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Location not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE locations SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.id]
  );
  return jsonOk({ ok: true });
};
