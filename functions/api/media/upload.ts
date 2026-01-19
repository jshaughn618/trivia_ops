import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, sniffMedia } from '../../media';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const form = await request.formData();
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
    if (raw.startsWith('data:')) {
      const match = raw.match(/^data:([^;]+);base64,(.*)$/s);
      if (match) {
        mime = match[1];
        raw = match[2];
      }
    }
    const cleaned = raw.replace(/\s+/g, '');
    let decoded: Uint8Array | null = null;
    const base64Candidate = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (base64Candidate.length % 4)) % 4;
    const padded = base64Candidate + '='.repeat(padLength);
    try {
      const binary = atob(padded);
      decoded = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        decoded[i] = binary.charCodeAt(i);
      }
    } catch {
      decoded = null;
    }
    if (decoded) {
      buffer = decoded.buffer;
      size = decoded.byteLength;
    } else {
      // Fallback: treat the string as raw binary bytes.
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) {
        bytes[i] = raw.charCodeAt(i) & 0xff;
      }
      buffer = bytes.buffer;
      size = bytes.byteLength;
    }
    if (!kind && mime) {
      if (mime.startsWith('audio/')) kind = 'audio';
      if (mime.startsWith('image/')) kind = 'image';
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
    return jsonError({ code: 'invalid_request', message: 'Invalid media kind' }, 400);
  }

  const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (size > maxBytes) {
    return jsonError({ code: 'file_too_large', message: 'File exceeds size limit' }, 400);
  }

  const sniff = sniffMedia(new Uint8Array(buffer));
  if (!sniff || sniff.kind !== kind) {
    return jsonError({ code: 'invalid_media', message: 'Unsupported media type' }, 400);
  }

  const key = `user/${data.user.id}/${kind}/${crypto.randomUUID()}.${sniff.extension}`;
  await env.BUCKET.put(key, buffer, {
    httpMetadata: { contentType: sniff.contentType }
  });

  return jsonOk({ key, media_type: sniff.kind, content_type: sniff.contentType });
};
