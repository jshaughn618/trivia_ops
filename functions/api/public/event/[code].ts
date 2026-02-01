import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { getPublicEventPayload } from '../../../public-event';
import { checkRateLimit, recordRateLimitHit } from '../../../rate-limit';

const DEFAULT_PUBLIC_EVENT_RATE_LIMIT = {
  maxAttempts: 300,
  windowSeconds: 5 * 60,
  blockSeconds: 10 * 60
};

function getPublicEventRateLimit(env: Env) {
  return {
    maxAttempts: parseEnvInt(env.PUBLIC_EVENT_RATE_MAX, DEFAULT_PUBLIC_EVENT_RATE_LIMIT.maxAttempts),
    windowSeconds: parseEnvInt(env.PUBLIC_EVENT_RATE_WINDOW_SECONDS, DEFAULT_PUBLIC_EVENT_RATE_LIMIT.windowSeconds),
    blockSeconds: parseEnvInt(env.PUBLIC_EVENT_RATE_BLOCK_SECONDS, DEFAULT_PUBLIC_EVENT_RATE_LIMIT.blockSeconds)
  };
}

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const code = String(params.code ?? 'unknown').toUpperCase();
  const limitKey = `public-event:${ip}:${code}`;
  const status = await checkRateLimit(env, limitKey, getPublicEventRateLimit(env));
  if (!status.allowed) {
    const headers = status.retryAfterSeconds ? { 'Retry-After': String(status.retryAfterSeconds) } : undefined;
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429,
      { headers }
    );
  }
  const url = new URL(request.url);
  const viewParam = url.searchParams.get('view') as 'play' | 'leaderboard' | null;
  const result = await getPublicEventPayload(env, params.code as string, viewParam ?? undefined);
  if (!result.ok) {
    await recordRateLimitHit(env, limitKey, getPublicEventRateLimit(env));
    return jsonError(result.error, result.status);
  }

  return jsonOk(result.data);
};
