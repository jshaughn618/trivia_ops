type LogPayload = Record<string, unknown>;

const DEBUG_ENABLED = import.meta.env.VITE_DEBUG === 'true';

const nowIso = () => new Date().toISOString();

function safeSerialize(payload: LogPayload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({ message: 'unserializable_payload' });
  }
}

function write(level: 'info' | 'warn' | 'error', event: string, payload: LogPayload) {
  if (!DEBUG_ENABLED && level === 'info') return;
  const entry = { level, event, ts: nowIso(), ...payload };
  const text = safeSerialize(entry);
  if (level === 'error') {
    console.error(text);
  } else if (level === 'warn') {
    console.warn(text);
  } else {
    console.log(text);
  }
}

export function logInfo(event: string, payload: LogPayload) {
  write('info', event, payload);
}

export function logWarn(event: string, payload: LogPayload) {
  write('warn', event, payload);
}

export function logError(event: string, payload: LogPayload) {
  write('error', event, payload);
}

export function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}
