import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { ButtonLink, PrimaryButton, SecondaryButton } from '../components/Buttons';
import type { Game, GameEdition } from '../types';

export function EditionsPage() {
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [gameId, setGameId] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const location = useLocation();

  const load = async () => {
    const [gamesRes, editionsRes] = await Promise.all([
      api.listGames(),
      api.listEditions({ game_id: gameId || undefined, status: status || undefined, tag: tag || undefined })
    ]);
    if (gamesRes.ok) setGames(gamesRes.data);
    if (editionsRes.ok) setEditions(editionsRes.data);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextStatus = params.get('status') ?? '';
    setStatus(nextStatus);
    load();
  }, [location.search]);

  return (
    <AppShell title="Editions">
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Edition Library" action={<ButtonLink to="/editions/new" variant="primary">New Edition</ButtonLink>}>
          <div className="flex flex-col gap-3">
            {editions.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No editions found.</div>
            )}
            {editions.map((edition) => (
              <Link
                key={edition.id}
                to={`/editions/${edition.id}`}
                className="border-2 border-border bg-panel2 p-3"
              >
                <div className="text-sm font-display uppercase tracking-[0.25em]">{edition.title}</div>
                <div className="mt-1 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-muted">
                  <span>{edition.status}</span>
                  <span>{edition.theme ?? edition.tags_csv ?? 'No tags'}</span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Filters">
          <div className="flex flex-col gap-4">
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
            <div className="flex items-center gap-2">
              <PrimaryButton onClick={load}>Apply</PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setGameId('');
                  setStatus('');
                  setTag('');
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
