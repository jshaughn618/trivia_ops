import type { ApiError } from '../shared/types';

export function jsonOk<T>(data: T, init: ResponseInit = {}) {
  const headers = buildJsonHeaders(init.headers);
  return new Response(JSON.stringify({ ok: true, data }), {
    ...init,
    headers
  });
}

export function jsonError(error: ApiError, status = 400, init: ResponseInit = {}) {
  const headers = buildJsonHeaders(init.headers);
  return new Response(JSON.stringify({ ok: false, error }), {
    ...init,
    status,
    headers
  });
}

function buildJsonHeaders(initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}
