import type { ApiError } from '../shared/types';

const jsonHeaders = {
  'Content-Type': 'application/json'
};

export function jsonOk<T>(data: T, init: ResponseInit = {}) {
  return new Response(JSON.stringify({ ok: true, data }), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers ?? {}) }
  });
}

export function jsonError(error: ApiError, status = 400, init: ResponseInit = {}) {
  return new Response(JSON.stringify({ ok: false, error }), {
    ...init,
    status,
    headers: { ...jsonHeaders, ...(init.headers ?? {}) }
  });
}
