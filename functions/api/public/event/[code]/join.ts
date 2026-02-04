import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { parseJson } from '../../../../request';
import { publicJoinSchema } from '../../../../../shared/validators';
import { normalizeCode, normalizeTeamCode } from '../../../../public';
import { execute, nowIso, queryFirst } from '../../../../db';
import { checkRateLimit, recordRateLimitHit } from '../../../../rate-limit';

const DEFAULT_PUBLIC_JOIN_RATE_LIMIT = {
  maxAttempts: 12,
  windowSeconds: 2 * 60,
  blockSeconds: 5 * 60
};

function getPublicJoinRateLimit(env: Env) {
  return {
    maxAttempts: parseEnvInt(env.PUBLIC_JOIN_RATE_MAX, DEFAULT_PUBLIC_JOIN_RATE_LIMIT.maxAttempts),
    windowSeconds: parseEnvInt(env.PUBLIC_JOIN_RATE_WINDOW_SECONDS, DEFAULT_PUBLIC_JOIN_RATE_LIMIT.windowSeconds),
    blockSeconds: parseEnvInt(env.PUBLIC_JOIN_RATE_BLOCK_SECONDS, DEFAULT_PUBLIC_JOIN_RATE_LIMIT.blockSeconds)
  };
}

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const limitKey = `public-join:${ip}`;
  const status = await checkRateLimit(env, limitKey, getPublicJoinRateLimit(env));
  if (!status.allowed) {
    const headers = status.retryAfterSeconds ? { 'Retry-After': String(status.retryAfterSeconds) } : undefined;
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429,
      { headers }
    );
  }
  const recordFailure = async () => recordRateLimitHit(env, limitKey, getPublicJoinRateLimit(env));
  const code = normalizeCode(params.code as string);
  const payload = await parseJson(request);
  const parsed = publicJoinSchema.safeParse(payload);
  if (!parsed.success) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'Invalid join request', details: parsed.error.flatten() }, 400);
  }

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

  const teamCode = normalizeTeamCode(parsed.data.team_code);
  if (!teamCode || teamCode.length !== 4) {
    await recordFailure();
    return jsonError({ code: 'validation_error', message: 'Team code required' }, 400);
  }
  const requestedName = typeof parsed.data.team_name === 'string' ? parsed.data.team_name.trim() : '';

  const team = await queryFirst<{ id: string; name: string; team_placeholder: number | null }>(
    env,
    'SELECT id, name, team_placeholder FROM teams WHERE event_id = ? AND team_code = ? AND COALESCE(deleted, 0) = 0',
    [event.id, teamCode]
  );

  if (!team) {
    await recordFailure();
    return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
  }

  const placeholder = Number(team.team_placeholder ?? 0) === 1;
  if (placeholder && !requestedName) {
    await recordFailure();
    return jsonError({ code: 'team_name_required', message: 'Team name required to claim this code.' }, 400);
  }
  if (requestedName) {
    if (placeholder) {
      const duplicate = await queryFirst<{ id: string }>(
        env,
        'SELECT id FROM teams WHERE event_id = ? AND lower(name) = lower(?) AND COALESCE(deleted, 0) = 0 AND id != ?',
        [event.id, requestedName, team.id]
      );
      if (duplicate) {
        await recordFailure();
        return jsonError({ code: 'conflict', message: 'Team name already exists for this event.' }, 409);
      }
      await execute(
        env,
        'UPDATE teams SET name = ?, team_placeholder = 0, updated_at = ? WHERE id = ?',
        [requestedName, nowIso(), team.id]
      );
      team.name = requestedName;
    } else if (team.name.trim().toLowerCase() !== requestedName.toLowerCase()) {
      await recordFailure();
      return jsonError({ code: 'team_name_mismatch', message: 'Team name already set. Use the existing name.' }, 409);
    }
  }

  const sessionToken = crypto.randomUUID();
  const now = nowIso();
  await execute(
    env,
    'UPDATE teams SET team_session_token = ?, team_session_updated_at = ? WHERE id = ?',
    [sessionToken, now, team.id]
  );

  return jsonOk({ team, session_token: sessionToken });
};
