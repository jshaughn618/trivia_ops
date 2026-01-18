import type { Env } from '../../types';
import { jsonError } from '../../responses';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const raw = params.key;
  const key = Array.isArray(raw) ? raw.join('/') : raw;
  if (!key) {
    return jsonError({ code: 'invalid_request', message: 'Missing media key' }, 400);
  }

  if (!key.startsWith(`user/${data.user.id}/`)) {
    return jsonError({ code: 'forbidden', message: 'Access denied' }, 403);
  }

  const object = await env.BUCKET.get(key);
  if (!object) {
    return jsonError({ code: 'not_found', message: 'Media not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=300');

  return new Response(object.body, { headers });
};
