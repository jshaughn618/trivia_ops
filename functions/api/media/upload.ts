import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, sniffMedia } from '../../media';
import { logError, logInfo, logWarn } from '../../_lib/log';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const requestId = data.requestId ?? request.headers.get('x-request-id') ?? 'unknown';
  logInfo(env, 'media_upload_start', {
    requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    userId: data.user?.id ?? null
  });

  if (!data.user) {
    return jsonError({ code: 'unauthorized', message: 'Authentication required' }, 401);
  }

  const contentTypeHeader = request.headers.get('content-type') ?? '';
  if (!contentTypeHeader.includes('multipart/form-data')) {
    const kindHeader = request.headers.get('x-media-kind');
    let kind = typeof kindHeader === 'string' && kindHeader ? kindHeader : null;
    const buffer = await request.arrayBuffer();
    const size = buffer.byteLength;

    const sniff = sniffMedia(new Uint8Array(buffer));
    if (!sniff) {
      logWarn(env, 'media_invalid_sniff', { requestId, kind, detected: 'unknown' });
      return jsonError({ code: 'invalid_media', message: 'Unsupported media type' }, 400);
    }

    if (!kind) {
      kind = sniff.kind;
    }

    if (kind !== sniff.kind) {
      logWarn(env, 'media_invalid_kind', { requestId, kind, detected: sniff.kind });
      return jsonError({ code: 'invalid_request', message: 'Invalid media kind' }, 400);
    }

    const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    if (size > maxBytes) {
      logWarn(env, 'media_too_large', { requestId, kind, size, maxBytes });
      return jsonError({ code: 'file_too_large', message: 'File exceeds size limit' }, 400);
    }

    const key = `user/${data.user.id}/${kind}/${crypto.randomUUID()}.${sniff.extension}`;
    const putStart = performance.now();
    await env.BUCKET.put(key, buffer, {
      httpMetadata: { contentType: sniff.contentType }
    });
    const putDurationMs = Math.round(performance.now() - putStart);
    logInfo(env, 'r2_put', {
      requestId,
      key,
      kind,
      size,
      contentType: sniff.contentType,
      durationMs: putDurationMs,
      uploadMode: 'binary'
    });

    return jsonOk({ key, media_type: sniff.kind, content_type: sniff.contentType });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    logError(env, 'media_formdata_error', {
      requestId,
      message: error instanceof Error ? error.message : 'unknown_error'
    });
    return jsonError({ code: 'invalid_request', message: 'Could not parse form data' }, 400);
  }
  const file = form.get('file');
  const kindEntry = form.get('kind');
  const fileBlob = file && typeof (file as Blob).arrayBuffer === 'function' ? (file as Blob) : null;
  let kind = typeof kindEntry === 'string' && kindEntry ? kindEntry : null;
  let buffer: ArrayBuffer | null = null;
  let size = 0;

  if (fileBlob) {
    buffer = await fileBlob.arrayBuffer();
    size = fileBlob.size;
    if (!kind) {
      if (fileBlob.type.startsWith('audio/')) kind = 'audio';
      if (fileBlob.type.startsWith('image/')) kind = 'image';
    }
  } else if (typeof file === 'string' && file.length > 0) {
    let raw = file;
    let mime: string | null = null;
    const isDataUri = raw.startsWith('data:');
    if (isDataUri) {
      const match = raw.match(/^data:([^;]+);base64,(.*)$/s);
      if (match) {
        mime = match[1];
        raw = match[2];
      }
    }
    if (!kind && mime) {
      if (mime.startsWith('audio/')) kind = 'audio';
      if (mime.startsWith('image/')) kind = 'image';
    }
    const cleaned = raw.replace(/\s+/g, '');
    const base64Candidate = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (base64Candidate.length % 4)) % 4;
    const padded = base64Candidate + '='.repeat(padLength);

    let base64Bytes: Uint8Array | null = null;
    try {
      const binary = atob(padded);
      base64Bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        base64Bytes[i] = binary.charCodeAt(i);
      }
    } catch {
      base64Bytes = null;
    }

    const rawBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) {
      rawBytes[i] = raw.charCodeAt(i) & 0xff;
    }

    const base64Sniff = base64Bytes ? sniffMedia(base64Bytes) : null;
    const rawSniff = sniffMedia(rawBytes);
    const desiredKind = kind ?? null;
    const matchesKind = (sniff: { kind: string } | null) =>
      Boolean(sniff && (!desiredKind || sniff.kind === desiredKind));

    const preferBase64 = isDataUri;
    const first = preferBase64 ? base64Sniff : rawSniff;
    const second = preferBase64 ? rawSniff : base64Sniff;
    const firstBytes = preferBase64 ? base64Bytes : rawBytes;
    const secondBytes = preferBase64 ? rawBytes : base64Bytes;
    const firstLabel = preferBase64 ? 'base64' : 'raw';
    const secondLabel = preferBase64 ? 'raw' : 'base64';

    let selectedSniff: { kind: string } | null = null;
    if (matchesKind(first) && firstBytes) {
      buffer = firstBytes.buffer;
      size = firstBytes.byteLength;
      selectedSniff = first;
      logInfo(env, 'media_decode', { requestId, method: firstLabel, size });
    } else if (matchesKind(second) && secondBytes) {
      buffer = secondBytes.buffer;
      size = secondBytes.byteLength;
      selectedSniff = second;
      logInfo(env, 'media_decode', { requestId, method: secondLabel, size });
    } else if (base64Bytes) {
      buffer = base64Bytes.buffer;
      size = base64Bytes.byteLength;
      selectedSniff = base64Sniff;
      logWarn(env, 'media_decode', { requestId, method: 'base64_fallback', size });
    } else {
      buffer = rawBytes.buffer;
      size = rawBytes.byteLength;
      selectedSniff = rawSniff;
      logWarn(env, 'media_decode', { requestId, method: 'raw_fallback', size });
    }

    if (!kind && selectedSniff) {
      kind = selectedSniff.kind;
    }
  } else {
    const fileValue = file as unknown;
    return jsonError(
      {
        code: 'invalid_request',
        message: 'File is required',
        details: {
          content_type: request.headers.get('content-type'),
          form_keys: [...form.keys()],
          file_type: typeof fileValue,
          file_ctor: fileValue && (fileValue as { constructor?: { name?: string } }).constructor?.name,
          file_has_arrayBuffer: Boolean(
            fileValue && typeof (fileValue as { arrayBuffer?: unknown }).arrayBuffer === 'function'
          ),
          file_is_blob: fileValue instanceof Blob,
          file_string_length: typeof fileValue === 'string' ? fileValue.length : null
        }
      },
      400
    );
  }

  if (kind !== 'image' && kind !== 'audio') {
    logWarn(env, 'media_invalid_kind', { requestId, kind });
    return jsonError({ code: 'invalid_request', message: 'Invalid media kind' }, 400);
  }

  const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (size > maxBytes) {
    logWarn(env, 'media_too_large', { requestId, kind, size, maxBytes });
    return jsonError({ code: 'file_too_large', message: 'File exceeds size limit' }, 400);
  }

  const sniff = sniffMedia(new Uint8Array(buffer));
  if (!sniff || sniff.kind !== kind) {
    logWarn(env, 'media_invalid_sniff', {
      requestId,
      kind,
      detected: sniff?.kind ?? 'unknown'
    });
    return jsonError({ code: 'invalid_media', message: 'Unsupported media type' }, 400);
  }

  const key = `user/${data.user.id}/${kind}/${crypto.randomUUID()}.${sniff.extension}`;
  const putStart = performance.now();
  await env.BUCKET.put(key, buffer, {
    httpMetadata: { contentType: sniff.contentType }
  });
  const putDurationMs = Math.round(performance.now() - putStart);
  logInfo(env, 'r2_put', {
    requestId,
    key,
    kind,
    size,
    contentType: sniff.contentType,
    durationMs: putDurationMs
  });

  return jsonOk({ key, media_type: sniff.kind, content_type: sniff.contentType });
};
