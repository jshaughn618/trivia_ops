import type { AuthenticatedUser, Env } from './types';
import { jsonError } from './responses';
import { queryFirst } from './db';

function normalizeUser(user: unknown): AuthenticatedUser | null {
  if (!user || typeof user !== 'object') return null;
  const candidate = user as {
    id?: unknown;
    email?: unknown;
    created_at?: unknown;
    username?: unknown;
    first_name?: unknown;
    last_name?: unknown;
    user_type?: unknown;
  };
  if (typeof candidate.id !== 'string' || typeof candidate.user_type !== 'string') return null;
  if (candidate.user_type !== 'admin' && candidate.user_type !== 'host' && candidate.user_type !== 'player') {
    return null;
  }
  return {
    id: candidate.id,
    email: typeof candidate.email === 'string' ? candidate.email : '',
    created_at: typeof candidate.created_at === 'string' ? candidate.created_at : '',
    username: typeof candidate.username === 'string' ? candidate.username : null,
    first_name: typeof candidate.first_name === 'string' ? candidate.first_name : null,
    last_name: typeof candidate.last_name === 'string' ? candidate.last_name : null,
    user_type: candidate.user_type
  };
}

export function requireAdmin(user: unknown) {
  const authUser = normalizeUser(user);
  if (!authUser || authUser.user_type !== 'admin') {
    return jsonError({ code: 'forbidden', message: 'Admin access required' }, 403);
  }
  return null;
}

export function requireHostOrAdmin(user: unknown) {
  const authUser = normalizeUser(user);
  if (!authUser || (authUser.user_type !== 'admin' && authUser.user_type !== 'host')) {
    return jsonError({ code: 'forbidden', message: 'Host access required' }, 403);
  }
  return null;
}

export async function requireEventAccess(env: Env, user: unknown, eventId: string) {
  const authUser = normalizeUser(user);
  const event = await queryFirst<{ id: string; host_user_id: string | null }>(
    env,
    'SELECT id, host_user_id FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [eventId]
  );
  if (!event) {
    return { response: jsonError({ code: 'not_found', message: 'Event not found' }, 404), event: null };
  }
  if (authUser?.user_type !== 'admin' && event.host_user_id !== authUser?.id) {
    return { response: jsonError({ code: 'forbidden', message: 'Access denied' }, 403), event };
  }
  return { response: null, event };
}

export async function requireRoundAccess(env: Env, user: unknown, roundId: string) {
  const authUser = normalizeUser(user);
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
  if (authUser?.user_type !== 'admin' && row.host_user_id !== authUser?.id) {
    return { response: jsonError({ code: 'forbidden', message: 'Access denied' }, 403), round: row };
  }
  return { response: null, round: row };
}

export async function requireTeamAccess(env: Env, user: unknown, teamId: string) {
  const authUser = normalizeUser(user);
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
  if (authUser?.user_type !== 'admin' && row.host_user_id !== authUser?.id) {
    return { response: jsonError({ code: 'forbidden', message: 'Access denied' }, 403), team: row };
  }
  return { response: null, team: row };
}
