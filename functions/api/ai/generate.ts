import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { aiGenerateSchema } from '../../../shared/validators';
import { generateText } from '../../openai';
import { getRequestId, logInfo } from '../../_lib/log';

const LOG_LIMIT = 4000;

const truncate = (value: string) => {
  if (value.length <= LOG_LIMIT) return { text: value, truncated: false };
  return { text: value.slice(0, LOG_LIMIT), truncated: true };
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = await parseJson(request);
  const parsed = aiGenerateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid prompt', details: parsed.error.flatten() }, 400);
  }

  try {
    const requestId = getRequestId(request);
    const model = parsed.data.model ?? env.AI_DEFAULT_MODEL ?? 'gpt-5-mini';
    const promptLog = truncate(parsed.data.prompt);
    logInfo(env, 'ai_generate_request', {
      requestId,
      model,
      prompt: promptLog.text,
      prompt_length: parsed.data.prompt.length,
      prompt_truncated: promptLog.truncated
    });
    const result = await generateText(env, parsed.data);
    const outputLog = truncate(result.text);
    logInfo(env, 'ai_generate_response', {
      requestId,
      model,
      output: outputLog.text,
      output_length: result.text.length,
      output_truncated: outputLog.truncated
    });
    return jsonOk({ text: result.text });
  } catch (error) {
    return jsonError({
      code: 'openai_error',
      message: error instanceof Error ? error.message : 'OpenAI request failed'
    }, 500);
  }
};
