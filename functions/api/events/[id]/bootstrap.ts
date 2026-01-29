import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { queryAll, queryFirst } from '../../../db';
import { requireAdmin, requireEventAccess } from '../../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const access = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (access.response) return access.response;

  const event = await queryFirst(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [
    params.id
  ]);
  if (!event) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const [rounds, teams, editions, locations, games, hosts, gameTypes] = await Promise.all([
    queryAll(
      env,
      `SELECT er.*, ed.timer_seconds
       FROM event_rounds er
       JOIN editions ed ON ed.id = er.edition_id
       WHERE er.event_id = ? AND COALESCE(er.deleted, 0) = 0
       ORDER BY er.round_number ASC`,
      [params.id]
    ),
    queryAll(env, 'SELECT * FROM teams WHERE event_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY created_at DESC', [
      params.id
    ]),
    queryAll(env, 'SELECT * FROM editions WHERE COALESCE(deleted, 0) = 0 ORDER BY updated_at DESC'),
    queryAll(env, 'SELECT * FROM locations WHERE COALESCE(deleted, 0) = 0 ORDER BY created_at DESC'),
    queryAll(env, 'SELECT * FROM games WHERE COALESCE(deleted, 0) = 0 ORDER BY created_at DESC'),
    queryAll(
      env,
      `SELECT id, email, username, first_name, last_name, user_type, created_at
       FROM users
       WHERE user_type IN ('admin', 'host') AND COALESCE(deleted, 0) = 0
       ORDER BY last_name, first_name, email`
    ),
    queryAll(
      env,
      'SELECT id, name, code, default_settings_json, created_at FROM game_types WHERE COALESCE(deleted, 0) = 0 ORDER BY name ASC'
    )
  ]);

  return jsonOk({
    event,
    rounds,
    teams,
    editions,
    locations,
    games,
    hosts,
    game_types: gameTypes
  });
};
