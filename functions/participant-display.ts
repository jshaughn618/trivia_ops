import type { Env } from './types';
import { normalizeCode } from './public';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const DEFAULT_DISPLAY_LINK_TTL_MINUTES = 480;

type ParticipantDisplayTokenPayload = {
  v: 1;
  c: string;
  exp: number;
  iat: number;
};

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function getSigningSecret(env: Env) {
  const base = (env.PARTICIPANT_DISPLAY_SECRET || env.SESSION_SECRET || '').trim();
  return `${base}:participant_display:v1`;
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeString(value: string) {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlDecodeString(value: string) {
  const padded = value + '='.repeat((4 - (value.length % 4 || 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return decoder.decode(bytes);
}

async function signValue(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function secureEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function createParticipantDisplayToken(env: Env, rawCode: string) {
  const now = Date.now();
  const ttlMinutes = parseEnvInt(env.PARTICIPANT_DISPLAY_LINK_TTL_MINUTES, DEFAULT_DISPLAY_LINK_TTL_MINUTES);
  const payload: ParticipantDisplayTokenPayload = {
    v: 1,
    c: normalizeCode(rawCode),
    iat: now,
    exp: now + ttlMinutes * 60 * 1000
  };
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signature = await signValue(getSigningSecret(env), encodedPayload);
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp).toISOString()
  };
}

export async function verifyParticipantDisplayToken(env: Env, token: string, rawCode: string) {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return { ok: false as const, reason: 'token_malformed' };

  const expectedSignature = await signValue(getSigningSecret(env), encodedPayload);
  if (!secureEqual(signature, expectedSignature)) return { ok: false as const, reason: 'token_invalid' };

  let payload: ParticipantDisplayTokenPayload;
  try {
    const parsed = JSON.parse(base64UrlDecodeString(encodedPayload));
    payload = parsed as ParticipantDisplayTokenPayload;
  } catch {
    return { ok: false as const, reason: 'token_malformed' };
  }

  if (payload.v !== 1) return { ok: false as const, reason: 'token_invalid' };
  if (typeof payload.c !== 'string' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
    return { ok: false as const, reason: 'token_malformed' };
  }
  if (payload.exp <= Date.now()) return { ok: false as const, reason: 'token_expired' };
  if (normalizeCode(payload.c) !== normalizeCode(rawCode)) return { ok: false as const, reason: 'token_scope_mismatch' };

  return { ok: true as const, expiresAt: payload.exp };
}
