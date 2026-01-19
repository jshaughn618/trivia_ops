import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import type { Game } from '../types';

export function EditionNewPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [gameId, setGameId] = useState('');
  const [tags, setTags] = useState('');
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.listGames().then((res) => {
      if (res.ok) setGames(res.data);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromGame = params.get('game_id') ?? '';
    if (fromGame) setGameId(fromGame);
  }, [location.search]);

  const handleCreate = async () => {
    if (!gameId || !theme.trim()) return;
    const res = await api.createEdition({
      game_id: gameId,
      tags_csv: tags,
      theme,
      description,
      status: 'draft'
    });
    if (res.ok) {
      navigate(`/editions/${res.data.id}`);
    }
  };

  return (
    <AppShell title="New Edition">
      <Panel title="Edition Setup">
        <div className="flex flex-col gap-4 max-w-xl">
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Game
            <select className="h-10 px-3" value={gameId} onChange={(event) => setGameId(event.target.value)}>
              <option value="">Select a game</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Tags (comma separated)
            <input className="h-10 px-3" value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Theme
            <input className="h-10 px-3" value={theme} onChange={(event) => setTheme(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Description
            <textarea
              className="min-h-[100px] px-3 py-2"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="flex items-center gap-2">
            <PrimaryButton onClick={handleCreate}>Create Edition</PrimaryButton>
            <SecondaryButton onClick={() => navigate('/editions')}>Cancel</SecondaryButton>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
