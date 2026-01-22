import type { Env } from '../types';
import { jsonOk } from '../responses';
import { queryAll } from '../db';
import { requireAdmin } from '../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const rows = await queryAll(
    env,
    'SELECT id, name, code, default_settings_json, created_at FROM game_types WHERE COALESCE(deleted, 0) = 0 ORDER BY name ASC'
  );
  return jsonOk(rows);
};
