import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { logError } from '../lib/log';
import { useTheme } from '../lib/theme';
import { AudioVisualizer } from '../components/play/AudioVisualizer';
import { ChoiceList } from '../components/play/ChoiceList';
import { MediaFrame } from '../components/play/MediaFrame';
import { PlayFooterHint } from '../components/play/PlayFooterHint';
import { PlayHeader } from '../components/play/PlayHeader';
import { PlayShell } from '../components/play/PlayShell';
import { PlayStage } from '../components/play/PlayStage';
import { PromptHero } from '../components/play/PromptHero';
import { SwipeHint } from '../components/play/SwipeHint';

const POLL_MS = 8000;
const POLL_BACKUP_MS = 15000;
const STREAM_RETRY_BASE_MS = 2000;
const STREAM_RETRY_MAX_MS = 30000;

const parseChoices = (choicesJson?: string | null) => {
  if (!choicesJson) return [];
  try {
    const parsed = JSON.parse(choicesJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((choice) => typeof choice === 'string' && choice.trim().length > 0);
    }
  } catch {
    return [];
  }
  return [];
};

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

type PublicEventResponse = {
  event: {
    id: string;
    title: string;
    starts_at: string;
    status: string;
    public_code: string;
    location_name: string | null;
  };
  rounds: {
    id: string;
    round_number: number;
    label: string;
    status: string;
    timer_seconds?: number | null;
    is_speed_round?: boolean;
    allow_participant_audio_stop?: boolean;
  }[];
  teams: { id: string; name: string }[];
  leaderboard: { team_id: string; name: string; total: number }[];
  live: {
    active_round_id: string | null;
    current_item_ordinal: number | null;
    audio_playing: boolean;
    reveal_answer: boolean;
    reveal_fun_fact: boolean;
    waiting_message: string | null;
    waiting_show_leaderboard: boolean;
    waiting_show_next_round: boolean;
    show_full_leaderboard: boolean;
    timer_started_at: string | null;
    timer_duration_seconds: number | null;
    participant_audio_stopped_by_team_name?: string | null;
  } | null;
  visual_round?: boolean;
  visual_items?: {
    id: string;
    question_type?: 'text' | 'multiple_choice';
    choices_json?: string | null;
    prompt: string;
    answer?: string;
    answer_a?: string | null;
    answer_b?: string | null;
    answer_a_label?: string | null;
    answer_b_label?: string | null;
    answer_parts_json?: string | null;
    fun_fact?: string | null;
    media_type: string | null;
    media_key: string | null;
    ordinal: number;
  }[];
  speed_round_answers?: { ordinal: number; answer: string; song: string | null; artist: string | null }[] | null;
  current_item: {
    id?: string;
    question_type?: 'text' | 'multiple_choice';
    choices_json?: string | null;
    prompt: string;
    answer?: string;
    answer_a?: string | null;
    answer_b?: string | null;
    answer_a_label?: string | null;
    answer_b_label?: string | null;
    answer_parts_json?: string | null;
    fun_fact?: string | null;
    media_type: string | null;
    media_key: string | null;
  } | null;
  response_counts?: {
    total: number;
    counts: number[];
  } | null;
};

