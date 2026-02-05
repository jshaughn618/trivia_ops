import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { editionCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryAll } from '../db';
import { logError } from '../_lib/log';
import { requireAdmin } from '../access';

const isEditionNumberConflict = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('UNIQUE constraint failed: editions.game_id, editions.edition_number');
};

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
  const payloadData = parsed.data;
  const title = payloadData.title ?? payloadData.theme ?? 'Untitled Edition';

  try {
    await execute(
      env,
      `INSERT INTO editions (id, game_id, edition_number, title, description, status, tags_csv, theme, timer_seconds, speed_round_audio_key, speed_round_audio_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ,
      [
        id,
        payloadData.game_id,
        payloadData.edition_number ?? null,
        title,
        payloadData.description ?? null,
        payloadData.status,
        payloadData.tags_csv ?? null,
        payloadData.theme ?? null,
        payloadData.timer_seconds ?? 15,
        payloadData.speed_round_audio_key ?? null,
        payloadData.speed_round_audio_name ?? null,
        createdAt,
        createdAt
      ]
    );
  } catch (error) {
    if (isEditionNumberConflict(error)) {
      return jsonError({ code: 'conflict', message: 'Edition number already exists for this game.' }, 409);
    }
    throw error;
  }

  const rows = await queryAll(env, 'SELECT * FROM editions WHERE id = ? AND COALESCE(deleted, 0) = 0', [id]);
  return jsonOk(rows[0]);
};
