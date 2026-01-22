import type { Env } from './types';
import { jsonError } from './responses';
import { queryFirst } from './db';

type User = { id: string; user_type: string };

export function requireAdmin(user: User | null) {
  if (!user || user.user_type !== 'admin') {
    return jsonError({ code: 'forbidden', message: 'Admin access required' }, 403);
  }
  return null;
}

export function requireHostOrAdmin(user: User | null) {
  if (!user || (user.user_type !== 'admin' && user.user_type !== 'host')) {
    return jsonError({ code: 'forbidden', message: 'Host access required' }, 403);
  }
  return null;
}

export async function requireEventAccess(env: Env, user: User | null, eventId: string) {
  const event = await queryFirst<{ id: string; host_user_id: string | null }>(
    env,
    'SELECT id, host_user_id FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [eventId]
  );
  if (!event) {
    return { response: jsonError({ code: 'not_found', message: 'Event not found' }, 404), event: null };
  }
  if (user?.user_type !== 'admin' && event.host_user_id !== user?.id) {
    return { response: jsonError({ code: 'forbidden', message: 'Access denied' }, 403), event };
  }
  return { response: null, event };
}

export async function requireRoundAccess(env: Env, user: User | null, roundId: string) {
  const row = await queryFirst<{ id: string; host_user_id: string | null }>(
    env,
    `SELECT er.id, e.host_user_id
     FROM event_rounds er
     JOIN events e ON e.id = er.event_id
     WHERE er.id = ? AND COALESCE(er.deleted, 0) = 0 AND COALESCE(e.deleted, 0) = 0`,
    [roundId]
  );
  if (!row) {
    return { response: jsonError({ code: 'not_found', message: 'Event round not found' }, 404), round: null };
  }
  if (user?.user_type !== 'admin' && row.host_user_id !== user?.id) {
    return { response: jsonError({ code: 'forbidden', message: 'Access denied' }, 403), round: row };
  }
  return { response: null, round: row };
}

export async function requireTeamAccess(env: Env, user: User | null, teamId: string) {
  const row = await queryFirst<{ id: string; host_user_id: string | null }>(
    env,
    `SELECT t.id, e.host_user_id
     FROM teams t
     JOIN events e ON e.id = t.event_id
     WHERE t.id = ? AND COALESCE(t.deleted, 0) = 0 AND COALESCE(e.deleted, 0) = 0`,
    [teamId]
  );
  if (!row) {
    return { response: jsonError({ code: 'not_found', message: 'Team not found' }, 404), team: null };
  }
  if (user?.user_type !== 'admin' && row.host_user_id !== user?.id) {
    return { response: jsonError({ code: 'forbidden', message: 'Access denied' }, 403), team: row };
  }
  return { response: null, team: row };
}
