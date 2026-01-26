import type { Env } from '../../../types';
import { jsonOk } from '../../../responses';
import { execute, nowIso } from '../../../db';
import { requireHostOrAdmin, requireRoundAccess } from '../../../access';

export const onRequestPost: PagesFunction<Env> = async ({ env, params, data, request }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
  if (access.response) return access.response;

  const url = new URL(request.url);
  const itemId = url.searchParams.get('item_id');
  const now = nowIso();
  if (itemId) {
    await execute(
      env,
      `UPDATE event_item_responses
       SET deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
       WHERE event_round_id = ? AND edition_item_id = ? AND COALESCE(deleted, 0) = 0`,
      [now, data.user?.id ?? null, now, params.roundId, itemId]
    );
  } else {
    await execute(
      env,
      `UPDATE event_item_responses
       SET deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
       WHERE event_round_id = ? AND COALESCE(deleted, 0) = 0`,
      [now, data.user?.id ?? null, now, params.roundId]
    );
  }

  return jsonOk({ ok: true });
};
