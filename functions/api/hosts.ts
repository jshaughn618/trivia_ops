import type { Env } from '../types';
import { jsonOk } from '../responses';
import { queryAll } from '../db';
import { requireAdmin } from '../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const rows = await queryAll(
    env,
    `SELECT id, email, username, first_name, last_name, user_type, created_at
     FROM users
     WHERE user_type IN ('admin', 'host') AND COALESCE(deleted, 0) = 0
     ORDER BY last_name, first_name, email`
  );
  return jsonOk(rows);
};
