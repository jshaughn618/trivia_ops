import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { normalizeCode } from '../../../../public';
import { parseJson } from '../../../../request';
import { execute, nowIso, queryFirst } from '../../../../db';
import { publicTeamNameSchema } from '../../../../../shared/validators';
import { checkRateLimit, recordRateLimitHit } from '../../../../rate-limit';

const DEFAULT_PUBLIC_TEAM_NAME_RATE_LIMIT = {
  maxAttempts: 12,
  windowSeconds: 2 * 60,
  blockSeconds: 5 * 60
};

function getPublicTeamNameRateLimit(env: Env) {
  return {
    maxAttempts: parseEnvInt(env.PUBLIC_TEAM_NAME_RATE_MAX, DEFAULT_PUBLIC_TEAM_NAME_RATE_LIMIT.maxAttempts),
    windowSeconds: parseEnvInt(env.PUBLIC_TEAM_NAME_RATE_WINDOW_SECONDS, DEFAULT_PUBLIC_TEAM_NAME_RATE_LIMIT.windowSeconds),
    blockSeconds: parseEnvInt(env.PUBLIC_TEAM_NAME_RATE_BLOCK_SECONDS, DEFAULT_PUBLIC_TEAM_NAME_RATE_LIMIT.blockSeconds)
  };
}

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const limitKey = `public-team-name:${ip}`;
  const status = await checkRateLimit(env, limitKey, getPublicTeamNameRateLimit(env));
  if (!status.allowed) {
    const headers = status.retryAfterSeconds ? { 'Retry-After': String(status.retryAfterSeconds) } : undefined;
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429,
      { headers }
    );
  }
  const recordFailure = async () => recordRateLimitHit(env, limitKey, getPublicTeamNameRateLimit(env));
  const payload = await parseJson(request);
  const parsed = publicTeamNameSchema.safeParse(payload);
  if (!parsed.success) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'Invalid team name request', details: parsed.error.flatten() }, 400);
  }

  const code = normalizeCode(params.code as string);
  const event = await queryFirst<{ id: string; status: string }>(
    env,
    'SELECT id, status FROM events WHERE public_code = ? AND COALESCE(deleted, 0) = 0',
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

  const team = await queryFirst<{ id: string; name: string; team_session_token: string | null }>(
    env,
    'SELECT id, name, team_session_token FROM teams WHERE id = ? AND event_id = ? AND COALESCE(deleted, 0) = 0',
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

  const nextName = parsed.data.team_name.trim();
  if (!nextName) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'Team name required' }, 400);
  }
  if (team.name.trim().toLowerCase() === nextName.toLowerCase()) {
    return jsonOk({ team: { id: team.id, name: team.name } });
  }

  const duplicate = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM teams WHERE event_id = ? AND lower(name) = lower(?) AND COALESCE(deleted, 0) = 0 AND id != ?',
    [event.id, nextName, team.id]
  );
  if (duplicate) {
    await recordFailure();
    return jsonError({ code: 'conflict', message: 'Team name already exists for this event.' }, 409);
  }

  await execute(
    env,
    'UPDATE teams SET name = ?, team_placeholder = 0, updated_at = ? WHERE id = ?',
    [nextName, nowIso(), team.id]
  );

  return jsonOk({ team: { id: team.id, name: nextName } });
};
