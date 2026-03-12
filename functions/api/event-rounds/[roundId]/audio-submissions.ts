import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventRoundAudioSubmissionMarkSchema, eventRoundAudioSubmissionResetSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll, queryFirst } from '../../../db';
import { requireHostOrAdmin, requireRoundAccess } from '../../../access';
import { deriveExpectedAnswerParts } from '../../../response-labels';
import { logWarn } from '../../../_lib/log';

type SubmissionRow = {
  event_round_id: string;
  edition_item_id: string;
  ordinal: number;
  prompt: string;
  team_id: string | null;
  team_name: string | null;
  response_parts_json: string | null;
  submitted_at: string | null;
  approved_points: number | null;
  approved_parts_json: string | null;
  is_correct: number | null;
  marked_at: string | null;
};

const listSubmissions = (env: Env, roundId: string) =>
  queryAll<SubmissionRow>(
    env,
    `SELECT
      eri.event_round_id,
      eri.edition_item_id,
      eri.ordinal,
      COALESCE(eri.overridden_prompt, ei.prompt) AS prompt,
      resp.team_id,
      t.name AS team_name,
      resp.response_parts_json,
      resp.submitted_at,
      resp.approved_points,
      resp.approved_parts_json,
      resp.is_correct,
      resp.marked_at
     FROM event_round_items eri
     JOIN edition_items ei ON ei.id = eri.edition_item_id AND COALESCE(ei.deleted, 0) = 0
     LEFT JOIN event_item_responses resp
       ON resp.id = (
         SELECT r.id
         FROM event_item_responses r
         WHERE r.event_round_id = eri.event_round_id
           AND r.edition_item_id = eri.edition_item_id
           AND COALESCE(r.deleted, 0) = 0
           AND r.response_parts_json IS NOT NULL
         ORDER BY r.submitted_at DESC
         LIMIT 1
       )
     LEFT JOIN teams t ON t.id = resp.team_id AND COALESCE(t.deleted, 0) = 0
     WHERE eri.event_round_id = ? AND COALESCE(eri.deleted, 0) = 0
     ORDER BY eri.ordinal ASC`,
    [roundId]
  );

