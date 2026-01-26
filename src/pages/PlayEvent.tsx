import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { logError } from '../lib/log';
import { useTheme } from '../lib/theme';

const POLL_MS = 1500;
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
  const location = useLocation();
  const [data, setData] = useState<PublicEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamNameLabel, setTeamNameLabel] = useState<string | null>(null);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
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
  const lastResponseTotalRef = useRef(0);
  const [responseSync, setResponseSync] = useState<{ expectedTotal: number; expiresAt: number } | null>(null);
  const [graphDelayUntil, setGraphDelayUntil] = useState<number | null>(null);
  const graphDelayItemRef = useRef<string | null>(null);
  const normalizedCode = useMemo(() => (code ?? '').trim().toUpperCase(), [code]);

  const load = async () => {
    if (!normalizedCode) return;
    const res = await api.publicEvent(normalizedCode);
    if (res.ok) {
      setData(res.data as PublicEventResponse);
      setError(null);
      setLoading(false);
    } else {
      setError(res.error.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [normalizedCode]);

  useEffect(() => {
    if (!data?.event?.id) return;
    const stored = localStorage.getItem(`player_team_${data.event.id}`);
    if (stored) setTeamId(stored);
  }, [data?.event?.id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const teamParam = params.get('team_id') ?? '';
    if (teamParam && !teamId) {
      setTeamId(teamParam);
    }
  }, [location.search, teamId]);

  useEffect(() => {
    if (!normalizedCode) return;
    if (teamId) return;
    const stored = localStorage.getItem(`player_team_code_${normalizedCode}`);
    if (stored) setTeamId(stored);
  }, [normalizedCode, teamId]);

  useEffect(() => {
    if (!data) return;
    const matched = data.teams.find((team) => team.id === teamId);
    setTeamNameLabel(matched?.name ?? null);
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
    data?.live?.active_round_id
  ]);

  useEffect(() => {
    if (!data?.live?.show_full_leaderboard) return;
    if (!data?.event?.public_code) return;
    const params = new URLSearchParams();
    if (teamId) params.set('team_id', teamId);
    params.set('from', 'host');
    const query = params.toString();
    navigate(`/play/${data.event.public_code}/leaderboard${query ? `?${query}` : ''}`);
  }, [data?.live?.show_full_leaderboard, data?.event?.public_code, teamId, navigate]);

  const activeRound = data?.rounds.find((round) => round.id === data?.live?.active_round_id) ?? null;
  const isLive = activeRound?.status === 'live';
  const visualItems = data?.visual_items ?? [];
  const visualMode = Boolean(isLive && data?.visual_round && visualItems.length > 0);
  const displayItem = visualMode ? visualItems[visualIndex] : data?.current_item ?? null;
  const timerExpired = timerRemainingSeconds !== null && timerRemainingSeconds <= 0;
  const responseCounts = data?.response_counts ?? null;

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

  const handleSwipeStart = (event: React.TouchEvent) => {
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
    if (!teamId && !teamName.trim()) return;
    const payload = teamId ? { team_id: teamId } : { team_name: teamName.trim() };
    const res = await api.publicJoin(data.event.public_code, payload);
    if (res.ok) {
      setTeamId(res.data.team.id);
      setTeamNameLabel(res.data.team.name);
      localStorage.setItem(`player_team_${data.event.id}`, res.data.team.id);
      localStorage.setItem(`player_team_code_${data.event.public_code}`, res.data.team.id);
      setTeamName('');
    }
  };

  const handleChangeTeam = () => {
    if (!data?.event?.id) return;
    localStorage.removeItem(`player_team_${data.event.id}`);
    localStorage.removeItem(`player_team_code_${data.event.public_code}`);
    setTeamId('');
    setTeamNameLabel(null);
    setTeamName('');
    setTeamMenuOpen(false);
  };

  const handleSubmitChoice = async () => {
    if (!data?.event?.public_code || !teamId || !displayItem?.id) return;
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
      choice_index: selectedChoiceIndex
    });
    if (res.ok) {
      setSubmittedChoiceIndex(selectedChoiceIndex);
      setSubmitStatus('submitted');
      const expectedTotal = Math.max(0, lastResponseTotalRef.current) + 1;
      setResponseSync({ expectedTotal, expiresAt: Date.now() + 3000 });
    } else {
      setSubmitStatus('error');
      setSubmitError(res.error.message ?? 'Failed to submit choice.');
    }
  };

  useEffect(() => {
    if (!timerExpired) return;
    if (submittedChoiceIndex !== null) return;
    if (submitStatus === 'submitting') return;
    if (selectedChoiceIndex === null) return;
    if (!displayItem?.id || !data?.event?.public_code || !teamId) return;
    handleSubmitChoice();
  }, [
    timerExpired,
    selectedChoiceIndex,
    submittedChoiceIndex,
    submitStatus,
    displayItem?.id,
    data?.event?.public_code,
    teamId
  ]);

  if (!normalizedCode) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="rounded-lg border border-border bg-panel px-6 py-4 text-sm font-medium text-muted">
          Invalid Code
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="rounded-lg border border-border bg-panel px-6 py-4 text-sm font-medium text-muted">
          Loading Event
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="rounded-lg border border-danger bg-panel2 px-6 py-4 text-sm text-danger-ink">
          {error ?? 'Event not found'}
        </div>
      </div>
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
  const answerText = displayItem?.answer || (displayItem?.answer_a && displayItem?.answer_b
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
  const timerActive = Boolean(data.live?.timer_started_at && data.live?.timer_duration_seconds);
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

  const waitingRoom = (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="text-xs uppercase tracking-[0.35em] text-muted">Waiting Room</div>
      <div className="text-2xl font-display md:text-4xl">
        {waitingMessage || 'Stand by for the next round.'}
      </div>
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
      <div className="min-h-screen bg-bg text-text">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="mb-6 border-b border-border pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="ui-label">Event Code</div>
                <div className="text-2xl font-display tracking-tight">{data.event.public_code}</div>
                <div className="mt-1 text-sm text-muted">{data.event.title}</div>
                <div className="mt-1 text-sm text-muted">
                  {data.event.location_name ?? 'Location TBD'} • {new Date(data.event.starts_at).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
          <Panel title={`Event ${closedLabel}`}>
            <div className="text-sm text-muted">
              This event is {closedLabel.toLowerCase()}. Check with the host for the next session.
            </div>
          </Panel>
          <div className="mt-6">
            <SecondaryButton onClick={() => navigate('/login')}>Back to Login</SecondaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="min-h-screen flex flex-col">
        <header className="px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-display tracking-tight md:text-2xl">{data.event.title}</div>
              <div className="mt-1 text-xs text-muted">Event Code: {data.event.public_code}</div>
              <div className="mt-1 text-xs text-muted">
                {data.event.location_name ?? 'Location TBD'} • {new Date(data.event.starts_at).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              {teamId && teamNameLabel && (
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium">{teamNameLabel}</div>
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
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 pb-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col">
            <div className="flex min-h-[65vh] items-center justify-center">
              <div className="flex w-full flex-col items-center gap-8 text-center">
                {!teamId ? (
                  <div className="flex w-full flex-col items-center gap-6">
                    <div className="text-xs uppercase tracking-[0.35em] text-muted">Join a Team</div>
                    <div className="text-2xl font-display md:text-4xl">
                      Pick a team to see the live question.
                    </div>
                    {!isClosed && (
                      <div className="w-full max-w-2xl rounded-md border border-border bg-panel2 p-4 text-left">
                        <div className="text-xs uppercase tracking-[0.3em] text-muted">Join a Team</div>
                        <div className="mt-4 flex flex-col gap-3">
                          <label className="flex flex-col gap-2">
                            <span className="text-xs uppercase tracking-[0.25em] text-muted">Select Team</span>
                            <select
                              className="h-10 px-3"
                              value={teamId}
                              onChange={(event) => setTeamId(event.target.value)}
                            >
                              <option value="">Choose team</option>
                              {data.teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="text-center text-xs uppercase tracking-[0.2em] text-muted">Or</div>
                          <label className="flex flex-col gap-2">
                            <span className="text-xs uppercase tracking-[0.25em] text-muted">New Team Name</span>
                            <input
                              className="h-10 px-3"
                              value={teamName}
                              onChange={(event) => setTeamName(event.target.value)}
                            />
                          </label>
                          <PrimaryButton onClick={handleJoin}>Join</PrimaryButton>
                        </div>
                      </div>
                    )}
                  </div>
                ) : isLive ? (
                  displayItem ? (
                    <>
                      {activeRound?.label && (
                        <div className="text-xs uppercase tracking-[0.35em] text-muted">
                          {activeRound.label}
                        </div>
                      )}
                      <div className="text-xs uppercase tracking-[0.35em] text-muted">{questionLabel}</div>
                      {displayItem.media_type === 'image' && displayItem.media_key && (
                        <div
                          className="w-full rounded-md border border-border bg-panel p-4"
                          onTouchStart={handleSwipeStart}
                          onTouchEnd={handleSwipeEnd}
                        >
                          <img
                            className="max-h-[60vh] w-full object-contain"
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
                      )}
                      <div
                        className="text-4xl font-display leading-tight md:text-7xl"
                        onTouchStart={handleSwipeStart}
                        onTouchEnd={handleSwipeEnd}
                      >
                        {promptText}
                      </div>
                      {mediaError && (
                        <div className="rounded-md border border-danger bg-panel px-3 py-2 text-xs text-danger-ink">
                          {mediaError}
                        </div>
                      )}
                      {displayItem.media_type === 'audio' && (
                        <div className="flex items-center gap-3 rounded-md border border-border bg-panel px-3 py-2 text-left">
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
                            <div className="text-xs uppercase tracking-[0.3em] text-muted">Audio Clue</div>
                            <div className="text-sm text-muted">Listen for the clip.</div>
                          </div>
                        </div>
                      )}
                      {displayItem.question_type === 'multiple_choice' && choiceOptions.length > 0 && (
                        <div className="w-full max-w-3xl">
                          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted">
                            <span>Multiple Choice</span>
                            <span>{timerActive ? `Timer ${timerLabel}` : `Timer ${timerDurationSeconds}s`}</span>
                          </div>
                          <div className="grid gap-3">
                            {choiceOptions.map((choice, idx) => {
                              const selected = selectedChoiceIndex === idx;
                              const submitted = submittedChoiceIndex === idx;
                              return (
                                <button
                                  key={`${choice}-${idx}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedChoiceIndex(idx);
                                    setSubmitStatus('idle');
                                    setSubmitError(null);
                                  }}
                                  disabled={!timerActive || timerExpired || submitStatus === 'submitting'}
                                  className={`w-full rounded-md border px-4 py-3 text-left text-sm transition ${
                                    submitted
                                      ? 'border-accent-ink bg-panel text-text'
                                      : selected
                                        ? 'border-accent-ink bg-panel2 text-text'
                                        : 'border-border bg-panel2 text-text'
                                  }`}
                                >
                                  <span className="mr-2 text-xs uppercase tracking-[0.3em] text-muted">
                                    {String.fromCharCode(65 + idx)}
                                  </span>
                                  {choice}
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <PrimaryButton
                              onClick={handleSubmitChoice}
                              disabled={
                                !timerActive ||
                                timerExpired ||
                                submitStatus === 'submitting' ||
                                selectedChoiceIndex === null
                              }
                            >
                              {submitStatus === 'submitting' ? 'Submitting…' : 'Submit Answer'}
                            </PrimaryButton>
                            {!timerActive && (
                              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                                Waiting for timer to start.
                              </div>
                            )}
                            {timerExpired && (
                              <div className="text-xs uppercase tracking-[0.2em] text-danger">Time's up.</div>
                            )}
                            {submitStatus === 'submitted' && !timerExpired && (
                              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                                Answer submitted.
                              </div>
                            )}
                            {submitError && (
                              <div className="text-xs uppercase tracking-[0.2em] text-danger">{submitError}</div>
                            )}
                          </div>
                          {timerExpired && (awaitingResponseSync || awaitingGraphDelay) && (
                            <div className="mt-6 border-t border-border pt-4">
                              <div className="text-xs uppercase tracking-[0.3em] text-muted">
                                Collecting responses…
                              </div>
                            </div>
                          )}
                          {timerExpired &&
                            responseCounts &&
                            choiceOptions.length > 0 &&
                            !awaitingResponseSync &&
                            !awaitingGraphDelay &&
                            submitStatus !== 'submitting' && (
                            <div className="mt-6 border-t border-border pt-4">
                              <div className="text-xs uppercase tracking-[0.3em] text-muted">
                                Team Answers
                              </div>
                              <div className="mt-3 grid gap-2">
                                {choiceOptions.map((choice, idx) => {
                                  const count = responseCounts.counts[idx] ?? 0;
                                  const width = Math.round((count / maxResponseCount) * 100);
                                  return (
                                    <div key={`${choice}-${idx}`} className="flex items-center gap-3">
                                      <div className="w-6 text-xs uppercase tracking-[0.3em] text-muted">
                                        {String.fromCharCode(65 + idx)}
                                      </div>
                                      <div className="flex-1 rounded-md border border-border bg-panel2 p-1">
                                        <div
                                          className="h-3 rounded-sm bg-accent-ink"
                                          style={{ width: `${width}%` }}
                                        />
                                      </div>
                                      <div className="w-8 text-right text-xs text-muted">{count}</div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">
                                Total responses: {responseCounts.total}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {visualMode && (
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                          <button
                            type="button"
                            onClick={() => setVisualIndex((prev) => Math.max(prev - 1, 0))}
                            disabled={visualIndex === 0}
                            className="border border-border px-3 py-1 disabled:opacity-50"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisualIndex((prev) => Math.min(prev + 1, visualItems.length - 1))}
                            disabled={visualIndex >= visualItems.length - 1}
                            className="border border-border px-3 py-1 disabled:opacity-50"
                          >
                            Next
                          </button>
                          <span>
                            Image {visualIndex + 1} / {visualItems.length}
                          </span>
                        </div>
                      )}
                  {data.live?.reveal_answer && answerText && (
                    <div className="w-full max-w-4xl border-t border-border pt-4">
                      <div className="text-xs uppercase tracking-[0.3em] text-muted">Answer</div>
                      <div className="mt-2 text-2xl font-display md:text-3xl">{answerText}</div>
                    </div>
                  )}
                  {data.live?.reveal_fun_fact && displayItem.fun_fact && (
                    <div className="w-full max-w-4xl border-t border-border pt-4">
                      <div className="text-xs uppercase tracking-[0.3em] text-muted">Factoid</div>
                      <div className="mt-2 text-lg text-text">{displayItem.fun_fact}</div>
                    </div>
                  )}
                    </>
                  ) : (
                    waitingRoom
                  )
                ) : (
                  waitingRoom
                )}
              </div>
            </div>

            {!isLive && waitingShowLeaderboard && (
              <div className="mx-auto mt-10 w-full max-w-3xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.35em] text-muted">Leaderboard</div>
                <SecondaryButton
                  onClick={() =>
                    navigate(
                      `/play/${data.event.public_code}/leaderboard${
                        teamId ? `?team_id=${teamId}` : ''
                      }`
                    )
                  }
                >
                  View Full Leaderboard
                </SecondaryButton>
              </div>
              <div className="mt-3 grid gap-2">
                {data.leaderboard.length === 0 && (
                  <div className="text-sm text-muted">No scores yet.</div>
                )}
                {data.leaderboard.map((entry, index) => (
                  <div
                    key={entry.team_id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                      teamId && entry.team_id === teamId
                        ? 'border-accent-ink bg-accent-soft text-text'
                        : 'border-border bg-panel2'
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
          </div>
        </main>

        <div className="px-6 pb-6">
          <SecondaryButton onClick={() => navigate('/login')}>Back to Login</SecondaryButton>
        </div>
      </div>
    </div>
  );
}
