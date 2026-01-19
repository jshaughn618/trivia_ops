import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { roundScoresUpdateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll } from '../../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const rows = await queryAll<{ team_id: string; score: number }>(
    env,
    `SELECT team_id, score FROM event_round_scores
     WHERE event_round_id = ? AND COALESCE(deleted, 0) = 0`,
    [params.roundId]
  );
  return jsonOk(rows);
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request }) => {
  const payload = await parseJson(request);
  const parsed = roundScoresUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid scores', details: parsed.error.flatten() }, 400);
  }

  const now = nowIso();
  for (const entry of parsed.data.scores) {
    await execute(
      env,
      `INSERT INTO event_round_scores
       (id, event_round_id, team_id, score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_round_id, team_id)
       DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`,
      [crypto.randomUUID(), params.roundId, entry.team_id, entry.score, now, now]
    );
  }

  const rows = await queryAll<{ team_id: string; score: number }>(
    env,
    `SELECT team_id, score FROM event_round_scores
     WHERE event_round_id = ? AND COALESCE(deleted, 0) = 0`,
    [params.roundId]
  );

  return jsonOk(rows);
};
