import type { Env } from '../../../../../types';
import { jsonError } from '../../../../../responses';
import { normalizeCode } from '../../../../../public';
import { queryFirst } from '../../../../../db';
import { logError, logInfo, logWarn } from '../../../../../_lib/log';

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const requestId = data.requestId ?? request.headers.get('x-request-id') ?? 'unknown';
  const raw = params.key;
  const key = Array.isArray(raw) ? raw.join('/') : raw;
  if (!key) {
    return jsonError({ code: 'invalid_request', message: 'Missing media key' }, 400);
  }

  const code = normalizeCode(params.code as string);
  const event = await queryFirst<{ id: string; status: string }>(
    env,
    'SELECT id, status FROM events WHERE public_code = ? AND COALESCE(deleted, 0) = 0',
    [code]
  );

  if (!event) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  if (event.status === 'canceled') {
    return jsonError({ code: 'event_closed', message: 'Event is closed' }, 403);
  }

  const live = await queryFirst<{
    active_round_id: string | null;
    current_item_ordinal: number | null;
  }>(
    env,
    'SELECT active_round_id, current_item_ordinal FROM event_live_state WHERE event_id = ? AND COALESCE(deleted, 0) = 0',
    [event.id]
  );

  if (!live?.active_round_id || !live.current_item_ordinal) {
    return jsonError({ code: 'not_live', message: 'Event is not live' }, 403);
  }

  const activeRound = await queryFirst<{ status: string }>(
    env,
    'SELECT status FROM event_rounds WHERE id = ? AND event_id = ? AND COALESCE(deleted, 0) = 0',
    [live.active_round_id, event.id]
  );
  if (!activeRound || activeRound.status !== 'live') {
    return jsonError({ code: 'not_live', message: 'Event is not live' }, 403);
  }

  const mediaMatch = await queryFirst<{ media_key: string }>(
    env,
    `SELECT ei.media_key
     FROM event_round_items eri
     JOIN edition_items ei ON ei.id = eri.edition_item_id
     WHERE eri.event_round_id = ?
       AND eri.ordinal = ?
       AND ei.media_key = ?
       AND COALESCE(eri.deleted, 0) = 0
       AND COALESCE(ei.deleted, 0) = 0
     LIMIT 1`,
    [live.active_round_id, live.current_item_ordinal, key]
  );

  if (!mediaMatch) {
    return jsonError({ code: 'forbidden', message: 'Media not available' }, 403);
  }

  const rangeHeader = request.headers.get('range');
  logInfo(env, 'public_media_request_start', {
    requestId,
    method: request.method,
    key,
    hasRange: Boolean(rangeHeader),
    range: rangeHeader ? rangeHeader.slice(0, 64) : null
  });

  try {
    const headStart = performance.now();
    const head = await env.BUCKET.head(key);
    const headDurationMs = Math.round(performance.now() - headStart);
    if (!head) {
      logWarn(env, 'public_media_not_found', { requestId, key, headDurationMs });
      return jsonError({ code: 'not_found', message: 'Media not found' }, 404);
    }
    logInfo(env, 'public_r2_head', {
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
    headers.set('Cache-Control', 'private, max-age=60');

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
        logWarn(env, 'public_media_not_found', { requestId, key, durationMs: getDurationMs });
        return jsonError({ code: 'not_found', message: 'Media not found' }, 404);
      }
      logInfo(env, 'public_r2_get', {
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
        logWarn(env, 'public_media_not_found', { requestId, key, durationMs: getDurationMs });
        return jsonError({ code: 'not_found', message: 'Media not found' }, 404);
      }
      logInfo(env, 'public_r2_get', { requestId, key, durationMs: getDurationMs });
      headers.set('Content-Length', String(totalSize));
      body = object.body;
    }

    logInfo(env, 'public_media_response', {
      requestId,
      key,
      status,
      contentType,
      contentLength: headers.get('Content-Length')
    });
    return new Response(body, { status, headers });
  } catch (error) {
    logError(env, 'public_media_error', {
      requestId,
      key,
      message: error instanceof Error ? error.message : 'unknown_error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return jsonError({ code: 'server_error', message: 'Media fetch failed' }, 500);
  }
};
