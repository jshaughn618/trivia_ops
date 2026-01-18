import type { Env } from '../types';
import { jsonOk } from '../responses';
import { queryAll } from '../db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const rows = await queryAll(
    env,
    'SELECT id, name, code, default_settings_json, created_at FROM game_types WHERE deleted = 0 ORDER BY name ASC'
  );
  return jsonOk(rows);
};
