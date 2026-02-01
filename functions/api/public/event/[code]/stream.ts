import type { Env } from '../../../../types';
import { jsonError } from '../../../../responses';
import { checkRateLimit } from '../../../../rate-limit';
import { getPublicEventPayload } from '../../../../public-event';

const STREAM_POLL_MS = 2000;
const DEFAULT_PUBLIC_STREAM_RATE_LIMIT = {
  maxAttempts: 300,
  windowSeconds: 5 * 60,
  blockSeconds: 10 * 60
};

function getPublicStreamRateLimit(env: Env) {
  return {
    maxAttempts: parseEnvInt(env.PUBLIC_STREAM_RATE_MAX, DEFAULT_PUBLIC_STREAM_RATE_LIMIT.maxAttempts),
    windowSeconds: parseEnvInt(env.PUBLIC_STREAM_RATE_WINDOW_SECONDS, DEFAULT_PUBLIC_STREAM_RATE_LIMIT.windowSeconds),
    blockSeconds: parseEnvInt(env.PUBLIC_STREAM_RATE_BLOCK_SECONDS, DEFAULT_PUBLIC_STREAM_RATE_LIMIT.blockSeconds)
  };
}

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const encoder = new TextEncoder();

function formatEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function formatComment(value: string) {
  return `: ${value}\n\n`;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const code = String(params.code ?? 'unknown').toUpperCase();
  const limitKey = `public-event-stream:${ip}:${code}`;
  const status = await checkRateLimit(env, limitKey, getPublicStreamRateLimit(env));
  if (!status.allowed) {
    const headers = status.retryAfterSeconds ? { 'Retry-After': String(status.retryAfterSeconds) } : undefined;
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429,
      { headers }
    );
  }

  const url = new URL(request.url);
  const viewParam = url.searchParams.get('view') as 'play' | 'leaderboard' | null;

  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastPayload = '';

      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatEvent(event, data)));
      };

      const sendComment = (value: string) => {
        controller.enqueue(encoder.encode(formatComment(value)));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      const tick = async () => {
        if (closed) return;
        try {
          const result = await getPublicEventPayload(env, params.code as string, viewParam ?? undefined);
          if (!result.ok) {
            send('error', { message: result.error.message, code: result.error.code, status: result.status });
            close();
            return;
          }
          const payload = JSON.stringify(result.data);
          if (payload !== lastPayload) {
            lastPayload = payload;
            send('update', result.data);
          } else {
            sendComment('ping');
          }
        } catch (error) {
          send('error', { message: error instanceof Error ? error.message : 'Stream error' });
          close();
        }
      };

      sendComment('connected');
      tick();
      const timer = setInterval(tick, STREAM_POLL_MS);

      request.signal.addEventListener('abort', () => {
        clearInterval(timer);
        close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
};
