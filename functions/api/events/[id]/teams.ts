import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { teamCreateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll, queryFirst } from '../../../db';
import { requireAdmin, requireEventAccess, requireHostOrAdmin } from '../../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (access.response) return access.response;
  const rows = await queryAll(
    env,
    'SELECT * FROM teams WHERE event_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY created_at ASC',
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
    `INSERT INTO teams (id, event_id, name, table_label, created_at)
     VALUES (?, ?, ?, ?, ?)`
    ,
    [id, params.id, name, payloadData.table_label ?? null, createdAt]
  );

  const rows = await queryAll(env, 'SELECT * FROM teams WHERE id = ? AND COALESCE(deleted, 0) = 0', [id]);
  return jsonOk(rows[0]);
};
