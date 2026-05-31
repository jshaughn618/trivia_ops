import type {
  MusicDashboardArtist,
  MusicDashboardData,
  MusicDashboardSong
} from '../../shared/types';
import { requireAdmin } from '../access';
import { queryAll } from '../db';
import { jsonOk } from '../responses';
import type { AppHandler } from '../types';

type MusicUsageRow = {
  event_id: string;
  event_title: string;
  starts_at: string;
  location_id: string | null;
  location_name: string | null;
  round_id: string;
  round_number: number;
  edition_id: string;
  game_id: string;
  game_name: string;
  game_subtype: string | null;
  item_id: string;
  item_ordinal: number;
  answer: string | null;
  answer_a: string | null;
  answer_b: string | null;
  answer_a_label: string | null;
  answer_b_label: string | null;
  answer_parts_json: string | null;
  media_caption: string | null;
};

type AnswerPart = {
  label: string;
  answer: string;
};

type ParsedSongUsage = {
  eventId: string;
  eventTitle: string;
  startsAt: string;
  locationName: string | null;
  roundId: string;
  song: string;
  artists: string[];
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanDisplay(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function getLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseAnswerParts(row: MusicUsageRow) {
  const parts: AnswerPart[] = [];
  if (row.answer_parts_json) {
    try {
      const parsed = JSON.parse(row.answer_parts_json);
      if (Array.isArray(parsed)) {
        parsed.forEach((part) => {
          if (!part || typeof part !== 'object') return;
          const candidate = part as { label?: unknown; answer?: unknown };
          const label = typeof candidate.label === 'string' ? cleanDisplay(candidate.label) : '';
          const answer = typeof candidate.answer === 'string' ? cleanDisplay(candidate.answer) : '';
          if (label || answer) parts.push({ label, answer });
        });
      }
    } catch {
      // Fall back to the legacy answer columns below.
    }
  }

  if (parts.length > 0) return parts;

  if (row.answer_a || row.answer_a_label) {
    parts.push({
      label: cleanDisplay(row.answer_a_label || 'Artist'),
      answer: cleanDisplay(row.answer_a || '')
    });
  }
  if (row.answer_b || row.answer_b_label) {
    parts.push({
      label: cleanDisplay(row.answer_b_label || 'Song'),
      answer: cleanDisplay(row.answer_b || '')
    });
  }
  if (parts.length === 0 && row.answer) {
    parts.push({ label: 'Answer', answer: cleanDisplay(row.answer) });
  }
  return parts.filter((part) => part.answer.length > 0);
}

function parseSongUsage(row: MusicUsageRow): ParsedSongUsage | null {
  const parts = parseAnswerParts(row);
  const songPart =
    parts.find((part) => /^(song|track|title)$/i.test(part.label)) ??
    parts.find((part) => /\b(song|track|title)\b/i.test(part.label));
  const artistParts = parts.filter((part) => /\b(artist|performer|band)\b/i.test(part.label));

  const song = cleanDisplay(songPart?.answer ?? '');
  const artists = Array.from(
    new Map(
      artistParts
        .map((part) => cleanDisplay(part.answer))
        .filter(Boolean)
        .map((artist) => [normalizeKey(artist), artist])
    ).values()
  );

  if (!song || artists.length === 0) return null;
  return {
    eventId: row.event_id,
    eventTitle: row.event_title,
    startsAt: row.starts_at,
    locationName: row.location_name,
    roundId: row.round_id,
    song,
    artists
  };
}

function matchesFilter(value: string, filter: string) {
  return normalizeKey(value).includes(normalizeKey(filter));
}

export const onRequestGet: AppHandler = async ({ env, request, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const url = new URL(request.url);
  const locationId = url.searchParams.get('location_id')?.trim() ?? '';
  const from = url.searchParams.get('from')?.trim() ?? '';
  const to = url.searchParams.get('to')?.trim() ?? '';
  const artist = url.searchParams.get('artist')?.trim() ?? '';
  const song = url.searchParams.get('song')?.trim() ?? '';
  const limit = getLimit(url.searchParams.get('limit'));

  const where = [
    'COALESCE(ev.deleted, 0) = 0',
    'COALESCE(er.deleted, 0) = 0',
    'COALESCE(ed.deleted, 0) = 0',
    'COALESCE(g.deleted, 0) = 0',
    'COALESCE(ei.deleted, 0) = 0',
    "gt.code = 'music'"
  ];
  const params: unknown[] = [];

  if (locationId) {
    where.push('ev.location_id = ?');
    params.push(locationId);
  }
  if (from) {
    where.push('ev.starts_at >= ?');
    params.push(`${from}T00:00:00.000Z`);
  }
  if (to) {
    where.push('ev.starts_at <= ?');
    params.push(`${to}T23:59:59.999Z`);
  }
  if (artist) {
    where.push(`LOWER(
      COALESCE(ei.answer_parts_json, '') || ' ' ||
      COALESCE(ei.answer_a, '') || ' ' ||
      COALESCE(ei.answer_b, '') || ' ' ||
      COALESCE(ei.answer, '')
    ) LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(artist.toLowerCase())}%`);
  }
  if (song) {
    where.push(`LOWER(
      COALESCE(ei.answer_parts_json, '') || ' ' ||
      COALESCE(ei.answer_a, '') || ' ' ||
      COALESCE(ei.answer_b, '') || ' ' ||
      COALESCE(ei.answer, '') || ' ' ||
      COALESCE(ei.media_caption, '')
    ) LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(song.toLowerCase())}%`);
  }

  const rows = await queryAll<MusicUsageRow>(
    env,
    `SELECT
       ev.id AS event_id,
       ev.title AS event_title,
       ev.starts_at,
       ev.location_id,
       loc.name AS location_name,
       er.id AS round_id,
       er.round_number,
       ed.id AS edition_id,
       g.id AS game_id,
       g.name AS game_name,
       g.subtype AS game_subtype,
       ei.id AS item_id,
       ei.ordinal AS item_ordinal,
       ei.answer,
       ei.answer_a,
       ei.answer_b,
       ei.answer_a_label,
       ei.answer_b_label,
       ei.answer_parts_json,
       ei.media_caption
     FROM event_rounds er
     JOIN events ev ON ev.id = er.event_id
     JOIN editions ed ON ed.id = er.edition_id
     JOIN games g ON g.id = ed.game_id
     JOIN game_types gt ON gt.id = g.game_type_id
     JOIN edition_items ei ON ei.edition_id = ed.id
     LEFT JOIN locations loc ON loc.id = ev.location_id
     WHERE ${where.join(' AND ')}
     ORDER BY ev.starts_at DESC, er.round_number ASC, ei.ordinal ASC`,
    params
  );

  const usages = rows
    .map(parseSongUsage)
    .filter((usage): usage is ParsedSongUsage => Boolean(usage))
    .filter((usage) => (artist ? usage.artists.some((entry) => matchesFilter(entry, artist)) : true))
    .filter((usage) => (song ? matchesFilter(usage.song, song) : true));

  const artistMap = new Map<
    string,
    {
      artist: string;
      songUsageCount: number;
      songs: Set<string>;
      events: Set<string>;
      rounds: Set<string>;
      lastUsedAt: string | null;
    }
  >();
  const songMap = new Map<
    string,
    {
      song: string;
      artist: string;
      usageCount: number;
      events: Set<string>;
      rounds: Set<string>;
      lastUsedAt: string | null;
      lastEventTitle: string | null;
      lastLocationName: string | null;
    }
  >();
  const events = new Set<string>();
  const rounds = new Set<string>();
  const uniqueSongs = new Set<string>();

  usages.forEach((usage) => {
    events.add(usage.eventId);
    rounds.add(usage.roundId);
    uniqueSongs.add(normalizeKey(usage.song));

    usage.artists.forEach((artistName) => {
      const artistKey = normalizeKey(artistName);
      const songKey = normalizeKey(usage.song);
      const existingArtist = artistMap.get(artistKey) ?? {
        artist: artistName,
        songUsageCount: 0,
        songs: new Set<string>(),
        events: new Set<string>(),
        rounds: new Set<string>(),
        lastUsedAt: null
      };
      existingArtist.songUsageCount += 1;
      existingArtist.songs.add(songKey);
      existingArtist.events.add(usage.eventId);
      existingArtist.rounds.add(usage.roundId);
      if (!existingArtist.lastUsedAt || usage.startsAt > existingArtist.lastUsedAt) {
        existingArtist.lastUsedAt = usage.startsAt;
      }
      artistMap.set(artistKey, existingArtist);

      const artistSongKey = `${artistKey}::${songKey}`;
      const existingSong = songMap.get(artistSongKey) ?? {
        song: usage.song,
        artist: artistName,
        usageCount: 0,
        events: new Set<string>(),
        rounds: new Set<string>(),
        lastUsedAt: null,
        lastEventTitle: null,
        lastLocationName: null
      };
      existingSong.usageCount += 1;
      existingSong.events.add(usage.eventId);
      existingSong.rounds.add(usage.roundId);
      if (!existingSong.lastUsedAt || usage.startsAt > existingSong.lastUsedAt) {
        existingSong.lastUsedAt = usage.startsAt;
        existingSong.lastEventTitle = usage.eventTitle;
        existingSong.lastLocationName = usage.locationName;
      }
      songMap.set(artistSongKey, existingSong);
    });
  });

  const artists: MusicDashboardArtist[] = [...artistMap.values()]
    .map((entry) => ({
      artist: entry.artist,
      song_usage_count: entry.songUsageCount,
      unique_song_count: entry.songs.size,
      event_count: entry.events.size,
      round_count: entry.rounds.size,
      last_used_at: entry.lastUsedAt
    }))
    .sort((a, b) => b.song_usage_count - a.song_usage_count || a.artist.localeCompare(b.artist))
    .slice(0, limit);

  const songs: MusicDashboardSong[] = [...songMap.values()]
    .map((entry) => ({
      song: entry.song,
      artist: entry.artist,
      usage_count: entry.usageCount,
      event_count: entry.events.size,
      round_count: entry.rounds.size,
      last_used_at: entry.lastUsedAt,
      last_event_title: entry.lastEventTitle,
      last_location_name: entry.lastLocationName
    }))
    .sort((a, b) => b.usage_count - a.usage_count || a.artist.localeCompare(b.artist) || a.song.localeCompare(b.song))
    .slice(0, limit);

  const dashboardData: MusicDashboardData = {
    summary: {
      song_usage_count: usages.reduce((count, usage) => count + usage.artists.length, 0),
      unique_song_count: uniqueSongs.size,
      artist_count: artistMap.size,
      event_count: events.size,
      round_count: rounds.size
    },
    artists,
    songs
  };

  return jsonOk(dashboardData);
};
