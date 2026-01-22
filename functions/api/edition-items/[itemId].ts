import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { editionItemUpdateSchema } from '../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../db';
import { requireAdmin } from '../../access';

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = editionItemUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid item update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM edition_items WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.itemId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Item not found' }, 404);
  }

  const merged = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE edition_items
     SET prompt = ?, answer = ?, answer_a = ?, answer_b = ?, answer_a_label = ?, answer_b_label = ?, fun_fact = ?, ordinal = ?, media_type = ?, media_key = ?, audio_answer_key = ?, media_caption = ?
     WHERE id = ?`,
    [
      merged.prompt,
      merged.answer ?? '',
      merged.answer_a ?? null,
      merged.answer_b ?? null,
      merged.answer_a_label ?? null,
      merged.answer_b_label ?? null,
      merged.fun_fact ?? null,
      merged.ordinal,
      merged.media_type ?? null,
      merged.media_key ?? null,
      merged.audio_answer_key ?? null,
      merged.media_caption ?? null,
      params.itemId
    ]
  );

  const row = await queryFirst(env, 'SELECT * FROM edition_items WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.itemId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
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
