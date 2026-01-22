import type { Env } from './types';

const DEFAULT_MODEL = 'gpt-4.1-mini';

export async function generateText(env: Env, input: { prompt: string; model?: string; max_output_tokens?: number }) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const body = {
    model: input.model ?? DEFAULT_MODEL,
    input: input.prompt,
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

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? 'OpenAI request failed';
    throw new Error(message);
  }

  const text = typeof data.output_text === 'string' ? data.output_text : extractText(data);
  return { text, raw: data };
}

export async function generateImageAnswer(
  env: Env,
  input: { imageDataUrl: string; prompt: string; model?: string; max_output_tokens?: number }
) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const body = {
    model: input.model ?? DEFAULT_MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: input.prompt },
          { type: 'input_image', image_url: input.imageDataUrl, detail: 'low' }
        ]
      }
    ],
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

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? 'OpenAI request failed';
    throw new Error(message);
  }

  const text = typeof data.output_text === 'string' ? data.output_text : extractText(data);
  return { text, raw: data };
}

function extractText(data: any) {
  const output = Array.isArray(data?.output) ? data.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join('\n').trim();
}
