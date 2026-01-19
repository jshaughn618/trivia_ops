import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { userCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll, queryFirst } from '../db';
import { hashPassword } from '../auth';
import { requireAdmin } from '../users';

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const guard = requireAdmin(env, data.user);
  if (guard) return guard;

  const rows = await queryAll(
    env,
    'SELECT id, email, username, first_name, last_name, user_type, created_at FROM users WHERE deleted = 0 ORDER BY created_at DESC'
  );
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const guard = requireAdmin(env, data.user);
  if (guard) return guard;

  const payload = await parseJson(request);
  const parsed = userCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid user', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT id FROM users WHERE email = ?', [parsed.data.email]);
  if (existing) {
    return jsonError({ code: 'conflict', message: 'Email already exists' }, 409);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const passwordHash = await hashPassword(parsed.data.password);

  await execute(
    env,
    `INSERT INTO users (id, email, password_hash, created_at, username, first_name, last_name, user_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      parsed.data.email,
      passwordHash,
      createdAt,
      parsed.data.username ?? null,
      parsed.data.first_name ?? null,
      parsed.data.last_name ?? null,
      parsed.data.user_type
    ]
  );

  const row = await queryFirst(
    env,
    'SELECT id, email, username, first_name, last_name, user_type, created_at FROM users WHERE id = ? AND deleted = 0',
    [id]
  );

  return jsonOk(row);
};
