type LogPayload = Record<string, unknown>;

function shouldLog(env: { DEBUG?: string } | undefined, level: 'info' | 'warn' | 'error') {
  if (level === 'error') return true;
  if (level === 'warn') return true;
  return env?.DEBUG === 'true';
}

function safeSerialize(payload: LogPayload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({ message: 'unserializable_payload' });
  }
}

export function logInfo(env: { DEBUG?: string } | undefined, event: string, payload: LogPayload) {
  if (!shouldLog(env, 'info')) return;
  console.log(safeSerialize({ level: 'info', event, ...payload }));
}

export function logWarn(env: { DEBUG?: string } | undefined, event: string, payload: LogPayload) {
  if (!shouldLog(env, 'warn')) return;
  console.warn(safeSerialize({ level: 'warn', event, ...payload }));
}

export function logError(env: { DEBUG?: string } | undefined, event: string, payload: LogPayload) {
  if (!shouldLog(env, 'error')) return;
  console.error(safeSerialize({ level: 'error', event, ...payload }));
}

export function getRequestId(request: Request) {
  const headerId = request.headers.get('x-request-id');
  if (headerId) return headerId;
  try {
    const url = new URL(request.url);
    const queryId = url.searchParams.get('request_id');
    if (queryId && /^[a-zA-Z0-9._-]{8,80}$/.test(queryId)) {
      return queryId;
    }
  } catch {
    // Ignore malformed URLs and fall back to a random id.
  }
  return crypto.randomUUID();
}
