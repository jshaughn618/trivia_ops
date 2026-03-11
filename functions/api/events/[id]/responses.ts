import type { Env } from '../../../types';
import { jsonOk } from '../../../responses';
import { queryAll } from '../../../db';
import { requireHostOrAdmin, requireEventAccess } from '../../../access';
import { deriveExpectedAnswerParts, normalizeResponseParts } from '../../../response-labels';

type ParsedResponsePart = { label: string; answer: string };
type ParsedAiPart = {
  label: string;
  expected_answer: string;
  submitted_answer: string;
  max_points: number;
  awarded_points: number;
  is_correct: boolean;
  confidence: number;
  reason: string;
};
type ParsedAiGrade = {
  source: 'ai' | 'fallback';
  total_points: number;
  max_points: number;
  overall_confidence: number;
  needs_review: boolean;
  threshold: number;
  parts: ParsedAiPart[];
};

function toClampedNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseResponseParts(value: string | null): ParsedResponsePart[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
        if (!label) return null;
        const answer = typeof (entry as { answer?: unknown }).answer === 'string' ? (entry as { answer: string }).answer : '';
        return { label, answer } as ParsedResponsePart;
      })
      .filter((entry): entry is ParsedResponsePart => Boolean(entry));
  } catch {
    return [];
  }
}

