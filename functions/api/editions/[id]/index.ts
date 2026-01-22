import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { editionUpdateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../../db';
import { requireAdmin } from '../../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const row = await queryFirst(env, 'SELECT * FROM editions WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  if (!row) {
    return jsonError({ code: 'not_found', message: 'Edition not found' }, 404);
  }
  return jsonOk(row);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = editionUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid edition update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM editions WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Edition not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  const title = parsed.data.title ?? parsed.data.theme ?? data.title;
  await execute(
    env,
    `UPDATE editions SET game_id = ?, title = ?, description = ?, status = ?, tags_csv = ?, theme = ?, updated_at = ? WHERE id = ?`,
    [
      data.game_id,
      title,
      data.description ?? null,
      data.status,
      data.tags_csv ?? null,
      data.theme ?? null,
      nowIso(),
      params.id
    ]
  );

  const row = await queryFirst(env, 'SELECT * FROM editions WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const existing = await queryFirst(env, 'SELECT id FROM editions WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Edition not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE editions SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.id]
  );
  return jsonOk({ ok: true });
};
