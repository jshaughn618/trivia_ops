import type { Env } from './types';
import { jsonError } from './responses';
import { getSession, parseCookies, verifySessionCookie } from './auth';
import { queryFirst } from './db';
import { getRequestId, logError, logInfo } from './_lib/log';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const requestId = getRequestId(request);
  (env as { __requestId?: string }).__requestId = requestId;
  context.data.requestId = requestId;

  const publicRoutes = ['/login', '/api/login'];
  const publicPrefixes = ['/play', '/api/public', '/invite'];
  const isStatic = !path.startsWith('/api/') && (path.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(path));
  const loggable = path.startsWith('/api') || path.startsWith('/play') || path === '/login';

  try {
    if (publicRoutes.includes(path) || publicPrefixes.some((prefix) => path.startsWith(prefix)) || isStatic) {
      if (loggable) {
        logInfo(env, 'request_start', {
          requestId,
          method: request.method,
          path,
          userId: null
        });
      }
      const response = await context.next();
      if (loggable) {
        logInfo(env, 'request_end', {
          requestId,
          method: request.method,
          path,
          status: response.status,
          userId: null
        });
      }
      return withRequestId(response, requestId);
    }

    const cookies = parseCookies(request.headers.get('cookie'));
    const raw = cookies['triviaops_session'];
    if (!raw) {
      return withRequestId(unauthorized(path, requestId), requestId);
    }

    const sessionId = await verifySessionCookie(raw, env.SESSION_SECRET);
    if (!sessionId) {
      return withRequestId(unauthorized(path, requestId), requestId);
    }

    const session = await getSession(env, sessionId);
    if (!session) {
      return withRequestId(unauthorized(path, requestId), requestId);
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
      return withRequestId(unauthorized(path, requestId), requestId);
    }

    context.data.user = user;
    if (loggable) {
      logInfo(env, 'request_start', {
        requestId,
        method: request.method,
        path,
        userId: user.id
      });
    }
    const response = await context.next();
    if (loggable) {
      logInfo(env, 'request_end', {
        requestId,
        method: request.method,
        path,
        status: response.status,
        userId: user.id
      });
    }
    return withRequestId(response, requestId);
  } catch (error) {
    logError(env, 'request_error', {
      requestId,
      method: request.method,
      path,
      message: error instanceof Error ? error.message : 'unknown_error',
      stack: error instanceof Error ? error.stack : undefined
    });
    const response = path.startsWith('/api')
      ? jsonError({ code: 'server_error', message: 'Unexpected error' }, 500)
      : new Response('Unexpected error', { status: 500 });
    return withRequestId(response, requestId);
  }
};

function unauthorized(path: string, requestId: string) {
  if (path.startsWith('/api')) {
    return jsonError(
      { code: 'unauthorized', message: 'Authentication required', details: { requestId } },
      401
    );
  }
  return new Response(null, {
    status: 302,
    headers: { Location: '/login' }
  });
}

function withRequestId(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);
  return new Response(response.body, { ...response, headers });
}
