import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { userUpdateSchema } from '../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../db';
import { hashPassword } from '../../auth';
import { requireAdmin } from '../../users';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(env, data.user);
  if (guard) return guard;

  const row = await queryFirst(
    env,
    'SELECT id, email, username, first_name, last_name, user_type, created_at FROM users WHERE id = ? AND deleted = 0',
    [params.id]
  );
  if (!row) {
    return jsonError({ code: 'not_found', message: 'User not found' }, 404);
  }
  return jsonOk(row);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(env, data.user);
  if (guard) return guard;

  const payload = await parseJson(request);
  const parsed = userUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid user update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM users WHERE id = ? AND deleted = 0', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'User not found' }, 404);
  }

  const dataUpdate = { ...existing, ...parsed.data };
  const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : existing.password_hash;

  await execute(
    env,
    `UPDATE users
     SET email = ?, password_hash = ?, username = ?, first_name = ?, last_name = ?, user_type = ?
     WHERE id = ?`,
    [
      dataUpdate.email,
      passwordHash,
      dataUpdate.username ?? null,
      dataUpdate.first_name ?? null,
      dataUpdate.last_name ?? null,
      dataUpdate.user_type,
      params.id
    ]
  );

  const row = await queryFirst(
    env,
    'SELECT id, email, username, first_name, last_name, user_type, created_at FROM users WHERE id = ? AND deleted = 0',
    [params.id]
  );
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(env, data.user);
  if (guard) return guard;

  const existing = await queryFirst(env, 'SELECT id FROM users WHERE id = ? AND deleted = 0', [params.id]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'User not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE users SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.id]
  );
  return jsonOk({ ok: true });
};
