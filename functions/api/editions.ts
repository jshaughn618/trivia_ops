import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { editionCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll } from '../db';
import { logError } from '../_lib/log';
import { requireAdmin } from '../access';

export const onRequestGet: PagesFunction<Env> = async ({ env, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const url = new URL(request.url);
  const params: unknown[] = [];
  const where: string[] = ['COALESCE(deleted, 0) = 0'];

  const gameId = url.searchParams.get('game_id');
  const status = url.searchParams.get('status');
  const tag = url.searchParams.get('tag');
  const locationId = url.searchParams.get('location_id');
  const search = url.searchParams.get('search');

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
  if (locationId) {
    where.push(`NOT EXISTS (
      SELECT 1
      FROM event_rounds er
      JOIN events e ON e.id = er.event_id
      WHERE er.edition_id = editions.id
        AND e.location_id = ?
        AND COALESCE(er.deleted, 0) = 0
        AND COALESCE(e.deleted, 0) = 0
    )`);
    params.push(locationId);
  }
  const baseWhere = [...where];
  const baseParams = [...params];

  if (search) {
    where.push(`(
      editions.title LIKE ?
      OR editions.theme LIKE ?
      OR editions.description LIKE ?
      OR editions.tags_csv LIKE ?
      OR games.name LIKE ?
    )`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }

  const baseSql = `SELECT editions.* FROM editions`;
  const joinSql = search ? 'JOIN games ON games.id = editions.game_id' : '';
  const sql = `${baseSql} ${joinSql} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY editions.updated_at DESC`;
  try {
    const rows = await queryAll(env, sql, params);
    return jsonOk(rows);
  } catch (error) {
    logError(env, 'editions_query_failed', {
      message: error instanceof Error ? error.message : 'unknown_error'
    });
    const fallbackSql = `SELECT editions.* FROM editions ${baseWhere.length ? `WHERE ${baseWhere.join(' AND ')}` : ''} ORDER BY editions.updated_at DESC`;
    const rows = await queryAll(env, fallbackSql, baseParams);
    return jsonOk(rows);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
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
