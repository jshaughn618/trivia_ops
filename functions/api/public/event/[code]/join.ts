import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { parseJson } from '../../../../request';
import { publicJoinSchema } from '../../../../../shared/validators';
import { normalizeCode } from '../../../../public';
import { execute, nowIso, queryAll, queryFirst } from '../../../../db';

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const code = normalizeCode(params.code as string);
  const payload = await parseJson(request);
  const parsed = publicJoinSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid join request', details: parsed.error.flatten() }, 400);
  }

  const event = await queryFirst<{ id: string; status: string }>(
    env,
    'SELECT id, status FROM events WHERE public_code = ? AND deleted = 0',
    [code]
  );

  if (!event) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }
  if (event.status === 'completed' || event.status === 'canceled') {
    return jsonError({ code: 'event_closed', message: 'Event is closed' }, 403);
  }

  if (parsed.data.team_id) {
    const team = await queryFirst<{ id: string; name: string }>(
      env,
      'SELECT id, name FROM teams WHERE id = ? AND event_id = ? AND deleted = 0',
      [parsed.data.team_id, event.id]
    );
    if (!team) {
      return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
    }
    return jsonOk({ team });
  }

  if (!parsed.data.team_name) {
    return jsonError({ code: 'validation_error', message: 'Team name required' }, 400);
  }

  const existing = await queryFirst<{ id: string; name: string }>(
    env,
    'SELECT id, name FROM teams WHERE event_id = ? AND lower(name) = lower(?) AND deleted = 0',
    [event.id, parsed.data.team_name]
  );

  if (existing) {
    return jsonOk({ team: existing });
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  await execute(
    env,
    'INSERT INTO teams (id, event_id, name, table_label, created_at) VALUES (?, ?, ?, NULL, ?)',
    [id, event.id, parsed.data.team_name, createdAt]
  );

  const team = await queryFirst<{ id: string; name: string }>(
    env,
    'SELECT id, name FROM teams WHERE id = ?',
    [id]
  );

  return jsonOk({ team });
};
