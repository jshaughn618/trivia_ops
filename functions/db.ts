import type { Env } from './types';
import { logInfo } from './_lib/log';

export const nowIso = () => new Date().toISOString();

function summarizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export async function queryAll<T>(env: Env, sql: string, params: unknown[] = []) {
  const requestId = (env as { __requestId?: string }).__requestId ?? null;
  logInfo(env, 'd1_query_start', { requestId, sql: summarizeSql(sql) });
  const start = performance.now();
  const stmt = env.DB.prepare(sql).bind(...params);
  const result = await stmt.all<T>();
  const durationMs = Math.round(performance.now() - start);
  logInfo(env, 'd1_query_end', {
    requestId,
    sql: summarizeSql(sql),
    durationMs,
    rows: result.results?.length ?? 0
  });
  return result.results ?? [];
}

export async function queryFirst<T>(env: Env, sql: string, params: unknown[] = []) {
  const results = await queryAll<T>(env, sql, params);
  return results[0] ?? null;
}

export async function execute(env: Env, sql: string, params: unknown[] = []) {
  const requestId = (env as { __requestId?: string }).__requestId ?? null;
  logInfo(env, 'd1_exec_start', { requestId, sql: summarizeSql(sql) });
  const start = performance.now();
  const stmt = env.DB.prepare(sql).bind(...params);
  const result = await stmt.run();
  const durationMs = Math.round(performance.now() - start);
  logInfo(env, 'd1_exec_end', {
    requestId,
    sql: summarizeSql(sql),
    durationMs,
    changes: result.meta?.changes ?? null
  });
  return result;
}
