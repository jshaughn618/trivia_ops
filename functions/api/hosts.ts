import type { Env } from '../types';
import { jsonOk } from '../responses';
import { queryAll } from '../db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await queryAll(
    env,
    `SELECT id, email, username, first_name, last_name, user_type, created_at
     FROM users
     WHERE user_type IN ('admin', 'host')
     ORDER BY last_name, first_name, email`
  );
  return jsonOk(rows);
};
