import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { execute, queryFirst } from '../../../db';
import { requireAdmin } from '../../../access';
import { MAX_IMAGE_BYTES, sniffMedia } from '../../../media';
import { logInfo, logWarn } from '../../../_lib/log';

function sanitizeFilename(raw: string | null): string {
  if (!raw) return 'logo';
  const trimmed = raw.trim();
  if (!trimmed) return 'logo';
  const basename = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return basename.slice(0, 200);
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const locationId = params.id as string;
  const location = await queryFirst<any>(
    env,
    'SELECT * FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [locationId]
  );
  if (!location) {
    return jsonError({ code: 'not_found', message: 'Location not found' }, 404);
  }

  const buffer = await request.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    return jsonError({ code: 'invalid_request', message: 'File is required' }, 400);
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return jsonError({ code: 'file_too_large', message: 'File exceeds size limit' }, 400);
  }

  const sniff = sniffMedia(new Uint8Array(buffer));
  if (!sniff || sniff.kind !== 'image') {
    return jsonError({ code: 'invalid_media', message: 'Only image files are allowed' }, 400);
  }

  const filename = sanitizeFilename(request.headers.get('x-logo-filename'));
  const key = `user/${data.user?.id ?? 'unknown'}/locations/${locationId}/logo-${crypto.randomUUID()}.${sniff.extension}`;

  const putStart = performance.now();
  await env.BUCKET.put(key, buffer, { httpMetadata: { contentType: sniff.contentType } });
  const putDurationMs = Math.round(performance.now() - putStart);
  logInfo(env, 'location_logo_put', {
    locationId,
    key,
    size: buffer.byteLength,
    durationMs: putDurationMs
  });

  const previousKey = location.logo_key as string | null;
  await execute(env, 'UPDATE locations SET logo_key = ?, logo_name = ? WHERE id = ?', [
    key,
    filename,
    locationId
  ]);

  if (previousKey && previousKey !== key) {
    try {
      await env.BUCKET.delete(previousKey);
    } catch (error) {
      logWarn(env, 'location_logo_cleanup_failed', {
        locationId,
        previousKey,
        message: error instanceof Error ? error.message : 'unknown_error'
      });
    }
  }

  const row = await queryFirst(env, 'SELECT * FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0', [
    locationId
  ]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const locationId = params.id as string;
  const location = await queryFirst<any>(
    env,
    'SELECT * FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [locationId]
  );
  if (!location) {
    return jsonError({ code: 'not_found', message: 'Location not found' }, 404);
  }

  const key = location.logo_key as string | null;
  await execute(env, 'UPDATE locations SET logo_key = NULL, logo_name = NULL WHERE id = ?', [locationId]);

  if (key) {
    try {
      await env.BUCKET.delete(key);
    } catch (error) {
      logWarn(env, 'location_logo_delete_failed', {
        locationId,
        key,
        message: error instanceof Error ? error.message : 'unknown_error'
      });
    }
  }

  const row = await queryFirst(env, 'SELECT * FROM locations WHERE id = ? AND COALESCE(deleted, 0) = 0', [
    locationId
  ]);
  return jsonOk(row);
};
