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
  const row = await queryFirst<{
    key: string;
    count: number;
    first_seen: number;
    last_seen: number;
    blocked_until: number | null;
  }>(env, 'SELECT key, count, first_seen, last_seen, blocked_until FROM rate_limits WHERE key = ?', [key]);

  if (!row) {
    return { allowed: true, retryAfterSeconds: null };
  }

  if (row.blocked_until && row.blocked_until > now) {
    return { allowed: false, retryAfterSeconds: row.blocked_until - now };
  }

  const elapsed = now - row.first_seen;
  if (elapsed > config.windowSeconds) {
    return { allowed: true, retryAfterSeconds: null };
  }

  if (row.count >= config.maxAttempts) {
    const blockedUntil = now + config.blockSeconds;
    await execute(
      env,
      'UPDATE rate_limits SET blocked_until = ?, last_seen = ? WHERE key = ?',
      [blockedUntil, now, key]
    );
    return { allowed: false, retryAfterSeconds: config.blockSeconds };
  }

  return { allowed: true, retryAfterSeconds: null };
}

export async function recordRateLimitHit(env: Env, key: string, config: RateLimitConfig) {
  const now = nowSeconds();
  const row = await queryFirst<{
    key: string;
    count: number;
    first_seen: number;
    last_seen: number;
    blocked_until: number | null;
  }>(env, 'SELECT key, count, first_seen, last_seen, blocked_until FROM rate_limits WHERE key = ?', [key]);

  if (!row) {
    await execute(
      env,
      'INSERT INTO rate_limits (key, count, first_seen, last_seen, blocked_until) VALUES (?, ?, ?, ?, NULL)',
      [key, 1, now, now]
    );
    return;
  }

  const elapsed = now - row.first_seen;
  if (elapsed > config.windowSeconds) {
    await execute(
      env,
      'UPDATE rate_limits SET count = ?, first_seen = ?, last_seen = ?, blocked_until = NULL WHERE key = ?',
      [1, now, now, key]
    );
    return;
  }

  const nextCount = row.count + 1;
  let blockedUntil = row.blocked_until;
  if (nextCount >= config.maxAttempts) {
    blockedUntil = now + config.blockSeconds;
  }

  await execute(
    env,
    'UPDATE rate_limits SET count = ?, last_seen = ?, blocked_until = ? WHERE key = ?',
    [nextCount, now, blockedUntil ?? null, key]
  );
}

export async function clearRateLimit(env: Env, key: string) {
  await execute(env, 'DELETE FROM rate_limits WHERE key = ?', [key]);
}
