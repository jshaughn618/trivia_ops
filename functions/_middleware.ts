import type { Env } from './types';
import { jsonError } from './responses';
import { buildCsrfCookie, getSession, parseCookies, verifySessionCookie } from './auth';
import { queryFirst } from './db';
import { getRequestId, logError, logInfo } from './_lib/log';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const requestId = getRequestId(request);
  (env as { __requestId?: string }).__requestId = requestId;
  context.data.requestId = requestId;

  const publicRoutes = ['/login', '/api/login', '/api/health'];
  const publicPrefixes = ['/play', '/api/public', '/invite'];
  const isStatic = !path.startsWith('/api/') && (path.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(path));
  const loggable = path.startsWith('/api') || path.startsWith('/play') || path === '/login';

  try {
    if (publicRoutes.includes(path) || publicPrefixes.some((prefix) => path.startsWith(prefix)) || isStatic) {
      if (loggable) {
        logInfo(env, 'request_start', {
          requestId,
          method,
          path,
          userId: null
        });
      }
      const response = await context.next();
      if (loggable) {
        logInfo(env, 'request_end', {
          requestId,
          method,
          path,
          status: response.status,
          userId: null
        });
      }
      return withRequestId(response, requestId);
    }

    if (isStateChanging(method)) {
      const csrfResult = validateCsrf(request, env, url);
      if (!csrfResult.ok) {
        const response = path.startsWith('/api')
          ? jsonError(
            { code: 'csrf_failed', message: 'CSRF validation failed', details: { reason: csrfResult.reason } },
            403
          )
          : new Response('Forbidden', { status: 403 });
        return withRequestId(response, requestId);
      }
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
        method,
        path,
        userId: user.id
      });
    }
    const response = await context.next();
    const responseWithCsrf = withCsrfCookie(response, request, env);
    if (loggable) {
      logInfo(env, 'request_end', {
        requestId,
        method,
        path,
        status: response.status,
        userId: user.id
      });
    }
    return withRequestId(responseWithCsrf, requestId);
  } catch (error) {
    logError(env, 'request_error', {
      requestId,
      method,
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

function isStateChanging(method: string) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function validateCsrf(request: Request, env: Env, url: URL) {
  const method = request.method.toUpperCase();
  if (!isStateChanging(method)) return { ok: true as const };
  const cookies = parseCookies(request.headers.get('cookie'));
  const csrfCookie = cookies['csrf_token'];
  const csrfHeader = request.headers.get('x-csrf-token');
  if (csrfCookie && csrfHeader && csrfCookie !== csrfHeader) {
    return { ok: false as const, reason: 'csrf_token_mismatch' };
  }
  if (csrfCookie && !csrfHeader) {
    return { ok: false as const, reason: 'csrf_token_missing' };
  }
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const originFromReferer = referer ? safeOrigin(referer) : null;
  const requestOrigin = url.origin;
  const appOrigin = env.APP_BASE_URL ? safeOrigin(env.APP_BASE_URL) : null;
  const allowedOrigins = new Set([requestOrigin, appOrigin].filter(Boolean) as string[]);

  if (origin) {
    return allowedOrigins.has(origin)
      ? { ok: true as const }
      : { ok: false as const, reason: `origin_not_allowed:${origin}` };
  }
  if (originFromReferer) {
    return allowedOrigins.has(originFromReferer)
      ? { ok: true as const }
      : { ok: false as const, reason: `referer_not_allowed:${originFromReferer}` };
  }
  return { ok: false as const, reason: 'origin_missing' };
}

function safeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function withCsrfCookie(response: Response, request: Request, env: Env) {
  const method = request.method.toUpperCase();
  if (isStateChanging(method)) return response;
  const cookies = parseCookies(request.headers.get('cookie'));
  if (cookies['csrf_token']) return response;
  const token = crypto.randomUUID();
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', buildCsrfCookie(token, env));
  return new Response(response.body, { ...response, headers });
}

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
