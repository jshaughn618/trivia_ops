import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { gameCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll, queryFirst } from '../db';
import { requireAdmin } from '../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const rows = await queryAll(env, 'SELECT * FROM games WHERE COALESCE(deleted, 0) = 0 ORDER BY created_at DESC');
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = gameCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid game', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const payloadData = parsed.data;
  const name = payloadData.name.trim();

  const duplicate = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM games WHERE lower(name) = lower(?) AND COALESCE(deleted, 0) = 0',
    [name]
  );
  if (duplicate) {
    return jsonError({ code: 'conflict', message: 'Game name already exists.' }, 409);
  }

  const gameType = await queryFirst<{ default_settings_json: string | null }>(
    env,
    'SELECT default_settings_json FROM game_types WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [payloadData.game_type_id]
  );

  const defaultSettings = payloadData.default_settings_json ?? gameType?.default_settings_json ?? null;

  const showThemeValue = payloadData.show_theme === undefined ? 1 : payloadData.show_theme ? 1 : 0;
  await execute(
    env,
    `INSERT INTO games (id, name, game_type_id, description, subtype, default_settings_json, show_theme, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      payloadData.game_type_id,
      payloadData.description ?? null,
      payloadData.subtype ?? null,
      defaultSettings,
      showThemeValue,
      createdAt
    ]
  );

  const rows = await queryAll(env, 'SELECT * FROM games WHERE id = ? AND COALESCE(deleted, 0) = 0', [id]);
  return jsonOk(rows[0]);
};
