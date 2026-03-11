import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { AI_ICON } from '../lib/ai';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import type { Game, GameEdition, GameExampleItem, GameType } from '../types';

type ExampleAnswerPart = { label: string; answer: string; points: number };
type ExampleItemDraft = {
  question_type: 'text' | 'multiple_choice';
  media_type: '' | 'image' | 'audio';
  prompt: string;
  choices: string[];
  correct_choice_index: number;
  answer_parts: ExampleAnswerPart[];
  fun_fact: string;
  media_key: string;
  media_caption: string;
  audio_answer_key: string;
};

const emptyChoices = ['', '', '', ''];

const parseChoices = (choicesJson: string[] | null | undefined) => {
  if (!choicesJson) return [...emptyChoices];
  const choices = choicesJson.filter((choice) => typeof choice === 'string').slice(0, 4);
  while (choices.length < 4) choices.push('');
  return choices;
};

const defaultAnswerPartsForGame = (gameTypeCode: string | null, subtype: string | null): ExampleAnswerPart[] => {
  if (gameTypeCode === 'music') {
    if (subtype === 'mashup') {
      return [
        { label: 'Artist 1', answer: '', points: 1 },
        { label: 'Artist 2', answer: '', points: 1 },
        { label: 'Song', answer: '', points: 1 }
      ];
    }
    if (subtype === 'covers') {
      return [
        { label: 'Song', answer: '', points: 1 },
        { label: 'Cover artist', answer: '', points: 1 },
        { label: 'Original artist', answer: '', points: 1 }
      ];
    }
    return [
      { label: 'Song', answer: '', points: 1 },
      { label: 'Artist', answer: '', points: 1 }
    ];
  }
  if (gameTypeCode === 'audio') {
    return [{ label: 'Answer 1', answer: '', points: 1 }];
  }
  return [{ label: 'Answer', answer: '', points: 1 }];
};

const createExampleItemDraft = (gameTypeCode: string | null, subtype: string | null): ExampleItemDraft => ({
  question_type: 'text',
  media_type: gameTypeCode === 'audio' ? 'audio' : '',
  prompt: '',
  choices: [...emptyChoices],
  correct_choice_index: 0,
  answer_parts: defaultAnswerPartsForGame(gameTypeCode, subtype),
  fun_fact: '',
  media_key: '',
  media_caption: '',
  audio_answer_key: ''
});

const parseAnswerParts = (item: GameExampleItem | null, gameTypeCode: string | null, subtype: string | null): ExampleAnswerPart[] => {
  if (!item) return defaultAnswerPartsForGame(gameTypeCode, subtype);
  if (Array.isArray(item.answer_parts_json) && item.answer_parts_json.length > 0) {
    return item.answer_parts_json.map((part) => ({
      label: typeof part.label === 'string' ? part.label : '',
      answer: typeof part.answer === 'string' ? part.answer : '',
      points: typeof part.points === 'number' && Number.isFinite(part.points) ? Math.max(0, Math.trunc(part.points)) : 1
    }));
  }

  const parts: ExampleAnswerPart[] = [];
  if (item.answer_a) {
    parts.push({ label: item.answer_a_label ?? 'Answer 1', answer: item.answer_a, points: 1 });
  }
  if (item.answer_b) {
    parts.push({ label: item.answer_b_label ?? `Answer ${parts.length + 1}`, answer: item.answer_b, points: 1 });
  }
  if (parts.length === 0 && item.answer) {
    parts.push({ label: 'Answer', answer: item.answer, points: 1 });
  }
  return parts.length > 0 ? parts : defaultAnswerPartsForGame(gameTypeCode, subtype);
};

const parseExampleItemJson = (raw: string | null | undefined): GameExampleItem | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GameExampleItem;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const buildExampleDraftFromItem = (
  item: GameExampleItem | null,
  gameTypeCode: string | null,
  subtype: string | null
): ExampleItemDraft =>
  item
    ? {
        question_type: item.question_type ?? 'text',
        media_type: item.media_type ?? '',
        prompt: item.prompt ?? '',
        choices: parseChoices(item.choices_json ?? null),
        correct_choice_index:
          item.question_type === 'multiple_choice' && item.answer
            ? Math.max(0, parseChoices(item.choices_json ?? null).findIndex((choice) => choice.trim() === item.answer.trim()))
            : 0,
        answer_parts: parseAnswerParts(item, gameTypeCode, subtype),
        fun_fact: item.fun_fact ?? '',
        media_key: item.media_key ?? '',
        media_caption: item.media_caption ?? '',
        audio_answer_key: item.audio_answer_key ?? ''
      }
    : createExampleItemDraft(gameTypeCode, subtype);

