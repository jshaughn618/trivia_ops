import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { logError } from '../lib/log';
import { useTheme } from '../lib/theme';
import { PlayShell } from '../components/play/PlayShell';
import { PlayHeader } from '../components/play/PlayHeader';
import { PlayStage } from '../components/play/PlayStage';
import { PromptHero } from '../components/play/PromptHero';
import { MediaFrame } from '../components/play/MediaFrame';
import { SwipeHint } from '../components/play/SwipeHint';
import { ChoiceList } from '../components/play/ChoiceList';
import { PrimaryCTA } from '../components/play/PrimaryCTA';
import { PlayFooterHint } from '../components/play/PlayFooterHint';

const POLL_MS = 8000;
const POLL_BACKUP_MS = 15000;
const STREAM_RETRY_BASE_MS = 2000;
const STREAM_RETRY_MAX_MS = 30000;
const RESPONSE_GRAPH_DELAY_MS = 2000;

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
  rounds: { id: string; round_number: number; label: string; status: string; timer_seconds?: number | null }[];
  teams: { id: string; name: string }[];
  leaderboard: { team_id: string; name: string; total: number }[];
  live: {
    active_round_id: string | null;
    current_item_ordinal: number | null;
    reveal_answer: boolean;
    reveal_fun_fact: boolean;
    waiting_message: string | null;
    waiting_show_leaderboard: boolean;
    waiting_show_next_round: boolean;
    show_full_leaderboard: boolean;
    timer_started_at: string | null;
    timer_duration_seconds: number | null;
  } | null;
  visual_round?: boolean;
  visual_items?: {
    id: string;
    question_type?: 'text' | 'multiple_choice';
    choices_json?: string | null;
    prompt: string;
    answer: string;
    answer_a: string | null;
    answer_b: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_parts_json: string | null;
    fun_fact: string | null;
    media_type: string | null;
    media_key: string | null;
    ordinal: number;
  }[];
  current_item: {
    id?: string;
    question_type?: 'text' | 'multiple_choice';
    choices_json?: string | null;
    prompt: string;
    answer: string;
    answer_a: string | null;
    answer_b: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_parts_json: string | null;
    fun_fact: string | null;
    media_type: string | null;
    media_key: string | null;
  } | null;
  response_counts?: {
    total: number;
    counts: number[];
  } | null;
};

