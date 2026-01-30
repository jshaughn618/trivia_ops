import bcrypt from 'bcryptjs';
import type { Env } from './types';
import { execute, nowIso, queryFirst } from './db';

const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer) {
  const str = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64Url(signature);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((part) => {
    const [name, ...rest] = part.trim().split('=');
    cookies[name] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

export async function signSession(sessionId: string, secret: string) {
  const signature = await hmacSha256(secret, sessionId);
  return `${sessionId}.${signature}`;
}

export async function verifySessionCookie(cookieValue: string, secret: string) {
  const [sessionId, signature] = cookieValue.split('.');
  if (!sessionId || !signature) return null;
  const expected = await hmacSha256(secret, sessionId);
  if (expected !== signature) return null;
  return sessionId;
}

export function buildSessionCookie(value: string, expiresAt: string) {
  const expires = new Date(expiresAt).toUTCString();
  return `triviaops_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Secure; Expires=${expires}`;
}

export function clearSessionCookie() {
  return 'triviaops_session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0';
}

export async function createSession(env: Env, userId: string, req: Request) {
  const sessionId = crypto.randomUUID();
  const createdAt = nowIso();
  const ttlHours = Number(env.SESSION_TTL_HOURS || '24');
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const userAgent = req.headers.get('user-agent');
  const ip = req.headers.get('cf-connecting-ip');

  await execute(
    env,
    `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at, user_agent, ip)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`
     ,
    [sessionId, userId, createdAt, expiresAt, userAgent, ip]
  );

  const signed = await signSession(sessionId, env.SESSION_SECRET);
  return { sessionId, signed, expiresAt };
}

export async function getSession(env: Env, sessionId: string) {
  const session = await queryFirst<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
    env,
    `SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE id = ?`,
    [sessionId]
  );
  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  return session;
}
