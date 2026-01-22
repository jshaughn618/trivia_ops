import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { execute, queryFirst } from '../../../db';
import { logInfo, logWarn } from '../../../_lib/log';
import { MAX_PDF_BYTES, sniffPdf } from '../../../documents';
import { requireAdmin } from '../../../access';

const DOC_TYPES = new Set(['scoresheet', 'answersheet']);

type DocType = 'scoresheet' | 'answersheet';

function getDocType(request: Request): DocType | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('type');
  const fromHeader = request.headers.get('x-doc-type');
  const raw = (fromHeader || fromQuery || '').toLowerCase();
  if (raw === 'scoresheet' || raw === 'answersheet') return raw;
  return null;
}

function sanitizeFilename(raw: string | null): string {
  if (!raw) return 'document.pdf';
  const trimmed = raw.trim();
  if (!trimmed) return 'document.pdf';
  const basename = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return basename.slice(0, 200);
}

function columnFor(type: DocType) {
  if (type === 'scoresheet') {
    return { keyColumn: 'scoresheet_key', nameColumn: 'scoresheet_name' };
  }
  return { keyColumn: 'answersheet_key', nameColumn: 'answersheet_name' };
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const requestId = data.requestId ?? request.headers.get('x-request-id') ?? 'unknown';
  const eventId = params.id as string;
  const docType = getDocType(request);

  logInfo(env, 'event_document_upload_start', {
    requestId,
    eventId,
    docType,
    userId: data.user?.id ?? null
  });

  if (!data.user) {
    return jsonError({ code: 'unauthorized', message: 'Authentication required' }, 401);
  }

  const adminGuard = requireAdmin(data.user ?? null);
  if (adminGuard) return adminGuard;

  if (!docType || !DOC_TYPES.has(docType)) {
    return jsonError({ code: 'invalid_request', message: 'Invalid document type' }, 400);
  }

  const event = await queryFirst<any>(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [
    eventId
  ]);
  if (!event) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const buffer = await request.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    return jsonError({ code: 'invalid_request', message: 'File is required' }, 400);
  }

  const size = buffer.byteLength;
  if (size > MAX_PDF_BYTES) {
    logWarn(env, 'event_document_too_large', { requestId, eventId, docType, size, maxBytes: MAX_PDF_BYTES });
    return jsonError({ code: 'file_too_large', message: 'File exceeds size limit' }, 400);
  }

  if (!sniffPdf(new Uint8Array(buffer))) {
    logWarn(env, 'event_document_invalid', { requestId, eventId, docType });
    return jsonError({ code: 'invalid_media', message: 'Only PDF files are allowed' }, 400);
  }

  const filename = sanitizeFilename(request.headers.get('x-doc-filename'));
  const key = `user/${data.user.id}/events/${eventId}/${docType}-${crypto.randomUUID()}.pdf`;
  const putStart = performance.now();
  await env.BUCKET.put(key, buffer, {
    httpMetadata: { contentType: 'application/pdf' }
  });
  const putDurationMs = Math.round(performance.now() - putStart);
  logInfo(env, 'event_document_put', { requestId, eventId, docType, key, size, durationMs: putDurationMs });

  const { keyColumn, nameColumn } = columnFor(docType);
  const previousKey = event[keyColumn] as string | null;
  await execute(env, `UPDATE events SET ${keyColumn} = ?, ${nameColumn} = ? WHERE id = ?`, [
    key,
    filename,
    eventId
  ]);

  if (previousKey && previousKey !== key) {
    try {
      await env.BUCKET.delete(previousKey);
    } catch (error) {
      logWarn(env, 'event_document_cleanup_failed', {
        requestId,
        eventId,
        docType,
        previousKey,
        message: error instanceof Error ? error.message : 'unknown_error'
      });
    }
  }

  const row = await queryFirst(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [eventId]);
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const requestId = data.requestId ?? request.headers.get('x-request-id') ?? 'unknown';
  const eventId = params.id as string;
  const docType = getDocType(request);

  logInfo(env, 'event_document_delete_start', {
    requestId,
    eventId,
    docType,
    userId: data.user?.id ?? null
  });

  if (!data.user) {
    return jsonError({ code: 'unauthorized', message: 'Authentication required' }, 401);
  }

  const adminGuard = requireAdmin(data.user ?? null);
  if (adminGuard) return adminGuard;

  if (!docType || !DOC_TYPES.has(docType)) {
    return jsonError({ code: 'invalid_request', message: 'Invalid document type' }, 400);
  }

  const event = await queryFirst<any>(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [
    eventId
  ]);
  if (!event) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const { keyColumn, nameColumn } = columnFor(docType);
  const key = event[keyColumn] as string | null;

  await execute(env, `UPDATE events SET ${keyColumn} = NULL, ${nameColumn} = NULL WHERE id = ?`, [eventId]);

  if (key) {
    try {
      await env.BUCKET.delete(key);
    } catch (error) {
      logWarn(env, 'event_document_delete_failed', {
        requestId,
        eventId,
        docType,
        key,
        message: error instanceof Error ? error.message : 'unknown_error'
      });
    }
  }

  const row = await queryFirst(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [eventId]);
  return jsonOk(row);
};
