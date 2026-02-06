import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { useAuth } from '../auth';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { AccordionSection } from '../components/AccordionSection';
import { ButtonLink, PrimaryButton, SecondaryButton } from '../components/Buttons';
import { StampBadge } from '../components/StampBadge';
import { createRequestId, logError, logInfo } from '../lib/log';
import type { EditionItem, Event, EventRound, Game, GameEdition, Team, EventRoundScore } from '../types';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

type AnswerPart = { label: string; answer: string };

const parseAnswerParts = (value?: string | null): AnswerPart[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof entry.label === 'string' ? entry.label : '';
        const answer = typeof entry.answer === 'string' ? entry.answer : '';
        if (!label || !answer) return null;
        return { label, answer } as AnswerPart;
      })
      .filter((part): part is AnswerPart => Boolean(part));
  } catch {
    return [];
  }
};

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
  const [timerJustExpired, setTimerJustExpired] = useState(false);
  const timerRef = useRef<number | null>(null);
  const timerExpireRef = useRef<number | null>(null);
  const timerPrevRemainingRef = useRef<number | null>(null);
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
  const syncAudioPlaying = useCallback((playing: boolean) => {
    if (!eventId) return;
    void api.updateLiveState(eventId, { audio_playing: playing });
  }, [eventId]);

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
          audio_playing: false,
          reveal_answer: false,
          reveal_fun_fact: false,
          timer_started_at: null,
          timer_duration_seconds: null,
          show_full_leaderboard: false
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

  const roundStatusLabel = (status: EventRound['status']) => {
    if (status === 'locked' || status === 'completed') return 'Completed';
    if (status === 'live') return 'Live';
    return 'Planned';
  };

  const activeRound = useMemo(() => rounds.find((round) => round.id === roundId) ?? null, [rounds, roundId]);
  const activeEdition = activeRound ? editionById[activeRound.edition_id] : null;
  const activeGame = activeEdition ? gameById[activeEdition.game_id] : null;
  const isSpeedRoundMode = activeGame?.subtype === 'speed_round';
  const item = items[index];
  const isAudioItem = item?.media_type === 'audio';
  const isImageItem = item?.media_type === 'image';
  const roundAudioKey = activeRound?.edition_audio_key ?? activeRound?.audio_key ?? null;
  const roundAudioName = activeRound?.edition_audio_name ?? activeRound?.audio_name ?? null;
  const effectiveAudioKey = isSpeedRoundMode ? roundAudioKey : isAudioItem ? item?.media_key ?? roundAudioKey : null;
  const usesRoundAudio = isSpeedRoundMode
    ? Boolean(roundAudioKey)
    : isAudioItem && !item?.media_key && Boolean(roundAudioKey);
  const speedRoundPrompt = 'Play the clip and collect answers before reveal.';
  const questionLabel = item?.prompt?.trim()
    ? isSpeedRoundMode ? speedRoundPrompt : item.prompt
    : item?.media_type === 'audio'
      ? 'Listen to the clip.'
      : isSpeedRoundMode
        ? speedRoundPrompt
        : item?.prompt ?? '';

  const speedRoundAnswerLines = useMemo(() => {
    if (!isSpeedRoundMode) return [];
    const byOrdinal = [...items].sort((a, b) => a.ordinal - b.ordinal);
    return byOrdinal.map((entry, idx) => {
      const answerParts = parseAnswerParts(entry.answer_parts_json);
      const songPart = answerParts.find((part) => part.label.toLowerCase().includes('song'))?.answer?.trim();
      const artistPart = answerParts.find((part) => {
        const label = part.label.toLowerCase();
        return label.includes('artist') && !label.includes('original');
      })?.answer?.trim();
      if (songPart && artistPart) return `${idx + 1}. ${songPart} - ${artistPart}`;
      if (songPart) return `${idx + 1}. ${songPart}`;
      if (entry.answer?.trim()) {
        const segments = entry.answer
          .split(' - ')
          .map((value) => value.trim())
          .filter(Boolean);
        if (segments.length >= 2) {
          return `${idx + 1}. ${segments[1]} - ${segments[0]}`;
        }
        return `${idx + 1}. ${entry.answer.trim()}`;
      }
      return `${idx + 1}. ${entry.answer_a?.trim() || entry.answer_b?.trim() || 'Answer missing'}`;
    });
  }, [isSpeedRoundMode, items]);

  useEffect(() => {
    if (!isSpeedRoundMode || index === 0) return;
    setIndex(0);
  }, [isSpeedRoundMode, index]);

  useEffect(() => {
    setTimerDurationSeconds(activeRound?.timer_seconds ?? 15);
  }, [activeRound?.id, activeRound?.timer_seconds]);

  useEffect(() => {
    setAudioError(null);
    setAudioRequestId(null);
    if (!isAudioItem || !effectiveAudioKey) {
      setAudioLoading(false);
      setAudioUrl(null);
      syncAudioPlaying(false);
      return;
    }
    const requestId = createRequestId();
    const base = api.mediaUrl(effectiveAudioKey);
    const joiner = base.includes('?') ? '&' : '?';
    const retryParam = audioRetryToken ? `&retry=${audioRetryToken}` : '';
    setAudioRequestId(requestId);
    setAudioUrl(`${base}${joiner}request_id=${encodeURIComponent(requestId)}${retryParam}`);
    setAudioLoading(true);
  }, [effectiveAudioKey, isAudioItem, audioRetryToken, syncAudioPlaying]);

  useEffect(() => {
    return () => {
      syncAudioPlaying(false);
    };
  }, [syncAudioPlaying]);

  const handleAudioEvent = (event: string) => {
    const error = audioRef.current?.error;
    logInfo('audio_event', {
      event,
      itemId: item?.id ?? null,
      roundId: activeRound?.id ?? null,
      mediaKey: effectiveAudioKey ?? null,
      source: usesRoundAudio ? 'round' : 'item',
      requestId: audioRequestId,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null
    });
  };

  const handleAudioError = () => {
    const error = audioRef.current?.error;
    logError('audio_error', {
      itemId: item?.id ?? null,
      roundId: activeRound?.id ?? null,
      mediaKey: effectiveAudioKey ?? null,
      source: usesRoundAudio ? 'round' : 'item',
      requestId: audioRequestId,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null
    });
    setAudioLoading(false);
    setAudioError('Audio unavailable.');
    syncAudioPlaying(false);
  };

  const handleAudioReady = (event: string) => {
    setAudioLoading(false);
    handleAudioEvent(event);
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

  useEffect(() => {
    const prev = timerPrevRemainingRef.current;
    timerPrevRemainingRef.current = timerRemainingSeconds;
    const expiredNow = Boolean(timerStartedAt) && timerRemainingSeconds === 0;
    const crossedToExpired = Boolean(timerStartedAt) && prev !== null && prev > 0 && timerRemainingSeconds === 0;

    if (!timerStartedAt || timerRemainingSeconds === null || timerRemainingSeconds > 0) {
      setTimerJustExpired(false);
      if (timerExpireRef.current) {
        window.clearTimeout(timerExpireRef.current);
        timerExpireRef.current = null;
      }
      return;
    }

    if (crossedToExpired) {
      setTimerJustExpired(true);
      if (timerExpireRef.current) window.clearTimeout(timerExpireRef.current);
      timerExpireRef.current = window.setTimeout(() => setTimerJustExpired(false), 2400);
    } else if (!expiredNow) {
      setTimerJustExpired(false);
    }
  }, [timerRemainingSeconds, timerStartedAt]);

  useEffect(() => {
    return () => {
      if (timerExpireRef.current) {
        window.clearTimeout(timerExpireRef.current);
        timerExpireRef.current = null;
      }
    };
  }, []);

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
          audio_playing: false,
          reveal_answer: false,
          reveal_fun_fact: false,
          timer_started_at: null,
          timer_duration_seconds: null,
          show_full_leaderboard: false
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
          audio_playing: false,
          reveal_answer: false,
          reveal_fun_fact: false,
          timer_started_at: null,
          timer_duration_seconds: null,
          show_full_leaderboard: false
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
        current_item_ordinal: currentOrdinal,
        audio_playing: false,
        show_full_leaderboard: false
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
        audio_playing: false,
        reveal_answer: false,
        reveal_fun_fact: false,
        timer_started_at: null,
        timer_duration_seconds: null,
        show_full_leaderboard: false
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
      waiting_show_next_round: waitingShowNextRound,
      audio_playing: false,
      show_full_leaderboard: false
    });
    if (!res.ok) {
      setWaitingError(formatApiError(res, 'Failed to update waiting room.'));
      logError('waiting_room_update_failed', { eventId, error: res.error });
    }
    setWaitingSaving(false);
  };

  const toggleFullLeaderboard = async () => {
    if (!eventId) return;
    const next = !showFullLeaderboard;
    setShowFullLeaderboard(next);
    const res = await api.updateLiveState(eventId, { show_full_leaderboard: next, audio_playing: false });
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
  const timerExpired = Boolean(timerStartedAt) && timerRemainingSeconds === 0;

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
      setClearResponsesMessage(formatApiError(res, 'Failed to clear responses.'));
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
      setScoresError(formatApiError(res, 'Failed to save scores.'));
    } else {
      setScoresOpen(false);
    }
    setScoresSaving(false);
  };

  const startTimer = async () => {
    if (!eventId || !activeRound) return;
    if (isImageItem) return;
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
      timer_duration_seconds: duration,
      audio_playing: false
    });
  };

  if (!event) {
    return (
      <AppShell title="Round Runner">
        <div className="text-sm text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Round Runner">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),360px]">
        <Panel title="Active Question" className="p-5">
          {activeRound ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="ui-label">Now running</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="text-sm font-semibold text-text">{roundDisplay(activeRound).title}</div>
                    <div className="text-sm text-muted">{roundDisplay(activeRound).detail}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StampBadge
                    label={roundStatusLabel(activeRound.status)}
                    variant={activeRound.status === 'live' ? 'approved' : 'inspected'}
                  />
                  <div className="text-xs tabular-nums text-muted">
                    {isSpeedRoundMode ? `Songs ${items.length}` : `Item ${items.length === 0 ? 0 : index + 1} / ${items.length}`}
                  </div>
                </div>
              </div>
              {item ? (
                <div className="surface-inset p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="ui-label">
                      {isSpeedRoundMode
                        ? 'Speed round clip'
                        : item.media_type === 'audio'
                        ? `Clip ${index + 1}`
                        : item.media_type === 'image'
                          ? `Image ${index + 1}`
                          : `Question ${index + 1}`}
                    </div>
                    {!isImageItem && (
                      <div
                        className={`rounded-full border bg-panel px-3 py-1 text-xs font-medium tabular-nums ${
                          timerExpired ? 'border-danger text-danger-ink' : 'border-border text-muted'
                        } ${timerJustExpired ? 'timer-flash' : ''}`}
                      >
                        {timerLabel}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-xl font-semibold leading-snug text-text">{questionLabel}</div>
                  {item.media_type === 'image' && item.media_key && (
                    <div className="mt-4 rounded-lg border border-border bg-panel p-2">
                      <img
                        className="max-h-[60vh] w-full object-contain"
                        src={api.mediaUrl(item.media_key)}
                        alt={item.media_caption ?? 'Media'}
                      />
                    </div>
                  )}
                  {(isSpeedRoundMode || item.media_type === 'audio') && effectiveAudioKey && (
                    <div className="mt-4 flex flex-col gap-2">
                      {usesRoundAudio && (
                        <div className="ui-label">
                          Edition clip{roundAudioName ? ` • ${roundAudioName}` : ''}
                        </div>
                      )}
                      {audioLoading && (
                        <div className="text-sm text-muted">Loading audio...</div>
                      )}
                      {audioError && (
                        <div className="rounded-lg border border-danger bg-panel px-3 py-2 text-sm text-danger-ink">
                          {audioError}
                          {audioRequestId ? ` (ref ${audioRequestId})` : ''}
                        </div>
                      )}
                      <audio
                        ref={audioRef}
                        className="w-full"
                        controls
                        src={audioUrl ?? undefined}
                        onLoadStart={() => setAudioLoading(true)}
                        onLoadedMetadata={() => handleAudioReady('loadedmetadata')}
                        onCanPlay={() => handleAudioReady('canplay')}
                        onPlay={() => {
                          handleAudioEvent('audio_play_click');
                          syncAudioPlaying(true);
                        }}
                        onPause={() => {
                          handleAudioEvent('pause');
                          syncAudioPlaying(false);
                        }}
                        onEnded={() => {
                          handleAudioEvent('ended');
                          syncAudioPlaying(false);
                        }}
                        onError={handleAudioError}
                      />
                      {audioError && (
                        <SecondaryButton className="h-11" onClick={() => setAudioRetryToken((prev) => prev + 1)}>
                          Retry Audio
                        </SecondaryButton>
                      )}
                    </div>
                  )}
                  {(isSpeedRoundMode || item.media_type === 'audio') && !effectiveAudioKey && (
                    <div className="mt-4 rounded-lg border border-danger bg-panel px-3 py-2 text-sm text-danger-ink">
                      No audio clip attached to this edition.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted">No items in this round.</div>
              )}
              {item && (showAnswer || showFact) && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {showAnswer && (
                    <div className="surface-inset p-5">
                      <div className="ui-label">Answer</div>
                      {isSpeedRoundMode ? (
                        <div className="mt-2 flex flex-col gap-1.5 text-sm font-semibold leading-snug">
                          {speedRoundAnswerLines.length > 0 ? (
                            speedRoundAnswerLines.map((line, lineIndex) => (
                              <div key={`${item.id}-${lineIndex}`}>{line}</div>
                            ))
                          ) : (
                            <div className="text-muted">No answers available.</div>
                          )}
                        </div>
                      ) : (() => {
                        const answerParts = parseAnswerParts(item.answer_parts_json);
                        if (answerParts.length > 0) {
                          return (
                            <div className="mt-2 flex flex-col gap-2 text-base font-semibold leading-snug">
                              {answerParts.map((part) => (
                                <div key={`${item.id}-${part.label}`}>
                                  <span className="text-muted">{part.label}:</span> {part.answer}
                                </div>
                              ))}
                            </div>
                          );
                        }
                        if (item.answer && !item.answer_a && !item.answer_b) {
                          return <div className="mt-2 text-base font-semibold leading-snug">{item.answer}</div>;
                        }
                        return (
                          <div className="mt-2 flex flex-col gap-2 text-base font-semibold leading-snug">
                            <div>
                              <span className="text-muted">{item.answer_a_label ? item.answer_a_label : 'A'}:</span>{' '}
                              {item.answer_a || 'N/A'}
                            </div>
                            <div>
                              <span className="text-muted">{item.answer_b_label ? item.answer_b_label : 'B'}:</span>{' '}
                              {item.answer_b || 'N/A'}
                            </div>
                          </div>
                        );
                      })()}
                      {item.audio_answer_key && (
                        <div className="mt-3">
                          <audio className="w-full" controls src={api.mediaUrl(item.audio_answer_key)} />
                        </div>
                      )}
                    </div>
                  )}
                  {showFact && (
                    <div className="surface-inset p-5">
                      <div className="ui-label">Factoid</div>
                      <div className="mt-2 text-sm leading-relaxed text-text">
                        {item.fun_fact || 'No factoid provided.'}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!isSpeedRoundMode && (
                  <SecondaryButton className="h-11" onClick={prevItem} disabled={index === 0}>
                    Back
                  </SecondaryButton>
                )}
                {activeRound?.status !== 'live' && (
                  <PrimaryButton className="h-11" onClick={setLive} disabled={!activeRound}>
                    Display
                  </PrimaryButton>
                )}
                {activeRound?.status === 'live' && (
                  <PrimaryButton className="h-11" onClick={setPlanned} disabled={!activeRound}>
                    Standby
                  </PrimaryButton>
                )}
                {!isImageItem && (
                  <SecondaryButton className="h-11" onClick={startTimer} disabled={!item}>
                    {timerButtonLabel}
                  </SecondaryButton>
                )}
                {item?.question_type === 'multiple_choice' && (
                  <SecondaryButton
                    className="h-11"
                    onClick={clearRoundResponses}
                    disabled={!activeRound || clearResponsesStatus === 'clearing'}
                  >
                    {clearResponsesStatus === 'clearing' ? 'Clearing…' : 'Clear Responses'}
                  </SecondaryButton>
                )}
                <SecondaryButton
                  className="h-11"
                  onClick={() => {
                    const next = !showAnswer;
                    setShowAnswer(next);
                    if (eventId) api.updateLiveState(eventId, { reveal_answer: next });
                  }}
                  disabled={!item}
                >
                  {showAnswer ? 'Hide answer' : 'Reveal answer'}
                </SecondaryButton>
                <SecondaryButton
                  className="h-11"
                  onClick={() => {
                    const next = !showFact;
                    setShowFact(next);
                    if (eventId) api.updateLiveState(eventId, { reveal_fun_fact: next });
                  }}
                  disabled={!item || isSpeedRoundMode}
                >
                  {showFact ? 'Hide fact' : 'Reveal fact'}
                </SecondaryButton>
                {!isSpeedRoundMode && (
                  <SecondaryButton className="h-11" onClick={nextItem} disabled={!item}>
                    Next
                  </SecondaryButton>
                )}
                {(activeRound?.status === 'completed' || activeRound?.status === 'locked') && (
                  <SecondaryButton className="h-11" onClick={reopenRound} disabled={!activeRound}>
                    Reopen Round
                  </SecondaryButton>
                )}
                {(activeRound?.status === 'completed' || activeRound?.status === 'locked') && (
                  <SecondaryButton className="h-11" onClick={openScores} disabled={!activeRound}>
                    Enter Scores
                  </SecondaryButton>
                )}
                {activeRound?.status !== 'completed' &&
                  activeRound?.status !== 'locked' &&
                  item &&
                  (isSpeedRoundMode || index === items.length - 1) && (
                  <SecondaryButton className="h-11" onClick={setCompleted} disabled={!activeRound}>
                    Mark Completed
                  </SecondaryButton>
                )}
              </div>
              {clearResponsesMessage && (
                <div
                  className={`text-sm ${clearResponsesStatus === 'error' ? 'text-danger-ink' : 'text-muted'}`}
                >
                  {clearResponsesMessage}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted">Select a round to begin.</div>
          )}
        </Panel>
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <AccordionSection title="Rounds" defaultOpen>
            <div className="flex max-h-[460px] flex-col gap-2 overflow-auto pr-1">
              {rounds.length === 0 && (
                <div className="text-sm text-muted">No rounds yet.</div>
              )}
              {rounds.map((round) => {
                const display = roundDisplay(round);
                const selected = round.id === roundId;
                const isCompleted = round.status === 'completed' || round.status === 'locked';
                return (
                  <button
                    key={round.id}
                    type="button"
                    onClick={() => {
                      preselectRef.current = true;
                      setRoundId(round.id);
                    }}
                    className={`surface-inset w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                      selected ? 'bg-panel3 border-accent-ink shadow-float' : ''
                    } ${isCompleted ? 'opacity-80' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text">{display.title}</div>
                        <div className="mt-1 text-xs leading-snug text-muted">{display.detail}</div>
                      </div>
                      <StampBadge
                        label={roundStatusLabel(round.status)}
                        variant={round.status === 'live' ? 'approved' : isCompleted ? 'locked' : 'inspected'}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </AccordionSection>
          <AccordionSection title="Waiting Room">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="ui-label">Leaderboard</div>
                <SecondaryButton className="h-11" onClick={toggleFullLeaderboard} disabled={!eventId}>
                  {showFullLeaderboard ? 'Hide Full Leaderboard' : 'Show Full Leaderboard'}
                </SecondaryButton>
              </div>
              <label className="flex flex-col gap-2 text-sm text-muted">
                <span className="ui-label">Message</span>
                <textarea
                  className="min-h-[96px] px-3 py-2"
                  value={waitingMessage}
                  onChange={(event) => setWaitingMessage(event.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={waitingShowLeaderboard}
                  onChange={(event) => setWaitingShowLeaderboard(event.target.checked)}
                />
                Show Leaderboard
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={waitingShowNextRound}
                  onChange={(event) => setWaitingShowNextRound(event.target.checked)}
                />
                Show Next Round Info
              </label>
              {waitingError && (
                <div className="rounded-lg border border-danger bg-panel px-3 py-2 text-sm text-danger-ink">
                  {waitingError}
                </div>
              )}
              {waitingShowLeaderboard && (
                <SecondaryButton className="h-11" onClick={() => window.open(`/events/${eventId}/leaderboard`, '_blank')}>
                  View Full Leaderboard
                </SecondaryButton>
              )}
              <PrimaryButton className="h-11" onClick={saveWaitingRoom} disabled={waitingSaving}>
                {waitingSaving ? 'Updating…' : 'Update Waiting Room'}
              </PrimaryButton>
            </div>
          </AccordionSection>
          <AccordionSection title="Round Control" defaultOpen>
            <div className="flex flex-col gap-4">
              <div className="ui-label">Event</div>
              <div className="text-base font-semibold text-text">{event.title}</div>
              <ButtonLink to={`/events/${event.id}`} variant="secondary" className="h-11">
                Back to Event
              </ButtonLink>
              <div className="surface-inset p-3 text-sm text-muted">
                {activeRound ? `Status: ${roundStatusLabel(activeRound.status)}` : 'Awaiting round selection'}
              </div>
            </div>
          </AccordionSection>
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