const normalizeChoiceList = (choices: string[]) => {
  const trimmed = choices.map((choice) => choice.trim());
  let lastFilled = trimmed.length - 1;
  while (lastFilled >= 0 && !trimmed[lastFilled]) lastFilled -= 1;
  const normalized = trimmed.slice(0, lastFilled + 1);
  const hasGap = normalized.some((choice, index) => !choice && normalized.slice(index + 1).some(Boolean));
  return { normalized, hasGap };
};

const sanitizeAnswerParts = (parts: ExampleAnswerPart[]) =>
  parts
    .map((part) => ({
      label: part.label.trim(),
      answer: part.answer.trim(),
      points: Number.isFinite(part.points) ? Math.max(0, Math.trunc(part.points)) : 1
    }))
    .filter((part) => part.label.length > 0 && part.answer.length > 0);

const buildExampleItemPayload = (
  enabled: boolean,
  draft: ExampleItemDraft
): { payload: GameExampleItem | null; error: string | null } => {
  if (!enabled) return { payload: null, error: null };

  const prompt = draft.prompt.trim();
  const mediaType = draft.media_type || null;
  const mediaKey = draft.media_key.trim() || null;
  const mediaCaption = draft.media_caption.trim() || null;
  const audioAnswerKey = draft.audio_answer_key.trim() || null;

  if (draft.question_type === 'multiple_choice') {
    const { normalized, hasGap } = normalizeChoiceList(draft.choices);
    if (prompt.length === 0 && mediaType !== 'audio') {
      return { payload: null, error: 'Example prompt is required.' };
    }
    if (hasGap) {
      return { payload: null, error: 'Fill multiple choice options in order without gaps.' };
    }
    if (normalized.length < 2) {
      return { payload: null, error: 'Example multiple choice needs at least two choices.' };
    }
    const answer = normalized[draft.correct_choice_index];
    if (!answer) {
      return { payload: null, error: 'Select the correct multiple choice answer.' };
    }
    return {
      payload: {
        question_type: 'multiple_choice',
        choices_json: normalized,
        prompt,
        answer,
        answer_a: null,
        answer_b: null,
        answer_a_label: null,
        answer_b_label: null,
        answer_parts_json: null,
        fun_fact: draft.fun_fact.trim() || null,
        media_type: mediaType,
        media_key: mediaKey,
        media_caption: mediaCaption,
        audio_answer_key: audioAnswerKey
      },
      error: null
    };
  }

  const parts = sanitizeAnswerParts(draft.answer_parts);
  if (prompt.length === 0 && mediaType !== 'audio') {
    return { payload: null, error: 'Example prompt is required.' };
  }
  if (parts.length === 0) {
    return { payload: null, error: 'Add at least one answer part for the example item.' };
  }

  return {
    payload: {
      question_type: 'text',
      choices_json: null,
      prompt,
      answer: parts.length === 1 ? parts[0].answer : parts.map((part) => part.answer).join(' / '),
      answer_a: parts[0]?.answer ?? null,
      answer_b: parts[1]?.answer ?? null,
      answer_a_label: parts[0]?.label ?? null,
      answer_b_label: parts[1]?.label ?? null,
      answer_parts_json: parts,
      fun_fact: draft.fun_fact.trim() || null,
      media_type: mediaType,
      media_key: mediaKey,
      media_caption: mediaCaption,
      audio_answer_key: audioAnswerKey
    },
    error: null
  };
};

