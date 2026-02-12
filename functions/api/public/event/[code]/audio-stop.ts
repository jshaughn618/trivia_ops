import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { parseJson } from '../../../../request';
import { publicAudioStopSchema } from '../../../../../shared/validators';
import { normalizeCode } from '../../../../public';
import { execute, nowIso, queryFirst } from '../../../../db';
import { checkRateLimit, recordRateLimitHit } from '../../../../rate-limit';

const DEFAULT_PUBLIC_AUDIO_STOP_RATE_LIMIT = {
  maxAttempts: 15,
  windowSeconds: 60,
  blockSeconds: 5 * 60
};

function getPublicAudioStopRateLimit(env: Env) {
  return {
    maxAttempts: parseEnvInt(env.PUBLIC_AUDIO_STOP_RATE_MAX, DEFAULT_PUBLIC_AUDIO_STOP_RATE_LIMIT.maxAttempts),
    windowSeconds: parseEnvInt(env.PUBLIC_AUDIO_STOP_RATE_WINDOW_SECONDS, DEFAULT_PUBLIC_AUDIO_STOP_RATE_LIMIT.windowSeconds),
    blockSeconds: parseEnvInt(env.PUBLIC_AUDIO_STOP_RATE_BLOCK_SECONDS, DEFAULT_PUBLIC_AUDIO_STOP_RATE_LIMIT.blockSeconds)
  };
}

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const code = normalizeCode(params.code as string);
  const limitKey = `public-audio-stop:${ip}:${code}`;
  const status = await checkRateLimit(env, limitKey, getPublicAudioStopRateLimit(env));
  if (!status.allowed) {
    const headers = status.retryAfterSeconds ? { 'Retry-After': String(status.retryAfterSeconds) } : undefined;
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429,
      { headers }
    );
  }
  const recordFailure = async () => recordRateLimitHit(env, limitKey, getPublicAudioStopRateLimit(env));

  const payload = await parseJson(request);
  const parsed = publicAudioStopSchema.safeParse(payload);
  if (!parsed.success) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'Invalid audio stop request', details: parsed.error.flatten() }, 400);
  }

  const event = await queryFirst<{
    id: string;
    status: string;
    active_round_id: string | null;
    audio_playing: number;
    active_round_status: string | null;
    game_type_code: string | null;
    allow_participant_audio_stop: number | null;
  }>(
    env,
    `SELECT e.id,
            e.status,
            ls.active_round_id,
            ls.audio_playing,
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
  if (!event.active_round_id || event.active_round_status !== 'live') {
    await recordFailure();
    return jsonError({ code: 'not_live', message: 'No active round is live.' }, 400);
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

  if (!Boolean(event.audio_playing)) {
    return jsonOk({ ok: true, stopped: false });
  }

  await execute(
    env,
    'UPDATE event_live_state SET audio_playing = 0, updated_at = ? WHERE event_id = ?',
    [nowIso(), event.id]
  );

  return jsonOk({ ok: true, stopped: true });
};
