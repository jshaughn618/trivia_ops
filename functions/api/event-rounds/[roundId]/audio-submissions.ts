import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventRoundAudioSubmissionMarkSchema, eventRoundAudioSubmissionResetSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll, queryFirst } from '../../../db';
import { requireHostOrAdmin, requireRoundAccess } from '../../../access';

type SubmissionRow = {
  event_round_id: string;
  edition_item_id: string;
  ordinal: number;
  prompt: string;
  team_id: string | null;
  team_name: string | null;
  response_parts_json: string | null;
  submitted_at: string | null;
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

  const existing = await queryFirst<{ id: string }>(
    env,
    `SELECT id
     FROM event_item_responses
     WHERE event_round_id = ?
       AND edition_item_id = ?
       AND response_parts_json IS NOT NULL
       AND COALESCE(deleted, 0) = 0
     ORDER BY submitted_at DESC, updated_at DESC
     LIMIT 1`,
    [params.roundId, parsed.data.edition_item_id]
  );
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'No submitted answer found for this item.' }, 404);
  }

  const now = nowIso();
  await execute(
    env,
    `UPDATE event_item_responses
     SET is_correct = ?,
         marked_at = ?,
         marked_by = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      parsed.data.is_correct === null ? null : parsed.data.is_correct ? 1 : 0,
      parsed.data.is_correct === null ? null : now,
      parsed.data.is_correct === null ? null : markerUserId,
      now,
      existing.id
    ]
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

  await execute(
    env,
    `UPDATE event_live_state
     SET participant_audio_stopped_by_team_id = NULL,
         participant_audio_stopped_by_team_name = NULL,
         participant_audio_stopped_at = NULL,
         audio_playing = 0,
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

  const rows = await listSubmissions(env, params.roundId as string);
  const next = normalizeRows(rows).find((row) => row.edition_item_id === parsed.data.edition_item_id);
  if (!next) {
    return jsonError({ code: 'not_found', message: 'Updated item not found.' }, 404);
  }
  return jsonOk(next);
};
