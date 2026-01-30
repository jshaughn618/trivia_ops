import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { loginSchema } from '../../shared/validators';
import { queryFirst } from '../db';
import { createSession, buildSessionCookie, verifyPassword } from '../auth';
import { checkRateLimit, clearRateLimit, recordRateLimitHit } from '../rate-limit';

const LOGIN_RATE_LIMIT = {
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  blockSeconds: 30 * 60
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const payload = await parseJson<{ email: string; password: string }>(request);
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid login', details: parsed.error.flatten() }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const key = `login:${ip}:${email}`;
  const status = await checkRateLimit(env, key, LOGIN_RATE_LIMIT);
  if (!status.allowed) {
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429
    );
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
    await recordRateLimitHit(env, key, LOGIN_RATE_LIMIT);
    return jsonError({ code: 'invalid_credentials', message: 'Invalid email or password' }, 401);
  }

  const isValid = await verifyPassword(parsed.data.password, user.password_hash);
  if (!isValid) {
    await recordRateLimitHit(env, key, LOGIN_RATE_LIMIT);
    return jsonError({ code: 'invalid_credentials', message: 'Invalid email or password' }, 401);
  }

  await clearRateLimit(env, key);
  const session = await createSession(env, user.id, request);
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
    { headers: { 'Set-Cookie': buildSessionCookie(session.signed, session.expiresAt) } }
  );
};