function parseAiGrade(value: string | null): ParsedAiGrade | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const source = parsed.source === 'fallback' ? 'fallback' : 'ai';
    const maxPoints = toClampedNumber(parsed.max_points, 0, Number.MAX_SAFE_INTEGER, 0);
    const partsRaw = Array.isArray(parsed.parts) ? parsed.parts : [];
    const parts: ParsedAiPart[] = partsRaw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const valueObj = entry as Record<string, unknown>;
        const label = typeof valueObj.label === 'string' ? valueObj.label.trim() : '';
        if (!label) return null;
        const maxPartPoints = toClampedNumber(valueObj.max_points, 0, Number.MAX_SAFE_INTEGER, 0);
        const awardedPoints = toClampedNumber(valueObj.awarded_points, 0, maxPartPoints, 0);
        return {
          label,
          expected_answer: typeof valueObj.expected_answer === 'string' ? valueObj.expected_answer : '',
          submitted_answer: typeof valueObj.submitted_answer === 'string' ? valueObj.submitted_answer : '',
          max_points: maxPartPoints,
          awarded_points: awardedPoints,
          is_correct: Boolean(valueObj.is_correct ?? awardedPoints >= maxPartPoints),
          confidence: toClampedNumber(valueObj.confidence, 0, 1, 0.5),
          reason: typeof valueObj.reason === 'string' ? valueObj.reason.slice(0, 280) : ''
        } as ParsedAiPart;
      })
      .filter((entry): entry is ParsedAiPart => Boolean(entry));

    return {
      source,
      total_points: toClampedNumber(
        parsed.total_points,
        0,
        Math.max(
          maxPoints,
          parts.reduce((sum, part) => sum + part.max_points, 0)
        ),
        parts.reduce((sum, part) => sum + part.awarded_points, 0)
      ),
      max_points: Math.max(maxPoints, parts.reduce((sum, part) => sum + part.max_points, 0)),
      overall_confidence: toClampedNumber(parsed.overall_confidence, 0, 1, 0.5),
      needs_review: Boolean(parsed.needs_review),
      threshold: toClampedNumber(parsed.threshold, 0, 1, 0.75),
      parts
    };
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireEventAccess(env, data.user ?? null, params.id as string);
  if (access.response) return access.response;

  const rounds = await queryAll<{
    id: string;
    round_number: number;
    label: string;
    status: string;
    is_stop_round: number;
  }>(
    env,
    `SELECT er.id,
            er.round_number,
            er.label,
            er.status,
            CASE WHEN gt.code = 'music' AND g.subtype = 'stop' THEN 1 ELSE 0 END AS is_stop_round
     FROM event_rounds er
     LEFT JOIN editions ed ON ed.id = er.edition_id AND COALESCE(ed.deleted, 0) = 0
     LEFT JOIN games g ON g.id = ed.game_id AND COALESCE(g.deleted, 0) = 0
     LEFT JOIN game_types gt ON gt.id = g.game_type_id AND COALESCE(gt.deleted, 0) = 0
     WHERE er.event_id = ? AND COALESCE(er.deleted, 0) = 0
     ORDER BY er.round_number ASC`,
    [params.id]
  );

  const teams = await queryAll<{ id: string; name: string }>(
    env,
    `SELECT id, name
     FROM teams
     WHERE event_id = ? AND COALESCE(deleted, 0) = 0
     ORDER BY name ASC`,
    [params.id]
  );

  const rowsRaw = await queryAll<{
    response_id: string | null;
    edition_item_id: string;
    team_id: string;
    team_name: string;
    event_round_id: string;
    round_number: number;
    round_label: string;
    question_type: string | null;
    item_ordinal: number;
    prompt: string;
    answer: string | null;
    answer_a: string | null;
    answer_b: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_parts_json: string | null;
    choice_text: string | null;
    submitted_at: string | null;
    response_parts_json: string | null;
    ai_grade_status: string | null;
    ai_grade_json: string | null;
    ai_graded_at: string | null;
    ai_grade_error: string | null;
    approved_points: number | null;
    approved_at: string | null;
  }>(
    env,
    `WITH latest_responses AS (
      SELECT * FROM (
        SELECT
          resp.id,
          resp.edition_item_id,
          resp.team_id,
          resp.event_round_id,
          resp.choice_text,
          resp.submitted_at,
          resp.response_parts_json,
          resp.ai_grade_status,
          resp.ai_grade_json,
          resp.ai_graded_at,
          resp.ai_grade_error,
          resp.approved_points,
          resp.approved_at,
          ROW_NUMBER() OVER (
            PARTITION BY resp.event_round_id, resp.edition_item_id, resp.team_id
            ORDER BY COALESCE(resp.submitted_at, resp.updated_at, resp.created_at) DESC, resp.updated_at DESC, resp.id DESC
          ) AS rn
        FROM event_item_responses resp
        WHERE resp.event_id = ?
          AND COALESCE(resp.deleted, 0) = 0
      ) ranked
      WHERE rn = 1
    )
    SELECT
      lr.id AS response_id,
      eri.edition_item_id,
      t.id AS team_id,
      t.name AS team_name,
      er.id AS event_round_id,
      er.round_number,
      er.label AS round_label,
      ei.question_type,
      eri.ordinal AS item_ordinal,
      COALESCE(eri.overridden_prompt, ei.prompt) AS prompt,
      COALESCE(eri.overridden_answer, ei.answer) AS answer,
      ei.answer_a,
      ei.answer_b,
      ei.answer_a_label,
      ei.answer_b_label,
      ei.answer_parts_json,
      lr.choice_text,
      lr.submitted_at,
      lr.response_parts_json,
      lr.ai_grade_status,
      lr.ai_grade_json,
      lr.ai_graded_at,
      lr.ai_grade_error,
      lr.approved_points,
      lr.approved_at
     FROM event_rounds er
     JOIN teams t ON t.event_id = er.event_id AND COALESCE(t.deleted, 0) = 0
     JOIN event_round_items eri
       ON eri.event_round_id = er.id
      AND COALESCE(eri.deleted, 0) = 0
     JOIN edition_items ei ON ei.id = eri.edition_item_id AND COALESCE(ei.deleted, 0) = 0
     LEFT JOIN latest_responses lr
       ON lr.event_round_id = er.id
      AND lr.edition_item_id = eri.edition_item_id
      AND lr.team_id = t.id
     WHERE er.event_id = ?
       AND COALESCE(er.deleted, 0) = 0
     ORDER BY er.round_number ASC, t.name ASC, eri.ordinal ASC`,
    [params.id, params.id]
  );

  const rows = rowsRaw.map((row) => {
    const expectedParts = row.question_type === 'multiple_choice'
      ? [{ label: 'Answer', answer: row.answer ?? '', points: 1 }]
      : deriveExpectedAnswerParts(
        {
          question_type: row.question_type,
          answer: row.answer,
          answer_a: row.answer_a,
          answer_b: row.answer_b,
          answer_a_label: row.answer_a_label,
          answer_b_label: row.answer_b_label,
          answer_parts_json: row.answer_parts_json
        },
        { fallbackSingleAnswer: true }
      );

    const responseParts = row.response_id
      ? (
        row.response_parts_json
          ? parseResponseParts(row.response_parts_json)
          : row.choice_text
            ? [{ label: 'Answer', answer: row.choice_text }]
            : []
      )
      : [];
    const aiGrade = row.response_id ? parseAiGrade(row.ai_grade_json) : null;
    const aiStatus = row.response_id ? (row.ai_grade_status ?? (aiGrade ? 'graded' : 'pending')) : 'not_submitted';

    return {
      response_id: row.response_id ?? null,
      edition_item_id: row.edition_item_id,
      team_id: row.team_id,
      team_name: row.team_name,
      event_round_id: row.event_round_id,
      round_number: row.round_number,
      round_label: row.round_label,
      question_type: row.question_type,
      item_ordinal: row.item_ordinal,
      prompt: row.prompt,
      expected_parts: expectedParts,
      max_points: expectedParts.reduce((sum, part) => sum + Math.max(0, part.points), 0),
      submitted_at: row.submitted_at ?? null,
      response_parts: responseParts,
      normalized_response_parts: normalizeResponseParts(expectedParts.map((part) => part.label), responseParts),
      ai_grade_status: aiStatus,
      ai_grade: aiGrade,
      ai_graded_at: row.ai_graded_at ?? null,
      ai_grade_error: row.ai_grade_error ?? null,
      approved_points: row.approved_points ?? null,
      approved_at: row.approved_at ?? null
    };
  });

  return jsonOk({
    rounds: rounds.map((round) => ({
      ...round,
      is_stop_round: Boolean(round.is_stop_round)
    })),
    teams,
    rows
  });
};