export function GameDetailPage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const musicSubtypeOptions = [
    { value: '', label: 'Standard' },
    { value: 'stop', label: 'Stop!' },
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
  const [allowParticipantAudioStop, setAllowParticipantAudioStop] = useState(false);
  const [exampleItemEnabled, setExampleItemEnabled] = useState(false);
  const [exampleItemDraft, setExampleItemDraft] = useState<ExampleItemDraft>(createExampleItemDraft(null, null));
  const [exampleMediaBusy, setExampleMediaBusy] = useState<'question' | 'answer' | null>(null);
  const [exampleMediaError, setExampleMediaError] = useState<string | null>(null);
  const [descLoading, setDescLoading] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const exampleMediaInputRef = useRef<HTMLInputElement | null>(null);
  const exampleAnswerAudioInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!gameId) return;
      const [gameRes, editionsRes, typesRes] = await Promise.all([
        api.getGame(gameId),
        api.listEditions({ game_id: gameId }),
        api.listGameTypes()
      ]);
      if (gameRes.ok) {
        const parsedExample = parseExampleItemJson(gameRes.data.example_item_json);
        setGame(gameRes.data);
        setName(gameRes.data.name);
        setGameCode(gameRes.data.game_code ?? '');
        setGameTypeId(gameRes.data.game_type_id);
        setDescription(gameRes.data.description ?? '');
        setSubtype(gameRes.data.subtype ?? '');
        setShowTheme(Boolean(gameRes.data.show_theme ?? 1));
        setAllowParticipantAudioStop(Boolean(gameRes.data.allow_participant_audio_stop ?? 0));
        setExampleItemEnabled(Boolean(parsedExample));
        setExampleItemDraft(buildExampleDraftFromItem(parsedExample, null, gameRes.data.subtype ?? ''));
      }
      if (editionsRes.ok) setEditions(editionsRes.data);
      if (typesRes.ok) setGameTypes(typesRes.data);
    };
    load();
  }, [gameId]);

  const gameDraft = useMemo(
    () => {
      const exampleItemBuild = buildExampleItemPayload(exampleItemEnabled, exampleItemDraft);
      return {
        name,
        game_code: gameCode.trim() || '',
        description,
        game_type_id: gameTypeId,
        subtype: subtype.trim() || '',
        show_theme: showTheme ? 1 : 0,
        allow_participant_audio_stop: allowParticipantAudioStop ? 1 : 0,
        example_item: exampleItemBuild.payload
      };
    },
    [name, gameCode, description, gameTypeId, subtype, showTheme, allowParticipantAudioStop, exampleItemEnabled, exampleItemDraft]
  );

  const exampleItemBuild = useMemo(
    () => ({
      ...buildExampleItemPayload(exampleItemEnabled, exampleItemDraft)
    }),
    [exampleItemEnabled, exampleItemDraft]
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
            show_theme: game.show_theme ? 1 : 0,
            allow_participant_audio_stop: game.allow_participant_audio_stop ? 1 : 0,
            example_item: parseExampleItemJson(game.example_item_json)
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
    if (exampleItemBuild.error) {
      setSaveState('error');
      setUpdateError(exampleItemBuild.error);
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
        show_theme: showTheme,
        allow_participant_audio_stop: allowParticipantAudioStop,
        example_item: exampleItemBuild.payload
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
  }, [
    gameId,
    game,
    gameDirty,
    name,
    gameCode,
    description,
    gameTypeId,
    subtype,
    showTheme,
    allowParticipantAudioStop,
    exampleItemBuild
  ]);

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

  const selectedType = gameTypes.find((type) => type.id === gameTypeId) ?? null;
  const isMusicType = selectedType?.code === 'music';

  const resetExampleItem = () => {
    setExampleItemEnabled(true);
    setExampleItemDraft(createExampleItemDraft(selectedType?.code ?? null, subtype));
    setExampleMediaError(null);
  };

  const uploadExampleMedia = async (file: File, target: 'question' | 'answer') => {
    const kind = target === 'question'
      ? exampleItemDraft.media_type === 'audio'
        ? 'audio'
        : 'image'
      : 'audio';
    setExampleMediaBusy(target);
    setExampleMediaError(null);
    const res = await api.uploadMedia(file, kind);
    if (!res.ok) {
      setExampleMediaError(formatApiError(res, 'Upload failed.'));
      setExampleMediaBusy(null);
      return;
    }
    setExampleItemDraft((current) => ({
      ...current,
      media_key: target === 'question' ? res.data.key : current.media_key,
      audio_answer_key: target === 'answer' ? res.data.key : current.audio_answer_key
    }));
    setExampleMediaBusy(null);
  };

  const removeExampleQuestionMedia = async () => {
    if (!exampleItemDraft.media_key) return;
    const key = exampleItemDraft.media_key;
    setExampleItemDraft((current) => ({ ...current, media_key: '', media_caption: '' }));
    await api.deleteMedia(key);
  };

  const removeExampleAnswerAudio = async () => {
    if (!exampleItemDraft.audio_answer_key) return;
    const key = exampleItemDraft.audio_answer_key;
    setExampleItemDraft((current) => ({ ...current, audio_answer_key: '' }));
    await api.deleteMedia(key);
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
      <div className="grid gap-4">
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
              {isMusicType && (
                <label className="flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                  <input
                    type="checkbox"
                    checked={allowParticipantAudioStop}
                    onChange={(event) => setAllowParticipantAudioStop(event.target.checked)}
                  />
                  Allow participants to stop audio (Stop! subtype only)
                </label>
              )}
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

        <Panel
          title="Example Item"
          action={
            exampleItemEnabled ? (
              <SecondaryButton
                onClick={() => setExampleItemEnabled(false)}
              >
                Remove Example
              </SecondaryButton>
            ) : (
              <PrimaryButton onClick={resetExampleItem}>Add Example</PrimaryButton>
            )
          }
        >
          <div className="flex flex-col gap-4">
            <div className="text-sm text-muted">
              The example item appears first in runner and participant views for rounds using this game. It is presentation-only and stays off scoresheets and scoring.
            </div>

            {!exampleItemEnabled && (
              <div className="rounded-md border border-dashed border-border bg-panel2 px-4 py-6 text-sm text-muted">
                No example item configured.
              </div>
            )}

            {exampleItemEnabled && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Question Type
                    <select
                      className="h-10 px-3"
                      value={exampleItemDraft.question_type}
                      onChange={(event) =>
                        setExampleItemDraft((current) => ({
                          ...current,
                          question_type: event.target.value as 'text' | 'multiple_choice'
                        }))
                      }
                    >
                      <option value="text">Text / typed answer</option>
                      <option value="multiple_choice">Multiple choice</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Media Type
                    <select
                      className="h-10 px-3"
                      value={exampleItemDraft.media_type}
                      onChange={(event) =>
                        setExampleItemDraft((current) => ({
                          ...current,
                          media_type: event.target.value as '' | 'image' | 'audio',
                          media_key:
                            event.target.value === current.media_type || event.target.value
                              ? current.media_key
                              : ''
                        }))
                      }
                    >
                      <option value="">No media</option>
                      <option value="image">Image</option>
                      <option value="audio">Audio</option>
                    </select>
                  </label>
                </div>

                <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                  Prompt
                  <textarea
                    className="min-h-[96px] px-3 py-2"
                    value={exampleItemDraft.prompt}
                    onChange={(event) =>
                      setExampleItemDraft((current) => ({ ...current, prompt: event.target.value }))
                    }
                    placeholder={exampleItemDraft.media_type === 'audio' ? 'Optional for audio examples' : 'Enter the example prompt'}
                  />
                </label>

                {exampleItemDraft.question_type === 'multiple_choice' ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-3">
                      {exampleItemDraft.choices.map((choice, index) => (
                        <label key={`example-choice-${index}`} className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                          Choice {String.fromCharCode(65 + index)}
                          <input
                            className="h-10 px-3"
                            value={choice}
                            onChange={(event) =>
                              setExampleItemDraft((current) => {
                                const next = [...current.choices];
                                next[index] = event.target.value;
                                return { ...current, choices: next };
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                      Correct Choice
                      <select
                        className="h-10 px-3"
                        value={exampleItemDraft.correct_choice_index}
                        onChange={(event) =>
                          setExampleItemDraft((current) => ({
                            ...current,
                            correct_choice_index: Number(event.target.value)
                          }))
                        }
                      >
                        {exampleItemDraft.choices.map((_, index) => (
                          <option key={`example-correct-${index}`} value={index}>
                            {String.fromCharCode(65 + index)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-display uppercase tracking-[0.25em] text-muted">Answer Parts</div>
                      <SecondaryButton
                        onClick={() =>
                          setExampleItemDraft((current) => ({
                            ...current,
                            answer_parts: [...current.answer_parts, { label: `Answer ${current.answer_parts.length + 1}`, answer: '', points: 1 }]
                          }))
                        }
                      >
                        Add Part
                      </SecondaryButton>
                    </div>
                    {exampleItemDraft.answer_parts.map((part, index) => (
                      <div key={`example-part-${index}`} className="grid gap-3 rounded-md border border-border bg-panel2 p-3 md:grid-cols-[minmax(0,180px),minmax(0,1fr),120px,auto]">
                        <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                          Label
                          <input
                            className="h-10 px-3"
                            value={part.label}
                            onChange={(event) =>
                              setExampleItemDraft((current) => {
                                const next = [...current.answer_parts];
                                next[index] = { ...next[index], label: event.target.value };
                                return { ...current, answer_parts: next };
                              })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                          Answer
                          <input
                            className="h-10 px-3"
                            value={part.answer}
                            onChange={(event) =>
                              setExampleItemDraft((current) => {
                                const next = [...current.answer_parts];
                                next[index] = { ...next[index], answer: event.target.value };
                                return { ...current, answer_parts: next };
                              })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                          Points
                          <input
                            className="h-10 px-3"
                            type="number"
                            min={0}
                            value={part.points}
                            onChange={(event) =>
                              setExampleItemDraft((current) => {
                                const next = [...current.answer_parts];
                                next[index] = { ...next[index], points: Number(event.target.value) };
                                return { ...current, answer_parts: next };
                              })
                            }
                          />
                        </label>
                        <div className="flex items-end">
                          <SecondaryButton
                            onClick={() =>
                              setExampleItemDraft((current) => ({
                                ...current,
                                answer_parts:
                                  current.answer_parts.length === 1
                                    ? current.answer_parts
                                    : current.answer_parts.filter((_, partIndex) => partIndex !== index)
                              }))
                            }
                          >
                            Remove
                          </SecondaryButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border border-border bg-panel2 p-4">
                    <div className="text-xs font-display uppercase tracking-[0.25em] text-muted">Question Media</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        ref={exampleMediaInputRef}
                        type="file"
                        className="hidden"
                        accept={exampleItemDraft.media_type === 'audio' ? 'audio/*' : 'image/*'}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadExampleMedia(file, 'question');
                          event.target.value = '';
                        }}
                      />
                      <PrimaryButton
                        onClick={() => exampleMediaInputRef.current?.click()}
                        disabled={!exampleItemDraft.media_type || exampleMediaBusy === 'question'}
                      >
                        {exampleMediaBusy === 'question' ? 'Uploading…' : 'Upload Media'}
                      </PrimaryButton>
                      {exampleItemDraft.media_key && (
                        <SecondaryButton onClick={() => void removeExampleQuestionMedia()}>
                          Remove
                        </SecondaryButton>
                      )}
                    </div>
                    {exampleItemDraft.media_key && (
                      <div className="mt-3 text-xs text-muted">{exampleItemDraft.media_key}</div>
                    )}
                    {exampleItemDraft.media_type === 'image' && exampleItemDraft.media_key && (
                      <img
                        className="mt-3 max-h-52 rounded-md border border-border object-contain"
                        src={api.mediaUrl(exampleItemDraft.media_key)}
                        alt="Example media"
                      />
                    )}
                    {exampleItemDraft.media_type === 'audio' && exampleItemDraft.media_key && (
                      <audio className="mt-3 w-full" controls src={api.mediaUrl(exampleItemDraft.media_key)} />
                    )}
                  </div>

                  <div className="rounded-md border border-border bg-panel2 p-4">
                    <div className="text-xs font-display uppercase tracking-[0.25em] text-muted">Answer Audio</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        ref={exampleAnswerAudioInputRef}
                        type="file"
                        className="hidden"
                        accept="audio/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadExampleMedia(file, 'answer');
                          event.target.value = '';
                        }}
                      />
                      <PrimaryButton
                        onClick={() => exampleAnswerAudioInputRef.current?.click()}
                        disabled={exampleMediaBusy === 'answer'}
                      >
                        {exampleMediaBusy === 'answer' ? 'Uploading…' : 'Upload Answer Audio'}
                      </PrimaryButton>
                      {exampleItemDraft.audio_answer_key && (
                        <SecondaryButton onClick={() => void removeExampleAnswerAudio()}>
                          Remove
                        </SecondaryButton>
                      )}
                    </div>
                    {exampleItemDraft.audio_answer_key && (
                      <>
                        <div className="mt-3 text-xs text-muted">{exampleItemDraft.audio_answer_key}</div>
                        <audio className="mt-3 w-full" controls src={api.mediaUrl(exampleItemDraft.audio_answer_key)} />
                      </>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Media Caption
                    <input
                      className="h-10 px-3"
                      value={exampleItemDraft.media_caption}
                      onChange={(event) =>
                        setExampleItemDraft((current) => ({ ...current, media_caption: event.target.value }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Fun Fact
                    <textarea
                      className="min-h-[96px] px-3 py-2"
                      value={exampleItemDraft.fun_fact}
                      onChange={(event) =>
                        setExampleItemDraft((current) => ({ ...current, fun_fact: event.target.value }))
                      }
                    />
                  </label>
                </div>

                {(exampleItemBuild.error || exampleMediaError) && (
                  <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
                    {exampleItemBuild.error ?? exampleMediaError}
                  </div>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
