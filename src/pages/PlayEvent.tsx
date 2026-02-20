import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { PrimaryButton } from '../components/Buttons';
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
import { AudioVisualizer } from '../components/play/AudioVisualizer';

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
  rounds: {
    id: string;
    round_number: number;
    label: string;
    status: string;
    timer_seconds?: number | null;
    is_speed_round?: boolean;
    allow_participant_audio_stop?: boolean;
    round_audio_key?: string | null;
    round_audio_name?: string | null;
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
    participant_audio_stopped_by_team_id?: string | null;
    participant_audio_stopped_by_team_name?: string | null;
    participant_audio_stopped_at?: string | null;
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
    answer_part_labels?: string[];
    fun_fact: string | null;
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
    answer: string;
    answer_a: string | null;
    answer_b: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_parts_json: string | null;
    answer_part_labels?: string[];
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
  const [stopAudioLoading, setStopAudioLoading] = useState(false);
  const [stopAudioError, setStopAudioError] = useState<string | null>(null);
  const [audioAnswerDrafts, setAudioAnswerDrafts] = useState<Record<string, string>>({});
  const [audioAnswerStatus, setAudioAnswerStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [audioAnswerError, setAudioAnswerError] = useState<string | null>(null);
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
    setAudioAnswerDrafts({});
    setAudioAnswerStatus('idle');
    setAudioAnswerError(null);
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
  const speedRoundMode = Boolean(isLive && activeRound?.is_speed_round);
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
        setJoinError(null);
        setJoinLoading(false);
        return;
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

  const handleStopAudio = async () => {
    if (!data?.event?.public_code || !teamId) return;
    if (!teamSession) {
      handleSessionExpired('Your team session expired. Re-enter the team code to continue.');
      return;
    }
    setStopAudioLoading(true);
    setStopAudioError(null);
    const res = await api.publicStopAudio(data.event.public_code, {
      team_id: teamId,
      session_token: teamSession
    });
    setStopAudioLoading(false);
    if (!res.ok) {
      if (res.error?.code === 'team_session_invalid' || res.error?.code === 'team_session_required') {
        handleSessionExpired(res.error.message ?? 'Your team session expired. Re-enter the team code to continue.');
        return;
      }
      setStopAudioError(formatApiError(res, 'Unable to stop audio.'));
      return;
    }
    setStopAudioError(null);
  };

  const handleSubmitAudioAnswer = async () => {
    if (!data?.event?.public_code || !teamId || !teamSession || !displayItem?.id) return;
    if (!canSubmitStoppedAudioAnswer) return;
    if (missingAudioAnswerLabels.length > 0) {
      setAudioAnswerStatus('error');
      setAudioAnswerError(`Complete all answer parts: ${missingAudioAnswerLabels.join(', ')}`);
      return;
    }

    setAudioAnswerStatus('submitting');
    setAudioAnswerError(null);
    const answers = answerPartLabels.map((label) => ({
      label,
      answer: (audioAnswerDrafts[label] ?? '').trim()
    }));

    const res = await api.publicSubmitAudioAnswer(data.event.public_code, {
      team_id: teamId,
      item_id: displayItem.id,
      session_token: teamSession,
      answers
    });

    if (res.ok) {
      setAudioAnswerStatus('submitted');
      setAudioAnswerError(null);
      return;
    }
    if (res.error?.code === 'team_session_invalid' || res.error?.code === 'team_session_required') {
      handleSessionExpired(res.error.message ?? 'Your team session expired. Re-enter the team code to continue.');
      return;
    }
    setAudioAnswerStatus('error');
    setAudioAnswerError(formatApiError(res, 'Failed to submit answers.'));
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
          <div className="play-panel rounded-sm px-4 py-3 text-sm font-medium text-muted">Invalid code</div>
        </PlayStage>
      </PlayShell>
    );
  }

  if (loading) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="play-panel rounded-sm px-4 py-3 text-sm font-medium text-muted">Loading event</div>
        </PlayStage>
      </PlayShell>
    );
  }

  if (error || !data) {
    return (
      <PlayShell>
        <PlayStage fullBleed scrollable>
          <div className="play-panel rounded-sm border-danger px-6 py-4 text-sm text-danger-ink">
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
  const canRequestAudioStop = Boolean(
    showAudioClue &&
    activeRound?.allow_participant_audio_stop &&
    data?.live?.audio_playing &&
    teamId &&
    teamSession
  );
  const answerPartLabels = displayItem?.answer_part_labels ?? [];
  const canSubmitStoppedAudioAnswer = Boolean(
    showAudioClue &&
    !data?.live?.audio_playing &&
    data?.live?.participant_audio_stopped_by_team_id === teamId &&
    teamId &&
    teamSession &&
    displayItem?.id &&
    answerPartLabels.length > 0
  );
  const missingAudioAnswerLabels = answerPartLabels.filter((label) => !(audioAnswerDrafts[label] ?? '').trim());
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

  if (isClosed) {
    const closedLabel = data.event.status === 'canceled' ? 'Canceled' : 'Closed';
    const closedMenu = (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Team menu"
          aria-haspopup="menu"
          aria-expanded={teamMenuOpen}
          onClick={() => setTeamMenuOpen((open) => !open)}
          className="play-touch flex h-10 w-10 flex-col items-center justify-center gap-1 rounded-md border border-border bg-panel2"
        >
          <span className="h-0.5 w-4 bg-text" />
          <span className="h-0.5 w-4 bg-text" />
          <span className="h-0.5 w-4 bg-text" />
        </button>
        {teamMenuOpen && (
          <div className="play-panel absolute right-0 mt-2 min-w-[190px] rounded-sm p-2 text-left shadow-sm">
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={toggleTheme}
              className="play-touch mb-2 w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
            >
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTeamMenuOpen(false);
                navigate('/login');
              }}
              className="play-touch w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>
    );
    return (
      <PlayShell>
        {showHeader && (
          <PlayHeader
            title={data.event.title}
            code={data.event.public_code}
            meta={headerMeta}
            menu={closedMenu}
          />
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

  const headerTeam = teamId && teamNameLabel ? <div className="text-xs font-medium">{teamNameLabel}</div> : null;
  const headerMenu = (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="Team menu"
        aria-haspopup="menu"
        aria-expanded={teamMenuOpen}
        onClick={() => setTeamMenuOpen((open) => !open)}
        className="play-touch flex h-10 w-10 flex-col items-center justify-center gap-1 rounded-md border border-border bg-panel2"
      >
        <span className="h-0.5 w-4 bg-text" />
        <span className="h-0.5 w-4 bg-text" />
        <span className="h-0.5 w-4 bg-text" />
      </button>
      {teamMenuOpen && (
        <div className="play-panel absolute right-0 mt-2 min-w-[190px] rounded-sm p-2 text-left shadow-sm">
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={toggleTheme}
            className={`${teamId && teamNameLabel ? 'mb-2' : ''} play-touch w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text`}
          >
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          {teamId && teamNameLabel && (
            <button
              type="button"
              onClick={async () => {
                if (!data?.event?.public_code || !teamId || !teamSession) {
                  handleSessionExpired('Your team session expired. Re-enter the team code to continue.');
                  return;
                }
                const nextName = window.prompt('Enter a new team name', teamNameLabel ?? '')?.trim() ?? '';
                if (!nextName || nextName.toLowerCase() === (teamNameLabel ?? '').toLowerCase()) {
                  return;
                }
                const res = await api.publicUpdateTeamName(data.event.public_code, {
                  team_id: teamId,
                  team_name: nextName,
                  session_token: teamSession
                });
                if (res.ok) {
                  setTeamNameLabel(res.data.team.name);
                  localStorage.setItem(`player_team_name_${data.event.public_code}`, res.data.team.name);
                  setTeamMenuOpen(false);
                  return;
                }
                if (res.error?.code === 'team_session_invalid') {
                  handleSessionExpired(res.error.message ?? 'Your team session expired. Re-enter the team code to continue.');
                  return;
                }
                window.alert(formatApiError(res, 'Unable to update team name.'));
              }}
              className="play-touch mb-2 w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
            >
              Change Team Name
            </button>
          )}
          {teamId && teamNameLabel && (
            <button
              type="button"
              onClick={handleChangeTeam}
              className="play-touch mb-2 w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
            >
              Change Team
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTeamMenuOpen(false);
              navigate('/login');
            }}
            className="play-touch w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
          >
            Back to Login
          </button>
        </div>
      )}
    </div>
  );

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
            <div className="play-chip">Join your team</div>
            <PromptHero>Enter the team code from your scoresheet.</PromptHero>
            <div className="play-panel w-full rounded-md p-4 text-left">
              <div className="text-xs font-medium text-muted">Team code</div>
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-col gap-2">
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
                        className="play-touch h-14 w-14 rounded-md border border-border-strong bg-panel2 text-center text-2xl font-display tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
                </div>
                {requireTeamName && (
                  <label className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-muted">Team name required</span>
                    <input
                      className="play-touch h-12 rounded-md px-3"
                      value={teamNameInput}
                      onChange={(event) => setTeamNameInput(event.target.value)}
                      placeholder="Enter your team name"
                    />
                    <span className="text-xs text-muted">Enter a team name to claim this code.</span>
                  </label>
                )}
                {joinError && (
                  <div className="play-panel rounded-sm border-danger px-3 py-2 text-xs text-danger-ink" aria-live="polite">
                    {joinError}
                  </div>
                )}
                <PrimaryButton
                  onClick={handleJoin}
                  disabled={joinLoading || !teamCodeReady || (requireTeamName && !teamNameInput.trim())}
                  className="play-touch h-12 rounded-md"
                >
                  {joinLoading ? 'Joining…' : 'Join'}
                </PrimaryButton>
              </div>
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
                              logError('participant_media_error', {
                                eventId: data.event.id,
                                mediaKey: displayItem?.media_key ?? null
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
                      {canRequestAudioStop && (
                        <div className="flex flex-col items-center gap-2">
                          <button
                            type="button"
                            onClick={handleStopAudio}
                            disabled={stopAudioLoading}
                            className="play-touch w-full max-w-sm rounded-md border border-danger bg-danger px-4 py-3 text-base font-semibold text-bg hover:bg-danger/90 disabled:opacity-60"
                          >
                            {stopAudioLoading ? 'Stopping…' : 'STOP'}
                          </button>
                          {stopAudioError && <PlayFooterHint className="text-danger">{stopAudioError}</PlayFooterHint>}
                        </div>
                      )}
                      {canSubmitStoppedAudioAnswer && (
                        <div className="play-panel rounded-md px-4 py-4 text-left">
                          <div className="text-sm font-semibold text-text">Your Team Stopped Playback</div>
                          <div className="mt-1 text-xs text-muted">Enter each answer part and submit it to the host.</div>
                          <div className="mt-3 grid gap-2.5">
                            {answerPartLabels.map((label) => (
                              <label key={`audio-answer-${displayItem?.id}-${label}`} className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-muted">{label}</span>
                                <input
                                  className="play-touch h-11 rounded-md px-3"
                                  value={audioAnswerDrafts[label] ?? ''}
                                  onChange={(event) => {
                                    setAudioAnswerDrafts((prev) => ({ ...prev, [label]: event.target.value }));
                                    if (audioAnswerStatus !== 'submitting') {
                                      setAudioAnswerStatus('idle');
                                      setAudioAnswerError(null);
                                    }
                                  }}
                                  placeholder={`Enter ${label}`}
                                />
                              </label>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-col items-start gap-2">
                            <PrimaryCTA
                              onClick={handleSubmitAudioAnswer}
                              disabled={audioAnswerStatus === 'submitting' || missingAudioAnswerLabels.length > 0}
                            >
                              {audioAnswerStatus === 'submitting'
                                ? 'Submitting…'
                                : audioAnswerStatus === 'submitted'
                                  ? 'Update submission'
                                  : 'Submit to host'}
                            </PrimaryCTA>
                            {audioAnswerStatus === 'submitted' && !audioAnswerError && (
                              <PlayFooterHint>Submitted to host.</PlayFooterHint>
                            )}
                            {audioAnswerError && <PlayFooterHint className="text-danger">{audioAnswerError}</PlayFooterHint>}
                          </div>
                        </div>
                      )}
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
                          className={`play-touch flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left text-base transition ${
                            submitted
                              ? 'border-accent-ink/70 bg-accent-soft/50 text-text'
                              : selected
                                ? 'border-accent-ink/70 bg-panel2 text-text'
                                : 'border-border bg-panel3/60 text-text'
                          }`}
                        >
                          <span
                            className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold ${
                              highlight ? 'border-accent-ink/70 text-accent-ink' : 'border-border text-muted'
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="flex-1">{choice}</span>
                        </button>
                      );
                    })}
                  </ChoiceList>
                  <div className="mt-4 flex flex-col items-center gap-2.5">
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
                    <div className="mt-4">
                      <PlayFooterHint>Collecting responses…</PlayFooterHint>
                    </div>
                  )}
                  {timerExpired &&
                    responseCounts &&
                    choiceOptions.length > 0 &&
                    !awaitingResponseSync &&
                    !awaitingGraphDelay &&
                    submitStatus !== 'submitting' && (
                    <div className="mt-4 space-y-2.5">
                      <div className="text-xs font-medium text-muted">Team answers</div>
                      <div className="space-y-2">
                        {choiceOptions.map((choice, idx) => {
                          const count = responseCounts.counts[idx] ?? 0;
                          const width = Math.round((count / maxResponseCount) * 100);
                          return (
                            <div key={`${choice}-${idx}`} className="flex items-center gap-3">
                              <div className="w-6 text-xs font-medium text-muted">
                                {String.fromCharCode(65 + idx)}
                              </div>
                              <div className="flex-1 rounded-sm border border-border bg-panel2 p-1">
                                <div className="h-3 rounded-sm bg-accent-ink" style={{ width: `${width}%` }} />
                              </div>
                              <div className="w-8 text-right text-xs text-muted">{count}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs font-medium text-muted">
                        Total responses: {responseCounts.total}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {data.live?.reveal_answer && (speedRoundMode ? (data.speed_round_answers ?? []).length > 0 : Boolean(answerText)) && (
                <div className="w-full max-w-4xl pt-4 text-center">
                  <div className="text-xs font-medium text-muted">
                    {speedRoundMode ? 'Answers' : 'Answer'}
                  </div>
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
        {!isLive && waitingShowLeaderboard && (
          <div className="w-full max-w-2xl space-y-3 text-left">
            <div className="play-chip">Leaderboard</div>
            {data.leaderboard.length === 0 && <div className="text-sm text-muted">No scores yet.</div>}
            <div className="play-panel divide-y divide-border rounded-md">
              {data.leaderboard.map((entry, index) => (
                <div
                  key={entry.team_id}
                  className={`play-list-row ${
                    teamId && entry.team_id === teamId ? 'text-accent-ink' : 'text-text'
                  }`}
                >
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
