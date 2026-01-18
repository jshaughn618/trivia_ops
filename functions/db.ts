import type { Env } from './types';

export const nowIso = () => new Date().toISOString();

export async function queryAll<T>(env: Env, sql: string, params: unknown[] = []) {
  const stmt = env.DB.prepare(sql).bind(...params);
  const result = await stmt.all<T>();
  return result.results ?? [];
}

export async function queryFirst<T>(env: Env, sql: string, params: unknown[] = []) {
  const results = await queryAll<T>(env, sql, params);
  return results[0] ?? null;
}

export async function execute(env: Env, sql: string, params: unknown[] = []) {
  const stmt = env.DB.prepare(sql).bind(...params);
  return stmt.run();
}
