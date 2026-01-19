import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { ButtonLink, PrimaryButton, SecondaryButton } from '../components/Buttons';
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
    <AppShell title="Editions">
      {error && (
        <div className="mb-4 border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
          {error}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Edition Library" action={<ButtonLink to="/editions/new" variant="primary">New Edition</ButtonLink>}>
          <div className="flex flex-col gap-3">
            {editions.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No editions found.</div>
            )}
            {games.map((game) => {
              const gameEditions = editionsByGame.get(game.id) ?? [];
              if (gameEditions.length === 0) return null;
              const isOpen = openGames[game.id] ?? (gameId ? gameId === game.id : true);
              return (
                <div key={game.id} className="border-2 border-border bg-panel2">
                  <button
                    type="button"
                    onClick={() => setOpenGames((prev) => ({ ...prev, [game.id]: !isOpen }))}
                    className="flex w-full items-center justify-between px-3 py-2 text-left"
                  >
                    <div className="text-sm font-display uppercase tracking-[0.25em]">{game.name}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted">
                      {gameEditions.length} {gameEditions.length === 1 ? 'Edition' : 'Editions'}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border px-3 py-2">
                      <div className="flex flex-col gap-2">
                        {gameEditions.map((edition) => (
                          <Link
                            key={edition.id}
                            to={`/editions/${edition.id}`}
                            className="border border-border bg-panel px-3 py-2"
                          >
                            <div className="text-sm font-display uppercase tracking-[0.25em]">
                              {edition.theme ?? 'Untitled Theme'}
                            </div>
                            <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                              {edition.status}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Filters">
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
              Tag Search
              <input className="h-10 px-3" value={tag} onChange={(event) => setTag(event.target.value)} />
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Exclude Played At Location
              <select className="h-10 px-3" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Any Location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <PrimaryButton onClick={() => load()}>Apply</PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setGameId('');
                  setStatus('');
                  setTag('');
                  setLocationId('');
                  setSearch('');
                }}
              >
                Reset
              </SecondaryButton>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