export function PlayEventPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PublicEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState('');
  const [teamSession, setTeamSession] = useState('');
  const [teamCode, setTeamCode] = useState(['', '', '', '']);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [requireTeamName, setRequireTeamName] = useState(false);
  const [requireTeamNameCode, setRequireTeamNameCode] = useState('');
  const [teamNameLabel, setTeamNameLabel] = useState<string | null>(null);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [visualIndex, setVisualIndex] = useState(0);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  const [submittedChoiceIndex, setSubmittedChoiceIndex] = useState<number | null>(null);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState<number | null>(null);
  const { theme, toggleTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const countdownRef = useRef<number | null>(null);
  const swipeHintRef = useRef<number | null>(null);
  const teamCodeRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const lastResponseTotalRef = useRef(0);
  const [responseSync, setResponseSync] = useState<{ expectedTotal: number; expiresAt: number } | null>(null);
  const [graphDelayUntil, setGraphDelayUntil] = useState<number | null>(null);
  const graphDelayItemRef = useRef<string | null>(null);
  const normalizedCode = useMemo(() => (code ?? '').trim().toUpperCase(), [code]);
  const sanitizedDigits = (value: string) => value.replace(/\D/g, '');
  const teamCodeValue = teamCode.join('');
  const teamCodeReady = teamCode.every((digit) => digit.length === 1);

  const load = async () => {
    if (!normalizedCode) return;
    const res = await api.publicEvent(normalizedCode, 'play');
    if (res.ok) {
      setData(res.data as PublicEventResponse);
      setError(null);
      setLoading(false);
    } else {
      setError(formatApiError(res, 'Event not available.'));
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!normalizedCode) return;
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
      source = new EventSource(`/api/public/event/${encodeURIComponent(normalizedCode)}/stream?view=play`);
      source.addEventListener('open', () => {
        retryCount = 0;
        stopPolling();
      });
      source.addEventListener('update', (event) => {
        try {
          const next = JSON.parse((event as MessageEvent).data) as PublicEventResponse;
          applyData(next);
        } catch {
          // Ignore malformed events and let polling handle it if needed.
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
  }, [normalizedCode]);

  useEffect(() => {
    if (!data?.event?.id || !data?.event?.public_code) return;
    const storedByEvent = localStorage.getItem(`player_team_${data.event.id}`) ?? '';
    const storedByCode = localStorage.getItem(`player_team_id_${data.event.public_code}`) ?? '';
    const storedLegacy = localStorage.getItem(`player_team_code_${data.event.public_code}`) ?? '';
    const storedName = localStorage.getItem(`player_team_name_${data.event.public_code}`) ?? '';
    const storedSession = localStorage.getItem(`player_team_session_${data.event.public_code}`) ?? '';
    const nextTeamId = storedByEvent || storedByCode || storedLegacy;
    if (nextTeamId && storedSession) {
      setTeamId(nextTeamId);
      setTeamSession(storedSession);
      if (storedName) setTeamNameLabel(storedName);
    } else {
      setTeamId('');
      setTeamSession('');
    }
  }, [data?.event?.id, data?.event?.public_code]);

  useEffect(() => {
    if (!data) return;
    const matched = data.teams.find((team) => team.id === teamId);
    if (matched) setTeamNameLabel(matched.name);
  }, [data, teamId]);

  useEffect(() => {
    setMediaError(null);
  }, [data?.current_item?.media_key, data?.current_item?.media_type, visualIndex, data?.visual_items?.length]);

  useEffect(() => {
    setVisualIndex(0);
  }, [data?.live?.active_round_id, data?.visual_items?.length]);

  useEffect(() => {
    setSelectedChoiceIndex(null);
    setSubmittedChoiceIndex(null);
    setSubmitStatus('idle');
    setSubmitError(null);
    setResponseSync(null);
    setGraphDelayUntil(null);
    graphDelayItemRef.current = null;
  }, [data?.live?.active_round_id, data?.live?.current_item_ordinal, data?.current_item?.id]);

  useEffect(() => {
    if (!teamMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setTeamMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [teamMenuOpen]);

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
    if (!data?.live?.show_full_leaderboard) return;
    if (!data?.event?.public_code) return;
    const params = new URLSearchParams();
    params.set('from', 'host');
    const query = params.toString();
    navigate(`/play/${data.event.public_code}/leaderboard${query ? `?${query}` : ''}`);
  }, [data?.live?.show_full_leaderboard, data?.event?.public_code, teamId, navigate]);

  const activeRound = data?.rounds.find((round) => round.id === data?.live?.active_round_id) ?? null;
  const isLive = activeRound?.status === 'live';
  const visualItems = data?.visual_items ?? [];
  const visualMode = Boolean(isLive && data?.visual_round && visualItems.length > 0);
  const displayItem = visualMode ? visualItems[visualIndex] : data?.current_item ?? null;
  const suppressItemTimer = Boolean(data?.visual_round);
  const timerExpired = !suppressItemTimer && timerRemainingSeconds !== null && timerRemainingSeconds <= 0;
  const responseCounts = data?.response_counts ?? null;

  useEffect(() => {
    if (!visualMode) {
      setShowSwipeHint(false);
      return;
    }
    triggerSwipeHint();
  }, [visualMode, displayItem?.id]);

  useEffect(() => {
    return () => {
      if (swipeHintRef.current) {
        window.clearTimeout(swipeHintRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!responseCounts) {
      lastResponseTotalRef.current = 0;
      return;
    }
    lastResponseTotalRef.current = responseCounts.total;
  }, [responseCounts?.total, displayItem?.id]);

  useEffect(() => {
    if (!responseSync || !responseCounts) return;
    if (responseCounts.total >= responseSync.expectedTotal) {
      setResponseSync(null);
    }
  }, [responseCounts?.total, responseSync]);

  useEffect(() => {
    if (!responseSync) return;
    const delay = Math.max(0, responseSync.expiresAt - Date.now());
    const timeout = window.setTimeout(() => {
      setResponseSync(null);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [responseSync]);

  useEffect(() => {
    if (!timerExpired) return;
    if (!displayItem?.id) return;
    if (graphDelayItemRef.current === displayItem.id) return;
    graphDelayItemRef.current = displayItem.id;
    setGraphDelayUntil(Date.now() + RESPONSE_GRAPH_DELAY_MS);
  }, [timerExpired, displayItem?.id]);

  useEffect(() => {
    if (!graphDelayUntil) return;
    const delay = Math.max(0, graphDelayUntil - Date.now());
    const timeout = window.setTimeout(() => {
      setGraphDelayUntil(null);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [graphDelayUntil]);

  const triggerSwipeHint = () => {
    if (!visualMode) return;
    if (swipeHintRef.current) {
      window.clearTimeout(swipeHintRef.current);
    }
    setShowSwipeHint(true);
    swipeHintRef.current = window.setTimeout(() => setShowSwipeHint(false), 2000);
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

  const handleJoin = async () => {
    if (!data) return;
    const normalized = sanitizedDigits(teamCodeValue);
    if (!normalized) {
      setJoinError('Enter the team code from your scoresheet.');
      return;
    }
    setJoinError(null);
    setJoinLoading(true);
    const namePayload = teamNameInput.trim();
    const res = await api.publicJoin(data.event.public_code, {
      team_code: normalized,
      ...(namePayload ? { team_name: namePayload } : {})
    });
    if (res.ok) {
      setTeamId(res.data.team.id);
      setTeamSession(res.data.session_token);
      setTeamNameLabel(res.data.team.name);
      localStorage.setItem(`player_team_${data.event.id}`, res.data.team.id);
      localStorage.setItem(`player_team_id_${data.event.public_code}`, res.data.team.id);
      localStorage.setItem(`player_team_code_${data.event.public_code}`, res.data.team.id);
      localStorage.setItem(`player_team_name_${data.event.public_code}`, res.data.team.name);
      localStorage.setItem(`player_team_session_${data.event.public_code}`, res.data.session_token);
      setTeamCode(['', '', '', '']);
      setTeamNameInput('');
      setRequireTeamName(false);
      setRequireTeamNameCode('');
      setJoinError(null);
    } else {
      if (res.error?.code === 'team_name_required') {
        setRequireTeamName(true);
        setRequireTeamNameCode(normalized);
      }
      setJoinError(formatApiError(res, 'Unable to join team.'));
    }
    setJoinLoading(false);
  };

  const handleChangeTeam = () => {
    if (!data?.event?.id || !data?.event?.public_code) return;
    localStorage.removeItem(`player_team_${data.event.id}`);
    localStorage.removeItem(`player_team_id_${data.event.public_code}`);
    localStorage.removeItem(`player_team_code_${data.event.public_code}`);
    localStorage.removeItem(`player_team_name_${data.event.public_code}`);
    localStorage.removeItem(`player_team_session_${data.event.public_code}`);
    setTeamId('');
    setTeamSession('');
    setTeamNameLabel(null);
    setTeamCode(['', '', '', '']);
    setTeamNameInput('');
    setRequireTeamName(false);
    setRequireTeamNameCode('');
    setTeamMenuOpen(false);
  };

  const handleSessionExpired = (message: string) => {
    handleChangeTeam();
    setJoinError(message);
    setSubmitStatus('error');
    setSubmitError(message);
  };

  const handleSubmitChoice = async () => {
    if (!data?.event?.public_code || !teamId || !displayItem?.id) return;
    if (!teamSession) {
      handleSessionExpired('Your team session expired. Re-enter the team code to continue.');
      return;
    }
    if (selectedChoiceIndex === null) {
      setSubmitError('Select an option first.');
      setSubmitStatus('error');
      return;
    }
    setSubmitStatus('submitting');
    setSubmitError(null);
    const res = await api.publicSubmitChoice(data.event.public_code, {
      team_id: teamId,
      item_id: displayItem.id,
      choice_index: selectedChoiceIndex,
      session_token: teamSession
    });
    if (res.ok) {
      setSubmittedChoiceIndex(selectedChoiceIndex);
      setSubmitStatus('submitted');
      const expectedTotal = Math.max(0, lastResponseTotalRef.current) + 1;
      setResponseSync({ expectedTotal, expiresAt: Date.now() + 3000 });
    } else {
      if (res.error?.code === 'team_session_invalid' || res.error?.code === 'team_session_required') {
        handleSessionExpired(res.error.message ?? 'Your team session expired. Re-enter the team code to continue.');
        return;
      }
      setSubmitStatus('error');
      setSubmitError(formatApiError(res, 'Failed to submit choice.'));
    }
  };

  useEffect(() => {
    if (!timerExpired) return;
    if (submittedChoiceIndex !== null) return;
    if (submitStatus === 'submitting') return;
    if (selectedChoiceIndex === null) return;
    if (!displayItem?.id || !data?.event?.public_code || !teamId || !teamSession) return;
    handleSubmitChoice();
  }, [
    timerExpired,
    selectedChoiceIndex,
    submittedChoiceIndex,
    submitStatus,
    displayItem?.id,
    data?.event?.public_code,
    teamId,
    teamSession
  ]);

  if (!normalizedCode) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="text-sm font-medium text-muted">Invalid code</div>
        </PlayStage>
      </PlayShell>
    );
  }

  if (loading) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="text-sm font-medium text-muted">Loading event</div>
        </PlayStage>
      </PlayShell>
    );
  }

  if (error || !data) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="rounded-2xl border border-danger bg-panel2 px-6 py-4 text-sm text-danger-ink">
            {error ?? 'Event not found'}
          </div>
        </PlayStage>
      </PlayShell>
    );
  }

  const isClosed = data.event.status === 'completed' || data.event.status === 'canceled';
  const waitingMessage = data.live?.waiting_message?.trim() ?? '';
  const waitingShowLeaderboard = data.live?.waiting_show_leaderboard ?? false;
  const waitingShowNextRound = data.live?.waiting_show_next_round ?? true;
  const questionLabel = visualMode
    ? `Round ${activeRound?.round_number ?? ''} • Image ${visualIndex + 1} of ${visualItems.length}`.trim()
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
    ? displayItem.prompt
    : displayItem?.media_type === 'audio'
      ? 'Listen to the clip.'
      : '';
  const choiceOptions =
    displayItem?.question_type === 'multiple_choice' ? parseChoices(displayItem.choices_json) : [];
  const awaitingResponseSync = Boolean(responseSync);
  const awaitingGraphDelay = graphDelayUntil !== null;
  const maxResponseCount = responseCounts?.counts
    ? Math.max(1, ...responseCounts.counts)
    : 1;
  const timerDurationSeconds = data.live?.timer_duration_seconds ?? activeRound?.timer_seconds ?? 15;
  const timerActive = !suppressItemTimer && Boolean(data.live?.timer_started_at && data.live?.timer_duration_seconds);
  const timerBlocked = !suppressItemTimer && (!timerActive || timerExpired);
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
  const headerMeta = `${data.event.location_name ?? 'Location TBD'} • ${new Date(
    data.event.starts_at
  ).toLocaleString()}`;
  const showHeader = !isQuestionActive;

  const waitingRoom = (
    <div className="flex w-full flex-col items-center gap-5 text-center">
      <div className="text-xs uppercase tracking-[0.35em] text-muted">Waiting room</div>
      <PromptHero>{waitingMessage || 'Stand by for the next round.'}</PromptHero>
      {waitingShowNextRound && nextRound && (
        <div className="text-sm text-muted">
          Up next: Round {nextRound.round_number}
          {nextRound.label ? ` — ${nextRound.label}` : ''}
        </div>
      )}
    </div>
  );

  if (isClosed) {
    const closedLabel = data.event.status === 'canceled' ? 'Canceled' : 'Closed';
    return (
      <PlayShell>
        {showHeader && (
          <PlayHeader
            title={data.event.title}
            code={data.event.public_code}
            meta={headerMeta}
          />
        )}
        <PlayStage scrollable>
          <div className="flex w-full max-w-2xl flex-col items-center gap-4 text-center">
            <div className="text-xs uppercase tracking-[0.35em] text-muted">Event {closedLabel}</div>
            <PromptHero>This event is {closedLabel.toLowerCase()}.</PromptHero>
            <div className="text-sm text-muted">Check with the host for the next session.</div>
            <SecondaryButton onClick={() => navigate('/login')}>Back to login</SecondaryButton>
          </div>
        </PlayStage>
      </PlayShell>
    );
  }

  const headerTeam = teamId && teamNameLabel ? <div className="text-xs font-medium">{teamNameLabel}</div> : null;
  const headerMenu =
    teamId && teamNameLabel ? (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Team menu"
          aria-haspopup="menu"
          aria-expanded={teamMenuOpen}
          onClick={() => setTeamMenuOpen((open) => !open)}
          className="flex h-8 w-8 flex-col items-center justify-center gap-1 rounded-md border border-border bg-panel2"
        >
          <span className="h-0.5 w-4 bg-text" />
          <span className="h-0.5 w-4 bg-text" />
          <span className="h-0.5 w-4 bg-text" />
        </button>
        {teamMenuOpen && (
          <div className="absolute right-0 mt-2 min-w-[180px] rounded-md border border-border bg-panel p-2 text-left shadow-sm">
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={toggleTheme}
              className="mb-2 w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
            >
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              type="button"
              onClick={handleChangeTeam}
              className="w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
            >
              Change Team
            </button>
          </div>
        )}
      </div>
    ) : null;

  return (
    <PlayShell>
      {showHeader && (
        <PlayHeader
          title={data.event.title}
          code={data.event.public_code}
          meta={headerMeta}
          team={headerTeam}
          menu={headerMenu}
        />
      )}
      <PlayStage fullBleed={isQuestionActive} scrollable>
        {!teamId ? (
          <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
            <div className="text-xs uppercase tracking-[0.35em] text-muted">Join your team</div>
            <PromptHero>Enter the team code from your scoresheet.</PromptHero>
            <div className="w-full rounded-2xl bg-panel/40 p-4 text-left">
              <div className="text-xs uppercase tracking-[0.3em] text-muted">Team code</div>
              <div className="mt-4 flex flex-col gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.25em] text-muted">Enter code</span>
                  <div className="flex justify-center gap-3">
                    {teamCode.map((value, index) => (
                      <input
                        key={`team-code-${index}`}
                        ref={(el) => {
                          teamCodeRefs.current[index] = el;
                        }}
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        className="h-14 w-14 border-2 border-strong bg-panel2 text-center text-2xl font-display tracking-[0.2em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                        value={value}
                        onChange={(event) => {
                          const next = sanitizedDigits(event.target.value).slice(0, 1);
                          setTeamCode((prev) => {
                            const updated = [...prev];
                            updated[index] = next;
                            const nextCode = updated.join('');
                            if (requireTeamName && requireTeamNameCode && nextCode !== requireTeamNameCode) {
                              setRequireTeamName(false);
                              setRequireTeamNameCode('');
                            }
                            if (updated.every((digit) => digit) && (!requireTeamName || teamNameInput.trim())) {
                              handleJoin();
                            }
                            return updated;
                          });
                          if (next && index < teamCodeRefs.current.length - 1) {
                            teamCodeRefs.current[index + 1]?.focus();
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Backspace' && !teamCode[index] && index > 0) {
                            teamCodeRefs.current[index - 1]?.focus();
                          }
                          if (event.key === 'Enter' && teamCodeReady) {
                            handleJoin();
                          }
                        }}
                        onPaste={(event) => {
                          event.preventDefault();
                          const paste = sanitizedDigits(event.clipboardData.getData('text'));
                          if (!paste) return;
                          setTeamCode((prev) => {
                            const updated = [...prev];
                            for (let i = 0; i < paste.length && index + i < updated.length; i += 1) {
                              updated[index + i] = paste[i];
                            }
                            const nextCode = updated.join('');
                            if (requireTeamName && requireTeamNameCode && nextCode !== requireTeamNameCode) {
                              setRequireTeamName(false);
                              setRequireTeamNameCode('');
                            }
                            if (updated.every((digit) => digit) && (!requireTeamName || teamNameInput.trim())) {
                              handleJoin();
                            }
                            return updated;
                          });
                          const nextIndex = Math.min(index + paste.length, teamCodeRefs.current.length - 1);
                          teamCodeRefs.current[nextIndex]?.focus();
                        }}
                        aria-label={`Team code digit ${index + 1}`}
                      />
                    ))}
                  </div>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.25em] text-muted">
                    {requireTeamName ? 'Team name required' : 'Team name (only for new teams)'}
                  </span>
                  <input
                    className="h-10 px-3"
                    value={teamNameInput}
                    onChange={(event) => setTeamNameInput(event.target.value)}
                    placeholder="Enter your team name"
                  />
                </label>
                {joinError && (
                  <div className="rounded-md border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink" aria-live="polite">
                    {joinError}
                  </div>
                )}
                <PrimaryButton
                  onClick={handleJoin}
                  disabled={joinLoading || !teamCodeReady || (requireTeamName && !teamNameInput.trim())}
                >
                  {joinLoading ? 'Joining…' : 'Join'}
                </PrimaryButton>
              </div>
            </div>
          </div>
        ) : isLive ? (
          displayItem ? (
            <div className="flex w-full flex-col items-center gap-6 text-center">
              {activeRound?.label && (
                <div className="text-xs uppercase tracking-[0.35em] text-muted">{activeRound.label}</div>
              )}
              <div className="text-xs uppercase tracking-[0.35em] text-muted">{questionLabel}</div>
              {displayItem.media_type === 'image' && displayItem.media_key ? (
                <div className="w-full">
                  <div className="flex w-full flex-col gap-6 landscape:flex-row landscape:items-center">
                    <div className="order-2 w-full landscape:order-1 landscape:w-[58%]">
                      <MediaFrame>
                        <div onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd} onClick={triggerSwipeHint}>
                          <img
                            className="max-h-[55vh] w-full object-contain landscape:max-h-[50vh]"
                            src={api.publicMediaUrl(data.event.public_code, displayItem.media_key)}
                            alt="Media"
                            onError={() => {
                              setMediaError('Media unavailable.');
                              logError('participant_media_error', {
                                eventId: data.event.id,
                                mediaKey: displayItem?.media_key ?? null
                              });
                            }}
                          />
                        </div>
                      </MediaFrame>
                      {mediaError && (
                        <div className="mt-3 rounded-md bg-panel px-3 py-2 text-xs text-danger-ink">
                          {mediaError}
                        </div>
                      )}
                      {visualMode && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setVisualIndex((prev) => Math.max(prev - 1, 0))}
                              disabled={visualIndex === 0}
                              className="rounded-full border border-border px-3 py-1 disabled:opacity-50"
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisualIndex((prev) => Math.min(prev + 1, visualItems.length - 1))}
                              disabled={visualIndex >= visualItems.length - 1}
                              className="rounded-full border border-border px-3 py-1 disabled:opacity-50"
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
                      {promptText && <PromptHero align="left">{promptText}</PromptHero>}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {promptText && <PromptHero>{promptText}</PromptHero>}
                  {mediaError && (
                    <div className="rounded-md bg-panel px-3 py-2 text-xs text-danger-ink">{mediaError}</div>
                  )}
                  {displayItem.media_type === 'audio' && (
                    <div className="flex items-center gap-3 rounded-2xl bg-panel/40 px-4 py-3 text-left">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-panel2">
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
                        <div className="text-xs uppercase tracking-[0.3em] text-muted">Audio clue</div>
                        <div className="text-sm text-muted">Listen for the clip.</div>
                      </div>
                    </div>
                  )}
                </>
              )}
              {displayItem.question_type === 'multiple_choice' && choiceOptions.length > 0 && (
                <div className="w-full max-w-3xl text-left">
                  <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted">
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
                    {choiceOptions.map((choice, idx) => {
                      const selected = selectedChoiceIndex === idx;
                      const submitted = submittedChoiceIndex === idx;
                      const highlight = selected || submitted;
                      return (
                        <button
                          key={`${choice}-${idx}`}
                          type="button"
                          onClick={() => {
                            setSelectedChoiceIndex(idx);
                            setSubmitStatus('idle');
                            setSubmitError(null);
                          }}
                          disabled={timerBlocked || submitStatus === 'submitting'}
                          className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-base transition ${
                            submitted
                              ? 'border-accent-ink bg-accent-soft text-text'
                              : selected
                                ? 'border-accent-ink bg-panel text-text'
                                : 'border-border bg-panel/40 text-text'
                          }`}
                        >
                          <span
                            className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                              highlight ? 'border-accent-ink text-accent-ink' : 'border-border text-muted'
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="flex-1">{choice}</span>
                        </button>
                      );
                    })}
                  </ChoiceList>
                  <div className="mt-5 flex flex-col items-center gap-3">
                    <PrimaryCTA
                      onClick={handleSubmitChoice}
                      disabled={timerBlocked || submitStatus === 'submitting' || selectedChoiceIndex === null}
                    >
                      {submitStatus === 'submitting' ? 'Submitting…' : 'Submit answer'}
                    </PrimaryCTA>
                    {!suppressItemTimer && !timerActive && (
                      <PlayFooterHint>Waiting for timer to start.</PlayFooterHint>
                    )}
                    {timerExpired && <PlayFooterHint className="text-danger">Time's up.</PlayFooterHint>}
                    {submitStatus === 'submitted' && !timerExpired && (
                      <PlayFooterHint>Answer submitted.</PlayFooterHint>
                    )}
                    {submitError && <PlayFooterHint className="text-danger">{submitError}</PlayFooterHint>}
                  </div>
                  {timerExpired && (awaitingResponseSync || awaitingGraphDelay) && (
                    <div className="mt-6">
                      <PlayFooterHint>Collecting responses…</PlayFooterHint>
                    </div>
                  )}
                  {timerExpired &&
                    responseCounts &&
                    choiceOptions.length > 0 &&
                    !awaitingResponseSync &&
                    !awaitingGraphDelay &&
                    submitStatus !== 'submitting' && (
                    <div className="mt-6 space-y-3">
                      <div className="text-xs uppercase tracking-[0.3em] text-muted">Team answers</div>
                      <div className="space-y-2">
                        {choiceOptions.map((choice, idx) => {
                          const count = responseCounts.counts[idx] ?? 0;
                          const width = Math.round((count / maxResponseCount) * 100);
                          return (
                            <div key={`${choice}-${idx}`} className="flex items-center gap-3">
                              <div className="w-6 text-xs uppercase tracking-[0.3em] text-muted">
                                {String.fromCharCode(65 + idx)}
                              </div>
                              <div className="flex-1 rounded-full bg-panel/40 p-1">
                                <div className="h-3 rounded-full bg-accent-ink" style={{ width: `${width}%` }} />
                              </div>
                              <div className="w-8 text-right text-xs text-muted">{count}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">
                        Total responses: {responseCounts.total}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {data.live?.reveal_answer && answerText && (
                <div className="w-full max-w-4xl pt-4 text-center">
                  <div className="text-xs uppercase tracking-[0.3em] text-muted">Answer</div>
                  <div className="mt-2 text-2xl font-display md:text-3xl">{answerText}</div>
                </div>
              )}
              {data.live?.reveal_fun_fact && displayItem.fun_fact && (
                <div className="w-full max-w-4xl pt-4 text-center">
                  <div className="text-xs uppercase tracking-[0.3em] text-muted">Factoid</div>
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
        {!isLive && waitingShowLeaderboard && (
          <div className="w-full max-w-2xl space-y-3 text-left">
            <div className="text-xs uppercase tracking-[0.35em] text-muted">Leaderboard</div>
            {data.leaderboard.length === 0 && <div className="text-sm text-muted">No scores yet.</div>}
            <div className="divide-y divide-border rounded-2xl bg-panel/40">
              {data.leaderboard.map((entry, index) => (
                <div
                  key={entry.team_id}
                  className={`flex items-center justify-between px-4 py-2 ${
                    teamId && entry.team_id === teamId ? 'text-accent-ink' : 'text-text'
                  }`}
                >
                  <div className="text-xs text-muted">#{index + 1}</div>
                  <div className="text-sm font-medium">{entry.name}</div>
                  <div className="text-xs text-muted">{entry.total}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PlayStage>
      {showHeader && (
        <div className="px-4 pb-6 pt-2 sm:px-6">
          <SecondaryButton onClick={() => navigate('/login')}>Back to login</SecondaryButton>
        </div>
      )}
    </PlayShell>
  );
}
