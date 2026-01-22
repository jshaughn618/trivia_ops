import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { liveStateUpdateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../../db';
import { requireEventAccess, requireHostOrAdmin } from '../../../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (access.response) return access.response;
  const row = await queryFirst<{
    id: string;
    event_id: string;
    active_round_id: string | null;
    current_item_ordinal: number | null;
    reveal_answer: number;
    reveal_fun_fact: number;
    waiting_message: string | null;
    waiting_show_leaderboard: number;
    waiting_show_next_round: number;
    updated_at: string;
  }>(
    env,
    `SELECT id, event_id, active_round_id, current_item_ordinal, reveal_answer, reveal_fun_fact,
            waiting_message, waiting_show_leaderboard, waiting_show_next_round, updated_at
     FROM event_live_state WHERE event_id = ? AND COALESCE(deleted, 0) = 0`,
    [params.id]
  );
  return jsonOk(
    row
      ? {
          ...row,
          reveal_answer: Boolean(row.reveal_answer),
          reveal_fun_fact: Boolean(row.reveal_fun_fact),
          waiting_message: row.waiting_message ?? null,
          waiting_show_leaderboard: Boolean(row.waiting_show_leaderboard),
          waiting_show_next_round: Boolean(row.waiting_show_next_round)
        }
      : null
  );
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (access.response) return access.response;
  const payload = await parseJson(request);
  const parsed = liveStateUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid live state', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM event_live_state WHERE event_id = ? AND COALESCE(deleted, 0) = 0',
    [params.id]
  );

  const now = nowIso();
  const data = parsed.data;

  if (existing) {
    const waitingMessageProvided = data.waiting_message !== undefined;
    await execute(
      env,
      `UPDATE event_live_state
       SET active_round_id = COALESCE(?, active_round_id),
           current_item_ordinal = COALESCE(?, current_item_ordinal),
           reveal_answer = COALESCE(?, reveal_answer),
           reveal_fun_fact = COALESCE(?, reveal_fun_fact),
           waiting_message = CASE WHEN ? = 1 THEN ? ELSE waiting_message END,
           waiting_show_leaderboard = COALESCE(?, waiting_show_leaderboard),
           waiting_show_next_round = COALESCE(?, waiting_show_next_round),
           updated_at = ?
       WHERE event_id = ?`,
      [
        data.active_round_id ?? null,
        data.current_item_ordinal ?? null,
        data.reveal_answer === undefined ? null : data.reveal_answer ? 1 : 0,
        data.reveal_fun_fact === undefined ? null : data.reveal_fun_fact ? 1 : 0,
        waitingMessageProvided ? 1 : 0,
        data.waiting_message ?? null,
        data.waiting_show_leaderboard === undefined ? null : data.waiting_show_leaderboard ? 1 : 0,
        data.waiting_show_next_round === undefined ? null : data.waiting_show_next_round ? 1 : 0,
        now,
        params.id
      ]
    );
  } else {
    const id = crypto.randomUUID();
    await execute(
      env,
      `INSERT INTO event_live_state
       (id, event_id, active_round_id, current_item_ordinal, reveal_answer, reveal_fun_fact,
        waiting_message, waiting_show_leaderboard, waiting_show_next_round, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.id,
        data.active_round_id ?? null,
        data.current_item_ordinal ?? null,
        data.reveal_answer ? 1 : 0,
        data.reveal_fun_fact ? 1 : 0,
        data.waiting_message ?? null,
        data.waiting_show_leaderboard ? 1 : 0,
        data.waiting_show_next_round === undefined ? 1 : data.waiting_show_next_round ? 1 : 0,
        now,
        now
      ]
    );
  }

  const row = await queryFirst<{
    id: string;
    event_id: string;
    active_round_id: string | null;
    current_item_ordinal: number | null;
    reveal_answer: number;
    reveal_fun_fact: number;
    waiting_message: string | null;
    waiting_show_leaderboard: number;
    waiting_show_next_round: number;
    updated_at: string;
  }>(
    env,
    `SELECT id, event_id, active_round_id, current_item_ordinal, reveal_answer, reveal_fun_fact,
            waiting_message, waiting_show_leaderboard, waiting_show_next_round, updated_at
     FROM event_live_state WHERE event_id = ? AND COALESCE(deleted, 0) = 0`,
    [params.id]
  );

  return jsonOk(
    row
      ? {
          ...row,
          reveal_answer: Boolean(row.reveal_answer),
          reveal_fun_fact: Boolean(row.reveal_fun_fact),
          waiting_message: row.waiting_message ?? null,
          waiting_show_leaderboard: Boolean(row.waiting_show_leaderboard),
          waiting_show_next_round: Boolean(row.waiting_show_next_round)
        }
      : null
  );
};
