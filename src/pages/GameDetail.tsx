import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import type { Game, GameEdition } from '../types';

export function GameDetailPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!gameId) return;
      const [gameRes, editionsRes] = await Promise.all([
        api.getGame(gameId),
        api.listEditions({ game_id: gameId })
      ]);
      if (gameRes.ok) {
        setGame(gameRes.data);
        setName(gameRes.data.name);
        setDescription(gameRes.data.description ?? '');
      }
      if (editionsRes.ok) setEditions(editionsRes.data);
    };
    load();
  }, [gameId]);

  const handleUpdate = async () => {
    if (!gameId) return;
    const res = await api.updateGame(gameId, { name, description });
    if (res.ok) setGame(res.data);
  };

  const handleDelete = async () => {
    if (!gameId) return;
    await api.deleteGame(gameId);
    navigate('/games');
  };

  if (!game) {
    return (
      <AppShell title="Game Detail">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Game Detail">
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Edit Game">
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
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={handleUpdate}>Update</PrimaryButton>
              <DangerButton onClick={handleDelete}>Delete</DangerButton>
              <SecondaryButton onClick={() => navigate('/games')}>Back</SecondaryButton>
            </div>
          </div>
        </Panel>
        <Panel title="Editions">
          <div className="flex flex-col gap-3">
            {editions.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No editions yet.</div>
            )}
            {editions.map((edition) => (
              <Link key={edition.id} to={`/editions/${edition.id}`} className="border-2 border-border bg-panel2 p-3">
                <div className="text-sm font-display uppercase tracking-[0.25em]">{edition.title}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                  {edition.status}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
