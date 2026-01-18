import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { editionItemUpdateSchema } from '../../../shared/validators';
import { execute, queryFirst } from '../../db';

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = editionItemUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid item update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM edition_items WHERE id = ?', [params.itemId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Item not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE edition_items
     SET prompt = ?, answer = ?, fun_fact = ?, ordinal = ?, media_type = ?, media_key = ?, media_caption = ?
     WHERE id = ?`,
    [
      data.prompt,
      data.answer,
      data.fun_fact ?? null,
      data.ordinal,
      data.media_type ?? null,
      data.media_key ?? null,
      data.media_caption ?? null,
      params.itemId
    ]
  );

  const row = await queryFirst(env, 'SELECT * FROM edition_items WHERE id = ?', [params.itemId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  await execute(env, 'DELETE FROM edition_items WHERE id = ?', [params.itemId]);
  return jsonOk({ ok: true });
};
