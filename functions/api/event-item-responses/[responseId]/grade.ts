import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventItemResponseGradeSchema } from '../../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../../db';
import { requireHostOrAdmin } from '../../../access';
import { deriveExpectedAnswerParts } from '../../../response-labels';

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;

  const payload = await parseJson(request);
  const parsed = eventItemResponseGradeSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid response grade payload', details: parsed.error.flatten() }, 400);
  }

  const responseRow = await queryFirst<{
    id: string;
    event_round_id: string;
    team_id: string;
    host_user_id: string | null;
    question_type: string | null;
    answer: string | null;
    answer_a: string | null;
    answer_b: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_parts_json: string | null;
  }>(
    env,
    `SELECT
      resp.id,
      resp.event_round_id,
      resp.team_id,
      e.host_user_id,
      ei.question_type,
      COALESCE(eri.overridden_answer, ei.answer) AS answer,
      ei.answer_a,
      ei.answer_b,
      ei.answer_a_label,
      ei.answer_b_label,
      ei.answer_parts_json
     FROM event_item_responses resp
     JOIN event_rounds er ON er.id = resp.event_round_id AND COALESCE(er.deleted, 0) = 0
     JOIN events e ON e.id = er.event_id AND COALESCE(e.deleted, 0) = 0
     JOIN event_round_items eri
       ON eri.event_round_id = resp.event_round_id
      AND eri.edition_item_id = resp.edition_item_id
      AND COALESCE(eri.deleted, 0) = 0
     JOIN edition_items ei ON ei.id = resp.edition_item_id AND COALESCE(ei.deleted, 0) = 0
     WHERE resp.id = ? AND COALESCE(resp.deleted, 0) = 0`,
    [params.responseId as string]
  );
  if (!responseRow) {
    return jsonError({ code: 'not_found', message: 'Response not found.' }, 404);
  }

  const user = data.user as { id?: string; user_type?: string } | null | undefined;
  const isAdmin = user?.user_type === 'admin';
  if (!isAdmin && responseRow.host_user_id !== user?.id) {
    return jsonError({ code: 'forbidden', message: 'Access denied' }, 403);
  }

  const now = nowIso();
  const approvedPoints = parsed.data.approved_points;
  const maxPoints = (
    responseRow.question_type === 'multiple_choice'
      ? [{ label: 'Answer', answer: responseRow.answer ?? '', points: 1 }]
      : deriveExpectedAnswerParts(
        {
          question_type: responseRow.question_type,
          answer: responseRow.answer,
          answer_a: responseRow.answer_a,
          answer_b: responseRow.answer_b,
          answer_a_label: responseRow.answer_a_label,
          answer_b_label: responseRow.answer_b_label,
          answer_parts_json: responseRow.answer_parts_json
        },
        { fallbackSingleAnswer: true }
      )
  ).reduce((sum, part) => sum + Math.max(0, part.points), 0);
  if (approvedPoints !== null && approvedPoints > maxPoints) {
    return jsonError(
      { code: 'validation_error', message: `approved_points cannot exceed max points (${maxPoints}).` },
      400
    );
  }

  await execute(
    env,
    `UPDATE event_item_responses
     SET approved_points = ?,
         approved_at = ?,
         approved_by = ?,
         updated_at = ?
     WHERE id = ?`,
    [approvedPoints, approvedPoints === null ? null : now, approvedPoints === null ? null : user?.id ?? null, now, responseRow.id]
  );

  const sumRow = await queryFirst<{ total: number | null }>(
    env,
    `SELECT SUM(COALESCE(approved_points, 0)) AS total
     FROM event_item_responses
     WHERE event_round_id = ?
       AND team_id = ?
       AND COALESCE(deleted, 0) = 0`,
    [responseRow.event_round_id, responseRow.team_id]
  );
  const total = sumRow?.total ?? 0;

  await execute(
    env,
    `INSERT INTO event_round_scores
     (id, event_round_id, team_id, score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_round_id, team_id)
     DO UPDATE SET score = excluded.score,
                   updated_at = excluded.updated_at,
                   deleted = 0,
                   deleted_at = NULL,
                   deleted_by = NULL`,
    [crypto.randomUUID(), responseRow.event_round_id, responseRow.team_id, total, now, now]
  );

  return jsonOk({
    response_id: responseRow.id,
    event_round_id: responseRow.event_round_id,
    team_id: responseRow.team_id,
    approved_points: approvedPoints,
    round_total: total
  });
};
