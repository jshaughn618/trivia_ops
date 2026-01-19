import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { editionCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll } from '../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const params: unknown[] = [];
  const where: string[] = ['COALESCE(deleted, 0) = 0'];

  const gameId = url.searchParams.get('game_id');
  const status = url.searchParams.get('status');
  const tag = url.searchParams.get('tag');

  if (gameId) {
    where.push('game_id = ?');
    params.push(gameId);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (tag) {
    where.push('tags_csv LIKE ?');
    params.push(`%${tag}%`);
  }

  const sql = `SELECT * FROM editions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC`;
  const rows = await queryAll(env, sql, params);
  return jsonOk(rows);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = await parseJson(request);
  const parsed = editionCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid edition', details: parsed.error.flatten() }, 400);
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const data = parsed.data;
  const title = data.title ?? data.theme ?? 'Untitled Edition';

  await execute(
    env,
    `INSERT INTO editions (id, game_id, title, description, status, tags_csv, theme, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
    [
      id,
      data.game_id,
      title,
      data.description ?? null,
      data.status,
      data.tags_csv ?? null,
      data.theme ?? null,
      createdAt,
      createdAt
    ]
  );

  const rows = await queryAll(env, 'SELECT * FROM editions WHERE id = ? AND COALESCE(deleted, 0) = 0', [id]);
  return jsonOk(rows[0]);
};
