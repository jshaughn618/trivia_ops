import type { Env } from '../../../../types';
import { jsonError } from '../../../../responses';
import { checkRateLimit } from '../../../../rate-limit';
import { getPublicEventPayload } from '../../../../public-event';

const STREAM_POLL_MS = 2000;
const PUBLIC_EVENT_RATE_LIMIT = {
  maxAttempts: 30,
  windowSeconds: 5 * 60,
  blockSeconds: 10 * 60
};

const encoder = new TextEncoder();

function formatEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function formatComment(value: string) {
  return `: ${value}\n\n`;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const limitKey = `public-event-stream:${ip}`;
  const status = await checkRateLimit(env, limitKey, PUBLIC_EVENT_RATE_LIMIT);
  if (!status.allowed) {
    return jsonError(
      { code: 'rate_limited', message: 'Too many attempts. Please try again later.', details: { retry_after: status.retryAfterSeconds } },
      429
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
