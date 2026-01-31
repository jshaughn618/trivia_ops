import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { parseJson } from '../../../../request';
import { publicJoinSchema } from '../../../../../shared/validators';
import { normalizeCode } from '../../../../public';
import { execute, nowIso, queryAll, queryFirst } from '../../../../db';
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

  if (parsed.data.team_id) {
    const team = await queryFirst<{ id: string; name: string }>(
      env,
      'SELECT id, name FROM teams WHERE id = ? AND event_id = ? AND COALESCE(deleted, 0) = 0',
      [parsed.data.team_id, event.id]
    );
    if (!team) {
      return jsonError({ code: 'not_found', message: 'Team not found' }, 404);
    }
    return jsonOk({ team });
  }

  if (!parsed.data.team_name) {
    return jsonError({ code: 'validation_error', message: 'Team name required' }, 400);
  }

  const existing = await queryFirst<{ id: string; name: string }>(
    env,
    'SELECT id, name FROM teams WHERE event_id = ? AND lower(name) = lower(?) AND COALESCE(deleted, 0) = 0',
    [event.id, parsed.data.team_name]
  );

  if (existing) {
    return jsonOk({ team: existing });
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  await execute(
    env,
    'INSERT INTO teams (id, event_id, name, table_label, created_at) VALUES (?, ?, ?, NULL, ?)',
    [id, event.id, parsed.data.team_name, createdAt]
  );

  const team = await queryFirst<{ id: string; name: string }>(
    env,
    'SELECT id, name FROM teams WHERE id = ?',
    [id]
  );

  return jsonOk({ team });
};
