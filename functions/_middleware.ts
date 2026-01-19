import type { Env } from './types';
import { jsonError } from './responses';
import { getSession, parseCookies, verifySessionCookie } from './auth';
import { queryFirst } from './db';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const publicRoutes = ['/login', '/api/login'];
  const publicPrefixes = ['/play', '/api/public'];
  const isStatic = !path.startsWith('/api/') && (path.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(path));

  if (publicRoutes.includes(path) || publicPrefixes.some((prefix) => path.startsWith(prefix)) || isStatic) {
    return context.next();
  }

  const cookies = parseCookies(request.headers.get('cookie'));
  const raw = cookies['triviaops_session'];
  if (!raw) {
    return unauthorized(path);
  }

  const sessionId = await verifySessionCookie(raw, env.SESSION_SECRET);
  if (!sessionId) {
    return unauthorized(path);
  }

  const session = await getSession(env, sessionId);
  if (!session) {
    return unauthorized(path);
  }

  const user = await queryFirst<{
    id: string;
    email: string;
    created_at: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    user_type: string;
  }>(
    env,
    'SELECT id, email, created_at, username, first_name, last_name, user_type FROM users WHERE id = ?',
    [session.user_id]
  );

  if (!user) {
    return unauthorized(path);
  }

  context.data.user = user;
  return context.next();
};

function unauthorized(path: string) {
  if (path.startsWith('/api')) {
    return jsonError({ code: 'unauthorized', message: 'Authentication required' }, 401);
  }
  return new Response(null, {
    status: 302,
    headers: { Location: '/login' }
  });
}
