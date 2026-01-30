import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { logError, logInfo, logWarn } from '../../_lib/log';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data, request }) => {
  const requestId = data.requestId ?? request.headers.get('x-request-id') ?? 'unknown';
  const raw = params.key;
  const key = Array.isArray(raw) ? raw.join('/') : raw;
  if (!key) {
    return jsonError({ code: 'invalid_request', message: 'Missing media key' }, 400);
  }

  if (!data.user) {
    return jsonError({ code: 'unauthorized', message: 'Authentication required' }, 401);
  }

  const rangeHeader = request.headers.get('range');
  logInfo(env, 'media_request_start', {
    requestId,
    method: request.method,
    key,
    userId: data.user?.id ?? null,
    hasRange: Boolean(rangeHeader),
    range: rangeHeader ? rangeHeader.slice(0, 64) : null
  });

  try {
    const headStart = performance.now();
    const head = await env.BUCKET.head(key);
    const headDurationMs = Math.round(performance.now() - headStart);
    if (!head) {
      logWarn(env, 'media_not_found', { requestId, key, headDurationMs });
      return jsonError({ code: 'not_found', message: 'Media not found' }, 404);
    }
    logInfo(env, 'r2_head', {
      requestId,
      key,
      size: head.size,
      contentType: head.httpMetadata?.contentType ?? null,
      durationMs: headDurationMs
    });

    const totalSize = head.size;
    const rawContentType = head.httpMetadata?.contentType ?? 'application/octet-stream';
    const extension = key.split('.').pop()?.toLowerCase() ?? '';
    const inferredContentType = (() => {
      switch (extension) {
        case 'mp3':
          return 'audio/mpeg';
        case 'wav':
          return 'audio/wav';
        case 'ogg':
          return 'audio/ogg';
        case 'pdf':
          return 'application/pdf';
        case 'png':
          return 'image/png';
        case 'jpg':
        case 'jpeg':
          return 'image/jpeg';
        case 'webp':
          return 'image/webp';
        default:
          return null;
      }
    })();
    const contentType =
      rawContentType === 'application/octet-stream' && inferredContentType
        ? inferredContentType
        : rawContentType;
    let status = 200;
    let body = null as ReadableStream | null;
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'private, max-age=300');

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
      if (!match) {
        return jsonError({ code: 'invalid_request', message: 'Invalid range header' }, 416);
      }
      const startRaw = match[1];
      const endRaw = match[2];
      let start = startRaw ? Number(startRaw) : NaN;
      let end = endRaw ? Number(endRaw) : NaN;

      if (Number.isNaN(start) && !Number.isNaN(end)) {
        const suffixLength = end;
        start = Math.max(totalSize - suffixLength, 0);
        end = totalSize - 1;
      } else if (!Number.isNaN(start) && Number.isNaN(end)) {
        end = totalSize - 1;
      }

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
        headers.set('Content-Range', `bytes */${totalSize}`);
        return new Response(null, { status: 416, headers });
      }

      const length = end - start + 1;
      const getStart = performance.now();
      const object = await env.BUCKET.get(key, { range: { offset: start, length } });
      const getDurationMs = Math.round(performance.now() - getStart);
      if (!object) {
        logWarn(env, 'media_not_found', { requestId, key, durationMs: getDurationMs });
        return jsonError({ code: 'not_found', message: 'Media not found' }, 404);
      }
      logInfo(env, 'r2_get', {
        requestId,
        key,
        offset: start,
        length,
        durationMs: getDurationMs
      });
      status = 206;
      headers.set('Content-Length', String(length));
      headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      body = object.body;
    } else {
      const getStart = performance.now();
      const object = await env.BUCKET.get(key);
      const getDurationMs = Math.round(performance.now() - getStart);
      if (!object) {
        logWarn(env, 'media_not_found', { requestId, key, durationMs: getDurationMs });
        return jsonError({ code: 'not_found', message: 'Media not found' }, 404);
      }
      logInfo(env, 'r2_get', { requestId, key, durationMs: getDurationMs });
      headers.set('Content-Length', String(totalSize));
      body = object.body;
    }

    logInfo(env, 'media_response', {
      requestId,
      key,
      status,
      contentType,
      contentLength: headers.get('Content-Length')
    });
    return new Response(body, { status, headers });
  } catch (error) {
    logError(env, 'media_error', {
      requestId,
      key,
      message: error instanceof Error ? error.message : 'unknown_error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return jsonError({ code: 'server_error', message: 'Media fetch failed' }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data, request }) => {
  const requestId = data.requestId ?? request.headers.get('x-request-id') ?? 'unknown';
  const raw = params.key;
  const key = Array.isArray(raw) ? raw.join('/') : raw;
  if (!key) {
    return jsonError({ code: 'invalid_request', message: 'Missing media key' }, 400);
  }

  if (!data.user) {
    return jsonError({ code: 'unauthorized', message: 'Authentication required' }, 401);
  }

  if (data.user.user_type !== 'admin' && !key.startsWith(`user/${data.user.id}/`)) {
    return jsonError({ code: 'forbidden', message: 'Access denied' }, 403);
  }

  logInfo(env, 'media_delete_start', {
    requestId,
    key,
    userId: data.user.id
  });

  try {
    const start = performance.now();
    await env.BUCKET.delete(key);
    const durationMs = Math.round(performance.now() - start);
    logInfo(env, 'r2_delete', { requestId, key, durationMs });
    return jsonOk({ ok: true });
  } catch (error) {
    logError(env, 'media_delete_error', {
      requestId,
      key,
      message: error instanceof Error ? error.message : 'unknown_error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return jsonError({ code: 'server_error', message: 'Media delete failed' }, 500);
  }
};
