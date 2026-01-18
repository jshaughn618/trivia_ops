import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import { Table } from '../components/Table';
import type { EditionItem, GameEdition } from '../types';

const emptyItem = {
  prompt: '',
  answer: '',
  answer_a: '',
  answer_b: '',
  fun_fact: '',
  media_caption: ''
};

export function EditionDetailPage() {
  const { editionId } = useParams();
  const navigate = useNavigate();
  const [edition, setEdition] = useState<GameEdition | null>(null);
  const [items, setItems] = useState<EditionItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState({ ...emptyItem });
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('draft');
  const [tags, setTags] = useState('');
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const [gameTypeId, setGameTypeId] = useState('');
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineOptions, setRefineOptions] = useState<string[]>([]);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineSeed, setRefineSeed] = useState('');

  const load = async () => {
    if (!editionId) return;
    const [editionRes, itemsRes] = await Promise.all([
      api.getEdition(editionId),
      api.listEditionItems(editionId)
    ]);
    if (editionRes.ok) {
      setEdition(editionRes.data);
      setTitle(editionRes.data.title);
      setStatus(editionRes.data.status);
      setTags(editionRes.data.tags_csv ?? '');
      setTheme(editionRes.data.theme ?? '');
      setDescription(editionRes.data.description ?? '');
      const gameRes = await api.getGame(editionRes.data.game_id);
      if (gameRes.ok) setGameTypeId(gameRes.data.game_type_id);
    }
    if (itemsRes.ok) {
      setItems(itemsRes.data.sort((a, b) => a.ordinal - b.ordinal));
    }
  };

  useEffect(() => {
    load();
  }, [editionId]);

  const nextOrdinal = useMemo(() => {
    return items.length === 0 ? 1 : Math.max(...items.map((item) => item.ordinal)) + 1;
  }, [items]);

  const handleEditionUpdate = async () => {
    if (!editionId) return;
    const res = await api.updateEdition(editionId, {
      title,
      status,
      tags_csv: tags,
      theme,
      description
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
    const res = await api.createEditionItem(editionId, {
      prompt: itemDraft.prompt,
      answer: itemDraft.answer,
      answer_a: itemDraft.answer_a || null,
      answer_b: itemDraft.answer_b || null,
      fun_fact: itemDraft.fun_fact || null,
      media_caption: itemDraft.media_caption || null,
      ordinal: nextOrdinal
    });
    if (res.ok) {
      setItemDraft({ ...emptyItem });
      load();
    }
  };

  const startEdit = (item: EditionItem) => {
    setEditingId(item.id);
    setItemDraft({
      prompt: item.prompt,
      answer: item.answer,
      answer_a: item.answer_a ?? '',
      answer_b: item.answer_b ?? '',
      fun_fact: item.fun_fact ?? '',
      media_caption: item.media_caption ?? ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setItemDraft({ ...emptyItem });
  };

  const saveEdit = async (item: EditionItem) => {
    const res = await api.updateEditionItem(item.id, {
      prompt: itemDraft.prompt,
      answer: itemDraft.answer,
      answer_a: itemDraft.answer_a || null,
      answer_b: itemDraft.answer_b || null,
      fun_fact: itemDraft.fun_fact || null,
      media_caption: itemDraft.media_caption || null
    });
    if (res.ok) {
      cancelEdit();
      load();
    }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const current = items[index];
    const target = items[targetIndex];
    await Promise.all([
      api.updateEditionItem(current.id, { ordinal: target.ordinal }),
      api.updateEditionItem(target.id, { ordinal: current.ordinal })
    ]);
    load();
  };

  const handleUpload = async (item: EditionItem, file: File) => {
    const kind = file.type.startsWith('audio/') ? 'audio' : 'image';
    const uploadRes = await api.uploadMedia(file, kind);
    if (uploadRes.ok) {
      await api.updateEditionItem(item.id, {
        media_type: uploadRes.data.media_type,
        media_key: uploadRes.data.key,
        media_caption: item.media_caption
      });
      load();
    }
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

  if (!edition) {
    return (
      <AppShell title="Edition Detail">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Edition Detail">
      <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
        <Panel title="Edition Info">
          <div className="grid gap-4">
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Title
              <input className="h-10 px-3" value={title} onChange={(event) => setTitle(event.target.value)} />
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
              Tags
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
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={handleEditionUpdate}>Update</PrimaryButton>
              <DangerButton onClick={handleDeleteEdition}>Delete</DangerButton>
              <SecondaryButton onClick={() => navigate('/editions')}>Back</SecondaryButton>
            </div>
          </div>
        </Panel>
        <Panel title="Items">
          <Table headers={["#", "Prompt", "Answer", "Media", "Actions"]}>
            {items.map((item, index) => (
              <tr key={item.id} className="bg-panel">
                <td className="px-3 py-2 text-xs text-muted">{item.ordinal}</td>
                <td className="px-3 py-2 text-xs text-text">{item.prompt}</td>
                <td className="px-3 py-2 text-xs text-text">
                  {item.answer || (item.answer_a && item.answer_b
                    ? `A: ${item.answer_a} / B: ${item.answer_b}`
                    : '')}
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {item.media_key ? item.media_type : 'None'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton onClick={() => moveItem(index, -1)}>Up</SecondaryButton>
                    <SecondaryButton onClick={() => moveItem(index, 1)}>Down</SecondaryButton>
                    <SecondaryButton onClick={() => startEdit(item)}>Edit</SecondaryButton>
                    <DangerButton onClick={() => api.deleteEditionItem(item.id).then(load)}>
                      Delete
                    </DangerButton>
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleUpload(item, file);
                      }}
                      className="text-xs text-muted"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <div className="mt-4 border-t-2 border-border pt-4">
            <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Add Item</div>
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
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Answer
                <input
                  className="h-10 px-3"
                  value={itemDraft.answer}
                  onChange={(event) => setItemDraft((draft) => ({ ...draft, answer: event.target.value }))}
                  disabled={gameTypeId === 'audio'}
                />
              </label>
              {gameTypeId === 'audio' && (
                <>
                  <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                    Answer A
                    <input
                      className="h-10 px-3"
                      value={itemDraft.answer_a}
                      onChange={(event) => setItemDraft((draft) => ({ ...draft, answer_a: event.target.value }))}
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
                Fun Fact
                <textarea
                  className="min-h-[70px] px-3 py-2"
                  value={itemDraft.fun_fact}
                  onChange={(event) => setItemDraft((draft) => ({ ...draft, fun_fact: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Media Caption
                <input
                  className="h-10 px-3"
                  value={itemDraft.media_caption}
                  onChange={(event) => setItemDraft((draft) => ({ ...draft, media_caption: event.target.value }))}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {editingId ? (
                  <>
                    <PrimaryButton onClick={() => {
                      const item = items.find((current) => current.id === editingId);
                      if (item) saveEdit(item);
                    }}>
                      Save Changes
                    </PrimaryButton>
                    <SecondaryButton onClick={cancelEdit}>Cancel</SecondaryButton>
                  </>
                ) : (
                  <PrimaryButton onClick={handleCreateItem}>Add Item</PrimaryButton>
                )}
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
        </Panel>
      </div>
    </AppShell>
  );
}
