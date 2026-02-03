import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { parseJson } from '../../../../request';
import { execute, nowIso, queryAll, queryFirst } from '../../../../db';
import { requireAdmin, requireEventAccess } from '../../../../access';
import { generateTeamCode } from '../../../../public';

const TEAM_COLUMNS = 'id, event_id, name, table_label, team_code, team_placeholder, created_at';
const DEFAULT_COUNT = 20;
const MAX_COUNT = 100;

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const access = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (access.response) return access.response;

  const payload = await parseJson(request);
  const countRaw = payload?.count;
  const count = Number.isFinite(Number(countRaw)) ? Number(countRaw) : DEFAULT_COUNT;
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    return jsonError({ code: 'validation_error', message: `Count must be between 1 and ${MAX_COUNT}.` }, 400);
  }

  const event = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [params.id]
  );
  if (!event) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const existingNames = await queryAll<{ name: string }>(
    env,
    'SELECT name FROM teams WHERE event_id = ? AND COALESCE(deleted, 0) = 0',
    [params.id]
  );
  const nameSet = new Set(existingNames.map((row) => row.name.trim().toLowerCase()));

  const createdIds: string[] = [];
  let index = 1;
  let attempts = 0;
  const maxAttempts = count * 10 + 20;

  while (createdIds.length < count && attempts < maxAttempts) {
    attempts += 1;
    const candidateName = `Team ${String(index).padStart(2, '0')}`;
    index += 1;
    if (nameSet.has(candidateName.toLowerCase())) continue;

    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const teamCode = await generateTeamCode(env, params.id as string);
    try {
      await execute(
        env,
        `INSERT INTO teams (id, event_id, name, table_label, team_code, team_placeholder, created_at)
         VALUES (?, ?, ?, NULL, ?, 1, ?)`,
        [id, params.id, candidateName, teamCode, createdAt]
      );
      createdIds.push(id);
      nameSet.add(candidateName.toLowerCase());
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('unique')) continue;
      throw error;
    }
  }

  if (createdIds.length === 0) {
    return jsonOk({ created: 0, teams: [] });
  }

  const teams = await queryAll(
    env,
    `SELECT ${TEAM_COLUMNS} FROM teams WHERE id IN (${createdIds.map(() => '?').join(',')})`,
    createdIds
  );
  return jsonOk({ created: createdIds.length, teams });
};
