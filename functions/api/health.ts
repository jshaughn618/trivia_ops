import type { Env } from '../types';
import { jsonOk, jsonError } from '../responses';
import { queryFirst } from '../db';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const errors: string[] = [];

  if (!env.SESSION_SECRET) errors.push('SESSION_SECRET');
  if (!env.DB) errors.push('DB');
  if (!env.BUCKET) errors.push('BUCKET');

  let dbOk = false;
  try {
    const row = await queryFirst<{ ok: number }>(env, 'SELECT 1 AS ok');
    dbOk = Boolean(row?.ok);
  } catch {
    dbOk = false;
  }

  let r2Ok = false;
  try {
    const list = await env.BUCKET.list({ limit: 1 });
    r2Ok = Boolean(list);
  } catch {
    r2Ok = false;
  }

  const ok = errors.length === 0 && dbOk && r2Ok;
  if (!ok) {
    return jsonError(
      {
        code: 'health_check_failed',
        message: 'Health check failed',
        details: {
          missing: errors,
          db: dbOk,
          r2: r2Ok
        }
      },
      500
    );
  }

  return jsonOk({ ok: true, db: dbOk, r2: r2Ok });
};
