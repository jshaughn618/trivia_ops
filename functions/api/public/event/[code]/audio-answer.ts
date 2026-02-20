import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { parseJson } from '../../../../request';
import { publicAudioAnswerSchema } from '../../../../../shared/validators';
import { normalizeCode } from '../../../../public';
import { execute, nowIso, queryFirst } from '../../../../db';
import { checkRateLimit, recordRateLimitHit } from '../../../../rate-limit';

const DEFAULT_PUBLIC_AUDIO_ANSWER_RATE_LIMIT = {
  maxAttempts: 20,
  windowSeconds: 2 * 60,
  blockSeconds: 5 * 60
};

function getPublicAudioAnswerRateLimit(env: Env) {
  return {
    maxAttempts: parseEnvInt(env.PUBLIC_RESPONSE_RATE_MAX, DEFAULT_PUBLIC_AUDIO_ANSWER_RATE_LIMIT.maxAttempts),
    windowSeconds: parseEnvInt(env.PUBLIC_RESPONSE_RATE_WINDOW_SECONDS, DEFAULT_PUBLIC_AUDIO_ANSWER_RATE_LIMIT.windowSeconds),
    blockSeconds: parseEnvInt(env.PUBLIC_RESPONSE_RATE_BLOCK_SECONDS, DEFAULT_PUBLIC_AUDIO_ANSWER_RATE_LIMIT.blockSeconds)
  };
}

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function deriveExpectedLabels(item: {
  answer_parts_json: string | null;
  answer_a_label: string | null;
  answer_b_label: string | null;
  answer_a: string | null;
  answer_b: string | null;
}) {
  const labels: string[] = [];
  if (item.answer_parts_json) {
    try {
      const parsed = JSON.parse(item.answer_parts_json) as Array<{ label?: unknown }>;
      if (Array.isArray(parsed)) {
        parsed.forEach((part) => {
          const label = typeof part?.label === 'string' ? part.label.trim() : '';
          if (!label) return;
          if (!labels.includes(label)) labels.push(label);
        });
      }
    } catch {
      // Ignore malformed answer-parts payload.
    }
  }

  const answerAExists = Boolean(item.answer_a?.trim());
  const answerBExists = Boolean(item.answer_b?.trim());
  if (labels.length === 0) {
    if (answerAExists) labels.push(item.answer_a_label?.trim() || 'Part A');
    if (answerBExists) labels.push(item.answer_b_label?.trim() || 'Part B');
  }
  return labels.filter(Boolean);
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const code = normalizeCode(params.code as string);
  const limitKey = `public-audio-answer:${ip}:${code}`;
  const status = await checkRateLimit(env, limitKey, getPublicAudioAnswerRateLimit(env));
  if (!status.allowed) {
    const headers = status.retryAfterSeconds ? { 'Retry-After': String(status.retryAfterSeconds) } : undefined;
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429,
      { headers }
    );
  }
  const recordFailure = async () => recordRateLimitHit(env, limitKey, getPublicAudioAnswerRateLimit(env));

  const payload = await parseJson(request);
  const parsed = publicAudioAnswerSchema.safeParse(payload);
  if (!parsed.success) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'Invalid audio answer request', details: parsed.error.flatten() }, 400);
  }

  const event = await queryFirst<{
    id: string;
    status: string;
    active_round_id: string | null;
    current_item_ordinal: number | null;
    audio_playing: number;
    participant_audio_stopped_by_team_id: string | null;
    active_round_status: string | null;
    game_type_code: string | null;
    allow_participant_audio_stop: number | null;
  }>(
    env,
    `SELECT e.id,
            e.status,
            ls.active_round_id,
            ls.current_item_ordinal,
            ls.audio_playing,
            ls.participant_audio_stopped_by_team_id,
            er.status AS active_round_status,
            gt.code AS game_type_code,
            g.allow_participant_audio_stop
     FROM events e
     LEFT JOIN event_live_state ls ON ls.event_id = e.id AND COALESCE(ls.deleted, 0) = 0
     LEFT JOIN event_rounds er ON er.id = ls.active_round_id AND COALESCE(er.deleted, 0) = 0
     LEFT JOIN editions ed ON ed.id = er.edition_id AND COALESCE(ed.deleted, 0) = 0
     LEFT JOIN games g ON g.id = ed.game_id AND COALESCE(g.deleted, 0) = 0
     LEFT JOIN game_types gt ON gt.id = g.game_type_id AND COALESCE(gt.deleted, 0) = 0
     WHERE e.public_code = ? AND COALESCE(e.deleted, 0) = 0`,
    [code]
  );

  if (!event) {
    await recordFailure();
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }
  if (event.status === 'completed' || event.status === 'canceled') {
    await recordFailure();
    return jsonError({ code: 'event_closed', message: 'Event is closed' }, 403);
  }
  if (!event.active_round_id || !event.current_item_ordinal || event.active_round_status !== 'live') {
    await recordFailure();
    return jsonError({ code: 'not_live', message: 'No active item is live.' }, 400);
  }
  if (event.game_type_code !== 'music' || Number(event.allow_participant_audio_stop ?? 0) !== 1) {
    await recordFailure();
    return jsonError({ code: 'forbidden', message: 'Participant audio stop is not enabled for this game.' }, 403);
  }

  const team = await queryFirst<{ id: string; team_session_token: string | null }>(
    env,
    'SELECT id, team_session_token FROM teams WHERE id = ? AND event_id = ? AND COALESCE(deleted, 0) = 0',
    [parsed.data.team_id, event.id]
  );
  if (!team) {
    await recordFailure();
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }
  if (!team.team_session_token || team.team_session_token !== parsed.data.session_token) {
    await recordFailure();
    return jsonError({ code: 'team_session_invalid', message: 'Team session expired. Please rejoin with your team code.' }, 401);
  }

  if (event.participant_audio_stopped_by_team_id !== team.id) {
    await recordFailure();
    return jsonError({ code: 'forbidden', message: 'Only the team that stopped playback can submit this answer.' }, 403);
  }
  if (Boolean(event.audio_playing)) {
    await recordFailure();
    return jsonError({ code: 'audio_still_playing', message: 'Stop audio before submitting your answer.' }, 400);
  }

  const currentItem = await queryFirst<{
    edition_item_id: string;
    answer_parts_json: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_a: string | null;
    answer_b: string | null;
  }>(
    env,
    `SELECT eri.edition_item_id,
            ei.answer_parts_json,
            ei.answer_a_label,
            ei.answer_b_label,
            ei.answer_a,
            ei.answer_b
     FROM event_round_items eri
     JOIN edition_items ei ON ei.id = eri.edition_item_id
     WHERE eri.event_round_id = ? AND eri.ordinal = ? AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0`,
    [event.active_round_id, event.current_item_ordinal]
  );

  if (!currentItem || currentItem.edition_item_id !== parsed.data.item_id) {
    await recordFailure();
    return jsonError({ code: 'not_current', message: 'Item is not active.' }, 400);
  }

  const expectedLabels = deriveExpectedLabels(currentItem);
  if (expectedLabels.length === 0) {
    await recordFailure();
    return jsonError({ code: 'invalid_type', message: 'Active item does not support labeled answer submission.' }, 400);
  }

  const answersByLabel = new Map<string, string>();
  parsed.data.answers.forEach((entry) => {
    const label = entry.label.trim().toLowerCase();
    const answer = entry.answer.trim();
    if (!label || !answer) return;
    answersByLabel.set(label, answer);
  });

  const missing = expectedLabels.filter((label) => !answersByLabel.get(label.toLowerCase()));
  if (missing.length > 0) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: `Missing answers for: ${missing.join(', ')}` }, 400);
  }

  const orderedAnswers = expectedLabels.map((label) => ({
    label,
    answer: answersByLabel.get(label.toLowerCase()) ?? ''
  }));

  const now = nowIso();
  const responsePartsJson = JSON.stringify(orderedAnswers);
  const existingForItem = await queryFirst<{ id: string; team_id: string }>(
    env,
    `SELECT id, team_id
     FROM event_item_responses
     WHERE event_id = ?
       AND event_round_id = ?
       AND edition_item_id = ?
       AND response_parts_json IS NOT NULL
       AND COALESCE(deleted, 0) = 0
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [event.id, event.active_round_id, parsed.data.item_id]
  );
  if (existingForItem && existingForItem.team_id !== team.id) {
    await recordFailure();
    return jsonError({ code: 'forbidden', message: 'Another team has already submitted for this item.' }, 403);
  }

  let targetResponseId = existingForItem?.id ?? null;
  if (!targetResponseId) {
    const existingByTeam = await queryFirst<{ id: string }>(
      env,
      `SELECT id FROM event_item_responses
       WHERE event_id = ?
         AND event_round_id = ?
         AND team_id = ?
         AND edition_item_id = ?
         AND COALESCE(deleted, 0) = 0
       ORDER BY submitted_at DESC
       LIMIT 1`,
      [event.id, event.active_round_id, team.id, parsed.data.item_id]
    );
    targetResponseId = existingByTeam?.id ?? null;
  }

  if (targetResponseId) {
    await execute(
      env,
      `UPDATE event_item_responses
       SET choice_index = NULL,
           choice_text = NULL,
           response_parts_json = ?,
           submitted_at = ?,
           updated_at = ?,
           is_correct = NULL,
           marked_at = NULL,
           marked_by = NULL,
           deleted = 0,
           deleted_at = NULL,
           deleted_by = NULL
       WHERE id = ?`,
      [responsePartsJson, now, now, targetResponseId]
    );
  } else {
    await execute(
      env,
      `INSERT INTO event_item_responses
       (id, event_id, event_round_id, edition_item_id, team_id, response_parts_json, submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), event.id, event.active_round_id, parsed.data.item_id, team.id, responsePartsJson, now, now, now]
    );
  }

  return jsonOk({ ok: true, answers: orderedAnswers });
};
