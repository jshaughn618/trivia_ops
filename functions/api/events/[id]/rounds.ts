import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventRoundCreateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll } from '../../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const rows = await queryAll(
    env,
    'SELECT * FROM event_rounds WHERE event_id = ? AND deleted = 0 ORDER BY round_number ASC',
    [params.id]
  );
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = eventRoundCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid round', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const data = parsed.data;

  await execute(
    env,
    `INSERT INTO event_rounds (id, event_id, round_number, label, edition_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
    ,
    [id, params.id, data.round_number, data.label, data.edition_id, data.status, createdAt]
  );

  const editionItems = await queryAll<{ id: string; ordinal: number }>(
    env,
    'SELECT id, ordinal FROM edition_items WHERE edition_id = ? AND deleted = 0 ORDER BY ordinal ASC',
    [data.edition_id]
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

  const rows = await queryAll(env, 'SELECT * FROM event_rounds WHERE id = ? AND deleted = 0', [id]);
  return jsonOk(rows[0]);
};
