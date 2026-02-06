import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { AI_ICON } from '../lib/ai';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { SecondaryButton, DangerButton } from '../components/Buttons';
import type { Game, GameEdition, GameType } from '../types';

export function GameDetailPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const musicSubtypeOptions = [
    { value: '', label: 'Standard' },
    { value: 'speed_round', label: 'Speed Round' },
    { value: 'mashup', label: 'Mashup' },
    { value: 'covers', label: 'Covers' }
  ];
  const [game, setGame] = useState<Game | null>(null);
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [gameTypes, setGameTypes] = useState<GameType[]>([]);
  const [name, setName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [gameTypeId, setGameTypeId] = useState('');
  const [subtype, setSubtype] = useState('');
  const [description, setDescription] = useState('');
  const [showTheme, setShowTheme] = useState(true);
  const [descLoading, setDescLoading] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);

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
        setGameCode(gameRes.data.game_code ?? '');
        setGameTypeId(gameRes.data.game_type_id);
        setDescription(gameRes.data.description ?? '');
        setSubtype(gameRes.data.subtype ?? '');
        setShowTheme(Boolean(gameRes.data.show_theme ?? 1));
      }
      if (editionsRes.ok) setEditions(editionsRes.data);
      if (typesRes.ok) setGameTypes(typesRes.data);
    };
    load();
  }, [gameId]);

  const gameDraft = useMemo(
    () => ({
      name,
      game_code: gameCode.trim() || '',
      description,
      game_type_id: gameTypeId,
      subtype: subtype.trim() || '',
      show_theme: showTheme ? 1 : 0
    }),
    [name, gameCode, description, gameTypeId, subtype, showTheme]
  );

  const gameSaved = useMemo(
    () =>
      game
        ? {
            name: game.name,
            game_code: game.game_code ?? '',
            description: game.description ?? '',
            game_type_id: game.game_type_id,
            subtype: game.subtype ?? '',
            show_theme: game.show_theme ? 1 : 0
          }
        : null,
    [game]
  );

  const gameDirty = useMemo(() => {
    if (!gameSaved) return false;
    return JSON.stringify(gameDraft) !== JSON.stringify(gameSaved);
  }, [gameDraft, gameSaved]);

  useEffect(() => {
    if (!gameId || !game) return;
    if (!gameDirty) return;
    if (!name.trim()) {
      setSaveState('error');
      setUpdateError('Name is required.');
      return;
    }
    if (!gameTypeId) {
      setSaveState('error');
      setUpdateError('Game type is required.');
      return;
    }
    setSaveState('saving');
    setUpdateError(null);
    const timeout = window.setTimeout(async () => {
      const res = await api.updateGame(gameId, {
        name,
        game_code: gameCode.trim() || null,
        description,
        game_type_id: gameTypeId,
        subtype: subtype.trim() || null,
        show_theme: showTheme
      });
      if (res.ok) {
        setGame(res.data);
        setSaveState('saved');
        setUpdateError(null);
      } else {
        setSaveState('error');
        setUpdateError(formatApiError(res, 'Auto-save failed.'));
      }
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [gameId, game, gameDirty, name, gameCode, description, gameTypeId, subtype, showTheme]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const timeout = window.setTimeout(() => setSaveState('idle'), 1400);
    return () => window.clearTimeout(timeout);
  }, [saveState]);

  const generateDescription = async () => {
    if (!name.trim() && editions.length === 0) return;
    setDescLoading(true);
    setDescError(null);
    const editionLines = editions
      .slice(0, 10)
      .map((edition, index) => `${index + 1}. ${edition.theme ?? 'Untitled Theme'}`)
      .join('\n');
    const prompt = `Write a short, punchy 1-2 sentence description for a trivia game named below. Use any editions as context if provided.\n\nGame name: ${name}\nEditions:\n${editionLines}`;
    const res = await api.aiGenerate({ prompt, max_output_tokens: 120 });
    setDescLoading(false);
    if (!res.ok) {
      setDescError(formatApiError(res, 'Failed to update description.'));
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

  const selectedType = gameTypes.find((type) => type.id === gameTypeId) ?? null;
  const isMusicType = selectedType?.code === 'music';

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
              Game code (3 characters)
              <input
                className="h-10 px-3 uppercase"
                maxLength={3}
                value={gameCode}
                onChange={(event) => setGameCode(event.target.value.toUpperCase())}
              />
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
            {isMusicType && (
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Music Subtype
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
              <span className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={generateDescription}
                  className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent-ink hover:text-text"
                  disabled={descLoading}
                >
                  {descLoading ? `Generating${AI_ICON}` : `Generate${AI_ICON}`}
                </button>
              </span>
              <textarea
                className="min-h-[80px] px-3 py-2"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              {descError && <span className="text-[10px] tracking-[0.2em] text-danger">{descError}</span>}
            </label>
            <label className="flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              <input
                type="checkbox"
                checked={showTheme}
                onChange={(event) => setShowTheme(event.target.checked)}
              />
              Show theme when presenting
            </label>
            {updateError && (
              <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
                {updateError}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <DangerButton onClick={handleDelete}>Delete</DangerButton>
              <SecondaryButton onClick={() => navigate('/games')}>Back</SecondaryButton>
              <div aria-live="polite" className="text-xs">
                {saveState === 'saving' && <span className="text-muted">Saving changes…</span>}
                {saveState === 'saved' && <span className="text-accent-ink">All changes saved.</span>}
              </div>
            </div>
          </div>
        </Panel>
        <Panel
          title="Editions"
          action={
            <Link
              to={`/editions/new?game_id=${game.id}`}
              className="text-xs font-display uppercase tracking-[0.25em] text-accent-ink"
            >
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
                <div className="text-sm font-display uppercase tracking-[0.25em]">
                  {edition.theme ?? 'Untitled Theme'}
                </div>
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
