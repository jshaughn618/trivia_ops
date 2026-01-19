import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, sniffMedia } from '../../media';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const form = await request.formData();
  const file = form.get('file');
  const kindEntry = form.get('kind');
  const fileBlob = file && typeof (file as Blob).arrayBuffer === 'function' ? (file as Blob) : null;
  let kind = typeof kindEntry === 'string' && kindEntry ? kindEntry : null;

  if (!fileBlob) {
    return jsonError({ code: 'invalid_request', message: 'File is required' }, 400);
  }

  if (!kind) {
    if (fileBlob.type.startsWith('audio/')) kind = 'audio';
    if (fileBlob.type.startsWith('image/')) kind = 'image';
  }

  if (kind !== 'image' && kind !== 'audio') {
    return jsonError({ code: 'invalid_request', message: 'Invalid media kind' }, 400);
  }

  const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (fileBlob.size > maxBytes) {
    return jsonError({ code: 'file_too_large', message: 'File exceeds size limit' }, 400);
  }

  const buffer = await fileBlob.arrayBuffer();
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
