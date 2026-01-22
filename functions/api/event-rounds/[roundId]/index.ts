import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventRoundUpdateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll, queryFirst } from '../../../db';
import { requireAdmin } from '../../../access';

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const payload = await parseJson(request);
  const parsed = eventRoundUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid round update', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst(env, 'SELECT * FROM event_rounds WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.roundId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Round not found' }, 404);
  }

  const data = { ...existing, ...parsed.data };
  await execute(
    env,
    `UPDATE event_rounds SET round_number = ?, label = ?, edition_id = ?, status = ? WHERE id = ?`,
    [data.round_number, data.label, data.edition_id, data.status, params.roundId]
  );

  const event = await queryFirst<{ id: string; status: string }>(
    env,
    'SELECT id, status FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [existing.event_id]
  );
  if (event && event.status !== 'canceled') {
    const roundStatuses = await queryAll<{ status: string }>(
      env,
      'SELECT status FROM event_rounds WHERE event_id = ? AND COALESCE(deleted, 0) = 0',
      [existing.event_id]
    );
    const statuses = roundStatuses.map((round) => round.status);
    const anyNotCompleted = statuses.some((status) => status !== 'completed' && status !== 'locked');
    const anyLive = statuses.some((status) => status === 'live');
    let nextStatus: string | null = null;
    if (anyLive) {
      nextStatus = 'live';
    } else if (event.status === 'completed' && anyNotCompleted) {
      nextStatus = 'live';
    }
    if (nextStatus && nextStatus !== event.status) {
      await execute(
        env,
        'UPDATE events SET status = ?, updated_at = ? WHERE id = ?',
        [nextStatus, nowIso(), existing.event_id]
      );
    }
  }

  const row = await queryFirst(env, 'SELECT * FROM event_rounds WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.roundId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const existing = await queryFirst(env, 'SELECT id FROM event_rounds WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.roundId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Round not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE event_rounds SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.roundId]
  );
  return jsonOk({ ok: true });
};
