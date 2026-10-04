import type { MusicCatalog } from '../../shared/types';

export type MusicCatalogRow = {
  game_id: string;
  game_code: string | null;
  game_name: string;
  edition_id: string | null;
  edition_number: number | null;
  edition_title: string | null;
  theme: string | null;
  item_id: string | null;
  ordinal: number | null;
  prompt: string | null;
  answer: string | null;
  fun_fact: string | null;
  media_caption: string | null;
  answer_parts_json: string | null;
  answer_a: string | null;
  answer_b: string | null;
  answer_a_label: string | null;
  answer_b_label: string | null;
};

export const musicCatalogSql = `
  SELECT g.id AS game_id, g.game_code, g.name AS game_name,
         ed.id AS edition_id, ed.edition_number, ed.title AS edition_title, ed.theme,
         ei.id AS item_id, ei.ordinal, ei.prompt, ei.answer, ei.fun_fact, ei.media_caption, ei.answer_parts_json,
         ei.answer_a, ei.answer_b, ei.answer_a_label, ei.answer_b_label
  FROM games g
  JOIN game_types gt ON gt.id = g.game_type_id AND gt.code = 'music'
  LEFT JOIN editions ed ON ed.game_id = g.id AND COALESCE(ed.deleted, 0) = 0
  LEFT JOIN edition_items ei ON ei.edition_id = ed.id AND COALESCE(ei.deleted, 0) = 0
  WHERE COALESCE(g.deleted, 0) = 0
  ORDER BY g.game_code COLLATE NOCASE, g.name COLLATE NOCASE, g.id,
           ed.edition_number, ed.title, ed.id, ei.ordinal, ei.id
`;

function answerParts(row: MusicCatalogRow) {
  const parts: MusicCatalog['games'][number]['editions'][number]['songs'][number]['answer_parts'] = [];
  try {
    const parsed: unknown = JSON.parse(row.answer_parts_json || 'null');
    if (Array.isArray(parsed)) {
      for (const part of parsed) {
        if (!part || typeof part.label !== 'string' || typeof part.answer !== 'string') continue;
        parts.push({
          label: part.label,
          answer: part.answer,
          points: typeof part.points === 'number' && Number.isFinite(part.points) ? part.points : null
        });
      }
    }
  } catch {
    // Older items may only have the legacy answer columns.
  }
  if (parts.length) return parts;
  if (row.answer_a || row.answer_a_label) {
    parts.push({ label: row.answer_a_label || 'Artist', answer: row.answer_a || '', points: null });
  }
  if (row.answer_b || row.answer_b_label) {
    parts.push({ label: row.answer_b_label || 'Song', answer: row.answer_b || '', points: null });
  }
  return parts;
}

export function buildMusicCatalog(rows: MusicCatalogRow[], exportedAt = new Date().toISOString()): MusicCatalog {
  const catalog: MusicCatalog = { schema_version: 1, exported_at: exportedAt, games: [] };
  const games = new Map<string, MusicCatalog['games'][number]>();
  const editions = new Map<string, MusicCatalog['games'][number]['editions'][number]>();
  for (const row of rows) {
    let game = games.get(row.game_id);
    if (!game) {
      game = { id: row.game_id, code: row.game_code, name: row.game_name, editions: [] };
      games.set(game.id, game);
      catalog.games.push(game);
    }
    if (!row.edition_id) continue;
    let edition = editions.get(row.edition_id);
    if (!edition) {
      edition = {
        id: row.edition_id,
        code: row.game_code && row.edition_number != null
          ? `${row.game_code}${String(row.edition_number).padStart(3, '0')}` : null,
        number: row.edition_number,
        title: row.edition_title || '',
        theme: row.theme,
        songs: []
      };
      editions.set(edition.id, edition);
      game.editions.push(edition);
    }
    if (!row.item_id) continue;
    edition.songs.push({
      id: row.item_id,
      track: row.ordinal ?? 0,
      prompt: row.prompt || '',
      answer: row.answer || '',
      fun_fact: row.fun_fact,
      caption: row.media_caption,
      answer_parts: answerParts(row)
    });
  }
  return catalog;
}
