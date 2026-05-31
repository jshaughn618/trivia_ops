import type { Env } from '../types';
import type { ItemSearchResult } from '../../shared/types';
import { requireAdmin } from '../access';
import { queryAll } from '../db';
import { jsonOk } from '../responses';

type RankedItemSearchResult = ItemSearchResult & { match_rank: number };

const MAX_TERMS = 8;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function getSearchTerms(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}

function getLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? url.searchParams.get('query') ?? '').trim().replace(/\s+/g, ' ');
  const terms = getSearchTerms(query);
  const limit = getLimit(url.searchParams.get('limit'));

  if (terms.length === 0) {
    return jsonOk({ query, results: [] });
  }

  const searchTextSql = `LOWER(
    COALESCE(ei.prompt, '') || ' ' ||
    COALESCE(ei.answer, '') || ' ' ||
    COALESCE(ei.answer_a, '') || ' ' ||
    COALESCE(ei.answer_b, '') || ' ' ||
    COALESCE(ei.answer_a_label, '') || ' ' ||
    COALESCE(ei.answer_b_label, '') || ' ' ||
    COALESCE(ei.answer_parts_json, '') || ' ' ||
    COALESCE(ei.fun_fact, '') || ' ' ||
    COALESCE(ei.media_caption, '') || ' ' ||
    COALESCE(ed.title, '') || ' ' ||
    COALESCE(ed.theme, '') || ' ' ||
    COALESCE(ed.tags_csv, '') || ' ' ||
    COALESCE(g.name, '') || ' ' ||
    COALESCE(g.game_code, '')
  )`;

  const exactQuery = query.toLowerCase();
  const phraseLike = `%${escapeLike(exactQuery)}%`;
  const where = [
    'COALESCE(ei.deleted, 0) = 0',
    'COALESCE(ed.deleted, 0) = 0',
    'COALESCE(g.deleted, 0) = 0',
    ...terms.map(() => `${searchTextSql} LIKE ? ESCAPE '\\'`)
  ];

  const params: unknown[] = [
    exactQuery,
    exactQuery,
    exactQuery,
    phraseLike,
    phraseLike,
    phraseLike,
    phraseLike,
    phraseLike,
    phraseLike,
    phraseLike,
    phraseLike,
    ...terms.map((term) => `%${escapeLike(term)}%`),
    limit
  ];

  const rows = await queryAll<RankedItemSearchResult>(
    env,
    `SELECT
       ei.id AS item_id,
       ei.edition_id,
       ed.game_id,
       g.name AS game_name,
       g.game_code,
       gt.code AS game_type_code,
       ed.title AS edition_title,
       ed.edition_number,
       ed.theme AS edition_theme,
       ed.status AS edition_status,
       ei.ordinal AS item_ordinal,
       COALESCE(ei.question_type, 'text') AS question_type,
       ei.prompt,
       COALESCE(ei.answer, '') AS answer,
       ei.answer_a,
       ei.answer_b,
       ei.answer_a_label,
       ei.answer_b_label,
       ei.answer_parts_json,
       ei.fun_fact,
       ei.media_type,
       ei.media_caption,
       COALESCE(usage.round_usage_count, 0) AS round_usage_count,
       COALESCE(usage.event_usage_count, 0) AS event_usage_count,
       usage.last_used_at,
       CASE
         WHEN LOWER(COALESCE(ei.answer, '')) = ?
           OR LOWER(COALESCE(ei.answer_a, '')) = ?
           OR LOWER(COALESCE(ei.answer_b, '')) = ?
           THEN 0
         WHEN LOWER(COALESCE(ei.answer, '')) LIKE ? ESCAPE '\\'
           OR LOWER(COALESCE(ei.answer_a, '')) LIKE ? ESCAPE '\\'
           OR LOWER(COALESCE(ei.answer_b, '')) LIKE ? ESCAPE '\\'
           OR LOWER(COALESCE(ei.answer_parts_json, '')) LIKE ? ESCAPE '\\'
           THEN 1
         WHEN LOWER(COALESCE(ei.prompt, '')) LIKE ? ESCAPE '\\'
           THEN 2
         WHEN LOWER(COALESCE(ed.title, '')) LIKE ? ESCAPE '\\'
           OR LOWER(COALESCE(ed.theme, '')) LIKE ? ESCAPE '\\'
           OR LOWER(COALESCE(g.name, '')) LIKE ? ESCAPE '\\'
           THEN 3
         ELSE 4
       END AS match_rank
     FROM edition_items ei
     JOIN editions ed ON ed.id = ei.edition_id
     JOIN games g ON g.id = ed.game_id
     LEFT JOIN game_types gt ON gt.id = g.game_type_id
     LEFT JOIN (
       SELECT
         er.edition_id,
         COUNT(DISTINCT er.id) AS round_usage_count,
         COUNT(DISTINCT ev.id) AS event_usage_count,
         MAX(ev.starts_at) AS last_used_at
       FROM event_rounds er
       JOIN events ev ON ev.id = er.event_id AND COALESCE(ev.deleted, 0) = 0
       WHERE COALESCE(er.deleted, 0) = 0
       GROUP BY er.edition_id
     ) usage ON usage.edition_id = ed.id
     WHERE ${where.join(' AND ')}
     ORDER BY match_rank ASC,
       CASE WHEN usage.last_used_at IS NULL THEN 1 ELSE 0 END ASC,
       usage.last_used_at DESC,
       ed.updated_at DESC,
       g.name ASC,
       ed.edition_number DESC,
       ei.ordinal ASC
     LIMIT ?`,
    params
  );

  return jsonOk({
    query,
    results: rows.map(({ match_rank, ...row }) => row)
  });
};
