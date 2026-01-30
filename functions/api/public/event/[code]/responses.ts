import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { normalizeCode } from '../../../../public';
import { parseJson } from '../../../../request';
import { execute, nowIso, queryFirst } from '../../../../db';
import { checkRateLimit, recordRateLimitHit } from '../../../../rate-limit';

const PUBLIC_RESPONSE_RATE_LIMIT = {
  maxAttempts: 20,
  windowSeconds: 2 * 60,
  blockSeconds: 5 * 60
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const limitKey = `public-response:${ip}`;
  const status = await checkRateLimit(env, limitKey, PUBLIC_RESPONSE_RATE_LIMIT);
  if (!status.allowed) {
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429
    );
  }
  const recordFailure = async () => recordRateLimitHit(env, limitKey, PUBLIC_RESPONSE_RATE_LIMIT);
  const payload = await parseJson(request);
  const teamId = payload?.team_id;
  const itemId = payload?.item_id;
  const choiceIndex = payload?.choice_index;

  if (!teamId || !itemId || typeof choiceIndex !== 'number') {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'team_id, item_id, and choice_index are required.' }, 400);
  }

  const code = normalizeCode(params.code as string);
  const event = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM events WHERE public_code = ? AND COALESCE(deleted, 0) = 0',
    [code]
  );
  if (!event) {
    await recordFailure();
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const team = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM teams WHERE id = ? AND event_id = ? AND COALESCE(deleted, 0) = 0',
    [teamId, event.id]
  );
  if (!team) {
    await recordFailure();
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }

  const live = await queryFirst<{
    active_round_id: string | null;
    current_item_ordinal: number | null;
    timer_started_at: string | null;
    timer_duration_seconds: number | null;
  }>(
    env,
    `SELECT active_round_id, current_item_ordinal, timer_started_at, timer_duration_seconds
     FROM event_live_state WHERE event_id = ? AND COALESCE(deleted, 0) = 0`,
    [event.id]
  );

  if (!live?.active_round_id || !live.current_item_ordinal) {
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

  const current = await queryFirst<{
    edition_item_id: string;
    question_type: string | null;
    choices_json: string | null;
  }>(
    env,
    `SELECT eri.edition_item_id, ei.question_type, ei.choices_json
     FROM event_round_items eri
     JOIN edition_items ei ON ei.id = eri.edition_item_id
     WHERE eri.event_round_id = ? AND eri.ordinal = ? AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0`,
    [live.active_round_id, live.current_item_ordinal]
  );

  if (!current || current.edition_item_id !== itemId) {
    await recordFailure();
    return jsonError({ code: 'not_current', message: 'Item is not active.' }, 400);
  }

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

  if (choiceIndex < 0 || choiceIndex >= choices.length) {
    await recordFailure();
    return jsonError({ code: 'invalid_choice', message: 'Choice is out of range.' }, 400);
  }

  const choiceText = choices[choiceIndex];
  const now = nowIso();
  const existing = await queryFirst<{ id: string; deleted: number }>(
    env,
    `SELECT id, deleted FROM event_item_responses
     WHERE event_id = ? AND team_id = ? AND edition_item_id = ?`,
    [event.id, teamId, itemId]
  );

  if (existing) {
    await execute(
      env,
      `UPDATE event_item_responses
       SET choice_index = ?, choice_text = ?, submitted_at = ?, updated_at = ?, deleted = 0, deleted_at = NULL, deleted_by = NULL
       WHERE id = ?`,
      [choiceIndex, choiceText, now, now, existing.id]
    );
  } else {
    await execute(
      env,
      `INSERT INTO event_item_responses
       (id, event_id, event_round_id, edition_item_id, team_id, choice_index, choice_text, submitted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), event.id, live.active_round_id, itemId, teamId, choiceIndex, choiceText, now, now]
    );
  }

  return jsonOk({ ok: true, choice_index: choiceIndex, choice_text: choiceText });
};
