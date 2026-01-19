import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { ButtonLink, PrimaryButton, SecondaryButton } from '../components/Buttons';
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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioRequestId, setAudioRequestId] = useState<string | null>(null);
  const [audioRetryToken, setAudioRetryToken] = useState(0);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [waitingShowLeaderboard, setWaitingShowLeaderboard] = useState(false);
  const [waitingShowNextRound, setWaitingShowNextRound] = useState(true);
  const [waitingSaving, setWaitingSaving] = useState(false);
  const [waitingError, setWaitingError] = useState<string | null>(null);

  const load = async () => {
    if (!eventId) return;
    const [eventRes, roundsRes, editionsRes, gamesRes, liveRes] = await Promise.all([
      api.getEvent(eventId),
      api.listEventRounds(eventId),
      api.listEditions(),
      api.listGames(),
      api.getLiveState(eventId)
    ]);
    if (eventRes.ok) setEvent(eventRes.data);
    if (roundsRes.ok) setRounds(roundsRes.data);
    if (editionsRes.ok) setEditions(editionsRes.data);
    if (gamesRes.ok) setGames(gamesRes.data);
    if (liveRes.ok) {
      if (liveRes.data) {
        setWaitingMessage(liveRes.data.waiting_message ?? '');
        setWaitingShowLeaderboard(Boolean(liveRes.data.waiting_show_leaderboard));
        setWaitingShowNextRound(
          liveRes.data.waiting_show_next_round === undefined ? true : Boolean(liveRes.data.waiting_show_next_round)
        );
      }
    }
    const preselect = query.get('round') ?? '';
    if (!roundId && preselect) setRoundId(preselect);
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
  useEffect(() => {
    if (roundId || rounds.length === 0) return;
    const nextRound = rounds.find((round) => round.status !== 'completed' && round.status !== 'locked') ?? rounds[0];
    if (nextRound) setRoundId(nextRound.id);
  }, [rounds, roundId]);

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

  const roundStatusLabel = (status: EventRound['status']) =>
    status === 'locked' ? 'COMPLETED' : status.toUpperCase();

  const activeRound = useMemo(() => rounds.find((round) => round.id === roundId) ?? null, [rounds, roundId]);
  const item = items[index];

  useEffect(() => {
    setAudioError(null);
  }, [item?.id]);

  useEffect(() => {
    let cancelled = false;
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioError(null);
    setAudioRequestId(null);
    if (!item || item.media_type !== 'audio' || !item.media_key) {
      setAudioLoading(false);
      return () => {};
    }
    setAudioLoading(true);
    api.fetchMedia(item.media_key).then((res) => {
      if (cancelled) return;
      setAudioLoading(false);
      if (res.ok) {
        let blob = res.data.blob;
        if (!blob.type || blob.type === 'application/octet-stream') {
          const ext = item.media_key.split('.').pop()?.toLowerCase();
          const typeMap: Record<string, string> = {
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg'
          };
          if (ext && typeMap[ext]) {
            blob = blob.slice(0, blob.size, typeMap[ext]);
          }
        }
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setAudioRequestId(res.requestId ?? null);
      } else {
        setAudioError('Failed to load audio.');
        setAudioRequestId(res.requestId ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.media_key, item?.media_type, audioRetryToken]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const handleAudioEvent = (event: string) => {
    const error = audioRef.current?.error;
    logInfo('audio_event', {
      event,
      itemId: item?.id ?? null,
      mediaKey: item?.media_key ?? null,
      requestId: audioRequestId,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null
    });
  };

  const handleAudioError = () => {
    const error = audioRef.current?.error;
    logError('audio_error', {
      itemId: item?.id ?? null,
      mediaKey: item?.media_key ?? null,
      requestId: audioRequestId,
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

  const setLive = async () => {
    if (!activeRound) return;
    const otherLive = rounds.filter((round) => round.id !== activeRound.id && round.status === 'live');
    if (otherLive.length > 0) {
      await Promise.all(otherLive.map((round) => api.updateEventRound(round.id, { status: 'planned' })));
    }
    await api.updateEventRound(activeRound.id, { status: 'live' });
    await load();
  };

  const setPlanned = async () => {
    if (!activeRound) return;
    await api.updateEventRound(activeRound.id, { status: 'planned' });
    if (eventId) {
      await api.updateLiveState(eventId, {
        active_round_id: roundId || activeRound.id,
        current_item_ordinal: null,
        reveal_answer: false,
        reveal_fun_fact: false
      });
    }
    await load();
  };

  const setCompleted = async () => {
    if (!activeRound) return;
    await api.updateEventRound(activeRound.id, { status: 'completed' });
    await load();
  };

  const reopenRound = async () => {
    if (!activeRound) return;
    await api.updateEventRound(activeRound.id, { status: 'planned' });
    await load();
  };

  const saveWaitingRoom = async () => {
    if (!eventId) return;
    setWaitingSaving(true);
    setWaitingError(null);
    const res = await api.updateLiveState(eventId, {
      waiting_message: waitingMessage.trim() ? waitingMessage.trim() : null,
      waiting_show_leaderboard: waitingShowLeaderboard,
      waiting_show_next_round: waitingShowNextRound
    });
    if (!res.ok) {
      setWaitingError(res.error.message ?? 'Failed to update waiting room.');
      logError('waiting_room_update_failed', { eventId, error: res.error });
    }
    setWaitingSaving(false);
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
                <StampBadge label={roundStatusLabel(activeRound.status)} variant="verified" />
              </div>
              {item ? (
                <div className="relative border-2 border-border bg-panel2 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">
                    {item.media_type === 'audio'
                      ? `Clip ${index + 1}`
                      : item.media_type === 'image'
                        ? `Image ${index + 1}`
                        : `Question ${index + 1}`}
                  </div>
                  <div className="mt-2 text-lg font-display uppercase tracking-[0.2em]">{item.prompt}</div>
                  {item.media_type === 'image' && item.media_key && (
                    <div className="mt-4 border-2 border-border bg-panel p-2">
                      <img
                        className="max-h-[60vh] w-full object-contain"
                        src={api.mediaUrl(item.media_key)}
                        alt={item.media_caption ?? 'Media'}
                      />
                    </div>
                  )}
                  {item.media_type === 'audio' && item.media_key && (
                    <div className="mt-4 flex flex-col gap-2">
                      {audioLoading && (
                        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading audio…</div>
                      )}
                      {audioError && (
                        <div className="border-2 border-danger bg-panel px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger">
                          {audioError}
                          {audioRequestId ? ` (ref ${audioRequestId})` : ''}
                        </div>
                      )}
                      <audio
                        ref={audioRef}
                        className="w-full"
                        controls
                        src={audioUrl ?? undefined}
                        onLoadedMetadata={() => handleAudioEvent('loadedmetadata')}
                        onCanPlay={() => handleAudioEvent('canplay')}
                        onPlay={() => handleAudioEvent('audio_play_click')}
                        onPause={() => handleAudioEvent('pause')}
                        onError={handleAudioError}
                      />
                      {audioError && (
                        <SecondaryButton onClick={() => setAudioRetryToken((prev) => prev + 1)}>
                          Retry Audio
                        </SecondaryButton>
                      )}
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
                  {item.answer && !item.answer_a && !item.answer_b ? (
                    <div className="mt-2 text-base font-display uppercase tracking-[0.2em]">{item.answer}</div>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2 text-base font-display uppercase tracking-[0.2em]">
                      <div>
                        {item.answer_a_label ? `${item.answer_a_label}: ` : 'A: '}
                        {item.answer_a || 'N/A'}
                      </div>
                      <div>
                        {item.answer_b_label ? `${item.answer_b_label}: ` : 'B: '}
                        {item.answer_b || 'N/A'}
                      </div>
                    </div>
                  )}
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
                {(activeRound?.status === 'completed' || activeRound?.status === 'locked') && (
                  <SecondaryButton onClick={reopenRound} disabled={!activeRound} className="py-4 text-sm">
                    Reopen Round
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
                {activeRound?.status !== 'completed' && activeRound?.status !== 'locked' && item && index === items.length - 1 && (
                  <SecondaryButton onClick={setCompleted} disabled={!activeRound}>
                    Mark Completed
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
        <div className="flex flex-col gap-4">
          <Panel title="Rounds">
            <div className="flex flex-col gap-3">
              {rounds.length === 0 && (
                <div className="text-xs uppercase tracking-[0.2em] text-muted">No rounds yet.</div>
              )}
              {rounds.map((round) => {
                const display = roundDisplay(round);
                const selected = round.id === roundId;
                const isCompleted = round.status === 'completed' || round.status === 'locked';
                const statusLabel = round.status === 'locked' ? 'COMPLETED' : round.status.toUpperCase();
                return (
                  <button
                    key={round.id}
                    type="button"
                    onClick={() => setRoundId(round.id)}
                    className={`flex w-full flex-col gap-2 border-2 px-3 py-2 text-left ${
                      selected
                        ? 'border-accent-ink bg-panel text-text'
                        : isCompleted
                          ? 'border-border bg-panel2 text-muted'
                          : 'border-border bg-panel2'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-display uppercase tracking-[0.2em]">{display.title}</div>
                      <StampBadge label={statusLabel} variant="inspected" />
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{display.detail}</div>
                  </button>
                );
              })}
            </div>
          </Panel>
          <Panel title="Round Control">
            <div className="flex flex-col gap-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Event</div>
              <div className="text-sm font-display uppercase tracking-[0.2em]">{event.title}</div>
              <ButtonLink to={`/events/${event.id}`} variant="secondary">
                Back to Event
              </ButtonLink>
              <div className="border-2 border-border bg-panel2 p-3 text-xs uppercase tracking-[0.2em] text-muted">
                {activeRound ? `Status: ${roundStatusLabel(activeRound.status)}` : 'Awaiting round selection'}
              </div>
            </div>
          </Panel>
          <Panel title="Waiting Room">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Message
                <textarea
                  className="min-h-[96px] px-3 py-2"
                  value={waitingMessage}
                  onChange={(event) => setWaitingMessage(event.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                <input
                  type="checkbox"
                  checked={waitingShowLeaderboard}
                  onChange={(event) => setWaitingShowLeaderboard(event.target.checked)}
                />
                Show Leaderboard
              </label>
              <label className="flex items-center gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                <input
                  type="checkbox"
                  checked={waitingShowNextRound}
                  onChange={(event) => setWaitingShowNextRound(event.target.checked)}
                />
                Show Next Round Info
              </label>
              {waitingError && (
                <div className="border-2 border-danger bg-panel px-3 py-2 text-xs uppercase tracking-[0.2em] text-danger">
                  {waitingError}
                </div>
              )}
              <PrimaryButton onClick={saveWaitingRoom} disabled={waitingSaving}>
                {waitingSaving ? 'Updating…' : 'Update Waiting Room'}
              </PrimaryButton>
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
