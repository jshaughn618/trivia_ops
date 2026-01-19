import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { editionItemCreateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll } from '../../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const rows = await queryAll(
    env,
    'SELECT * FROM edition_items WHERE edition_id = ? ORDER BY ordinal ASC',
    [params.id]
  );
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = editionItemCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid item', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const data = parsed.data;

  await execute(
    env,
    `INSERT INTO edition_items
     (id, edition_id, prompt, answer, answer_a, answer_b, answer_a_label, answer_b_label, fun_fact, ordinal, media_type, media_key, media_caption, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      params.id,
      data.prompt,
      data.answer ?? '',
      data.answer_a ?? null,
      data.answer_b ?? null,
      data.answer_a_label ?? null,
      data.answer_b_label ?? null,
      data.fun_fact ?? null,
      data.ordinal,
      data.media_type ?? null,
      data.media_key ?? null,
      data.media_caption ?? null,
      createdAt
    ]
  );

  const rows = await queryAll(env, 'SELECT * FROM edition_items WHERE id = ?', [id]);
  return jsonOk(rows[0]);
};
