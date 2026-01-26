import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { ButtonLink, SecondaryButton } from '../components/Buttons';
import { PageHeader } from '../components/PageHeader';
import { Section } from '../components/Section';
import { List, ListRow } from '../components/List';
import { StatusPill } from '../components/StatusPill';
import { logError } from '../lib/log';
import type { Game, GameEdition, Location } from '../types';

export function EditionsPage() {
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [gameId, setGameId] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openGames, setOpenGames] = useState<Record<string, boolean>>({});
  const location = useLocation();

  const activeFilterCount = useMemo(() => {
    return [gameId, status, tag, locationId, search].filter((value) => value && value.trim().length > 0).length;
  }, [gameId, status, tag, locationId, search]);

  const load = async (filters?: {
    gameId?: string;
    status?: string;
    tag?: string;
    locationId?: string;
    search?: string;
  }) => {
    setError(null);
    const [gamesRes, editionsRes] = await Promise.all([
      api.listGames(),
      api.listEditions({
        game_id: filters?.gameId || gameId || undefined,
        status: filters?.status || status || undefined,
        tag: filters?.tag || tag || undefined,
        location_id: filters?.locationId || locationId || undefined,
        search: filters?.search || search || undefined
      })
    ]);
    const locationsRes = await api.listLocations();
    if (gamesRes.ok) setGames(gamesRes.data);
    if (!gamesRes.ok) {
      setError(gamesRes.error.message ?? 'Failed to load games.');
      logError('editions_games_load_failed', { error: gamesRes.error });
    }
    if (editionsRes.ok) setEditions(editionsRes.data);
    if (!editionsRes.ok) {
      setError(editionsRes.error.message ?? 'Failed to load editions.');
      logError('editions_load_failed', { error: editionsRes.error });
    }
    if (locationsRes.ok) setLocations(locationsRes.data);
    if (!locationsRes.ok) {
      setError(locationsRes.error.message ?? 'Failed to load locations.');
      logError('editions_locations_load_failed', { error: locationsRes.error });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextStatus = params.get('status') ?? '';
    setStatus(nextStatus);
    load({ status: nextStatus, gameId, tag, locationId, search });
  }, [location.search]);

  const editionsByGame = useMemo(() => {
    const map = new Map<string, GameEdition[]>();
    editions.forEach((edition) => {
      const list = map.get(edition.game_id) ?? [];
      list.push(edition);
      map.set(edition.game_id, list);
    });
    return map;
  }, [editions]);

  return (
    <AppShell title="Editions" showTitle={false}>
      <div className="space-y-4">
        <PageHeader
          title="Editions"
          actions={
            <ButtonLink to="/editions/new" variant="primary">
              New edition
            </ButtonLink>
          }
        >
          <p className="text-sm text-muted">Browse and manage game editions.</p>
        </PageHeader>
        {error && (
          <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
            {error}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
          <Section title="Edition library">
            {editions.length === 0 && (
              <div className="flex flex-col gap-2 text-sm text-muted">
                <span>No editions match your filters.</span>
                <button
                  type="button"
                  onClick={() => {
                    setGameId('');
                    setStatus('');
                    setTag('');
                    setLocationId('');
                    setSearch('');
                  }}
                  className="text-left text-xs uppercase tracking-[0.2em] text-accent-ink"
                >
                  Reset filters
                </button>
              </div>
            )}
            {editions.length > 0 && (
              <div className="divide-y divide-border">
                {games.map((game) => {
                  const gameEditions = editionsByGame.get(game.id) ?? [];
                  if (gameEditions.length === 0) return null;
                  const isOpen = openGames[game.id] ?? (gameId ? gameId === game.id : true);
                  return (
                    <div key={game.id} className="py-2">
                      <button
                        type="button"
                        onClick={() => setOpenGames((prev) => ({ ...prev, [game.id]: !isOpen }))}
                        className="flex w-full items-center justify-between gap-3 rounded-md bg-panel2/40 px-4 py-3 text-left"
                      >
                        <div className="text-sm font-display tracking-[0.15em]">{game.name}</div>
                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span>
                            {gameEditions.length} {gameEditions.length === 1 ? 'Edition' : 'Editions'}
                          </span>
                          <span className="text-base">{isOpen ? '−' : '+'}</span>
                        </div>
                      </button>
                      {isOpen && (
                        <List className="mt-1">
                          {gameEditions.map((edition) => {
                            const primaryTitle = edition.theme ?? edition.title ?? 'Untitled edition';
                            const secondary =
                              edition.title && edition.title !== primaryTitle
                                ? edition.title
                                : edition.tags_csv
                                  ? `Tags: ${edition.tags_csv}`
                                  : '';
                            return (
                              <ListRow key={edition.id} to={`/editions/${edition.id}`} className="py-3">
                                <div className="flex-1">
                                  <div className="text-sm font-display tracking-[0.12em]">{primaryTitle}</div>
                                  {secondary && <div className="mt-1 text-xs text-muted">{secondary}</div>}
                                </div>
                                <StatusPill status={edition.status} label={edition.status} />
                              </ListRow>
                            );
                          })}
                        </List>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
          <Section
            title="Filters"
            actions={
              activeFilterCount > 0 ? (
                <span className="text-xs uppercase tracking-[0.2em] text-muted">
                  Active: {activeFilterCount}
                </span>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Search
                <input className="h-10 px-3" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Game
                <select className="h-10 px-3" value={gameId} onChange={(event) => setGameId(event.target.value)}>
                  <option value="">All</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Status
                <select className="h-10 px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All</option>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Tag search
                <input className="h-10 px-3" value={tag} onChange={(event) => setTag(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Exclude played at location
                <select className="h-10 px-3" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">Any location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <SecondaryButton onClick={() => load()}>Apply</SecondaryButton>
                <button
                  type="button"
                  onClick={() => {
                    setGameId('');
                    setStatus('');
                    setTag('');
                    setLocationId('');
                    setSearch('');
                  }}
                  className="text-xs uppercase tracking-[0.25em] text-muted hover:text-text"
                >
                  Reset
                </button>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
