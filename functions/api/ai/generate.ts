import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { aiGenerateSchema } from '../../../shared/validators';
import { generateText } from '../../openai';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = await parseJson(request);
  const parsed = aiGenerateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid prompt', details: parsed.error.flatten() }, 400);
  }

  try {
    const result = await generateText(env, parsed.data);
    return jsonOk({ text: result.text });
  } catch (error) {
    return jsonError({
      code: 'openai_error',
      message: error instanceof Error ? error.message : 'OpenAI request failed'
    }, 500);
  }
};
