import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { teamUpdateSchema } from '../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../db';
import { requireAdmin } from '../../access';
import { generateTeamCode } from '../../public';

const TEAM_COLUMNS = 'id, event_id, name, table_label, team_code, team_placeholder, created_at';

const assignTeamCode = async (env: Env, eventId: string, teamId: string) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = await generateTeamCode(env, eventId);
    try {
      await execute(env, 'UPDATE teams SET team_code = ? WHERE id = ? AND team_code IS NULL', [code, teamId]);
      return code;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('unique')) continue;
      throw error;
    }
  }
  throw new Error('Unable to assign team code');
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = teamUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid team update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(
    env,
    'SELECT id, event_id, name, table_label, team_code, team_placeholder FROM teams WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [params.teamId]
  );
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }

  const merged = { ...existing, ...parsed.data };
  const name = typeof merged.name === 'string' ? merged.name.trim() : '';
  if (!name) {
    return jsonError({ code: 'validation_error', message: 'Team name is required.' }, 400);
  }
  const duplicate = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM teams WHERE event_id = ? AND lower(name) = lower(?) AND COALESCE(deleted, 0) = 0 AND id != ?',
    [existing.event_id, name, params.teamId]
  );
  if (duplicate) {
    return jsonError({ code: 'conflict', message: 'Team name already exists for this event.' }, 409);
  }
  await execute(
    env,
    `UPDATE teams SET name = ?, table_label = ? WHERE id = ?`,
    [name, merged.table_label ?? null, params.teamId]
  );

  if (!existing.team_code) {
    await assignTeamCode(env, existing.event_id, params.teamId as string);
  }
  const row = await queryFirst(env, `SELECT ${TEAM_COLUMNS} FROM teams WHERE id = ? AND COALESCE(deleted, 0) = 0`, [params.teamId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const existing = await queryFirst(env, 'SELECT id FROM teams WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.teamId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE teams SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.teamId]
  );
  return jsonOk({ ok: true });
};
