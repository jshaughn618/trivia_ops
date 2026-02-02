import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { loginSchema } from '../../shared/validators';
import { queryFirst } from '../db';
import { createSession, buildSessionCookie, buildCsrfCookie, verifyPassword } from '../auth';
import { checkRateLimit, clearRateLimit, recordRateLimitHit } from '../rate-limit';
import { logError } from '../_lib/log';

const DEFAULT_LOGIN_RATE_LIMIT = {
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  blockSeconds: 30 * 60
};

function getLoginRateLimit(env: Env) {
  return {
    maxAttempts: parseEnvInt(env.LOGIN_RATE_MAX, DEFAULT_LOGIN_RATE_LIMIT.maxAttempts),
    windowSeconds: parseEnvInt(env.LOGIN_RATE_WINDOW_SECONDS, DEFAULT_LOGIN_RATE_LIMIT.windowSeconds),
    blockSeconds: parseEnvInt(env.LOGIN_RATE_BLOCK_SECONDS, DEFAULT_LOGIN_RATE_LIMIT.blockSeconds)
  };
}

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!env.SESSION_SECRET) {
    return jsonError(
      { code: 'server_misconfig', message: 'SESSION_SECRET not configured' },
      500
    );
  }
  const payload = await parseJson<{ email: string; password: string }>(request);
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid login', details: parsed.error.flatten() }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const key = `login:${ip}:${email}`;
  try {
    const status = await checkRateLimit(env, key, getLoginRateLimit(env));
    if (!status.allowed) {
      const headers = status.retryAfterSeconds
        ? { 'Retry-After': String(status.retryAfterSeconds) }
        : undefined;
      return jsonError(
        { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
        429,
        { headers }
      );
    }
  } catch (error) {
    logError(env, 'login_rate_limit_error', {
      ip,
      email,
      message: error instanceof Error ? error.message : 'unknown_error'
    });
    // Allow login to proceed if rate limiting fails.
  }

  const user = await queryFirst<{
    id: string;
    email: string;
    password_hash: string;
    created_at: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    user_type: string;
  }>(
    env,
    'SELECT id, email, password_hash, created_at, username, first_name, last_name, user_type FROM users WHERE email = ? AND COALESCE(deleted, 0) = 0',
    [parsed.data.email]
  );

  if (!user) {
    try {
      await recordRateLimitHit(env, key, getLoginRateLimit(env));
    } catch (error) {
      logError(env, 'login_rate_limit_record_error', {
        ip,
        email,
        message: error instanceof Error ? error.message : 'unknown_error'
      });
    }
    return jsonError({ code: 'invalid_credentials', message: 'Invalid email or password' }, 401);
  }

  const isValid = await verifyPassword(parsed.data.password, user.password_hash);
  if (!isValid) {
    try {
      await recordRateLimitHit(env, key, getLoginRateLimit(env));
    } catch (error) {
      logError(env, 'login_rate_limit_record_error', {
        ip,
        email,
        message: error instanceof Error ? error.message : 'unknown_error'
      });
    }
    return jsonError({ code: 'invalid_credentials', message: 'Invalid email or password' }, 401);
  }

  try {
    await clearRateLimit(env, key);
  } catch (error) {
    logError(env, 'login_rate_limit_clear_error', {
      ip,
      email,
      message: error instanceof Error ? error.message : 'unknown_error'
    });
  }
  const session = await createSession(env, user.id, request);
  const csrfToken = crypto.randomUUID();
  const headers = new Headers();
  headers.append('Set-Cookie', buildSessionCookie(session.signed, session.expiresAt, env, request));
  headers.append('Set-Cookie', buildCsrfCookie(csrfToken, env, request));
  return jsonOk(
    {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      user_type: user.user_type as 'admin' | 'host' | 'player'
    },
    { headers }
  );
};
