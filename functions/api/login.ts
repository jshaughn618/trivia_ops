import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { loginSchema } from '../../shared/validators';
import { queryFirst } from '../db';
import { createSession, buildSessionCookie, verifyPassword } from '../auth';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = await parseJson<{ email: string; password: string }>(request);
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid login', details: parsed.error.flatten() }, 400);
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
    return jsonError({ code: 'invalid_credentials', message: 'Invalid email or password' }, 401);
  }

  const isValid = await verifyPassword(parsed.data.password, user.password_hash);
  if (!isValid) {
    return jsonError({ code: 'invalid_credentials', message: 'Invalid email or password' }, 401);
  }

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
