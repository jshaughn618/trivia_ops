import type { Env } from './types';
import { execute, queryFirst } from './db';

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number | null;
};

type RateLimitConfig = {
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function checkRateLimit(env: Env, key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const now = nowSeconds();
  await cleanupRateLimits(env, config);

  const row = await queryFirst<{
    key: string;
    count: number;
    first_seen: number;
    last_seen: number;
    blocked_until: number | null;
  }>(env, 'SELECT key, count, first_seen, last_seen, blocked_until FROM rate_limits WHERE key = ?', [key]);

  let allowed: boolean;
  let retryAfterSeconds: number | null = null;

  if (!row) {
    // First hit: start a new window with count = 1.
    await execute(
      env,
      'INSERT INTO rate_limits (key, count, first_seen, last_seen, blocked_until) VALUES (?, ?, ?, ?, NULL)',
      [key, 1, now, now]
    );
    allowed = true;
  } else {
    // Existing record: apply window and blocking logic.
    const elapsed = now - row.first_seen;
    let nextCount: number;
    let firstSeen = row.first_seen;
    let blockedUntil = row.blocked_until;

    if (blockedUntil && blockedUntil > now) {
      // Still blocked; do not increment count in the blocked period.
      allowed = false;
      retryAfterSeconds = blockedUntil - now;
    } else {
      // Window expired: reset.
      if (elapsed > config.windowSeconds) {
        nextCount = 1;
        firstSeen = now;
        blockedUntil = null;
      } else {
        nextCount = row.count + 1;
      }

      if (nextCount >= config.maxAttempts) {
        blockedUntil = now + config.blockSeconds;
        allowed = false;
        retryAfterSeconds = config.blockSeconds;
      } else {
        allowed = true;
        retryAfterSeconds = null;
      }

      await execute(
        env,
        'UPDATE rate_limits SET count = ?, first_seen = ?, last_seen = ?, blocked_until = ? WHERE key = ?',
        [nextCount, firstSeen, now, blockedUntil ?? null, key]
      );
    }
  }

  return { allowed, retryAfterSeconds };
}

export async function recordRateLimitHit(env: Env, key: string, _config: RateLimitConfig) {
  // No-op shim retained for backwards compatibility.
  //
  // The rate limit is now fully enforced and recorded by `checkRateLimit`,
  // which performs an atomic check-and-record inside a transaction.
  // Callers should stop invoking `recordRateLimitHit` after `checkRateLimit`,
  // as that pattern is no longer necessary and `recordRateLimitHit` does nothing.
  void env;
  void key;
}

export async function clearRateLimit(env: Env, key: string) {
  await execute(env, 'DELETE FROM rate_limits WHERE key = ?', [key]);
}

async function cleanupRateLimits(env: Env, config: RateLimitConfig) {
  const now = nowSeconds();
  const cutoff = now - (config.windowSeconds + config.blockSeconds);
  await execute(
    env,
    'DELETE FROM rate_limits WHERE last_seen < ? AND (blocked_until IS NULL OR blocked_until < ?)',
    [cutoff, now]
  );
}