export function PlayDisplayPage() {
  const { code } = useParams();
  const location = useLocation();
  const [data, setData] = useState<PublicEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [visualIndex, setVisualIndex] = useState(0);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number | null>(null);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const countdownRef = useRef<number | null>(null);
  const swipeHintRef = useRef<number | null>(null);
  const normalizedCode = useMemo(() => (code ?? '').trim().toUpperCase(), [code]);
  const token = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return (search.get('token') ?? '').trim();
  }, [location.search]);

  const load = async () => {
    if (!normalizedCode || !token) return;
    const res = await api.publicDisplayEvent(normalizedCode, token);
    if (res.ok) {
      setData(res.data as PublicEventResponse);
      setError(null);
      setLoading(false);
    } else {
      setError(formatApiError(res, 'Display view unavailable.'));
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!normalizedCode || !token) return;
    let cancelled = false;
    let timer: number | null = null;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let retryCount = 0;

    const applyData = (payload: PublicEventResponse) => {
      if (cancelled) return;
      setData(payload);
      setError(null);
      setLoading(false);
    };

    const startPolling = (intervalMs = POLL_MS) => {
      if (timer) return;
      load();
      timer = window.setInterval(load, intervalMs);
    };

    const stopPolling = () => {
      if (!timer) return;
      window.clearInterval(timer);
      timer = null;
    };

    const scheduleStreamRetry = () => {
      if (retryTimer) return;
      const delay = Math.min(STREAM_RETRY_MAX_MS, STREAM_RETRY_BASE_MS * 2 ** retryCount);
      retryCount += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        startStream();
      }, delay);
    };

    const startStream = () => {
      source = new EventSource(api.publicDisplayStreamUrl(normalizedCode, token));
      source.addEventListener('open', () => {
        retryCount = 0;
        stopPolling();
      });
      source.addEventListener('update', (event) => {
        try {
          const next = JSON.parse((event as MessageEvent).data) as PublicEventResponse;
          applyData(next);
        } catch {
          // Ignore malformed stream payloads and keep polling fallback.
        }
      });
      source.addEventListener('error', () => {
        if (cancelled) return;
        source?.close();
        source = null;
        scheduleStreamRetry();
        if (!timer) startPolling(POLL_BACKUP_MS);
      });
    };

    if (typeof EventSource === 'undefined') {
      startPolling();
    } else {
      startStream();
      load();
    }

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [normalizedCode, token]);

  useEffect(() => {
    setMediaError(null);
  }, [data?.current_item?.media_key, data?.current_item?.media_type, visualIndex, data?.visual_items?.length]);

  useEffect(() => {
    setVisualIndex(0);
  }, [data?.live?.active_round_id, data?.visual_items?.length]);

  useEffect(() => {
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (data?.visual_round) {
      setTimerRemainingSeconds(null);
      return () => {};
    }
    const updateTimer = () => {
      const startedAt = data?.live?.timer_started_at;
      const duration = data?.live?.timer_duration_seconds;
      if (!startedAt || !duration) {
        setTimerRemainingSeconds(null);
        return;
      }
      const startMs = new Date(startedAt).getTime();
      if (Number.isNaN(startMs)) {
        setTimerRemainingSeconds(null);
        return;
      }
      const remaining = Math.max(0, Math.ceil((startMs + duration * 1000 - Date.now()) / 1000));
      setTimerRemainingSeconds(remaining);
    };
    updateTimer();
    if (data?.live?.timer_started_at && data?.live?.timer_duration_seconds) {
      countdownRef.current = window.setInterval(updateTimer, 1000);
    }
    return () => {
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [
    data?.live?.timer_started_at,
    data?.live?.timer_duration_seconds,
    data?.live?.current_item_ordinal,
    data?.live?.active_round_id,
    data?.visual_round
  ]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!showSwipeHint) return;
    if (swipeHintRef.current) {
      window.clearTimeout(swipeHintRef.current);
    }
    swipeHintRef.current = window.setTimeout(() => setShowSwipeHint(false), 2000);
  }, [showSwipeHint]);

  useEffect(() => {
    return () => {
      if (swipeHintRef.current) {
        window.clearTimeout(swipeHintRef.current);
      }
    };
  }, []);

  const activeRound = data?.rounds.find((round) => round.id === data?.live?.active_round_id) ?? null;
  const isLive = activeRound?.status === 'live';
  const speedRoundMode = Boolean(isLive && activeRound?.is_speed_round);
  const visualItems = data?.visual_items ?? [];
  const visualMode = Boolean(isLive && data?.visual_round && visualItems.length > 0);
  const displayItem = visualMode ? visualItems[visualIndex] : data?.current_item ?? null;
  const suppressItemTimer = Boolean(data?.visual_round);
  const timerExpired = !suppressItemTimer && timerRemainingSeconds !== null && timerRemainingSeconds <= 0;
  const responseCounts = data?.response_counts ?? null;

  const triggerSwipeHint = () => {
    if (!visualMode) return;
    setShowSwipeHint(true);
  };

  const handleSwipeStart = (event: React.TouchEvent) => {
    triggerSwipeHint();
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleSwipeEnd = (event: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    if (!visualMode || visualItems.length <= 1) return;
    if (event.changedTouches.length === 0) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) {
      setVisualIndex((prev) => Math.min(prev + 1, visualItems.length - 1));
    } else {
      setVisualIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  if (!normalizedCode) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="play-panel rounded-sm px-4 py-3 text-sm font-medium text-muted">Invalid event code.</div>
        </PlayStage>
      </PlayShell>
    );
  }

  if (!token) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="play-panel rounded-sm border-danger px-6 py-4 text-sm text-danger-ink">
            Missing display token. Ask the host to share a fresh participant display URL.
          </div>
        </PlayStage>
      </PlayShell>
    );
  }

  if (loading) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="play-panel rounded-sm px-4 py-3 text-sm font-medium text-muted">Loading event display…</div>
        </PlayStage>
      </PlayShell>
    );
  }

  if (error || !data) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="play-panel rounded-sm border-danger px-6 py-4 text-sm text-danger-ink">
            {error ?? 'Display unavailable.'}
          </div>
        </PlayStage>
      </PlayShell>
    );
  }

  const isClosed = data.event.status === 'completed' || data.event.status === 'canceled';
  const waitingMessage = data.live?.waiting_message?.trim() ?? '';
  const waitingShowLeaderboard = data.live?.waiting_show_leaderboard ?? false;
  const waitingShowNextRound = data.live?.waiting_show_next_round ?? true;
  const showingFullLeaderboard = Boolean(data.live?.show_full_leaderboard);
  const questionLabel = visualMode
    ? `Round ${activeRound?.round_number ?? ''} • Image ${visualIndex + 1} of ${visualItems.length}`.trim()
    : speedRoundMode
      ? `Round ${activeRound?.round_number ?? ''} • Speed round`.trim()
      : activeRound && data.live?.current_item_ordinal
        ? `Round ${activeRound.round_number} • Question ${data.live.current_item_ordinal}`
        : 'Question';
  const answerParts = parseAnswerParts(displayItem?.answer_parts_json);
  const answerText = answerParts.length > 0
    ? answerParts.map((part) => `${part.label}: ${part.answer}`).join(' / ')
    : displayItem?.answer || (displayItem?.answer_a && displayItem?.answer_b
      ? `${displayItem.answer_a_label ? `${displayItem.answer_a_label}: ` : 'A: '}${displayItem.answer_a} / ${displayItem.answer_b_label ? `${displayItem.answer_b_label}: ` : 'B: '}${displayItem.answer_b}`
      : null);
  const promptText = displayItem?.prompt?.trim()
    ? speedRoundMode ? 'Play the clip and collect answers before reveal.' : displayItem.prompt
    : displayItem?.media_type === 'audio'
      ? 'Listen to the clip.'
      : speedRoundMode
        ? 'Play the clip and collect answers before reveal.'
        : '';
  const showAudioClue = speedRoundMode || displayItem?.media_type === 'audio';
  const choiceOptions = displayItem?.question_type === 'multiple_choice' ? parseChoices(displayItem.choices_json) : [];
  const maxResponseCount = responseCounts?.counts ? Math.max(1, ...responseCounts.counts) : 1;
  const timerDurationSeconds = data.live?.timer_duration_seconds ?? activeRound?.timer_seconds ?? 15;
  const timerActive = !suppressItemTimer && Boolean(data.live?.timer_started_at && data.live?.timer_duration_seconds);
  const timerLabel = (() => {
    const totalSeconds = timerRemainingSeconds ?? timerDurationSeconds;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  })();
  const nextRound = (() => {
    const rounds = data?.rounds ?? [];
    const ordered = [...rounds].sort((a, b) => a.round_number - b.round_number);
    return ordered.find((round) => !['completed', 'locked', 'canceled'].includes(round.status)) ?? null;
  })();
  const isQuestionActive = Boolean(isLive && displayItem);
  const headerMeta = `${data.event.location_name ?? 'Location TBD'} • ${new Date(data.event.starts_at).toLocaleString()}`;
  const showHeader = !isQuestionActive;

  const waitingRoom = (
    <div className="flex w-full flex-col items-center gap-5 text-center">
      <div className="play-chip">Waiting room</div>
      <PromptHero>{waitingMessage || 'Stand by for the next round.'}</PromptHero>
      {waitingShowNextRound && nextRound && (
        <div className="text-sm text-muted">
          Up next: Round {nextRound.round_number}
          {nextRound.label ? ` — ${nextRound.label}` : ''}
        </div>
      )}
    </div>
  );

  const headerMenu = (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="Display menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className="play-touch flex h-10 w-10 flex-col items-center justify-center gap-1 rounded-md border border-border bg-panel2"
      >
        <span className="h-0.5 w-4 bg-text" />
        <span className="h-0.5 w-4 bg-text" />
        <span className="h-0.5 w-4 bg-text" />
      </button>
      {menuOpen && (
        <div className="play-panel absolute right-0 mt-2 min-w-[190px] rounded-sm p-2 text-left shadow-sm">
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={toggleTheme}
            className="play-touch w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
          >
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      )}
    </div>
  );

  if (isClosed) {
    const closedLabel = data.event.status === 'canceled' ? 'Canceled' : 'Closed';
    return (
      <PlayShell>
        {showHeader && (
          <PlayHeader title={data.event.title} code={data.event.public_code} meta={headerMeta} menu={headerMenu} />
        )}
        <PlayStage scrollable>
          <div className="flex w-full max-w-2xl flex-col items-center gap-4 text-center">
            <div className="play-chip">Event {closedLabel}</div>
            <PromptHero>This event is {closedLabel.toLowerCase()}.</PromptHero>
            <div className="text-sm text-muted">Check with the host for the next session.</div>
          </div>
        </PlayStage>
      </PlayShell>
    );
  }

  return (
    <PlayShell>
      {showHeader && (
        <PlayHeader
          title={data.event.title}
          code={data.event.public_code}
          meta={headerMeta}
          menu={headerMenu}
        />
      )}
      <PlayStage fullBleed={isQuestionActive} scrollable>
        {showingFullLeaderboard ? (
          <div className="w-full max-w-2xl space-y-3 text-left">
            <div className="play-chip">Leaderboard</div>
            {data.leaderboard.length === 0 && <div className="text-sm text-muted">No scores yet.</div>}
            <div className="play-panel divide-y divide-border rounded-md">
              {data.leaderboard.map((entry, index) => (
                <div key={entry.team_id} className="play-list-row text-text">
                  <div className="flex items-center gap-3">
                    <span className={`play-rank ${index < 3 ? 'play-rank-top' : ''}`}>#{index + 1}</span>
                    <div className="text-sm font-semibold">{entry.name}</div>
                  </div>
                  <div className="text-sm font-semibold">{entry.total}</div>
                </div>
              ))}
            </div>
          </div>
        ) : isLive ? (
          displayItem ? (
            <div className="flex w-full flex-col items-center gap-3 text-center sm:gap-4">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {activeRound?.label && <div className="play-chip">{activeRound.label}</div>}
                <div className="play-chip">{questionLabel}</div>
              </div>
              {displayItem.media_type === 'image' && displayItem.media_key ? (
                <div className="w-full">
                  <div className="flex w-full flex-col gap-3 landscape:flex-row landscape:items-start">
                    <div className="order-2 w-full landscape:order-1 landscape:w-[58%]">
                      <MediaFrame>
                        <div onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd} onClick={triggerSwipeHint}>
                          <img
                            className="max-h-[44vh] w-full object-contain landscape:max-h-[42vh]"
                            src={api.publicMediaUrl(data.event.public_code, displayItem.media_key)}
                            alt="Media"
                            onError={() => {
                              setMediaError('Media unavailable.');
                              logError('display_media_error', {
                                eventId: data.event.id,
                                mediaKey: displayItem.media_key ?? null
                              });
                            }}
                          />
                        </div>
                      </MediaFrame>
                      {mediaError && (
                        <div className="play-panel mt-3 rounded-sm border-danger px-3 py-2 text-xs text-danger-ink">
                          {mediaError}
                        </div>
                      )}
                      {visualMode && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setVisualIndex((prev) => Math.max(prev - 1, 0))}
                              disabled={visualIndex === 0}
                              className="play-touch inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border bg-panel2 px-3 py-1 disabled:opacity-50"
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisualIndex((prev) => Math.min(prev + 1, visualItems.length - 1))}
                              disabled={visualIndex >= visualItems.length - 1}
                              className="play-touch inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border bg-panel2 px-3 py-1 disabled:opacity-50"
                            >
                              ›
                            </button>
                          </div>
                          <span>
                            Image {visualIndex + 1} / {visualItems.length}
                          </span>
                        </div>
                      )}
                      {visualMode && (
                        <div className="mt-3">
                          <SwipeHint visible={showSwipeHint} />
                        </div>
                      )}
                    </div>
                    <div className="order-1 w-full landscape:order-2 landscape:w-[42%]">
                      {promptText && (
                        <PromptHero
                          align="left"
                          className="text-[clamp(1.5rem,6.8vw,2.8rem)] leading-[1.1] landscape:text-[clamp(1.2rem,3.4vw,2.2rem)]"
                        >
                          {promptText}
                        </PromptHero>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {promptText && (
                    <PromptHero className="text-[clamp(1.65rem,8.2vw,3.2rem)] leading-[1.12] landscape:text-[clamp(1.35rem,4.2vw,2.4rem)]">
                      {promptText}
                    </PromptHero>
                  )}
                  {mediaError && (
                    <div className="play-panel rounded-sm border-danger px-3 py-2 text-xs text-danger-ink">{mediaError}</div>
                  )}
                  {showAudioClue && (
                    <div className="w-full max-w-3xl space-y-3">
                      <div className="play-panel flex items-center gap-3 rounded-md px-4 py-3 text-left">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-panel2">
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="h-5 w-5 text-text"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15 9a4 4 0 0 1 0 6" />
                            <path d="M19 7a8 8 0 0 1 0 10" />
                          </svg>
                        </span>
                        <div>
                          <div className="text-xs font-medium text-muted">Audio clue</div>
                          <div className="text-sm text-muted">
                            {data.live?.audio_playing
                              ? speedRoundMode
                                ? 'Host audio is playing for this speed round.'
                                : 'Host audio is playing now.'
                              : 'Audio playback is controlled by the host.'}
                          </div>
                          {!data.live?.audio_playing && data.live?.participant_audio_stopped_by_team_name && (
                            <div className="text-sm text-accent-ink">
                              Stopped by {data.live.participant_audio_stopped_by_team_name}.
                            </div>
                          )}
                        </div>
                      </div>
                      <AudioVisualizer active={Boolean(data.live?.audio_playing)} />
                    </div>
                  )}
                </>
              )}
              {displayItem.question_type === 'multiple_choice' && choiceOptions.length > 0 && (
                <div className="w-full max-w-3xl text-left">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-muted">
                    <span>Multiple choice</span>
                    {!suppressItemTimer && (
                      <span className={timerActive ? 'text-accent-ink' : 'text-muted'}>
                        {timerActive ? `Timer ${timerLabel}` : `Timer ${timerDurationSeconds}s`}
                      </span>
                    )}
                  </div>
                  <ChoiceList
                    className={
                      choiceOptions.length === 4
                        ? 'landscape:grid landscape:grid-flow-col landscape:grid-rows-2 landscape:gap-3'
                        : ''
                    }
                  >
                    {choiceOptions.map((choice, idx) => (
                      <div
                        key={`${choice}-${idx}`}
                        className="flex w-full items-start gap-3 rounded-md border border-border bg-panel3/60 px-4 py-3 text-left text-base text-text"
                      >
                        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-xs font-semibold text-muted">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="flex-1">{choice}</span>
                      </div>
                    ))}
                  </ChoiceList>
                  {!suppressItemTimer && !timerActive && (
                    <div className="mt-4">
                      <PlayFooterHint>Waiting for timer to start.</PlayFooterHint>
                    </div>
                  )}
                  {timerExpired && responseCounts && choiceOptions.length > 0 && (
                    <div className="mt-4 space-y-2.5">
                      <div className="text-xs font-medium text-muted">Team answers</div>
                      <div className="space-y-2">
                        {choiceOptions.map((choice, idx) => {
                          const count = responseCounts.counts[idx] ?? 0;
                          const width = Math.round((count / maxResponseCount) * 100);
                          return (
                            <div key={`${choice}-${idx}`} className="flex items-center gap-3">
                              <div className="w-6 text-xs font-medium text-muted">{String.fromCharCode(65 + idx)}</div>
                              <div className="flex-1 rounded-sm border border-border bg-panel2 p-1">
                                <div className="h-3 rounded-sm bg-accent-ink" style={{ width: `${width}%` }} />
                              </div>
                              <div className="w-8 text-right text-xs text-muted">{count}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs font-medium text-muted">Total responses: {responseCounts.total}</div>
                    </div>
                  )}
                </div>
              )}
              {data.live?.reveal_answer && (speedRoundMode ? (data.speed_round_answers ?? []).length > 0 : Boolean(answerText)) && (
                <div className="w-full max-w-4xl pt-4 text-center">
                  <div className="text-xs font-medium text-muted">{speedRoundMode ? 'Answers' : 'Answer'}</div>
                  {speedRoundMode ? (
                    <div className="mt-2 flex flex-col gap-1 text-left text-base font-semibold leading-snug md:text-lg">
                      {(data.speed_round_answers ?? []).map((entry) => (
                        <div key={`speed-answer-${entry.ordinal}`}>
                          {entry.ordinal}. {entry.answer}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-2xl font-display md:text-3xl">{answerText}</div>
                  )}
                </div>
              )}
              {data.live?.reveal_fun_fact && displayItem.fun_fact && (
                <div className="w-full max-w-4xl pt-4 text-center">
                  <div className="text-xs font-medium text-muted">Factoid</div>
                  <div className="mt-2 text-lg text-text">{displayItem.fun_fact}</div>
                </div>
              )}
            </div>
          ) : (
            waitingRoom
          )
        ) : (
          waitingRoom
        )}
        {!isLive && waitingShowLeaderboard && !showingFullLeaderboard && (
          <div className="w-full max-w-2xl space-y-3 text-left">
            <div className="play-chip">Leaderboard</div>
            {data.leaderboard.length === 0 && <div className="text-sm text-muted">No scores yet.</div>}
            <div className="play-panel divide-y divide-border rounded-md">
              {data.leaderboard.map((entry, index) => (
                <div key={entry.team_id} className="play-list-row text-text">
                  <div className="flex items-center gap-3">
                    <span className={`play-rank ${index < 3 ? 'play-rank-top' : ''}`}>#{index + 1}</span>
                    <div className="text-sm font-semibold">{entry.name}</div>
                  </div>
                  <div className="text-sm font-semibold">{entry.total}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PlayStage>
    </PlayShell>
  );
}
