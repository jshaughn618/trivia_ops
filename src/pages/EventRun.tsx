import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { ButtonLink, PrimaryButton, SecondaryButton } from '../components/Buttons';
import { StampBadge } from '../components/StampBadge';
import { logError, logInfo } from '../lib/log';
import type { EditionItem, Event, EventRound, Game, GameEdition, Team, EventRoundScore } from '../types';

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
  const [timerStartedAt, setTimerStartedAt] = useState<string | null>(null);
  const [timerDurationSeconds, setTimerDurationSeconds] = useState(15);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number | null>(null);
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
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [clearResponsesStatus, setClearResponsesStatus] = useState<'idle' | 'clearing' | 'done' | 'error'>('idle');
  const [clearResponsesMessage, setClearResponsesMessage] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [scoresSaving, setScoresSaving] = useState(false);
  const [scoresError, setScoresError] = useState<string | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const preselectRef = useRef(false);
  const auth = useAuth();
  const isAdmin = auth.user?.user_type === 'admin';

  const load = async () => {
    if (!eventId) return;
    const [eventRes, roundsRes, editionsRes, gamesRes, liveRes, teamsRes] = await Promise.all([
      api.getEvent(eventId),
      api.listEventRounds(eventId),
      isAdmin ? api.listEditions() : Promise.resolve({ ok: true as const, data: [] as GameEdition[] }),
      isAdmin ? api.listGames() : Promise.resolve({ ok: true as const, data: [] as Game[] }),
      api.getLiveState(eventId),
      api.listTeams(eventId)
    ]);
    if (eventRes.ok) setEvent(eventRes.data);
    if (roundsRes.ok) setRounds(roundsRes.data);
    if (editionsRes.ok) setEditions(editionsRes.data);
    if (gamesRes.ok) setGames(gamesRes.data);
    if (teamsRes.ok) setTeams(teamsRes.data);
    if (liveRes.ok) {
      if (liveRes.data) {
        setWaitingMessage(liveRes.data.waiting_message ?? '');
        setWaitingShowLeaderboard(Boolean(liveRes.data.waiting_show_leaderboard));
        setWaitingShowNextRound(
          liveRes.data.waiting_show_next_round === undefined ? true : Boolean(liveRes.data.waiting_show_next_round)
        );
        setShowFullLeaderboard(Boolean(liveRes.data.show_full_leaderboard));
        setTimerStartedAt(liveRes.data.timer_started_at ?? null);
        setTimerDurationSeconds(liveRes.data.timer_duration_seconds ?? 15);
      }
    }
    const preselect = query.get('round') ?? '';
    if (!preselectRef.current && preselect) {
      setRoundId(preselect);
      preselectRef.current = true;
    }
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
      setTimerStartedAt(null);
      setTimerRemainingSeconds(null);
      if (eventId) {
        await api.updateLiveState(eventId, {
          active_round_id: selectedRoundId,
          current_item_ordinal: sorted[0]?.ordinal ?? null,
          reveal_answer: false,
          reveal_fun_fact: false,
          timer_started_at: null,
          timer_duration_seconds: null
        });
      }
    }
  };

  useEffect(() => {
    load();
  }, [eventId, isAdmin]);

  useEffect(() => {
    if (roundId) loadItems(roundId);
  }, [roundId]);
  useEffect(() => {
    if (roundId || rounds.length === 0) return;
    const nextRound = rounds.find((round) => round.status !== 'completed' && round.status !== 'locked') ?? rounds[0];
    if (nextRound) {
      setRoundId(nextRound.id);
      preselectRef.current = true;
    }
  }, [rounds, roundId]);

  const editionById = useMemo(() => {
    return Object.fromEntries(editions.map((edition) => [edition.id, edition]));
  }, [editions]);

  const gameById = useMemo(() => {
    return Object.fromEntries(games.map((game) => [game.id, game]));
  }, [games]);

  const roundDisplay = (round: EventRound) => {
    if (!isAdmin) {
      return {
        title: `Round ${round.round_number}`,
        detail: round.label
      };
    }
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
  const questionLabel = item?.prompt?.trim()
    ? item.prompt
    : item?.media_type === 'audio'
      ? 'Listen to the clip.'
      : item?.prompt ?? '';

  useEffect(() => {
    setTimerDurationSeconds(activeRound?.timer_seconds ?? 15);
  }, [activeRound?.id, activeRound?.timer_seconds]);

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
    const updateRemaining = () => {
      if (!timerStartedAt || !timerDurationSeconds) {
        setTimerRemainingSeconds(null);
        return;
      }
      const startMs = new Date(timerStartedAt).getTime();
      if (Number.isNaN(startMs)) {
        setTimerRemainingSeconds(null);
        return;
      }
      const remaining = Math.max(0, Math.ceil((startMs + timerDurationSeconds * 1000 - Date.now()) / 1000));
      setTimerRemainingSeconds(remaining);
    };
    updateRemaining();
    if (timerStartedAt && timerDurationSeconds) {
      timerRef.current = window.setInterval(updateRemaining, 1000);
    }
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerStartedAt, timerDurationSeconds]);

  const nextItem = () => {
    if (index < items.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      setShowAnswer(false);
      setShowFact(false);
      setTimerStartedAt(null);
      setTimerRemainingSeconds(null);
      if (eventId) {
        api.updateLiveState(eventId, {
          current_item_ordinal: items[nextIndex]?.ordinal ?? null,
          reveal_answer: false,
          reveal_fun_fact: false,
          timer_started_at: null,
          timer_duration_seconds: null
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
      setTimerStartedAt(null);
      setTimerRemainingSeconds(null);
      if (eventId) {
        api.updateLiveState(eventId, {
          current_item_ordinal: items[prevIndex]?.ordinal ?? null,
          reveal_answer: false,
          reveal_fun_fact: false,
          timer_started_at: null,
          timer_duration_seconds: null
        });
      }
    }
  };

  const setLive = async () => {
    if (!activeRound) return;
    const keepRoundId = roundId || activeRound.id;
    const otherLive = rounds.filter((round) => round.id !== activeRound.id && round.status === 'live');
    if (otherLive.length > 0) {
      await Promise.all(otherLive.map((round) => api.updateEventRound(round.id, { status: 'planned' })));
    }
    await api.updateEventRound(activeRound.id, { status: 'live' });
    if (eventId) {
      const currentOrdinal = items[index]?.ordinal ?? items[0]?.ordinal ?? null;
      await api.updateLiveState(eventId, {
        active_round_id: activeRound.id,
        current_item_ordinal: currentOrdinal
      });
    }
    await load();
    if (keepRoundId) {
      setRoundId(keepRoundId);
      preselectRef.current = true;
    }
  };

  const setPlanned = async () => {
    if (!activeRound) return;
    const keepRoundId = roundId || activeRound.id;
    await api.updateEventRound(activeRound.id, { status: 'planned' });
    if (eventId) {
      await api.updateLiveState(eventId, {
        active_round_id: roundId || activeRound.id,
        current_item_ordinal: null,
        reveal_answer: false,
        reveal_fun_fact: false,
        timer_started_at: null,
        timer_duration_seconds: null
      });
    }
    setTimerStartedAt(null);
    setTimerRemainingSeconds(null);
    await load();
    if (keepRoundId) {
      setRoundId(keepRoundId);
      preselectRef.current = true;
    }
  };

  const setCompleted = async () => {
    if (!activeRound) return;
    const keepRoundId = roundId || activeRound.id;
    await api.updateEventRound(activeRound.id, { status: 'completed' });
    await load();
    if (keepRoundId) {
      setRoundId(keepRoundId);
      preselectRef.current = true;
    }
  };

  const reopenRound = async () => {
    if (!activeRound) return;
    const keepRoundId = roundId || activeRound.id;
    await api.updateEventRound(activeRound.id, { status: 'planned' });
    await load();
    if (keepRoundId) {
      setRoundId(keepRoundId);
      preselectRef.current = true;
    }
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

  const toggleFullLeaderboard = async () => {
    if (!eventId) return;
    const next = !showFullLeaderboard;
    setShowFullLeaderboard(next);
    const res = await api.updateLiveState(eventId, { show_full_leaderboard: next });
    if (!res.ok) {
      setShowFullLeaderboard(!next);
    }
  };

  const timerLabel = useMemo(() => {
    const totalSeconds = timerRemainingSeconds ?? timerDurationSeconds;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [timerRemainingSeconds, timerDurationSeconds]);

  const timerButtonLabel = timerStartedAt ? 'Restart Timer' : 'Start Timer';

  const clearRoundResponses = async () => {
    if (!activeRound) return;
    const confirmed = window.confirm('Clear all multiple-choice responses for this round?');
    if (!confirmed) return;
    setClearResponsesStatus('clearing');
    setClearResponsesMessage(null);
    const res = await api.clearRoundResponses(activeRound.id);
    if (res.ok) {
      setClearResponsesStatus('done');
      setClearResponsesMessage('Responses cleared.');
    } else {
      setClearResponsesStatus('error');
      setClearResponsesMessage(res.error.message ?? 'Failed to clear responses.');
    }
  };

  const openScores = async () => {
    if (!activeRound) return;
    setScoresOpen(true);
    setScoresError(null);
    setScoresSaving(false);
    const scoresRes = await api.listRoundScores(activeRound.id);
    const scores = scoresRes.ok ? (scoresRes.data as EventRoundScore[]) : [];
    const scoresByTeam = new Map(scores.map((row) => [row.team_id, row.score]));
    const nextDrafts: Record<string, string> = {};
    teams.forEach((team) => {
      const value = scoresByTeam.get(team.id);
      nextDrafts[team.id] = value === undefined || value === null ? '' : String(value);
    });
    setScoreDrafts(nextDrafts);
    if (!scoresRes.ok) {
      setScoresError(scoresRes.error.message ?? 'Failed to load scores.');
    }
  };

  const saveScores = async () => {
    if (!activeRound) return;
    setScoresSaving(true);
    setScoresError(null);
    const payload = teams.map((team) => {
      const raw = scoreDrafts[team.id];
      const parsed = raw === undefined || raw === '' ? 0 : Number.parseFloat(raw);
      return { team_id: team.id, score: Number.isFinite(parsed) ? parsed : 0 };
    });
    const res = await api.updateRoundScores(activeRound.id, payload);
    if (!res.ok) {
      setScoresError(res.error.message ?? 'Failed to save scores.');
    } else {
      setScoresOpen(false);
    }
    setScoresSaving(false);
  };

  const startTimer = async () => {
    if (!eventId || !activeRound) return;
    const duration = activeRound.timer_seconds ?? timerDurationSeconds ?? 15;
    const startedAt = new Date().toISOString();
    if (item?.question_type === 'multiple_choice') {
      await api.clearRoundResponses(activeRound.id, item.id);
    }
    setTimerStartedAt(startedAt);
    setTimerDurationSeconds(duration);
    setTimerRemainingSeconds(duration);
    await api.updateLiveState(eventId, {
      timer_started_at: startedAt,
      timer_duration_seconds: duration
    });
  };

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
                  <div className="mt-2 text-lg font-display uppercase tracking-[0.2em]">{questionLabel}</div>
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
                  {item.audio_answer_key && (
                    <div className="mt-3">
                      <audio className="w-full" controls src={api.mediaUrl(item.audio_answer_key)} />
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
                {activeRound?.status !== 'live' && (
                  <PrimaryButton onClick={setLive} disabled={!activeRound}>
                    Display
                  </PrimaryButton>
                )}
                {activeRound?.status === 'live' && (
                  <PrimaryButton onClick={setPlanned} disabled={!activeRound}>
                    Standby
                  </PrimaryButton>
                )}
                <SecondaryButton onClick={startTimer} disabled={!item}>
                  {timerButtonLabel}
                </SecondaryButton>
                <SecondaryButton onClick={clearRoundResponses} disabled={!activeRound || clearResponsesStatus === 'clearing'}>
                  {clearResponsesStatus === 'clearing' ? 'Clearing…' : 'Clear Responses'}
                </SecondaryButton>
                <SecondaryButton
                  onClick={() => {
                    const next = !showAnswer;
                    setShowAnswer(next);
                    if (eventId) api.updateLiveState(eventId, { reveal_answer: next });
                  }}
                  disabled={!item}
                >
                  {showAnswer ? 'Hide Answer' : 'Reveal Answer'}
                </SecondaryButton>
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
                <SecondaryButton onClick={nextItem} disabled={!item} className="py-4 text-sm">
                  Next
                </SecondaryButton>
                {(activeRound?.status === 'completed' || activeRound?.status === 'locked') && (
                  <SecondaryButton onClick={reopenRound} disabled={!activeRound} className="py-4 text-sm">
                    Reopen Round
                  </SecondaryButton>
                )}
                {(activeRound?.status === 'completed' || activeRound?.status === 'locked') && (
                  <SecondaryButton onClick={openScores} disabled={!activeRound}>
                    Enter Scores
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
              {clearResponsesMessage && (
                <div
                  className={`text-xs uppercase tracking-[0.2em] ${
                    clearResponsesStatus === 'error' ? 'text-danger' : 'text-muted'
                  }`}
                >
                  {clearResponsesMessage}
                </div>
              )}
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
                    onClick={() => {
                      preselectRef.current = true;
                      setRoundId(round.id);
                    }}
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
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Leaderboard</div>
                <SecondaryButton onClick={toggleFullLeaderboard} disabled={!eventId}>
                  {showFullLeaderboard ? 'Hide Full Leaderboard' : 'Show Full Leaderboard'}
                </SecondaryButton>
              </div>
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
              {waitingShowLeaderboard && (
                <SecondaryButton onClick={() => window.open(`/events/${eventId}/leaderboard`, '_blank')}>
                  View Full Leaderboard
                </SecondaryButton>
              )}
              <PrimaryButton onClick={saveWaitingRoom} disabled={waitingSaving}>
                {waitingSaving ? 'Updating…' : 'Update Waiting Room'}
              </PrimaryButton>
            </div>
          </Panel>
        </div>
      </div>
      {scoresOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl border-2 border-border bg-panel p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-display uppercase tracking-[0.25em]">Enter Scores</div>
              <button
                type="button"
                onClick={() => setScoresOpen(false)}
                className="text-xs uppercase tracking-[0.2em] text-muted"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {teams.length === 0 && (
                <div className="text-xs uppercase tracking-[0.2em] text-muted">No teams yet.</div>
              )}
              {teams.map((team) => (
                <div key={team.id} className="flex items-center justify-between gap-3 border border-border bg-panel2 px-3 py-2">
                  <div className="text-sm font-display uppercase tracking-[0.2em]">{team.name}</div>
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    className="h-9 w-28 px-2 text-right"
                    value={scoreDrafts[team.id] ?? ''}
                    onChange={(event) =>
                      setScoreDrafts((prev) => ({
                        ...prev,
                        [team.id]: event.target.value
                      }))
                    }
                  />
                </div>
              ))}
              {scoresError && (
                <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
                  {scoresError}
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <SecondaryButton onClick={() => setScoresOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={saveScores} disabled={scoresSaving || teams.length === 0}>
                {scoresSaving ? 'Saving…' : 'Save Scores'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
