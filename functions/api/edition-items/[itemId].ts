import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { editionItemUpdateSchema } from '../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../db';

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = editionItemUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid item update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM edition_items WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.itemId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Item not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE edition_items
     SET prompt = ?, answer = ?, answer_a = ?, answer_b = ?, answer_a_label = ?, answer_b_label = ?, fun_fact = ?, ordinal = ?, media_type = ?, media_key = ?, media_caption = ?
     WHERE id = ?`,
    [
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
      params.itemId
    ]
  );

  const row = await queryFirst(env, 'SELECT * FROM edition_items WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.itemId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const existing = await queryFirst(env, 'SELECT id FROM edition_items WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.itemId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Item not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE edition_items SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.itemId]
  );
  return jsonOk({ ok: true });
};
