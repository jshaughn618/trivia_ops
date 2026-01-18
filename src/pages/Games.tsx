import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import type { Game } from '../types';

export function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const res = await api.listGames();
    if (res.ok) setGames(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const res = await api.createGame({ name, description });
    setLoading(false);
    if (res.ok) {
      setName('');
      setDescription('');
      load();
    }
  };

  return (
    <AppShell title="Games">
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Game Catalog">
          <div className="flex flex-col gap-3">
            {games.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No games yet.</div>
            )}
            {games.map((game) => (
              <Link key={game.id} to={`/games/${game.id}`} className="border-2 border-border bg-panel2 p-3">
                <div className="text-sm font-display uppercase tracking-[0.25em]">{game.name}</div>
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
