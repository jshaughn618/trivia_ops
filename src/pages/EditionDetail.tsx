import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import type { EditionItem, Game, GameEdition } from '../types';

const emptyItem = {
  prompt: '',
  answer: '',
  answer_a: '',
  answer_b: '',
  answer_a_label: '',
  answer_b_label: '',
  fun_fact: '',
  media_key: '',
  media_type: ''
};

export function EditionDetailPage() {
  const { editionId } = useParams();
  const navigate = useNavigate();
  const [edition, setEdition] = useState<GameEdition | null>(null);
  const [items, setItems] = useState<EditionItem[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [itemDraft, setItemDraft] = useState({ ...emptyItem });
  const [status, setStatus] = useState('draft');
  const [tags, setTags] = useState('');
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const [gameTypeId, setGameTypeId] = useState('');
  const [gameId, setGameId] = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineOptions, setRefineOptions] = useState<string[]>([]);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineSeed, setRefineSeed] = useState('');
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [factLoading, setFactLoading] = useState(false);
  const [factError, setFactError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const editUploadRef = useRef<HTMLInputElement | null>(null);
  const newUploadRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    if (!editionId) return;
    const [editionRes, itemsRes, gamesRes] = await Promise.all([
      api.getEdition(editionId),
      api.listEditionItems(editionId),
      api.listGames()
    ]);
    if (editionRes.ok) {
      setEdition(editionRes.data);
      setStatus(editionRes.data.status);
      setTags(editionRes.data.tags_csv ?? '');
      setTheme(editionRes.data.theme ?? '');
      setDescription(editionRes.data.description ?? '');
      setGameId(editionRes.data.game_id);
      const gameRes = await api.getGame(editionRes.data.game_id);
      if (gameRes.ok) setGameTypeId(gameRes.data.game_type_id);
    }
    if (itemsRes.ok) {
      setItems(itemsRes.data.sort((a, b) => a.ordinal - b.ordinal));
    }
    if (gamesRes.ok) {
      setGames(gamesRes.data);
    }
  };

  useEffect(() => {
    load();
  }, [editionId]);

  const nextOrdinal = useMemo(() => {
    return items.length === 0 ? 1 : Math.max(...items.map((item) => item.ordinal)) + 1;
  }, [items]);

  const orderedItems = useMemo(() => {
    return [...items].sort((a, b) => a.ordinal - b.ordinal);
  }, [items]);

  const filteredGames = useMemo(() => {
    if (!gameTypeId) return games;
    return games.filter((game) => game.game_type_id === gameTypeId);
  }, [games, gameTypeId]);

  const handleEditionUpdate = async () => {
    if (!editionId || !gameId) return;
    const res = await api.updateEdition(editionId, {
      title: theme,
      status,
      tags_csv: tags,
      theme,
      description,
      game_id: gameId
    });
    if (res.ok) setEdition(res.data);
  };

  const handleDeleteEdition = async () => {
    if (!editionId) return;
    await api.deleteEdition(editionId);
    navigate('/editions');
  };

  const handleCreateItem = async () => {
    if (!editionId) return;
    if (!itemDraft.prompt.trim()) return;
    if (gameTypeId === 'audio') {
      if (!itemDraft.answer_a.trim() || !itemDraft.answer_b.trim()) return;
    } else if (!itemDraft.answer.trim()) {
      return;
    }
    const answerValue = gameTypeId === 'audio' ? undefined : itemDraft.answer.trim();
    const res = await api.createEditionItem(editionId, {
      prompt: itemDraft.prompt,
      answer: answerValue,
      answer_a: itemDraft.answer_a || null,
      answer_b: itemDraft.answer_b || null,
      answer_a_label: itemDraft.answer_a_label || null,
      answer_b_label: itemDraft.answer_b_label || null,
      fun_fact: itemDraft.fun_fact || null,
      media_type: itemDraft.media_type || null,
      media_key: itemDraft.media_key || null,
      ordinal: nextOrdinal
    });
    if (res.ok) {
      setItemDraft({ ...emptyItem });
      setActiveItemId(null);
      load();
    }
  };

  const startEdit = (item: EditionItem) => {
    setActiveItemId(item.id);
    setRefineOpen(false);
    setRefineOptions([]);
    setRefineError(null);
    setItemDraft({
      prompt: item.prompt,
      answer: item.answer,
      answer_a: item.answer_a ?? '',
      answer_b: item.answer_b ?? '',
      answer_a_label: item.answer_a_label ?? '',
      answer_b_label: item.answer_b_label ?? '',
      fun_fact: item.fun_fact ?? '',
      media_type: item.media_type ?? '',
      media_key: item.media_key ?? ''
    });
  };

  const cancelEdit = () => {
    setActiveItemId(null);
    setItemDraft({ ...emptyItem });
  };

  const saveEdit = async (item: EditionItem) => {
    if (gameTypeId !== 'audio' && !itemDraft.answer.trim()) return;
    const answerValue = gameTypeId === 'audio' ? undefined : itemDraft.answer.trim();
    const res = await api.updateEditionItem(item.id, {
      prompt: itemDraft.prompt,
      answer: answerValue,
      answer_a: itemDraft.answer_a || null,
      answer_b: itemDraft.answer_b || null,
      answer_a_label: itemDraft.answer_a_label || null,
      answer_b_label: itemDraft.answer_b_label || null,
      fun_fact: itemDraft.fun_fact || null,
      media_type: itemDraft.media_type || null,
      media_key: itemDraft.media_key || null
    });
    if (res.ok) {
      cancelEdit();
      load();
    }
  };

  const reorderItems = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ordered = [...items].sort((a, b) => a.ordinal - b.ordinal);
    const fromIndex = ordered.findIndex((item) => item.id === sourceId);
    const toIndex = ordered.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    const updated = ordered.map((item, index) => ({ ...item, ordinal: index + 1 }));
    setItems(updated);
    await Promise.all(
      updated.map((item) => api.updateEditionItem(item.id, { ordinal: item.ordinal }))
    );
  };

  const handleUpload = async (item: EditionItem, file: File) => {
    if (gameTypeId === 'audio' && file.type !== 'audio/mpeg') {
      setMediaError('Audio rounds require MP3 files.');
      return;
    }
    const kind = gameTypeId === 'audio' ? 'audio' : file.type.startsWith('audio/') ? 'audio' : 'image';
    setMediaUploading(true);
    setMediaError(null);
    const uploadRes = await api.uploadMedia(file, kind);
    setMediaUploading(false);
    if (uploadRes.ok) {
      await api.updateEditionItem(item.id, {
        media_type: uploadRes.data.media_type,
        media_key: uploadRes.data.key
      });
      setItemDraft((draft) => ({
        ...draft,
        media_type: uploadRes.data.media_type,
        media_key: uploadRes.data.key
      }));
      load();
    } else {
      setMediaError(uploadRes.error.message);
    }
  };

  const handleDraftUpload = async (file: File) => {
    if (gameTypeId === 'audio' && file.type !== 'audio/mpeg') {
      setMediaError('Audio rounds require MP3 files.');
      return;
    }
    const kind = gameTypeId === 'audio' ? 'audio' : file.type.startsWith('audio/') ? 'audio' : 'image';
    setMediaUploading(true);
    setMediaError(null);
    const uploadRes = await api.uploadMedia(file, kind);
    setMediaUploading(false);
    if (uploadRes.ok) {
      setItemDraft((draft) => ({
        ...draft,
        media_type: uploadRes.data.media_type,
        media_key: uploadRes.data.key
      }));
    } else {
      setMediaError(uploadRes.error.message);
    }
  };

  const startNewItem = () => {
    setActiveItemId('new');
    setRefineOpen(false);
    setRefineOptions([]);
    setRefineError(null);
    setItemDraft({ ...emptyItem });
  };

  const startRefine = async () => {
    if (!itemDraft.prompt.trim()) return;
    setRefineOpen(true);
    setRefineLoading(true);
    setRefineError(null);
    setRefineSeed(itemDraft.prompt.trim());

    const prompt = `Rewrite the following trivia question into 5 distinct, clean pub-trivia ready versions. Return as a numbered list only.\n\nQuestion: ${itemDraft.prompt.trim()}`;
    const res = await api.aiGenerate({ prompt, max_output_tokens: 300 });
    setRefineLoading(false);
    if (!res.ok) {
      setRefineError(res.error.message);
      setRefineOptions([]);
      return;
    }
    const options = res.data.text
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[\).]\s*/, '').trim())
      .filter(Boolean);
    setRefineOptions(options.slice(0, 5));
  };

  const applyRefine = (value: string) => {
    setItemDraft((draft) => ({ ...draft, prompt: value }));
    setRefineOpen(false);
  };

  const keepOriginal = () => {
    setItemDraft((draft) => ({ ...draft, prompt: refineSeed || draft.prompt }));
    setRefineOpen(false);
  };

  const generateMeta = async () => {
    if (!theme.trim() && !description.trim() && items.length === 0) return;
    setMetaLoading(true);
    setMetaError(null);
    const itemLines = items
      .slice(0, 12)
      .map((item, index) => {
        const alt = `${item.answer_a ?? ''} / ${item.answer_b ?? ''}`.trim();
        return `${index + 1}. ${item.prompt} | ${item.answer || alt}`;
      })
      .join('\n');

    const prompt = `Based on the trivia edition theme and questions, generate:\n- Description: 1-2 sentences.\n- Theme: short phrase.\n- Tags: 6 concise, comma-separated lowercase tags.\nReturn exactly in this format:\nDescription: ...\nTheme: ...\nTags: tag1, tag2, tag3, tag4, tag5, tag6\n\nTheme: ${theme}\nQuestions:\n${itemLines}`;
    const res = await api.aiGenerate({ prompt, max_output_tokens: 200 });
    setMetaLoading(false);
    if (!res.ok) {
      setMetaError(res.error.message);
      return;
    }
    const lines = res.data.text.split('\n').map((line) => line.trim());
    const descriptionLine = lines.find((line) => line.toLowerCase().startsWith('description:'));
    const themeLine = lines.find((line) => line.toLowerCase().startsWith('theme:'));
    const tagsLine = lines.find((line) => line.toLowerCase().startsWith('tags:'));
    if (descriptionLine) setDescription(descriptionLine.replace(/^[^:]*:/, '').trim());
    if (themeLine) setTheme(themeLine.replace(/^[^:]*:/, '').trim());
    if (tagsLine) setTags(tagsLine.replace(/^[^:]*:/, '').trim());
  };

  const generateAnswer = async () => {
    if (!itemDraft.prompt.trim()) return;
    setAnswerLoading(true);
    setAnswerError(null);
    const prompt = `Provide a concise, correct pub-trivia answer for the question below. Respond with only the answer.\n\nQuestion: ${itemDraft.prompt.trim()}`;
    const res = await api.aiGenerate({ prompt, max_output_tokens: 80 });
    setAnswerLoading(false);
    if (!res.ok) {
      setAnswerError(res.error.message);
      return;
    }
    const line = res.data.text.split('\n')[0] ?? '';
    setItemDraft((draft) => ({ ...draft, answer: line.trim() }));
  };

  const generateFunFact = async () => {
    if (!itemDraft.prompt.trim() && !itemDraft.answer.trim()) return;
    setFactLoading(true);
    setFactError(null);
    const prompt = `Write one short, interesting pub-trivia fun fact related to the question and answer. Keep it under 20 words.\n\nQuestion: ${itemDraft.prompt.trim()}\nAnswer: ${itemDraft.answer.trim()}`;
    const res = await api.aiGenerate({ prompt, max_output_tokens: 80 });
    setFactLoading(false);
    if (!res.ok) {
      setFactError(res.error.message);
      return;
    }
    const line = res.data.text.split('\n')[0] ?? '';
    setItemDraft((draft) => ({ ...draft, fun_fact: line.trim() }));
  };

  const parseBulkJson = (text: string) => {
    const trimmed = text.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/, '').trim();
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    const jsonText = start >= 0 && end >= 0 ? trimmed.slice(start, end + 1) : trimmed;
    return JSON.parse(jsonText) as Array<{
      prompt: string;
      answer?: string;
      answer_a?: string;
      answer_b?: string;
      answer_a_label?: string;
      answer_b_label?: string;
      fun_fact?: string;
    }>;
  };

  const handleBulkGenerate = async () => {
    if (!bulkText.trim()) return;
    setBulkLoading(true);
    setBulkError(null);
    setBulkResult(null);
    setActiveItemId(null);
    const formatNote =
      gameTypeId === 'audio'
        ? 'Each item must include answer_a and answer_b. If labels are provided, include answer_a_label and answer_b_label.'
        : 'Each item must include answer.';
    const prompt = `Parse the following text into trivia items without altering any question or answer text. Do not rewrite or correct. Return ONLY valid JSON array. ${formatNote}\n\nOutput format:\n[{\n  \"prompt\": \"...\",\n  \"answer\": \"...\",\n  \"answer_a\": \"...\",\n  \"answer_b\": \"...\",\n  \"answer_a_label\": \"...\",\n  \"answer_b_label\": \"...\"\n}]\n\nInput:\n${bulkText.trim()}`;
    const res = await api.aiGenerate({ prompt, max_output_tokens: 900 });
    setBulkLoading(false);
    if (!res.ok) {
      setBulkError(res.error.message);
      return;
    }

    let parsed: ReturnType<typeof parseBulkJson>;
    try {
      parsed = parseBulkJson(res.data.text);
    } catch (error) {
      setBulkError('Could not parse the AI response. Try a simpler input block.');
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      setBulkError('No items were parsed.');
      return;
    }

    const baseOrdinal = nextOrdinal;
    for (let index = 0; index < parsed.length; index += 1) {
      const entry = parsed[index];
      if (!entry.prompt) continue;
      if (gameTypeId === 'audio') {
        if (!entry.answer_a || !entry.answer_b) continue;
      } else if (!entry.answer) {
        continue;
      }
      await api.createEditionItem(editionId!, {
        prompt: entry.prompt,
        answer: entry.answer ?? '',
        answer_a: entry.answer_a ?? null,
        answer_b: entry.answer_b ?? null,
        answer_a_label: entry.answer_a_label ?? null,
        answer_b_label: entry.answer_b_label ?? null,
        fun_fact: entry.fun_fact ?? null,
        ordinal: baseOrdinal + index
      });
    }
    setBulkResult(`Added ${parsed.length} items`);
    setBulkText('');
    setBulkOpen(false);
    load();
  };

  if (!edition) {
    return (
      <AppShell title="Edition Detail">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title={theme ? `Edition Detail — ${theme}` : 'Edition Detail'}>
      <div className="flex flex-col gap-4">
        <Panel
          title="Edition Info"
          action={
            <button
              type="button"
              onClick={() => setInfoOpen((prev) => !prev)}
              className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
            >
              {infoOpen ? 'Collapse' : 'Expand'}
            </button>
          }
        >
          {infoOpen && (
            <div className="grid gap-4">
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Game
              <select
                className="h-10 px-3"
                value={gameId}
                onChange={(event) => setGameId(event.target.value)}
              >
                {filteredGames.length === 0 && <option value="">No matching games</option>}
                {filteredGames.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Status
              <select className="h-10 px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              <span className="flex items-center justify-between">
                Tags
                <button
                  type="button"
                  onClick={generateMeta}
                  className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                  disabled={metaLoading}
                >
                  {metaLoading ? 'Generating' : 'Generate Details'}
                </button>
              </span>
              <input className="h-10 px-3" value={tags} onChange={(event) => setTags(event.target.value)} />
              {metaError && <span className="text-[10px] tracking-[0.2em] text-danger">{metaError}</span>}
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
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={handleEditionUpdate}>Update</PrimaryButton>
              <DangerButton onClick={handleDeleteEdition}>Delete</DangerButton>
              <SecondaryButton onClick={() => navigate('/editions')}>Back</SecondaryButton>
            </div>
            </div>
          )}
        </Panel>
        <Panel
          title="Items"
          action={
            <SecondaryButton onClick={() => setBulkOpen((prev) => !prev)}>
              {bulkOpen ? 'Close Import' : 'Bulk Add'}
            </SecondaryButton>
          }
        >
          {bulkOpen && (
            <div className="mb-4 border-2 border-border bg-panel2 p-3">
              <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Bulk Import</div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted">
                Paste question/answer blocks. AI will parse without rewriting.
              </div>
              <textarea
                className="mt-3 min-h-[140px] w-full px-3 py-2"
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                placeholder="Q: ... A: ... (or one per line)"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <PrimaryButton onClick={handleBulkGenerate} disabled={bulkLoading}>
                  {bulkLoading ? 'Generating' : 'Generate'}
                </PrimaryButton>
                <SecondaryButton onClick={() => setBulkOpen(false)}>Cancel</SecondaryButton>
              </div>
              {bulkError && (
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-danger">{bulkError}</div>
              )}
              {bulkResult && (
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">{bulkResult}</div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {orderedItems.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No items yet.</div>
            )}
            {orderedItems.map((item, index) => (
              <div key={item.id} className="flex flex-col gap-3">
                <div
                  className={`border-2 ${activeItemId === item.id ? 'border-accent' : 'border-border'} bg-panel2 p-3`}
                  draggable
                  onDragStart={() => setDraggedId(item.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedId) {
                      reorderItems(draggedId, item.id);
                      setDraggedId(null);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">
                      Item {index + 1}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                      >
                        Edit Item
                      </button>
                      <button
                        type="button"
                        onClick={() => api.deleteEditionItem(item.id).then(load)}
                        className="border-2 border-danger px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-danger hover:border-[#9d2a24]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-text">{item.prompt}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                    {item.answer || (item.answer_a && item.answer_b
                      ? `${item.answer_a_label ? `${item.answer_a_label}: ` : 'A: '}${item.answer_a} / ${item.answer_b_label ? `${item.answer_b_label}: ` : 'B: '}${item.answer_b}`
                      : 'Answer missing')}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted">
                    {item.media_key ? `${item.media_type} attached` : 'No media'} • Drag to reorder
                  </div>
                </div>
                {activeItemId === item.id && (
                  <div className="border-2 border-border bg-panel p-3">
                    <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">
                      Edit Item {index + 1}
                    </div>
                    <div className="mt-3 grid gap-3">
                      <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                        <span className="flex items-center justify-between">
                          Prompt
                          <button
                            type="button"
                            onClick={startRefine}
                            className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                          >
                            Refine
                          </button>
                        </span>
                        <input
                          className="h-10 px-3"
                          value={itemDraft.prompt}
                          onChange={(event) => setItemDraft((draft) => ({ ...draft, prompt: event.target.value }))}
                        />
                      </label>
                      {gameTypeId !== 'audio' && (
                        <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                          <span className="flex items-center justify-between">
                            Answer
                            <button
                              type="button"
                              onClick={generateAnswer}
                              className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                              disabled={answerLoading}
                            >
                              {answerLoading ? 'Generating' : 'Generate'}
                            </button>
                          </span>
                          <input
                            className="h-10 px-3"
                            value={itemDraft.answer}
                            onChange={(event) => setItemDraft((draft) => ({ ...draft, answer: event.target.value }))}
                          />
                          {answerError && <span className="text-[10px] tracking-[0.2em] text-danger">{answerError}</span>}
                        </label>
                      )}
                      {gameTypeId === 'audio' && (
                        <>
                          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                            Answer A Label
                            <input
                              className="h-10 px-3"
                              value={itemDraft.answer_a_label}
                              onChange={(event) =>
                                setItemDraft((draft) => ({ ...draft, answer_a_label: event.target.value }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                            Answer A
                            <input
                              className="h-10 px-3"
                              value={itemDraft.answer_a}
                              onChange={(event) => setItemDraft((draft) => ({ ...draft, answer_a: event.target.value }))}
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                            Answer B Label
                            <input
                              className="h-10 px-3"
                              value={itemDraft.answer_b_label}
                              onChange={(event) =>
                                setItemDraft((draft) => ({ ...draft, answer_b_label: event.target.value }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                            Answer B
                            <input
                              className="h-10 px-3"
                              value={itemDraft.answer_b}
                              onChange={(event) => setItemDraft((draft) => ({ ...draft, answer_b: event.target.value }))}
                            />
                          </label>
                        </>
                      )}
                      <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                        <span className="flex items-center justify-between">
                          Fun Fact
                          <button
                            type="button"
                            onClick={generateFunFact}
                            className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                            disabled={factLoading}
                          >
                            {factLoading ? 'Generating' : 'Generate'}
                          </button>
                        </span>
                        <textarea
                          className="min-h-[70px] px-3 py-2"
                          value={itemDraft.fun_fact}
                          onChange={(event) => setItemDraft((draft) => ({ ...draft, fun_fact: event.target.value }))}
                        />
                        {factError && <span className="text-[10px] tracking-[0.2em] text-danger">{factError}</span>}
                      </label>
                      <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                        Media Upload
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={editUploadRef}
                            type="file"
                            accept={gameTypeId === 'audio' ? 'audio/mpeg' : 'image/png,image/jpeg,image/webp'}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) handleUpload(item, file);
                            }}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => editUploadRef.current?.click()}
                            className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                          >
                            {mediaUploading ? 'Uploading' : 'Upload MP3'}
                          </button>
                          {itemDraft.media_key && (
                            <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Audio attached</span>
                          )}
                        </div>
                        {gameTypeId === 'audio' && (
                          <span className="text-[10px] tracking-[0.2em] text-muted">MP3 only for audio rounds.</span>
                        )}
                        {mediaError && <span className="text-[10px] tracking-[0.2em] text-danger">{mediaError}</span>}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <PrimaryButton onClick={() => saveEdit(item)}>Save</PrimaryButton>
                        <SecondaryButton onClick={cancelEdit}>Cancel</SecondaryButton>
                      </div>
                      {refineOpen && (
                        <div className="border-2 border-border bg-panel2 p-3">
                          <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Refined Prompts</div>
                          {refineLoading && (
                            <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">Generating…</div>
                          )}
                          {refineError && (
                            <div className="mt-2 text-xs uppercase tracking-[0.2em] text-danger">{refineError}</div>
                          )}
                          <div className="mt-3 flex flex-col gap-2">
                            {refineOptions.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => applyRefine(option)}
                                className="border-2 border-border bg-panel px-3 py-2 text-left text-xs uppercase tracking-[0.2em] text-text hover:border-accent"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={startRefine}
                              className="border-2 border-border px-3 py-2 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                            >
                              Generate Again
                            </button>
                            <button
                              type="button"
                              onClick={keepOriginal}
                              className="border-2 border-border px-3 py-2 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                            >
                              Keep Original
                            </button>
                            <button
                              type="button"
                              onClick={() => setRefineOpen(false)}
                              className="border-2 border-border px-3 py-2 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {activeItemId === 'new' && (
            <div className="mt-4 border-2 border-border bg-panel p-3">
              <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">New Item</div>
              <div className="mt-3 grid gap-3">
                <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                  <span className="flex items-center justify-between">
                    Prompt
                  <button
                    type="button"
                    onClick={startRefine}
                    className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                  >
                    Refine
                  </button>
                </span>
                <input
                  className="h-10 px-3"
                  value={itemDraft.prompt}
                  onChange={(event) => setItemDraft((draft) => ({ ...draft, prompt: event.target.value }))}
                />
              </label>
              {gameTypeId !== 'audio' && (
                <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                  <span className="flex items-center justify-between">
                    Answer
                    <button
                      type="button"
                      onClick={generateAnswer}
                      className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                      disabled={answerLoading}
                    >
                      {answerLoading ? 'Generating' : 'Generate'}
                    </button>
                  </span>
                  <input
                    className="h-10 px-3"
                    value={itemDraft.answer}
                    onChange={(event) => setItemDraft((draft) => ({ ...draft, answer: event.target.value }))}
                  />
                  {answerError && <span className="text-[10px] tracking-[0.2em] text-danger">{answerError}</span>}
                </label>
              )}
              {gameTypeId === 'audio' && (
                <>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Answer A Label
                    <input
                      className="h-10 px-3"
                      value={itemDraft.answer_a_label}
                      onChange={(event) =>
                        setItemDraft((draft) => ({ ...draft, answer_a_label: event.target.value }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Answer A
                    <input
                      className="h-10 px-3"
                      value={itemDraft.answer_a}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, answer_a: event.target.value }))}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Answer B Label
                    <input
                      className="h-10 px-3"
                      value={itemDraft.answer_b_label}
                      onChange={(event) =>
                        setItemDraft((draft) => ({ ...draft, answer_b_label: event.target.value }))
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Answer B
                    <input
                      className="h-10 px-3"
                      value={itemDraft.answer_b}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, answer_b: event.target.value }))}
                    />
                  </label>
                </>
              )}
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                <span className="flex items-center justify-between">
                  Fun Fact
                  <button
                    type="button"
                    onClick={generateFunFact}
                    className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                    disabled={factLoading}
                  >
                    {factLoading ? 'Generating' : 'Generate'}
                  </button>
                </span>
                <textarea
                  className="min-h-[70px] px-3 py-2"
                  value={itemDraft.fun_fact}
                  onChange={(event) => setItemDraft((draft) => ({ ...draft, fun_fact: event.target.value }))}
                />
                {factError && <span className="text-[10px] tracking-[0.2em] text-danger">{factError}</span>}
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Media Upload
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={newUploadRef}
                    type="file"
                    accept={gameTypeId === 'audio' ? 'audio/mpeg' : 'image/png,image/jpeg,image/webp'}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleDraftUpload(file);
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => newUploadRef.current?.click()}
                    className="border-2 border-border px-3 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                  >
                    {mediaUploading ? 'Uploading' : 'Upload MP3'}
                  </button>
                  {itemDraft.media_key && (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Audio attached</span>
                  )}
                </div>
                {gameTypeId === 'audio' && (
                  <span className="text-[10px] tracking-[0.2em] text-muted">MP3 only for audio rounds.</span>
                )}
                {mediaError && <span className="text-[10px] tracking-[0.2em] text-danger">{mediaError}</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={handleCreateItem}>Save</PrimaryButton>
                <SecondaryButton onClick={cancelEdit}>Cancel</SecondaryButton>
              </div>
              {refineOpen && (
                <div className="border-2 border-border bg-panel2 p-3">
                  <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Refined Prompts</div>
                  {refineLoading && (
                    <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">Generating…</div>
                  )}
                  {refineError && (
                    <div className="mt-2 text-xs uppercase tracking-[0.2em] text-danger">{refineError}</div>
                  )}
                  <div className="mt-3 flex flex-col gap-2">
                    {refineOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => applyRefine(option)}
                        className="border-2 border-border bg-panel px-3 py-2 text-left text-xs uppercase tracking-[0.2em] text-text hover:border-accent"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={startRefine}
                      className="border-2 border-border px-3 py-2 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                    >
                      Generate Again
                    </button>
                    <button
                      type="button"
                      onClick={keepOriginal}
                      className="border-2 border-border px-3 py-2 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                    >
                      Keep Original
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefineOpen(false)}
                      className="border-2 border-border px-3 py-2 text-[10px] font-display uppercase tracking-[0.3em] text-muted hover:border-accent hover:text-text"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>
          )}
          <div className="mt-4 border-t-2 border-border pt-4">
            <SecondaryButton onClick={startNewItem}>New Item</SecondaryButton>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
