import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventRoundCreateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll } from '../../../db';
import { requireAdmin, requireEventAccess, requireHostOrAdmin } from '../../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (access.response) return access.response;
  const rows = await queryAll(
    env,
    `SELECT er.*, ed.timer_seconds
     FROM event_rounds er
     JOIN editions ed ON ed.id = er.edition_id
     WHERE er.event_id = ? AND COALESCE(er.deleted, 0) = 0
     ORDER BY er.round_number ASC`,
    [params.id]
  );
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = eventRoundCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid round', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const payloadData = parsed.data;

  const scoresheetTitle = payloadData.scoresheet_title ?? payloadData.label;
  await execute(
    env,
    `INSERT INTO event_rounds (id, event_id, round_number, label, scoresheet_title, edition_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      params.id,
      payloadData.round_number,
      payloadData.label,
      scoresheetTitle,
      payloadData.edition_id,
      payloadData.status,
      createdAt
    ]
  );

  const editionItems = await queryAll<{ id: string; ordinal: number }>(
    env,
    'SELECT id, ordinal FROM edition_items WHERE edition_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY ordinal ASC',
    [payloadData.edition_id]
  );

  for (const item of editionItems) {
    await execute(
      env,
      `INSERT INTO event_round_items (id, event_round_id, edition_item_id, ordinal, overridden_prompt, overridden_answer, overridden_fun_fact)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL)`
      ,
      [crypto.randomUUID(), id, item.id, item.ordinal]
    );
  }

  const rows = await queryAll(
    env,
    `SELECT er.*, ed.timer_seconds
     FROM event_rounds er
     JOIN editions ed ON ed.id = er.edition_id
     WHERE er.id = ? AND COALESCE(er.deleted, 0) = 0`,
    [id]
  );
  return jsonOk(rows[0]);
};
