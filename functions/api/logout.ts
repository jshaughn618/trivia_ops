import type { Env } from '../types';
import { jsonOk } from '../responses';
import { parseCookies, verifySessionCookie, clearSessionCookie, clearCsrfCookie } from '../auth';
import { execute, nowIso } from '../db';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const cookies = parseCookies(request.headers.get('cookie'));
  const raw = cookies['triviaops_session'];
  if (raw) {
    const sessionId = await verifySessionCookie(raw, env.SESSION_SECRET);
    if (sessionId) {
      await execute(env, 'UPDATE sessions SET revoked_at = ? WHERE id = ?', [nowIso(), sessionId]);
    }
  }

  const headers = new Headers();
  headers.append('Set-Cookie', clearSessionCookie());
  headers.append('Set-Cookie', clearCsrfCookie());
  return jsonOk({ ok: true }, { headers });
};
