import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { imageAnswerSchema } from '../../../shared/validators';
import { requireAdmin } from '../../access';
import { generateImageAnswer } from '../../openai';
import { MAX_IMAGE_BYTES, sniffMedia } from '../../media';

function toBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  if (!data.user) {
    return jsonError({ code: 'unauthorized', message: 'Authentication required' }, 401);
  }
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const payload = await parseJson(request);
  const parsed = imageAnswerSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid request', details: parsed.error.flatten() }, 400);
  }

  const key = parsed.data.media_key;
  const object = await env.BUCKET.get(key);
  if (!object) {
    return jsonError({ code: 'not_found', message: 'Media not found' }, 404);
  }

  const buffer = await object.arrayBuffer();
  const size = buffer.byteLength;
  if (size > MAX_IMAGE_BYTES) {
    return jsonError({ code: 'file_too_large', message: 'Image exceeds size limit' }, 400);
  }

  const sniff = sniffMedia(new Uint8Array(buffer));
  if (!sniff || sniff.kind !== 'image') {
    return jsonError({ code: 'invalid_media', message: 'Only images are supported' }, 400);
  }

  const base64 = toBase64(new Uint8Array(buffer));
  const dataUrl = `data:${sniff.contentType};base64,${base64}`;
  const prompt =
    parsed.data.prompt ??
    'Identify the subject of this image for a trivia answer. Return a concise answer only.';

  try {
    const result = await generateImageAnswer(env, {
      imageDataUrl: dataUrl,
      prompt
    });
    return jsonOk({ answer: result.text.trim() });
  } catch (error) {
    return jsonError(
      { code: 'openai_error', message: error instanceof Error ? error.message : 'OpenAI request failed' },
      500
    );
  }
};
