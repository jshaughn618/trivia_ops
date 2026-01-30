import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { getPublicEventPayload } from '../../../public-event';
import { checkRateLimit, recordRateLimitHit } from '../../../rate-limit';

const PUBLIC_EVENT_RATE_LIMIT = {
  maxAttempts: 30,
  windowSeconds: 5 * 60,
  blockSeconds: 10 * 60
};

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const limitKey = `public-event:${ip}`;
  const status = await checkRateLimit(env, limitKey, PUBLIC_EVENT_RATE_LIMIT);
  if (!status.allowed) {
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429
    );
  }
  const url = new URL(request.url);
  const viewParam = url.searchParams.get('view') as 'play' | 'leaderboard' | null;
  const result = await getPublicEventPayload(env, params.code as string, viewParam ?? undefined);
  if (!result.ok) {
    await recordRateLimitHit(env, limitKey, PUBLIC_EVENT_RATE_LIMIT);
    return jsonError(result.error, result.status);
  }

  return jsonOk(result.data);
};
