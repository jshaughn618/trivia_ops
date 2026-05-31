import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Filter, Music2, Search } from 'lucide-react';
import { api, formatApiError } from '../api';
import { AppShell } from '../components/AppShell';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { logError } from '../lib/log';
import type { Location, MusicDashboardData } from '../types';

type RangePreset = 'all' | '30' | '90' | '365' | 'custom';

const emptyData: MusicDashboardData = {
  summary: {
    song_usage_count: 0,
    unique_song_count: 0,
    artist_count: 0,
    event_count: 0,
    round_count: 0
  },
  artists: [],
  songs: []
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetDates(preset: RangePreset) {
  if (preset === 'all' || preset === 'custom') return { from: '', to: '' };
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - Number(preset));
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function getInitialPreset(params: URLSearchParams): RangePreset {
  const preset = params.get('range');
  if (preset === '30' || preset === '90' || preset === '365' || preset === 'custom' || preset === 'all') return preset;
  if (params.get('from') || params.get('to')) return 'custom';
  return 'all';
}

export function MusicDashboardPage() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  const [locations, setLocations] = useState<Location[]>([]);
  const [data, setData] = useState<MusicDashboardData>(emptyData);
  const [locationId, setLocationId] = useState(params.get('location_id') ?? '');
  const [rangePreset, setRangePreset] = useState<RangePreset>(() => getInitialPreset(params));
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [artist, setArtist] = useState(params.get('artist') ?? '');
  const [song, setSong] = useState(params.get('song') ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveDates = useMemo(() => {
    if (rangePreset === 'custom') return { from, to };
    return getPresetDates(rangePreset);
  }, [from, rangePreset, to]);

  const activeFilterCount = useMemo(() => {
    return [locationId, effectiveDates.from, effectiveDates.to, artist.trim(), song.trim()].filter(Boolean).length;
  }, [artist, effectiveDates.from, effectiveDates.to, locationId, song]);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [locationsRes, dashboardRes] = await Promise.all([
      api.listLocations(),
      api.getMusicDashboard({
        location_id: locationId || undefined,
        from: effectiveDates.from || undefined,
        to: effectiveDates.to || undefined,
        artist: artist.trim() || undefined,
        song: song.trim() || undefined,
        limit: 30
      })
    ]);
    setLoading(false);

    if (locationsRes.ok) setLocations(locationsRes.data);
    if (!locationsRes.ok) {
      setError(formatApiError(locationsRes, 'Failed to load locations.'));
      logError('music_dashboard_locations_failed', { error: locationsRes.error });
    }

    if (dashboardRes.ok) {
      setData(dashboardRes.data);
    } else {
      setData(emptyData);
      setError(formatApiError(dashboardRes, 'Failed to load music dashboard.'));
      logError('music_dashboard_load_failed', { error: dashboardRes.error });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const applyFilters = (event?: FormEvent) => {
    event?.preventDefault();
    const next = new URLSearchParams();
    if (locationId) next.set('location_id', locationId);
    next.set('range', rangePreset);
    if (rangePreset === 'custom') {
      if (from) next.set('from', from);
      if (to) next.set('to', to);
    }
    if (artist.trim()) next.set('artist', artist.trim());
    if (song.trim()) next.set('song', song.trim());
    const query = next.toString();
    window.history.replaceState(null, '', query ? `/music-dashboard?${query}` : '/music-dashboard');
    setParams(next);
    load();
  };

  const clearFilters = () => {
    setLocationId('');
    setRangePreset('all');
    setFrom('');
    setTo('');
    setArtist('');
    setSong('');
    window.history.replaceState(null, '', '/music-dashboard');
    setParams(new URLSearchParams());
    setLoading(true);
    setError(null);
    Promise.all([api.listLocations(), api.getMusicDashboard({ limit: 30 })]).then(([locationsRes, dashboardRes]) => {
      setLoading(false);
      if (locationsRes.ok) setLocations(locationsRes.data);
      if (dashboardRes.ok) {
        setData(dashboardRes.data);
      } else {
        setData(emptyData);
        setError(formatApiError(dashboardRes, 'Failed to load music dashboard.'));
      }
    });
  };

  useEffect(() => {
    const nextPreset = getInitialPreset(params);
    setLocationId(params.get('location_id') ?? '');
    setRangePreset(nextPreset);
    setFrom(params.get('from') ?? '');
    setTo(params.get('to') ?? '');
    setArtist(params.get('artist') ?? '');
    setSong(params.get('song') ?? '');
  }, [params]);

  return (
    <AppShell title="Music Dashboard">
      <div className="space-y-5">
        {error && <div className="rounded-lg border border-danger bg-panel px-4 py-3 text-sm text-danger-ink">{error}</div>}

        <form onSubmit={applyFilters} className="surface-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-accent-ink" />
              <h2 className="panel-title">Filters</h2>
            </div>
            <div className="text-sm text-muted">{activeFilterCount} active</div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr),160px,repeat(2,150px)]">
            <label className="grid gap-1.5">
              <span className="ui-label">Location</span>
              <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-10">
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="ui-label">Time Range</span>
              <select
                value={rangePreset}
                onChange={(event) => setRangePreset(event.target.value as RangePreset)}
                className="h-10"
              >
                <option value="all">All time</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last year</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="ui-label">From</span>
              <input
                type="date"
                value={rangePreset === 'custom' ? from : effectiveDates.from}
                onChange={(event) => {
                  setRangePreset('custom');
                  setFrom(event.target.value);
                }}
                className="h-10"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="ui-label">To</span>
              <input
                type="date"
                value={rangePreset === 'custom' ? to : effectiveDates.to}
                onChange={(event) => {
                  setRangePreset('custom');
                  setTo(event.target.value);
                }}
                className="h-10"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto,auto]">
            <label className="grid gap-1.5">
              <span className="ui-label">Artist</span>
              <input
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
                placeholder="Filter by artist"
                className="h-10"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="ui-label">Song</span>
              <input
                value={song}
                onChange={(event) => setSong(event.target.value)}
                placeholder="Search for song"
                className="h-10"
              />
            </label>
            <div className="flex items-end">
              <PrimaryButton type="submit" disabled={loading} className="h-10 w-full lg:w-auto">
                <Search className="h-4 w-4" />
                Apply
              </PrimaryButton>
            </div>
            <div className="flex items-end">
              <SecondaryButton type="button" onClick={clearFilters} disabled={loading} className="h-10 w-full lg:w-auto">
                Clear
              </SecondaryButton>
            </div>
          </div>
        </form>

        <section className="grid gap-3 md:grid-cols-5">
          <SummaryTile label="Song Uses" value={data.summary.song_usage_count} />
          <SummaryTile label="Unique Songs" value={data.summary.unique_song_count} />
          <SummaryTile label="Artists" value={data.summary.artist_count} />
          <SummaryTile label="Events" value={data.summary.event_count} />
          <SummaryTile label="Rounds" value={data.summary.round_count} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
          <div className="surface-card overflow-hidden">
            <SectionHeader
              icon={<Music2 className="h-4 w-4 text-accent-ink" />}
              title="Top Artists"
              detail={loading ? 'Loading' : `${data.artists.length} shown`}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Artist</th>
                    <th className="px-5 py-3 text-right font-medium">Song Uses</th>
                    <th className="px-5 py-3 text-right font-medium">Unique Songs</th>
                    <th className="px-5 py-3 text-right font-medium">Events</th>
                    <th className="px-5 py-3 font-medium">Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <LoadingRow colSpan={5} />}
                  {!loading && data.artists.length === 0 && <EmptyRow colSpan={5} message="No music usage found." />}
                  {!loading &&
                    data.artists.map((entry) => (
                      <tr key={entry.artist} className="border-b border-border last:border-b-0">
                        <td className="px-5 py-3 font-medium text-text">{entry.artist}</td>
                        <td className="px-5 py-3 text-right text-text">{formatNumber(entry.song_usage_count)}</td>
                        <td className="px-5 py-3 text-right text-text-soft">{formatNumber(entry.unique_song_count)}</td>
                        <td className="px-5 py-3 text-right text-text-soft">{formatNumber(entry.event_count)}</td>
                        <td className="px-5 py-3 text-muted">{formatDate(entry.last_used_at)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <SectionHeader title="Songs Used" detail={loading ? 'Loading' : `${data.songs.length} shown`} />
            <div className="divide-y divide-border px-5">
              {loading && <div className="py-10 text-center text-sm text-muted">Loading music data...</div>}
              {!loading && data.songs.length === 0 && <div className="py-10 text-center text-sm text-muted">No songs found.</div>}
              {!loading &&
                data.songs.map((entry) => (
                  <div key={`${entry.artist}-${entry.song}`} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-text">{entry.song}</div>
                        <div className="mt-1 text-sm text-muted">{entry.artist}</div>
                      </div>
                      <div className="shrink-0 rounded-lg border border-border bg-panel2 px-2.5 py-1 text-sm text-text">
                        {entry.usage_count}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      {formatDate(entry.last_used_at)}
                      {entry.last_event_title ? ` / ${entry.last_event_title}` : ''}
                      {entry.last_location_name ? ` / ${entry.last_location_name}` : ''}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-text">{formatNumber(value)}</div>
    </div>
  );
}

function SectionHeader({ icon, title, detail }: { icon?: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="panel-title">{title}</h2>
      </div>
      <div className="text-sm text-muted">{detail}</div>
    </div>
  );
}

function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-sm text-muted">
        Loading music data...
      </td>
    </tr>
  );
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-sm text-muted">
        {message}
      </td>
    </tr>
  );
}
