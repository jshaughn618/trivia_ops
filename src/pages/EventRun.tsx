import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import { StampBadge } from '../components/StampBadge';
import { logError, logInfo } from '../lib/log';
import type { EditionItem, Event, EventRound, Game, GameEdition } from '../types';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export function EventRunPage() {
  const { eventId } = useParams();
  const query = useQuery();
  const [event, setEvent] = useState<Event | null>(null);
  const [rounds, setRounds] = useState<EventRound[]>([]);
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [roundId, setRoundId] = useState('');
  const [items, setItems] = useState<EditionItem[]>([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showFact, setShowFact] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const load = async () => {
    if (!eventId) return;
    const [eventRes, roundsRes, editionsRes, gamesRes] = await Promise.all([
      api.getEvent(eventId),
      api.listEventRounds(eventId),
      api.listEditions(),
      api.listGames()
    ]);
    if (eventRes.ok) setEvent(eventRes.data);
    if (roundsRes.ok) setRounds(roundsRes.data);
    if (editionsRes.ok) setEditions(editionsRes.data);
    if (gamesRes.ok) setGames(gamesRes.data);
    const preselect = query.get('round') ?? '';
    if (preselect) setRoundId(preselect);
  };

  const loadItems = async (selectedRoundId: string) => {
    if (!selectedRoundId) return;
    const res = await api.listEventRoundItems(selectedRoundId);
    if (res.ok) {
      const sorted = res.data.sort((a, b) => a.ordinal - b.ordinal);
      setItems(sorted);
      setIndex(0);
      setShowAnswer(false);
      setShowFact(false);
      if (eventId) {
        await api.updateLiveState(eventId, {
          active_round_id: selectedRoundId,
          current_item_ordinal: sorted[0]?.ordinal ?? null,
          reveal_answer: false,
          reveal_fun_fact: false
        });
      }
    }
  };

  useEffect(() => {
    load();
  }, [eventId]);

  useEffect(() => {
    if (roundId) loadItems(roundId);
  }, [roundId]);

  const editionById = useMemo(() => {
    return Object.fromEntries(editions.map((edition) => [edition.id, edition]));
  }, [editions]);

  const gameById = useMemo(() => {
    return Object.fromEntries(games.map((game) => [game.id, game]));
  }, [games]);

  const roundDisplay = (round: EventRound) => {
    const edition = editionById[round.edition_id];
    const game = edition ? gameById[edition.game_id] : null;
    const editionLabel = edition?.theme ?? edition?.title ?? 'Edition';
    const gameLabel = game?.name ?? 'Game';
    return {
      title: `Round ${round.round_number}`,
      detail: `${gameLabel} — ${editionLabel}`
    };
  };

  const activeRound = useMemo(() => rounds.find((round) => round.id === roundId) ?? null, [rounds, roundId]);
  const item = items[index];

  useEffect(() => {
    setAudioError(null);
  }, [item?.id]);

  const handleAudioEvent = (event: string) => {
    const error = audioRef.current?.error;
    logInfo('audio_event', {
      event,
      itemId: item?.id ?? null,
      mediaKey: item?.media_key ?? null,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null
    });
  };

  const handleAudioError = () => {
    const error = audioRef.current?.error;
    logError('audio_error', {
      itemId: item?.id ?? null,
      mediaKey: item?.media_key ?? null,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null
    });
    setAudioError('Audio unavailable.');
  };

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedSeconds(0);
    if (activeRound?.status === 'live' && items.length > 0) {
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeRound?.status, roundId, index, items.length]);

  const nextItem = () => {
    if (index < items.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setShowAnswer(false);
      setShowFact(false);
      if (eventId) {
        api.updateLiveState(eventId, {
          current_item_ordinal: items[nextIndex]?.ordinal ?? null,
          reveal_answer: false,
          reveal_fun_fact: false
        });
      }
    }
  };

  const prevItem = () => {
    if (index > 0) {
      const prevIndex = index - 1;
      setIndex(prevIndex);
      setShowAnswer(false);
      setShowFact(false);
      if (eventId) {
        api.updateLiveState(eventId, {
          current_item_ordinal: items[prevIndex]?.ordinal ?? null,
          reveal_answer: false,
          reveal_fun_fact: false
        });
      }
    }
  };

  const lockRound = async () => {
    if (!activeRound) return;
    await api.updateEventRound(activeRound.id, { status: 'locked' });
    await load();
  };

  const setLive = async () => {
    if (!activeRound) return;
    await api.updateEventRound(activeRound.id, { status: 'live' });
    await load();
  };

  const setPlanned = async () => {
    if (!activeRound) return;
    await api.updateEventRound(activeRound.id, { status: 'planned' });
    await load();
  };

  const timerLabel = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [elapsedSeconds]);

  if (!event) {
    return (
      <AppShell title="Round Runner">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Round Runner">
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Active Question">
          {activeRound ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  {roundDisplay(activeRound).title} — {roundDisplay(activeRound).detail}
                </div>
                <StampBadge label={activeRound.status.toUpperCase()} variant="verified" />
              </div>
              {item ? (
                <div className="relative border-2 border-border bg-panel2 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Question</div>
                  <div className="mt-2 text-lg font-display uppercase tracking-[0.2em]">{item.prompt}</div>
                  {item.media_type === 'image' && item.media_key && (
                    <img
                      className="mt-4 max-h-64 w-full object-cover border-2 border-border"
                      src={api.mediaUrl(item.media_key)}
                      alt={item.media_caption ?? 'Media'}
                    />
                  )}
                  {item.media_type === 'audio' && item.media_key && (
                    <div className="mt-4 flex flex-col gap-2">
                      {audioError && (
                        <div className="border-2 border-danger bg-panel px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger">
                          {audioError}
                        </div>
                      )}
                      <audio
                        ref={audioRef}
                        className="w-full"
                        controls
                        src={api.mediaUrl(item.media_key)}
                        onLoadedMetadata={() => handleAudioEvent('loadedmetadata')}
                        onCanPlay={() => handleAudioEvent('canplay')}
                        onPlay={() => handleAudioEvent('audio_play_click')}
                        onPause={() => handleAudioEvent('pause')}
                        onError={handleAudioError}
                      />
                    </div>
                  )}
                  <div className="absolute bottom-3 right-3 border-2 border-border bg-panel px-2 py-1 text-[10px] font-display uppercase tracking-[0.3em] text-muted">
                    {timerLabel}
                  </div>
                </div>
              ) : (
                <div className="text-xs uppercase tracking-[0.2em] text-muted">No items in this round.</div>
              )}
              {item && showAnswer && (
                <div className="border-2 border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Answer</div>
                  <div className="mt-2 text-base font-display uppercase tracking-[0.2em]">
                    {item.answer || (item.answer_a && item.answer_b
                      ? `${item.answer_a_label ? `${item.answer_a_label}: ` : 'A: '}${item.answer_a} / ${item.answer_b_label ? `${item.answer_b_label}: ` : 'B: '}${item.answer_b}`
                      : '')}
                  </div>
                </div>
              )}
              {item && showFact && (
                <div className="border-2 border-border bg-panel p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Factoid</div>
                  <div className="mt-2 text-sm text-text">{item.fun_fact || 'No factoid provided.'}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <SecondaryButton onClick={prevItem} disabled={index === 0}>
                  Back
                </SecondaryButton>
                <PrimaryButton
                  onClick={() => {
                    const next = !showAnswer;
                    setShowAnswer(next);
                    if (eventId) api.updateLiveState(eventId, { reveal_answer: next });
                  }}
                  disabled={!item}
                >
                  {showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                </PrimaryButton>
                <SecondaryButton
                  onClick={() => {
                    const next = !showFact;
                    setShowFact(next);
                    if (eventId) api.updateLiveState(eventId, { reveal_fun_fact: next });
                  }}
                  disabled={!item}
                >
                  {showFact ? 'Hide Fact' : 'Reveal Fact'}
                </SecondaryButton>
                <PrimaryButton onClick={nextItem} disabled={!item} className="py-4 text-sm">
                  Next
                </PrimaryButton>
                {activeRound?.status !== 'locked' ? (
                  <DangerButton onClick={lockRound} disabled={!activeRound} className="py-4 text-sm">
                    Lock In
                  </DangerButton>
                ) : (
                  <SecondaryButton onClick={setPlanned} disabled={!activeRound} className="py-4 text-sm">
                    Unlock
                  </SecondaryButton>
                )}
                {activeRound?.status !== 'live' && (
                  <SecondaryButton onClick={setLive} disabled={!activeRound}>
                    Go Live
                  </SecondaryButton>
                )}
                {activeRound?.status === 'live' && (
                  <SecondaryButton onClick={setPlanned} disabled={!activeRound}>
                    Go Offline
                  </SecondaryButton>
                )}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                Item {items.length === 0 ? 0 : index + 1} / {items.length}
              </div>
            </div>
          ) : (
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Select a round to begin.</div>
          )}
        </Panel>
        <Panel title="Round Control">
          <div className="flex flex-col gap-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Event</div>
            <div className="text-sm font-display uppercase tracking-[0.2em]">{event.title}</div>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Select Round
              <select className="h-10 px-3" value={roundId} onChange={(event) => setRoundId(event.target.value)}>
                <option value="">Choose round</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {roundDisplay(round).title} — {roundDisplay(round).detail}
                  </option>
                ))}
              </select>
            </label>
            <div className="border-2 border-border bg-panel2 p-3 text-xs uppercase tracking-[0.2em] text-muted">
              {activeRound ? `Status: ${activeRound.status}` : 'Awaiting round selection'}
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
