import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { teamCreateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll, queryFirst } from '../../../db';
import { requireAdmin, requireEventAccess, requireHostOrAdmin } from '../../../access';
import { generateTeamCode } from '../../../public';

const TEAM_COLUMNS = 'id, event_id, name, table_label, team_code, created_at';

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

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (access.response) return access.response;
  const missing = await queryAll<{ id: string }>(
    env,
    'SELECT id FROM teams WHERE event_id = ? AND team_code IS NULL AND COALESCE(deleted, 0) = 0',
    [params.id]
  );
  for (const team of missing) {
    await assignTeamCode(env, params.id as string, team.id);
  }
  const rows = await queryAll(
    env,
    `SELECT ${TEAM_COLUMNS} FROM teams WHERE event_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY created_at ASC`,
    [params.id]
  );
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = teamCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid team', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const payloadData = parsed.data;
  const name = payloadData.name.trim();
  const teamCode = await generateTeamCode(env, params.id as string);

  const duplicate = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM teams WHERE event_id = ? AND lower(name) = lower(?) AND COALESCE(deleted, 0) = 0',
    [params.id, name]
  );
  if (duplicate) {
    return jsonError({ code: 'conflict', message: 'Team name already exists for this event.' }, 409);
  }

  await execute(
    env,
    `INSERT INTO teams (id, event_id, name, table_label, team_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
    ,
    [id, params.id, name, payloadData.table_label ?? null, teamCode, createdAt]
  );

  const rows = await queryAll(env, `SELECT ${TEAM_COLUMNS} FROM teams WHERE id = ? AND COALESCE(deleted, 0) = 0`, [id]);
  return jsonOk(rows[0]);
};
