import type { Env } from './types';

const DEFAULT_MODEL = 'gpt-5-mini';

export async function generateText(env: Env, input: { prompt: string; model?: string; max_output_tokens?: number }) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const model = input.model ?? env.AI_DEFAULT_MODEL ?? DEFAULT_MODEL;
  const body = {
    model,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: input.prompt }]
      }
    ],
    reasoning: { effort: 'low' },
    max_output_tokens: input.max_output_tokens ?? 300
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    const message = data?.error?.message ?? 'OpenAI request failed';
    throw new Error(message);
  }

  const outputText = typeof data.output_text === 'string' ? data.output_text : '';
  const text = outputText.trim().length > 0 ? outputText : extractText(data);
  if (!text) {
    logEmptyResponse(env, data);
    const refusal = extractRefusal(data);
    if (refusal) {
      throw new Error(refusal);
    }
    throw new Error('OpenAI response contained no text output');
  }
  return { text, raw: data };
}

export async function generateImageAnswer(
  env: Env,
  input: { imageDataUrl: string; prompt: string; model?: string; max_output_tokens?: number }
) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const model = input.model ?? env.AI_DEFAULT_MODEL ?? DEFAULT_MODEL;
  const body = {
    model,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: input.prompt },
          { type: 'input_image', image_url: input.imageDataUrl, detail: 'low' }
        ]
      }
    ],
    text: { format: { type: 'text' } },
    reasoning: { effort: 'low' },
    max_output_tokens: input.max_output_tokens ?? 120
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    const message = data?.error?.message ?? 'OpenAI request failed';
    throw new Error(message);
  }

  const outputText = typeof data.output_text === 'string' ? data.output_text : '';
  const text = outputText.trim().length > 0 ? outputText : extractText(data);
  if (!text) {
    logEmptyResponse(env, data);
    const refusal = extractRefusal(data);
    if (refusal) {
      throw new Error(refusal);
    }
    throw new Error('OpenAI response contained no text output');
  }
  return { text, raw: data };
}

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; output_text?: string; refusal?: string; type?: string }>;
    output_text?: string;
    text?: string;
  }>;
  error?: { message?: string };
};


function extractText(data: OpenAIResponse) {
  const output = Array.isArray(data?.output) ? data.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (typeof item?.output_text === 'string') {
      chunks.push(item.output_text);
    }
    if (typeof (item as { summary?: unknown })?.summary === 'string') {
      chunks.push((item as { summary: string }).summary);
    }
    if (typeof item?.text === 'string') {
      chunks.push(item.text);
    }
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') {
        chunks.push(part.text);
      } else if (typeof part?.output_text === 'string') {
        chunks.push(part.output_text);
      }
    }
  }

  return chunks.join('\n').trim();
}

function extractRefusal(data: OpenAIResponse) {
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.refusal === 'string' && part.refusal.trim()) {
        return part.refusal;
      }
    }
  }
  return null;
}

function logEmptyResponse(env: Env, data: OpenAIResponse) {
  if (env.DEBUG !== 'true') return;
  const output = Array.isArray(data?.output) ? data.output : [];
  const contentTypes = output.flatMap((item) =>
    Array.isArray(item?.content) ? item.content.map((part) => part?.type ?? 'unknown') : []
  );
  const info = {
    has_output_text: typeof data.output_text === 'string',
    output_text_length: typeof data.output_text === 'string' ? data.output_text.length : 0,
    output_items: output.length,
    output_item_keys: output.map((item) => Object.keys(item ?? {})),
    output_content_types: contentTypes,
    output_content_count: contentTypes.length
  };
  console.warn(JSON.stringify({ level: 'warn', event: 'openai_empty_response', ...info }));
}