const normalizeRows = (rows: SubmissionRow[]) =>
  rows.map((row) => ({
    event_round_id: row.event_round_id,
    edition_item_id: row.edition_item_id,
    ordinal: row.ordinal,
    prompt: row.prompt,
    team_id: row.team_id ?? null,
    team_name: row.team_name ?? null,
    response_parts_json: row.response_parts_json ?? null,
    submitted_at: row.submitted_at ?? null,
    approved_points: row.approved_points ?? null,
    approved_parts_json: row.approved_parts_json ?? null,
    is_correct: row.is_correct === null || row.is_correct === undefined ? null : Boolean(row.is_correct),
    marked_at: row.marked_at ?? null
  }));

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
  if (access.response) return access.response;
  const rows = await listSubmissions(env, params.roundId as string);
  return jsonOk(normalizeRows(rows));
};

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
  if (access.response) return access.response;
  const payload = await parseJson(request);
  const parsed = eventRoundAudioSubmissionMarkSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid audio submission mark', details: parsed.error.flatten() }, 400);
  }

  const existing = await queryFirst<{
    id: string;
    team_id: string;
    game_subtype: string | null;
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
       resp.team_id,
       g.subtype AS game_subtype,
       ei.question_type,
       COALESCE(eri.overridden_answer, ei.answer) AS answer,
       ei.answer_a,
       ei.answer_b,
       ei.answer_a_label,
       ei.answer_b_label,
       ei.answer_parts_json
     FROM event_item_responses resp
     JOIN event_round_items eri
       ON eri.event_round_id = resp.event_round_id
      AND eri.edition_item_id = resp.edition_item_id
      AND COALESCE(eri.deleted, 0) = 0
     JOIN event_rounds er ON er.id = resp.event_round_id AND COALESCE(er.deleted, 0) = 0
     JOIN editions ed ON ed.id = er.edition_id AND COALESCE(ed.deleted, 0) = 0
     JOIN games g ON g.id = ed.game_id AND COALESCE(g.deleted, 0) = 0
     JOIN edition_items ei ON ei.id = resp.edition_item_id AND COALESCE(ei.deleted, 0) = 0
     WHERE resp.event_round_id = ?
       AND resp.edition_item_id = ?
       AND resp.response_parts_json IS NOT NULL
       AND COALESCE(resp.deleted, 0) = 0
     ORDER BY resp.submitted_at DESC, resp.updated_at DESC
     LIMIT 1`,
    [params.roundId, parsed.data.edition_item_id]
  );
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'No submitted answer found for this item.' }, 404);
  }

  const now = nowIso();
  const markerUserId = (data.user as { id?: string } | null | undefined)?.id ?? null;
  const isStopRound = existing.game_subtype === 'stop';
  const expectedParts = deriveExpectedAnswerParts(
    {
      question_type: existing.question_type,
      answer: existing.answer,
      answer_a: existing.answer_a,
      answer_b: existing.answer_b,
      answer_a_label: existing.answer_a_label,
      answer_b_label: existing.answer_b_label,
      answer_parts_json: existing.answer_parts_json
    },
    { fallbackSingleAnswer: true }
  );
  const partMarksByLabel = new Map(
    (parsed.data.approved_parts ?? []).map((part) => [part.label.trim().toLowerCase(), part.is_correct])
  );
  const fallbackMark = parsed.data.approved_parts ? undefined : parsed.data.is_correct ?? null;
  const approvedParts = expectedParts.map((part) => {
    const nextMark =
      partMarksByLabel.get(part.label.trim().toLowerCase()) ?? (fallbackMark === undefined ? null : fallbackMark);
    const effectivePoints = part.points * (isStopRound ? 2 : 1);
    return {
      label: part.label,
      is_correct: nextMark,
      awarded_points: nextMark === true ? effectivePoints : nextMark === false && isStopRound ? -effectivePoints : 0,
      max_points: effectivePoints
    };
  });
  const hasAnyMarks = approvedParts.some((part) => part.is_correct !== null);
  const allMarked = approvedParts.length > 0 && approvedParts.every((part) => part.is_correct !== null);
  const approvedPoints = hasAnyMarks
    ? approvedParts.reduce((sum, part) => sum + (part.is_correct === true ? part.max_points : 0), 0)
    : null;
  const maxPoints = approvedParts.reduce((sum, part) => sum + part.max_points, 0);
  const minimumPoints = isStopRound ? approvedParts.reduce((sum, part) => sum - part.max_points, 0) : 0;
  const normalizedApprovedPoints =
    approvedPoints === null
      ? null
      : approvedParts.reduce((sum, part) => sum + part.awarded_points, 0);
  const overallCorrect = allMarked ? approvedPoints === maxPoints : null;
  await execute(
    env,
    `UPDATE event_item_responses
     SET approved_parts_json = ?,
         approved_points = ?,
         approved_at = ?,
         approved_by = ?,
         is_correct = ?,
         marked_at = ?,
         marked_by = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      hasAnyMarks ? JSON.stringify(approvedParts) : null,
      normalizedApprovedPoints === null ? null : Math.max(minimumPoints, Math.min(maxPoints, normalizedApprovedPoints)),
      hasAnyMarks ? now : null,
      hasAnyMarks ? markerUserId : null,
      overallCorrect === null ? null : overallCorrect ? 1 : 0,
      hasAnyMarks ? now : null,
      hasAnyMarks ? markerUserId : null,
      now,
      existing.id
    ]
  );

  const sumRow = await queryFirst<{ total: number | null }>(
    env,
    `SELECT SUM(COALESCE(approved_points, 0)) AS total
     FROM event_item_responses
     WHERE event_round_id = ?
       AND team_id = ?
       AND COALESCE(deleted, 0) = 0`,
    [params.roundId, existing.team_id]
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
    [crypto.randomUUID(), params.roundId as string, existing.team_id, total, now, now]
  );

  const rows = await listSubmissions(env, params.roundId as string);
  const next = normalizeRows(rows).find((row) => row.edition_item_id === parsed.data.edition_item_id);
  if (!next) {
    return jsonError({ code: 'not_found', message: 'Updated item not found.' }, 404);
  }
  return jsonOk(next);
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
  if (access.response) return access.response;
  const payload = await parseJson(request);
  const parsed = eventRoundAudioSubmissionResetSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid audio submission reset request', details: parsed.error.flatten() }, 400);
  }

  const roundItem = await queryFirst<{ event_id: string; ordinal: number }>(
    env,
    `SELECT er.event_id, eri.ordinal
     FROM event_round_items eri
     JOIN event_rounds er ON er.id = eri.event_round_id AND COALESCE(er.deleted, 0) = 0
     WHERE eri.event_round_id = ? AND eri.edition_item_id = ? AND COALESCE(eri.deleted, 0) = 0`,
    [params.roundId, parsed.data.edition_item_id]
  );
  if (!roundItem) {
    return jsonError({ code: 'not_found', message: 'Item not found in this round.' }, 404);
  }

  const now = nowIso();
  const markerUserId = (data.user as { id?: string } | null | undefined)?.id ?? null;
  await execute(
    env,
    `UPDATE event_item_responses
     SET choice_index = NULL,
         choice_text = NULL,
         response_parts_json = NULL,
         approved_parts_json = NULL,
         approved_points = NULL,
         approved_at = NULL,
         approved_by = NULL,
         is_correct = NULL,
         marked_at = NULL,
         marked_by = NULL,
         updated_at = ?,
         deleted = 0,
         deleted_at = NULL,
         deleted_by = NULL
     WHERE event_round_id = ?
       AND edition_item_id = ?
       AND COALESCE(deleted, 0) = 0`,
    [now, params.roundId, parsed.data.edition_item_id]
  );

  const scoreRows = await queryAll<{ team_id: string; total: number | null }>(
    env,
    `SELECT team_id, SUM(COALESCE(approved_points, 0)) AS total
     FROM event_item_responses
     WHERE event_round_id = ?
       AND COALESCE(deleted, 0) = 0
     GROUP BY team_id`,
    [params.roundId]
  );
  await execute(env, `DELETE FROM event_round_scores WHERE event_round_id = ?`, [params.roundId]);
  for (const scoreRow of scoreRows) {
    await execute(
      env,
      `INSERT INTO event_round_scores
       (id, event_round_id, team_id, score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), params.roundId as string, scoreRow.team_id, scoreRow.total ?? 0, now, now]
    );
  }

  await execute(
    env,
    `UPDATE event_live_state
     SET participant_audio_stopped_by_team_id = NULL,
         participant_audio_stopped_by_team_name = NULL,
         participant_audio_stopped_at = NULL,
         audio_playing = 0,
         stop_enabled_at = NULL,
         reveal_answer = 0,
         reveal_fun_fact = 0,
         timer_started_at = NULL,
         timer_duration_seconds = NULL,
         updated_at = ?
     WHERE event_id = ?
       AND active_round_id = ?
       AND current_item_ordinal = ?
       AND COALESCE(deleted, 0) = 0`,
    [now, roundItem.event_id, params.roundId, roundItem.ordinal]
  );

  try {
    await execute(
      env,
      `UPDATE event_audio_stop_attempts
       SET deleted = 1,
           deleted_at = ?,
           deleted_by = ?
       WHERE event_round_id = ?
         AND item_ordinal = ?
         AND COALESCE(deleted, 0) = 0`,
      [now, markerUserId, params.roundId, roundItem.ordinal]
    );
  } catch (error) {
    logWarn(env, 'audio_stop_attempt_cleanup_failed', {
      roundId: params.roundId,
      itemOrdinal: roundItem.ordinal,
      message: error instanceof Error ? error.message : 'unknown_error'
    });
  }

  const rows = await listSubmissions(env, params.roundId as string);
  const next = normalizeRows(rows).find((row) => row.edition_item_id === parsed.data.edition_item_id);
  if (!next) {
    return jsonError({ code: 'not_found', message: 'Updated item not found.' }, 404);
  }
  return jsonOk(next);
};
