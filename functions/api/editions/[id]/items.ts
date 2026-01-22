import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { editionItemCreateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll } from '../../../db';
import { requireAdmin } from '../../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const rows = await queryAll(
    env,
    'SELECT * FROM edition_items WHERE edition_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY ordinal ASC',
    [params.id]
  );
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = editionItemCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid item', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const payloadData = parsed.data;

  await execute(
    env,
    `INSERT INTO edition_items
     (id, edition_id, prompt, answer, answer_a, answer_b, answer_a_label, answer_b_label, fun_fact, ordinal, media_type, media_key, audio_answer_key, media_caption, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      params.id,
      payloadData.prompt,
      payloadData.answer ?? '',
      payloadData.answer_a ?? null,
      payloadData.answer_b ?? null,
      payloadData.answer_a_label ?? null,
      payloadData.answer_b_label ?? null,
      payloadData.fun_fact ?? null,
      payloadData.ordinal,
      payloadData.media_type ?? null,
      payloadData.media_key ?? null,
      payloadData.audio_answer_key ?? null,
      payloadData.media_caption ?? null,
      createdAt
    ]
  );

  const rows = await queryAll(env, 'SELECT * FROM edition_items WHERE id = ? AND COALESCE(deleted, 0) = 0', [id]);
  return jsonOk(rows[0]);
};
