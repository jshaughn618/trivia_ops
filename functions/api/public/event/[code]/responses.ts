import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { normalizeCode } from '../../../../public';
import { parseJson } from '../../../../request';
import { execute, nowIso, queryFirst } from '../../../../db';
import { checkRateLimit, recordRateLimitHit } from '../../../../rate-limit';
import { deriveResponseLabels, normalizeResponseParts } from '../../../../response-labels';
import { queueAutoGradeForResponse } from '../../../../answer-grading';
import { buildRuntimeGameExampleItem, getGameExampleItemId } from '../../../../game-example-item';

const DEFAULT_PUBLIC_RESPONSE_RATE_LIMIT = {
  maxAttempts: 20,
  windowSeconds: 2 * 60,
  blockSeconds: 5 * 60
};

function getPublicResponseRateLimit(env: Env) {
  return {
    maxAttempts: parseEnvInt(env.PUBLIC_RESPONSE_RATE_MAX, DEFAULT_PUBLIC_RESPONSE_RATE_LIMIT.maxAttempts),
    windowSeconds: parseEnvInt(env.PUBLIC_RESPONSE_RATE_WINDOW_SECONDS, DEFAULT_PUBLIC_RESPONSE_RATE_LIMIT.windowSeconds),
    blockSeconds: parseEnvInt(env.PUBLIC_RESPONSE_RATE_BLOCK_SECONDS, DEFAULT_PUBLIC_RESPONSE_RATE_LIMIT.blockSeconds)
  };
}

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request, waitUntil }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const limitKey = `public-response:${ip}`;
  const status = await checkRateLimit(env, limitKey, getPublicResponseRateLimit(env));
  if (!status.allowed) {
    const headers = status.retryAfterSeconds ? { 'Retry-After': String(status.retryAfterSeconds) } : undefined;
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429,
      { headers }
    );
  }
  const recordFailure = async () => recordRateLimitHit(env, limitKey, getPublicResponseRateLimit(env));
  const payload = await parseJson(request);
  const payloadData =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  const teamId = typeof payloadData?.team_id === 'string' ? payloadData.team_id : '';
  const itemId = typeof payloadData?.item_id === 'string' ? payloadData.item_id : '';
  const sessionToken = typeof payloadData?.session_token === 'string' ? payloadData.session_token : '';
  const hasChoiceMode =
    typeof payloadData?.choice_index === 'number' && Number.isInteger(payloadData.choice_index);
  const choiceIndex = hasChoiceMode ? Number(payloadData?.choice_index) : null;

  if (!teamId || !itemId) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'team_id and item_id are required.' }, 400);
  }
  if (!sessionToken) {
    await recordFailure();
    return jsonError({ code: 'team_session_required', message: 'Team session required.' }, 401);
  }

  const code = normalizeCode(params.code as string);
  const event = await queryFirst<{ id: string; allow_participant_web_submissions: number }>(
    env,
    `SELECT id, COALESCE(allow_participant_web_submissions, 0) AS allow_participant_web_submissions
     FROM events
     WHERE public_code = ? AND COALESCE(deleted, 0) = 0`,
    [code]
  );
  if (!event) {
    await recordFailure();
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const team = await queryFirst<{ id: string; team_session_token: string | null }>(
    env,
    'SELECT id, team_session_token FROM teams WHERE id = ? AND event_id = ? AND COALESCE(deleted, 0) = 0',
    [teamId, event.id]
  );
  if (!team) {
    await recordFailure();
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }
  if (!team.team_session_token || team.team_session_token !== sessionToken) {
    await recordFailure();
    return jsonError({ code: 'team_session_invalid', message: 'Team session expired. Please rejoin with your team code.' }, 401);
  }

  const live = await queryFirst<{
    active_round_id: string | null;
    current_item_ordinal: number | null;
    timer_started_at: string | null;
    timer_duration_seconds: number | null;
    game_type_code: string | null;
    game_subtype: string | null;
    allow_participant_audio_stop: number | null;
    game_id: string | null;
    example_item_json: string | null;
  }>(
    env,
    `SELECT ls.active_round_id,
            ls.current_item_ordinal,
            ls.timer_started_at,
            ls.timer_duration_seconds,
            gt.code AS game_type_code,
            g.subtype AS game_subtype,
            g.allow_participant_audio_stop,
            g.id AS game_id,
            g.example_item_json
     FROM event_live_state ls
     LEFT JOIN event_rounds er ON er.id = ls.active_round_id AND COALESCE(er.deleted, 0) = 0
     LEFT JOIN editions ed ON ed.id = er.edition_id AND COALESCE(ed.deleted, 0) = 0
     LEFT JOIN games g ON g.id = ed.game_id AND COALESCE(g.deleted, 0) = 0
     LEFT JOIN game_types gt ON gt.id = g.game_type_id AND COALESCE(gt.deleted, 0) = 0
     WHERE ls.event_id = ? AND COALESCE(ls.deleted, 0) = 0`,
    [event.id]
  );

  if (!live?.active_round_id || live.current_item_ordinal === null || live.current_item_ordinal === undefined) {
    await recordFailure();
    return jsonError({ code: 'not_live', message: 'No active question.' }, 400);
  }

  if (!live.timer_started_at || !live.timer_duration_seconds) {
    await recordFailure();
    return jsonError({ code: 'timer_not_started', message: 'Timer has not started.' }, 400);
  }

  const expiresAt = new Date(live.timer_started_at).getTime() + live.timer_duration_seconds * 1000;
  const graceMs = 10000;
  if (Number.isNaN(expiresAt) || Date.now() > expiresAt + graceMs) {
    await recordFailure();
    return jsonError({ code: 'timer_expired', message: 'Timer expired.' }, 400);
  }

  const exampleItem =
    live.game_id && live.current_item_ordinal === 0
      ? buildRuntimeGameExampleItem(live.game_id, live.example_item_json)
      : null;

  if (exampleItem) {
    const exampleItemId = getGameExampleItemId(live.game_id as string);
    if (itemId !== exampleItemId) {
      await recordFailure();
      return jsonError({ code: 'not_current', message: 'Item is not active.' }, 400);
    }

    if (hasChoiceMode) {
      if (exampleItem.question_type !== 'multiple_choice') {
        await recordFailure();
        return jsonError({ code: 'invalid_type', message: 'Item is not multiple choice.' }, 400);
      }
      let choices: string[] = [];
      if (exampleItem.choices_json) {
        try {
          const parsed = JSON.parse(exampleItem.choices_json);
          if (Array.isArray(parsed)) {
            choices = parsed.filter((choice) => typeof choice === 'string');
          }
        } catch {
          choices = [];
        }
      }
      if (choiceIndex === null || choiceIndex < 0 || choiceIndex >= choices.length) {
        await recordFailure();
        return jsonError({ code: 'invalid_choice', message: 'Choice is out of range.' }, 400);
      }
      return jsonOk({ ok: true, mode: 'multiple_choice', choice_index: choiceIndex, choice_text: choices[choiceIndex] });
    }

    if (Number(event.allow_participant_web_submissions ?? 0) !== 1) {
      await recordFailure();
      return jsonError({ code: 'forbidden', message: 'Participant web submissions are not enabled for this event.' }, 403);
    }

    if (exampleItem.question_type === 'multiple_choice') {
      await recordFailure();
      return jsonError({ code: 'invalid_type', message: 'Use multiple-choice submission for this item.' }, 400);
    }

    const isMusicAudioStopExample =
      live.game_type_code === 'music' &&
      live.game_subtype === 'stop' &&
      Number(live.allow_participant_audio_stop ?? 0) === 1 &&
      exampleItem.media_type === 'audio';
    if (isMusicAudioStopExample) {
      await recordFailure();
      return jsonError({ code: 'use_audio_submission', message: 'Use the audio-stop submission flow for this item.' }, 400);
    }

    const answersPayload = payloadData?.answers;
    if (!Array.isArray(answersPayload)) {
      await recordFailure();
      return jsonError({ code: 'validation_error', message: 'answers is required for non-multiple-choice submissions.' }, 400);
    }

    const answers = answersPayload
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
        if (!label) return null;
        const answer = typeof (entry as { answer?: unknown }).answer === 'string' ? (entry as { answer: string }).answer : '';
        return { label, answer };
      })
      .filter((entry): entry is { label: string; answer: string } => Boolean(entry));

    const expectedLabels = deriveResponseLabels(exampleItem, { fallbackSingleAnswer: true });
    const responseParts = normalizeResponseParts(expectedLabels, answers);
    return jsonOk({ ok: true, mode: 'text_parts', response_parts: responseParts });
  }

  const current = await queryFirst<{
    edition_item_id: string;
    question_type: string | null;
    choices_json: string | null;
    answer_parts_json: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_a: string | null;
    answer_b: string | null;
    media_type: string | null;
  }>(
    env,
    `SELECT eri.edition_item_id,
            ei.question_type,
            ei.choices_json,
            ei.answer_parts_json,
            ei.answer_a_label,
            ei.answer_b_label,
            ei.answer_a,
            ei.answer_b,
            ei.media_type
     FROM event_round_items eri
     JOIN edition_items ei ON ei.id = eri.edition_item_id
     WHERE eri.event_round_id = ? AND eri.ordinal = ? AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0`,
    [live.active_round_id, live.current_item_ordinal]
  );

  if (!current || current.edition_item_id !== itemId) {
    await recordFailure();
    return jsonError({ code: 'not_current', message: 'Item is not active.' }, 400);
  }

  const now = nowIso();
  const existing = await queryFirst<{ id: string; deleted: number }>(
    env,
    `SELECT id, deleted FROM event_item_responses
     WHERE event_id = ? AND team_id = ? AND edition_item_id = ?`,
    [event.id, teamId, itemId]
  );

  if (hasChoiceMode) {
    if (current.question_type !== 'multiple_choice') {
      await recordFailure();
      return jsonError({ code: 'invalid_type', message: 'Item is not multiple choice.' }, 400);
    }

    let choices: string[] = [];
    if (current.choices_json) {
      try {
        const parsed = JSON.parse(current.choices_json);
        if (Array.isArray(parsed)) {
          choices = parsed.filter((choice) => typeof choice === 'string');
        }
      } catch {
        choices = [];
      }
    }

    if (choiceIndex === null || choiceIndex < 0 || choiceIndex >= choices.length) {
      await recordFailure();
      return jsonError({ code: 'invalid_choice', message: 'Choice is out of range.' }, 400);
    }

    const choiceText = choices[choiceIndex];
    let responseId: string;
    if (existing) {
      responseId = existing.id;
      await execute(
        env,
        `UPDATE event_item_responses
         SET choice_index = ?,
             choice_text = ?,
             response_parts_json = NULL,
             is_correct = NULL,
             marked_at = NULL,
             marked_by = NULL,
             ai_grade_status = 'pending',
             ai_grade_json = NULL,
             ai_graded_at = NULL,
             ai_grade_error = NULL,
             approved_points = NULL,
             approved_at = NULL,
             approved_by = NULL,
             submitted_at = ?,
             updated_at = ?,
             deleted = 0,
             deleted_at = NULL,
             deleted_by = NULL
         WHERE id = ?`,
        [choiceIndex, choiceText, now, now, existing.id]
      );
    } else {
      responseId = crypto.randomUUID();
      await execute(
        env,
        `INSERT INTO event_item_responses
         (id, event_id, event_round_id, edition_item_id, team_id, choice_index, choice_text, response_parts_json,
          ai_grade_status, ai_grade_json, ai_graded_at, ai_grade_error, approved_points, approved_at, approved_by,
          submitted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
        [responseId, event.id, live.active_round_id, itemId, teamId, choiceIndex, choiceText, now, now, now]
      );
    }

    queueAutoGradeForResponse(env, responseId, now, waitUntil);

    return jsonOk({ ok: true, mode: 'multiple_choice', choice_index: choiceIndex, choice_text: choiceText });
  }

  if (Number(event.allow_participant_web_submissions ?? 0) !== 1) {
    await recordFailure();
    return jsonError({ code: 'forbidden', message: 'Participant web submissions are not enabled for this event.' }, 403);
  }

  if (current.question_type === 'multiple_choice') {
    await recordFailure();
    return jsonError({ code: 'invalid_type', message: 'Use multiple-choice submission for this item.' }, 400);
  }

  const isMusicAudioStopItem =
    live.game_type_code === 'music' &&
    live.game_subtype === 'stop' &&
    Number(live.allow_participant_audio_stop ?? 0) === 1 &&
    current.media_type === 'audio';
  if (isMusicAudioStopItem) {
    await recordFailure();
    return jsonError({ code: 'use_audio_submission', message: 'Use the audio-stop submission flow for this item.' }, 400);
  }

  const answersPayload = payloadData?.answers;
  if (!Array.isArray(answersPayload)) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'answers is required for non-multiple-choice submissions.' }, 400);
  }

  const answers = answersPayload
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
      if (!label) return null;
      const answer = typeof (entry as { answer?: unknown }).answer === 'string' ? (entry as { answer: string }).answer : '';
      return { label, answer };
    })
    .filter((entry): entry is { label: string; answer: string } => Boolean(entry));

  const expectedLabels = deriveResponseLabels(
    {
      question_type: current.question_type,
      answer_parts_json: current.answer_parts_json,
      answer_a_label: current.answer_a_label,
      answer_b_label: current.answer_b_label,
      answer_a: current.answer_a,
      answer_b: current.answer_b
    },
    { fallbackSingleAnswer: true }
  );
  const responseParts = normalizeResponseParts(expectedLabels, answers);
  const responsePartsJson = JSON.stringify(responseParts);

  let responseId: string;
  if (existing) {
    responseId = existing.id;
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
           ai_grade_status = 'pending',
           ai_grade_json = NULL,
           ai_graded_at = NULL,
           ai_grade_error = NULL,
           approved_points = NULL,
           approved_at = NULL,
           approved_by = NULL,
           deleted = 0,
           deleted_at = NULL,
           deleted_by = NULL
       WHERE id = ?`,
      [responsePartsJson, now, now, existing.id]
    );
  } else {
    responseId = crypto.randomUUID();
    await execute(
      env,
      `INSERT INTO event_item_responses
       (id, event_id, event_round_id, edition_item_id, team_id, response_parts_json,
        ai_grade_status, ai_grade_json, ai_graded_at, ai_grade_error, approved_points, approved_at, approved_by,
        submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
      [responseId, event.id, live.active_round_id, itemId, teamId, responsePartsJson, now, now, now]
    );
  }

  queueAutoGradeForResponse(env, responseId, now, waitUntil);

  return jsonOk({ ok: true, mode: 'text_parts', response_parts: responseParts });
};
