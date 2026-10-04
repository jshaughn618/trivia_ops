import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMusicCatalog, type MusicCatalogRow } from '../functions/_lib/music-catalog';
import { onRequestGet } from '../functions/api/music-catalog';

const row: MusicCatalogRow = {
  game_id: 'g1', game_code: 'ATM', game_name: 'At the Movies', edition_id: 'e1',
  edition_number: 5, edition_title: 'ATM005', theme: 'Fictional Bands',
  item_id: 'i1', ordinal: 3, prompt: 'Track 3', answer: 'That Thing You Do! — The Oneders',
  fun_fact: 'That Thing You Do!', media_caption: null,
  answer_parts_json: JSON.stringify([
    { label: 'Song', answer: 'That Thing You Do!', points: 0 },
    { label: 'Artist', answer: 'The Oneders', points: 2 },
    { label: 'Movie', answer: 'That Thing You Do!', points: 1 }
  ]), answer_a: null, answer_b: null, answer_a_label: null, answer_b_label: null
};

test('preserves hierarchy, empty games/editions, track gaps, and all answer parts', () => {
  const catalog = buildMusicCatalog([
    row, { ...row, item_id: 'i2', ordinal: 5 },
    { ...row, edition_id: 'e2', edition_number: 6, item_id: null },
    { ...row, game_id: 'g2', game_code: null, edition_id: null, item_id: null }
  ], '2026-10-04T00:00:00Z');
  assert.equal(catalog.games.length, 2);
  assert.equal(catalog.games[0].editions[0].code, 'ATM005');
  assert.deepEqual(catalog.games[0].editions[0].songs.map(s => s.track), [3, 5]);
  assert.deepEqual(catalog.games[0].editions[0].songs[0].answer_parts, JSON.parse(row.answer_parts_json!));
  assert.deepEqual(catalog.games[0].editions[1].songs, []);
  assert.deepEqual(catalog.games[1].editions, []);
  assert.doesNotMatch(JSON.stringify(catalog), /media_key|audio|status|created_by/);
});

test('falls back to legacy answers without guessing missing points or losing raw answers', () => {
  const song = buildMusicCatalog([{ ...row, answer_parts_json: '{invalid',
    answer_a: 'Spinal Tap', answer_a_label: 'Band', answer_b: 'Big Bottom' }]).games[0].editions[0].songs[0];
  assert.deepEqual(song.answer_parts, [
    { label: 'Band', answer: 'Spinal Tap', points: null },
    { label: 'Song', answer: 'Big Bottom', points: null }
  ]);
  assert.equal(song.answer, row.answer);
});

test('export denies non-admins before querying and downloads plain JSON for admins', async () => {
  const denied = await onRequestGet({ data: { user: { id: 'u', user_type: 'host' } } } as any);
  assert.equal(denied.status, 403);
  const env = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [row] }) }) }) } };
  const response = await onRequestGet({ env, data: { user: { id: 'u', user_type: 'admin' } } } as any);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition')!, /^attachment; filename="triviaops-music-catalog-.*\.json"$/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json() as any).games[0].editions[0].songs.length, 1);
});
