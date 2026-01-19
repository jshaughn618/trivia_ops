import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import type { Game, GameEdition, GameType } from '../types';

export function GameDetailPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [gameTypes, setGameTypes] = useState<GameType[]>([]);
  const [name, setName] = useState('');
  const [gameTypeId, setGameTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [descLoading, setDescLoading] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!gameId) return;
      const [gameRes, editionsRes, typesRes] = await Promise.all([
        api.getGame(gameId),
        api.listEditions({ game_id: gameId }),
        api.listGameTypes()
      ]);
      if (gameRes.ok) {
        setGame(gameRes.data);
        setName(gameRes.data.name);
        setGameTypeId(gameRes.data.game_type_id);
        setDescription(gameRes.data.description ?? '');
      }
      if (editionsRes.ok) setEditions(editionsRes.data);
      if (typesRes.ok) setGameTypes(typesRes.data);
    };
    load();
  }, [gameId]);

  const handleUpdate = async () => {
    if (!gameId) return;
    const res = await api.updateGame(gameId, { name, description, game_type_id: gameTypeId });
    if (res.ok) setGame(res.data);
  };

  const generateDescription = async () => {
    if (!name.trim() && editions.length === 0) return;
    setDescLoading(true);
    setDescError(null);
    const editionLines = editions
      .slice(0, 10)
      .map((edition, index) => `${index + 1}. ${edition.theme ?? edition.title}`)
      .join('\n');
    const prompt = `Write a short, punchy 1-2 sentence description for a trivia game named below. Use any editions as context if provided.\n\nGame name: ${name}\nEditions:\n${editionLines}`;
    const res = await api.aiGenerate({ prompt, max_output_tokens: 120 });
    setDescLoading(false);
    if (!res.ok) {
      setDescError(res.error.message);
      return;
    }
    const line = res.data.text.split('\n')[0] ?? '';
    setDescription(line.trim());
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
              Game Type
              <select
                className="h-10 px-3"
                value={gameTypeId}
                onChange={(event) => setGameTypeId(event.target.value)}
              >
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
              <span className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={generateDescription}
                  className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                  disabled={descLoading}
                >
                  {descLoading ? 'Generating' : 'Generate'}
                </button>
              </span>
              <textarea
                className="min-h-[80px] px-3 py-2"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              {descError && <span className="text-[10px] tracking-[0.2em] text-danger">{descError}</span>}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={handleUpdate}>Update</PrimaryButton>
              <DangerButton onClick={handleDelete}>Delete</DangerButton>
              <SecondaryButton onClick={() => navigate('/games')}>Back</SecondaryButton>
            </div>
          </div>
        </Panel>
        <Panel
          title="Editions"
          action={
            <Link to="/editions/new" className="text-xs font-display uppercase tracking-[0.25em] text-accent">
              Add Edition
            </Link>
          }
        >
          <div className="flex flex-col gap-3">
            {editions.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No editions yet.</div>
            )}
            {editions.map((edition) => (
              <Link key={edition.id} to={`/editions/${edition.id}`} className="border-2 border-border bg-panel2 p-3">
                <div className="text-sm font-display uppercase tracking-[0.25em]">{edition.theme ?? edition.title}</div>
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
