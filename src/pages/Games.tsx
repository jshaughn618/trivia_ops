import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { PageHeader } from '../components/PageHeader';
import { Section } from '../components/Section';
import { List, ListRow } from '../components/List';
import { StatusPill } from '../components/StatusPill';
import { ButtonLink, PrimaryButton, SecondaryButton } from '../components/Buttons';
import { logError } from '../lib/log';
import type { Game, GameEdition, GameType, Location } from '../types';

export function GamesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const musicSubtypeOptions = [
    { value: '', label: 'Standard' },
    { value: 'speed_round', label: 'Speed Round' }
  ];
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [gameTypes, setGameTypes] = useState<GameType[]>([]);
  const [gameId, setGameId] = useState('');
  const [gameTypeFilterId, setGameTypeFilterId] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openGames, setOpenGames] = useState<Record<string, boolean>>({});
  const [gameMenuId, setGameMenuId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [gameTypeId, setGameTypeId] = useState('');
  const [subtype, setSubtype] = useState('');
  const [description, setDescription] = useState('');
  const [showTheme, setShowTheme] = useState(true);
  const [loading, setLoading] = useState(false);
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const createMode = params.get('create') === '1';

  const activeFilterCount = useMemo(() => {
    return [gameId, gameTypeFilterId, status, tag, locationId, search]
      .filter((value) => value && value.trim().length > 0)
      .length;
  }, [gameId, gameTypeFilterId, status, tag, locationId, search]);

  const updateCreateParam = (next: boolean) => {
    const nextParams = new URLSearchParams(location.search);
    if (next) {
      nextParams.set('create', '1');
    } else {
      nextParams.delete('create');
    }
    const query = nextParams.toString();
    navigate({ pathname: '/games', search: query ? `?${query}` : '' });
  };

  const load = async (filters?: {
    gameId?: string;
    status?: string;
    tag?: string;
    locationId?: string;
    search?: string;
  }) => {
    setError(null);
    const [gamesRes, editionsRes, locationsRes, gameTypesRes] = await Promise.all([
      api.listGames(),
      api.listEditions({
        game_id: filters?.gameId || gameId || undefined,
        status: filters?.status || status || undefined,
        tag: filters?.tag || tag || undefined,
        location_id: filters?.locationId || locationId || undefined,
        search: filters?.search || search || undefined
      }),
      api.listLocations(),
      api.listGameTypes()
    ]);
    if (gamesRes.ok) setGames(gamesRes.data);
    if (!gamesRes.ok) {
      setError(gamesRes.error.message ?? 'Failed to load games.');
      logError('games_load_failed', { error: gamesRes.error });
    }
    if (editionsRes.ok) setEditions(editionsRes.data);
    if (!editionsRes.ok) {
      setError(editionsRes.error.message ?? 'Failed to load editions.');
      logError('editions_load_failed', { error: editionsRes.error });
    }
    if (locationsRes.ok) setLocations(locationsRes.data);
    if (!locationsRes.ok) {
      setError(locationsRes.error.message ?? 'Failed to load locations.');
      logError('locations_load_failed', { error: locationsRes.error });
    }
    if (gameTypesRes.ok) setGameTypes(gameTypesRes.data);
    if (!gameTypesRes.ok) {
      setError(gameTypesRes.error.message ?? 'Failed to load game types.');
      logError('game_types_load_failed', { error: gameTypesRes.error });
    }
  };

  useEffect(() => {
    const statusParam = params.get('status');
    if (statusParam !== null) {
      setStatus(statusParam);
      load({ status: statusParam, gameId, tag, locationId, search });
      return;
    }
    load({ gameId, status, tag, locationId, search });
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

  const filteredGames = useMemo(() => {
    if (!gameTypeFilterId) return games;
    return games.filter((game) => game.game_type_id === gameTypeFilterId);
  }, [games, gameTypeFilterId]);

  const visibleGameIds = useMemo(() => {
    return filteredGames
      .filter((game) => (editionsByGame.get(game.id) ?? []).length > 0)
      .map((game) => game.id);
  }, [filteredGames, editionsByGame]);

  useEffect(() => {
    setOpenGames((prev) => {
      const next: Record<string, boolean> = {};
      visibleGameIds.forEach((id) => {
        if (prev[id]) next[id] = true;
      });
      return next;
    });
    setGameMenuId((current) => (current && visibleGameIds.includes(current) ? current : null));
  }, [visibleGameIds]);

  const handleCreate = async () => {
    if (!name.trim() || !gameTypeId) return;
    setLoading(true);
    const res = await api.createGame({
      name,
      description,
      game_type_id: gameTypeId,
      subtype: subtype.trim() || null,
      show_theme: showTheme
    });
    setLoading(false);
    if (res.ok) {
      setName('');
      setDescription('');
      setGameTypeId('');
      setSubtype('');
      setShowTheme(true);
      updateCreateParam(false);
      load();
    }
  };

  const typeById = useMemo(() => Object.fromEntries(gameTypes.map((type) => [type.id, type])), [gameTypes]);
  const selectedType = typeById[gameTypeId] ?? null;
  const isMusicType = selectedType?.code === 'music';

  return (
    <AppShell title="Games" showTitle={false}>
      <div className="space-y-4">
        <PageHeader
          title="Games"
          actions={
            <ButtonLink
              to="/games?create=1"
              variant="primary"
              onClick={(event) => {
                event.preventDefault();
                updateCreateParam(true);
              }}
            >
              New game
            </ButtonLink>
          }
        >
          <p className="text-sm text-muted">Browse games and manage their editions.</p>
        </PageHeader>
        {error && (
          <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
            {error}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
          <Section title="Edition library">
            {editions.length > 0 && (
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">
                Select a game to view editions.
              </div>
            )}
            {editions.length === 0 && (
              <div className="flex flex-col gap-2 text-sm text-muted">
                <span>No editions match your filters.</span>
                <button
                  type="button"
                  onClick={() => {
                    setGameId('');
                    setGameTypeFilterId('');
                    setStatus('');
                    setTag('');
                    setLocationId('');
                    setSearch('');
                    setOpenGames({});
                  }}
                  className="text-left text-xs uppercase tracking-[0.2em] text-accent-ink"
                >
                  Reset filters
                </button>
              </div>
            )}
            {editions.length > 0 && (
              <div className="divide-y divide-border">
                {filteredGames.map((game) => {
                  const gameEditions = editionsByGame.get(game.id) ?? [];
                  if (gameEditions.length === 0) return null;
                  const isOpen = Boolean(openGames[game.id]);
                  const editionListId = `editions-${game.id}`;
                  return (
                    <div key={game.id} className="py-2">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={editionListId}
                        onClick={() => {
                          setGameMenuId(null);
                          setOpenGames((prev) => ({ ...prev, [game.id]: !isOpen }));
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-4 py-3 text-left transition hover:bg-panel2/50"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-sm text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            aria-hidden="true"
                          >
                            ▶
                          </span>
                          <span className="text-base font-semibold text-accent-ink">{game.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">
                            {gameEditions.length} {gameEditions.length === 1 ? 'Edition' : 'Editions'}
                          </span>
                          <button
                            type="button"
                            aria-label={`Add edition to ${game.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/editions/new?game_id=${game.id}`);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm text-muted transition hover:border-accent-ink hover:text-accent-ink"
                          >
                            +
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              aria-label={`Game actions for ${game.name}`}
                              aria-haspopup="menu"
                              aria-expanded={gameMenuId === game.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                setGameMenuId((current) => (current === game.id ? null : game.id));
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm text-muted transition hover:border-accent-ink hover:text-accent-ink"
                            >
                              ⋯
                            </button>
                            {gameMenuId === game.id && (
                              <div className="absolute right-0 z-20 mt-2 min-w-[140px] rounded-md border border-border bg-panel p-2 text-left shadow-sm">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setGameMenuId(null);
                                    navigate(`/games/${game.id}`);
                                  }}
                                  className="w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
                                >
                                  Edit game
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                      {isOpen && (
                        <List id={editionListId} className="mt-1">
                          {gameEditions.map((edition) => {
                            const primaryTitle = edition.theme ?? edition.title ?? 'Untitled edition';
                            const secondary = edition.tags_csv ? `Tags: ${edition.tags_csv}` : '';
                            return (
                              <ListRow key={edition.id} to={`/editions/${edition.id}`} className="py-3 pl-8">
                                <div className="flex-1">
                                  <div className="text-sm text-text">{primaryTitle}</div>
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
          <div className="space-y-4">
            {createMode && (
              <Section
                title="New game"
                actions={
                  <button
                    type="button"
                    onClick={() => updateCreateParam(false)}
                    className="text-xs uppercase tracking-[0.2em] text-muted hover:text-text"
                  >
                    Close
                  </button>
                }
              >
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Name
                    <input className="h-10 px-3" value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Game type
                    <select className="h-10 px-3" value={gameTypeId} onChange={(event) => setGameTypeId(event.target.value)}>
                      <option value="">Select a type</option>
                      {gameTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {isMusicType && (
                    <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                      Music subtype
                      <select
                        className="h-10 px-3"
                        value={subtype}
                        onChange={(event) => setSubtype(event.target.value)}
                      >
                        {musicSubtypeOptions.map((option) => (
                          <option key={option.value || 'none'} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Description
                    <textarea
                      className="min-h-[80px] px-3 py-2"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    <input
                      type="checkbox"
                      checked={showTheme}
                      onChange={(event) => setShowTheme(event.target.checked)}
                    />
                    Show theme when presenting
                  </label>
                  <div className="flex items-center gap-2">
                    <PrimaryButton onClick={handleCreate} disabled={loading}>
                      {loading ? 'Saving' : 'Create'}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => {
                        setName('');
                        setDescription('');
                        setGameTypeId('');
                        setSubtype('');
                        setShowTheme(true);
                      }}
                    >
                      Clear
                    </SecondaryButton>
                  </div>
                </div>
              </Section>
            )}
            <Section
              title="Filters"
              actions={
                activeFilterCount > 0 ? (
                  <span className="text-xs uppercase tracking-[0.2em] text-muted">Active: {activeFilterCount}</span>
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
                  Game type
                  <select
                    className="h-10 px-3"
                    value={gameTypeFilterId}
                    onChange={(event) => setGameTypeFilterId(event.target.value)}
                  >
                    <option value="">All</option>
                    {gameTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
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
                      setGameTypeFilterId('');
                      setStatus('');
                      setTag('');
                      setLocationId('');
                      setSearch('');
                      setOpenGames({});
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
      </div>
    </AppShell>
  );
}
