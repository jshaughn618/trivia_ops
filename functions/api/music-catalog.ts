import { requireAdmin } from '../access';
import { queryAll } from '../db';
import { buildMusicCatalog, musicCatalogSql, type MusicCatalogRow } from '../_lib/music-catalog';
import type { AppHandler } from '../types';

export const onRequestGet: AppHandler = async ({ env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const rows = await queryAll<MusicCatalogRow>(env, musicCatalogSql);
  const catalog = buildMusicCatalog(rows);
  return new Response(JSON.stringify(catalog, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="triviaops-music-catalog-${catalog.exported_at.slice(0, 10)}.json"`,
      'Cache-Control': 'no-store'
    }
  });
};
