import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import type { Game, GameType } from '../types';

function GameTypeIcon({ type }: { type: GameType | null }) {
  const key = `${type?.code ?? ''} ${type?.name ?? ''}`.toLowerCase();
  const common = 'h-5 w-5 text-muted';
  if (key.includes('audio')) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15 9a4 4 0 0 1 0 6" />
        <path d="M19 7a8 8 0 0 1 0 10" />
      </svg>
    );
  }
  if (key.includes('visual') || key.includes('image')) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 17l-5-5-4 4-2-2-5 5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={common} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

export function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [gameTypes, setGameTypes] = useState<GameType[]>([]);
  const [name, setName] = useState('');
  const [gameTypeId, setGameTypeId] = useState('');
  const [filterTypeId, setFilterTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const [gamesRes, typesRes] = await Promise.all([api.listGames(), api.listGameTypes()]);
    if (gamesRes.ok) setGames(gamesRes.data);
    if (typesRes.ok) setGameTypes(typesRes.data);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !gameTypeId) return;
    setLoading(true);
    const res = await api.createGame({ name, description, game_type_id: gameTypeId });
    setLoading(false);
    if (res.ok) {
      setName('');
      setDescription('');
      setGameTypeId('');
      load();
    }
  };

  const typeById = useMemo(() => Object.fromEntries(gameTypes.map((type) => [type.id, type])), [gameTypes]);

  return (
    <AppShell title="Games">
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Game Catalog">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Filter Type
                <select
                  className="h-10 px-3"
                  value={filterTypeId}
                  onChange={(event) => setFilterTypeId(event.target.value)}
                >
                  <option value="">All</option>
                  {gameTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              {filterTypeId && (
                <SecondaryButton onClick={() => setFilterTypeId('')}>Clear</SecondaryButton>
              )}
            </div>
            {games.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No games yet.</div>
            )}
            {games
              .filter((game) => (filterTypeId ? game.game_type_id === filterTypeId : true))
              .map((game) => (
              <Link key={game.id} to={`/games/${game.id}`} className="border-2 border-border bg-panel2 p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center border border-border bg-panel">
                    <GameTypeIcon type={typeById[game.game_type_id] ?? null} />
                  </div>
                  <div className="text-sm font-display uppercase tracking-[0.25em]">{game.name}</div>
                </div>
                <div className="mt-1 text-xs text-muted uppercase tracking-[0.2em]">
                  {game.description ?? 'No description'}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Create Game">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Name
              <input className="h-10 px-3" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Game Type
              <select className="h-10 px-3" value={gameTypeId} onChange={(event) => setGameTypeId(event.target.value)}>
                <option value="">Select a type</option>
                {gameTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Description
              <textarea
                className="min-h-[80px] px-3 py-2"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
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
                }}
              >
                Clear
              </SecondaryButton>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
