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
  return request.headers.get('x-request-id') ?? crypto.randomUUID();
}
