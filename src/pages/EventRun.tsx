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
import type { EditionItem, Event, EventRound, Game, GameEdition, Team, EventRoundAudioSubmission, EventRoundScore } from '../types';

const STOP_ENABLE_DELAY_MS = 5000;

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

type AnswerPart = { label: string; answer: string };
type ExpectedAnswerPart = { label: string; answer: string; points: number };
type ApprovedAnswerPart = { label: string; is_correct: boolean | null; awarded_points: number; max_points: number };
type EventRoundResponseRow = {
  team_id: string;
  team_name: string;
  submitted_at: string | null;
  response_parts: Array<{ label: string; answer: string }> | null;
};

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

const parseExpectedAnswerParts = (item?: EditionItem | null): ExpectedAnswerPart[] => {
  if (!item) return [];
  if (item.answer_parts_json) {
    try {
      const parsed = JSON.parse(item.answer_parts_json);
      if (Array.isArray(parsed)) {
        const parts = parsed
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
            if (!label) return null;
            const answer = typeof (entry as { answer?: unknown }).answer === 'string' ? (entry as { answer: string }).answer : '';
            const pointsRaw = (entry as { points?: unknown }).points;
            const points = typeof pointsRaw === 'number' && Number.isFinite(pointsRaw) ? Math.max(0, Math.trunc(pointsRaw)) : 1;
            return { label, answer, points };
          })
          .filter((part): part is ExpectedAnswerPart => Boolean(part));
        if (parts.length > 0) return parts;
      }
    } catch {
      // Ignore malformed answer-parts payloads and fall back to legacy fields.
    }
  }

  const parts: ExpectedAnswerPart[] = [];
  if (item.answer_a?.trim()) {
    parts.push({ label: item.answer_a_label?.trim() || 'Part A', answer: item.answer_a.trim(), points: 1 });
  }
  if (item.answer_b?.trim()) {
    parts.push({ label: item.answer_b_label?.trim() || 'Part B', answer: item.answer_b.trim(), points: 1 });
  }
  if (parts.length === 0 && item.answer?.trim()) {
    parts.push({ label: 'Answer', answer: item.answer.trim(), points: 1 });
  }
  return parts;
};

const parseApprovedAnswerParts = (value?: string | null): ApprovedAnswerPart[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
        if (!label) return null;
        const isCorrectValue = (entry as { is_correct?: unknown }).is_correct;
        const awardedRaw = (entry as { awarded_points?: unknown }).awarded_points;
        const maxRaw = (entry as { max_points?: unknown }).max_points;
        return {
          label,
          is_correct: typeof isCorrectValue === 'boolean' ? isCorrectValue : null,
          awarded_points: typeof awardedRaw === 'number' && Number.isFinite(awardedRaw) ? awardedRaw : 0,
          max_points: typeof maxRaw === 'number' && Number.isFinite(maxRaw) ? maxRaw : 1
        } as ApprovedAnswerPart;
      })
      .filter((part): part is ApprovedAnswerPart => Boolean(part));
  } catch {
    return [];
  }
};

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
  const [audioRetryAttempt, setAudioRetryAttempt] = useState(0);
  const [localAudioPlaying, setLocalAudioPlaying] = useState(false);
  const [audioStoppedByTeamNotice, setAudioStoppedByTeamNotice] = useState<string | null>(null);
  const [stopAnswerReceivedNotice, setStopAnswerReceivedNotice] = useState<string | null>(null);
  const remoteAudioPlayingSeenRef = useRef(false);
  const lastAudioKeyRef = useRef<string | null>(null);
  const stopAnswerNoticeTimerRef = useRef<number | null>(null);
  const stopAnswerSubmissionKeyRef = useRef('');
  const [waitingMessage, setWaitingMessage] = useState('');
  const [waitingShowLeaderboard, setWaitingShowLeaderboard] = useState(false);
  const [waitingShowNextRound, setWaitingShowNextRound] = useState(true);
  const [waitingSnapshot, setWaitingSnapshot] = useState<{ message: string; showLeaderboard: boolean; showNextRound: boolean } | null>(null);
  const [waitingSaving, setWaitingSaving] = useState(false);
  const [waitingSaveState, setWaitingSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [waitingError, setWaitingError] = useState<string | null>(null);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [clearResponsesStatus, setClearResponsesStatus] = useState<'idle' | 'clearing' | 'done' | 'error'>('idle');
  const [clearResponsesMessage, setClearResponsesMessage] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [scoresSaving, setScoresSaving] = useState(false);
  const [scoresSaveState, setScoresSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [scoresError, setScoresError] = useState<string | null>(null);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [scoreDraftBaseline, setScoreDraftBaseline] = useState<Record<string, string>>({});
  const [scoreDraftRoundId, setScoreDraftRoundId] = useState<string | null>(null);
  const [audioSubmissions, setAudioSubmissions] = useState<EventRoundAudioSubmission[]>([]);
  const [audioSubmissionsLoading, setAudioSubmissionsLoading] = useState(false);
  const [audioSubmissionsError, setAudioSubmissionsError] = useState<string | null>(null);
  const [audioMarkingItemId, setAudioMarkingItemId] = useState<string | null>(null);
  const [roundResponseLabels, setRoundResponseLabels] = useState<string[]>([]);
  const [roundResponseRows, setRoundResponseRows] = useState<EventRoundResponseRow[]>([]);
  const [roundResponsesLoading, setRoundResponsesLoading] = useState(false);
  const [roundResponsesError, setRoundResponsesError] = useState<string | null>(null);
  const preselectRef = useRef(false);
  const auth = useAuth();
  const isAdmin = auth.user?.user_type === 'admin';
  const syncAudioPlaying = useCallback((playing: boolean) => {
    if (!eventId) return;
    void api.updateLiveState(eventId, {
      audio_playing: playing,
      ...(playing
        ? { stop_enable_delay_ms: STOP_ENABLE_DELAY_MS }
        : { stop_enabled_at: null }),
      ...(playing
        ? {
            participant_audio_stopped_by_team_id: null,
            participant_audio_stopped_by_team_name: null,
            participant_audio_stopped_at: null
          }
        : {})
    });
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
        setWaitingSnapshot({
          message: liveRes.data.waiting_message ?? '',
          showLeaderboard: Boolean(liveRes.data.waiting_show_leaderboard),
          showNextRound:
            liveRes.data.waiting_show_next_round === undefined ? true : Boolean(liveRes.data.waiting_show_next_round)
        });
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
    const res = await api.listEventRoundItems(selectedRoundId, { includeExample: true });
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

  const submissionOutcome = (submission: EventRoundAudioSubmission | null) => {
    if (!submission?.team_id || !submission.response_parts_json) return 'No Team Answer';
    if (submission.is_correct === true) return 'Correct';
    if (submission.is_correct === false) return 'Incorrect';
    return 'Pending';
  };

  const submissionOutcomeClass = (submission: EventRoundAudioSubmission | null) => {
    if (!submission?.team_id || !submission.response_parts_json) return 'border-border text-muted';
    if (submission.is_correct === true) return 'border-[#2d9a59] bg-[#2d9a59]/20 text-[#8ce7ad]';
    if (submission.is_correct === false) return 'border-danger bg-danger text-danger-fg';
    return 'border-border text-muted';
  };

  const activeRound = useMemo(() => rounds.find((round) => round.id === roundId) ?? null, [rounds, roundId]);
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [teams]
  );
  const activeEdition = activeRound ? editionById[activeRound.edition_id] : null;
  const activeGame = activeEdition ? gameById[activeEdition.game_id] : null;
  const isSpeedRoundMode = activeGame?.subtype === 'speed_round';
  const isStopMode = activeGame?.subtype === 'stop';
  const item = items[index];
  const isExampleItem = Boolean(item?.is_example_item);
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
  const multipleChoiceOptions = useMemo(
    () => (item?.question_type === 'multiple_choice' ? parseChoices(item.choices_json) : []),
    [item?.question_type, item?.choices_json]
  );
  const participantWebSubmissionsEnabled = Boolean(event?.allow_participant_web_submissions ?? 0);
  const isDedicatedAudioStopFlowItem = Boolean(
    activeGame?.allow_participant_audio_stop && isStopMode && isAudioItem
  );
  const hasTextResponseWorkflow = Boolean(
    participantWebSubmissionsEnabled &&
    item &&
    item.question_type !== 'multiple_choice' &&
    !isDedicatedAudioStopFlowItem
  );
  const hasAudioSubmissionWorkflow = Boolean(isSpeedRoundMode || isAudioItem);
  const hasParticipantAnswerWorkflow = Boolean(
    isDedicatedAudioStopFlowItem || (participantWebSubmissionsEnabled && hasAudioSubmissionWorkflow)
  );

  const loadRoundResponses = useCallback(
    async (selectedRoundId: string, selectedItemId: string, silent = false) => {
      if (!selectedRoundId || !selectedItemId) {
        setRoundResponseLabels([]);
        setRoundResponseRows([]);
        setRoundResponsesLoading(false);
        setRoundResponsesError(null);
        return;
      }
      if (!silent) setRoundResponsesLoading(true);
      const res = await api.listEventRoundResponses(selectedRoundId, selectedItemId);
      if (res.ok) {
        setRoundResponseLabels(res.data.labels ?? []);
        setRoundResponseRows(res.data.rows ?? []);
        if (!silent) setRoundResponsesError(null);
      } else if (!silent) {
        setRoundResponsesError(formatApiError(res, 'Failed to load participant submissions.'));
      }
      if (!silent) setRoundResponsesLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!activeRound?.id || !item?.id || !hasTextResponseWorkflow) {
      setRoundResponseLabels([]);
      setRoundResponseRows([]);
      setRoundResponsesLoading(false);
      setRoundResponsesError(null);
      return;
    }
    void loadRoundResponses(activeRound.id, item.id);
  }, [activeRound?.id, item?.id, hasTextResponseWorkflow, loadRoundResponses]);

  useEffect(() => {
    if (!activeRound?.id || activeRound.status !== 'live' || !item?.id || !hasTextResponseWorkflow) return;
    let closed = false;
    const tick = async () => {
      if (closed) return;
      await loadRoundResponses(activeRound.id, item.id, true);
    };
    const timer = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, [activeRound?.id, activeRound?.status, item?.id, hasTextResponseWorkflow, loadRoundResponses]);

  const loadAudioSubmissions = useCallback(
    async (selectedRoundId: string, silent = false) => {
      if (!selectedRoundId) {
        setAudioSubmissions([]);
        return;
      }
      if (!silent) setAudioSubmissionsLoading(true);
      const res = await api.listRoundAudioSubmissions(selectedRoundId);
      if (res.ok) {
        setAudioSubmissions(res.data);
        if (!silent) setAudioSubmissionsError(null);
      } else if (!silent) {
        setAudioSubmissionsError(formatApiError(res, 'Failed to load participant submissions.'));
      }
      if (!silent) setAudioSubmissionsLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!activeRound?.id || !hasParticipantAnswerWorkflow) {
      setAudioSubmissions([]);
      setAudioSubmissionsLoading(false);
      setAudioSubmissionsError(null);
      return;
    }
    void loadAudioSubmissions(activeRound.id);
  }, [activeRound?.id, activeRound?.status, hasParticipantAnswerWorkflow, loadAudioSubmissions]);

  useEffect(() => {
    if (!activeRound?.id || activeRound.status !== 'live' || !hasParticipantAnswerWorkflow) return;
    let closed = false;
    const tick = async () => {
      if (closed) return;
      await loadAudioSubmissions(activeRound.id, true);
    };
    const timer = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, [activeRound?.id, activeRound?.status, hasParticipantAnswerWorkflow, loadAudioSubmissions]);

  const audioSubmissionByItemId = useMemo(
    () => new Map(audioSubmissions.map((submission) => [submission.edition_item_id, submission])),
    [audioSubmissions]
  );
  const currentAudioSubmission = item ? audioSubmissionByItemId.get(item.id) ?? null : null;
  const currentExpectedAudioParts = useMemo(() => parseExpectedAnswerParts(item), [item]);
  const currentSubmittedParts = useMemo(
    () => parseAnswerParts(currentAudioSubmission?.response_parts_json),
    [currentAudioSubmission?.response_parts_json]
  );
  const currentApprovedAudioParts = useMemo(
    () => parseApprovedAnswerParts(currentAudioSubmission?.approved_parts_json),
    [currentAudioSubmission?.approved_parts_json]
  );

  useEffect(() => {
    const submissionKey =
      item?.id && currentAudioSubmission?.team_id && currentAudioSubmission?.response_parts_json
        ? `${item.id}:${currentAudioSubmission.team_id}:${currentAudioSubmission.submitted_at ?? currentAudioSubmission.response_parts_json}`
        : '';
    stopAnswerSubmissionKeyRef.current = submissionKey;
    setStopAnswerReceivedNotice(null);
    if (stopAnswerNoticeTimerRef.current) {
      window.clearTimeout(stopAnswerNoticeTimerRef.current);
      stopAnswerNoticeTimerRef.current = null;
    }
  }, [item?.id, isDedicatedAudioStopFlowItem]);

  useEffect(() => {
    if (!item?.id || !isDedicatedAudioStopFlowItem) return;
    const submissionKey =
      currentAudioSubmission?.team_id && currentAudioSubmission?.response_parts_json
        ? `${item.id}:${currentAudioSubmission.team_id}:${currentAudioSubmission.submitted_at ?? currentAudioSubmission.response_parts_json}`
        : '';
    const previousKey = stopAnswerSubmissionKeyRef.current;
    if (submissionKey && submissionKey !== previousKey) {
      setStopAnswerReceivedNotice(
        currentAudioSubmission?.team_name?.trim()
          ? `${currentAudioSubmission.team_name.trim()} answer received`
          : 'Stop team answer received'
      );
      if (stopAnswerNoticeTimerRef.current) {
        window.clearTimeout(stopAnswerNoticeTimerRef.current);
      }
      stopAnswerNoticeTimerRef.current = window.setTimeout(() => {
        setStopAnswerReceivedNotice(null);
        stopAnswerNoticeTimerRef.current = null;
      }, 5000);
    }
    stopAnswerSubmissionKeyRef.current = submissionKey;
  }, [
    currentAudioSubmission?.response_parts_json,
    currentAudioSubmission?.submitted_at,
    currentAudioSubmission?.team_id,
    currentAudioSubmission?.team_name,
    isDedicatedAudioStopFlowItem,
    item?.id
  ]);
  const audioSummaryRows = useMemo(
    () =>
      [...items]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((entry) => ({
          item: entry,
          submission: audioSubmissionByItemId.get(entry.id) ?? null
        })),
    [items, audioSubmissionByItemId]
  );
  const audioSummaryByTeam = useMemo(() => {
    const grouped = new Map<string, { teamId: string; teamName: string; rows: typeof audioSummaryRows }>();
    for (const row of audioSummaryRows) {
      const submission = row.submission;
      if (!submission?.team_id || !submission.response_parts_json) continue;
      const teamId = submission.team_id;
      const teamName = submission.team_name?.trim() || 'Unknown team';
      const existing = grouped.get(teamId);
      if (existing) {
        existing.rows.push(row);
      } else {
        grouped.set(teamId, { teamId, teamName, rows: [row] });
      }
    }
    return [...grouped.values()]
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((a, b) => a.item.ordinal - b.item.ordinal)
      }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' }));
  }, [audioSummaryRows]);

  const markAudioSubmission = async (
    editionItemId: string,
    payload: { is_correct?: boolean | null; approved_parts?: Array<{ label: string; is_correct: boolean | null }> }
  ) => {
    if (!activeRound?.id) return;
    setAudioMarkingItemId(editionItemId);
    setAudioSubmissionsError(null);
    const res = await api.markRoundAudioSubmission(activeRound.id, {
      edition_item_id: editionItemId,
      ...payload
    });
    if (res.ok) {
      setAudioSubmissions((prev) =>
        prev.map((entry) => (entry.edition_item_id === editionItemId ? res.data : entry))
      );
    } else {
      setAudioSubmissionsError(formatApiError(res, 'Failed to mark submission.'));
    }
    setAudioMarkingItemId(null);
  };

  const resetAudioSubmission = async (editionItemId: string) => {
    if (!activeRound?.id) return;
    const confirmed = window.confirm(
      'Reset this item? This will clear the stopped-by team and any submitted answers for this item.'
    );
    if (!confirmed) return;
    setAudioMarkingItemId(editionItemId);
    setAudioSubmissionsError(null);
    const res = await api.resetRoundAudioSubmission(activeRound.id, {
      edition_item_id: editionItemId
    });
    if (res.ok) {
      setAudioStoppedByTeamNotice(null);
      setStopAnswerReceivedNotice(null);
      setShowAnswer(false);
      setShowFact(false);
      setTimerStartedAt(null);
      setTimerRemainingSeconds(null);
      setAudioSubmissions((prev) =>
        prev.map((entry) => (entry.edition_item_id === editionItemId ? res.data : entry))
      );
    } else {
      setAudioSubmissionsError(formatApiError(res, 'Failed to reset item.'));
    }
    setAudioMarkingItemId(null);
  };

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
    return () => {
      if (stopAnswerNoticeTimerRef.current) {
        window.clearTimeout(stopAnswerNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setTimerDurationSeconds(activeRound?.timer_seconds ?? 15);
  }, [activeRound?.id, activeRound?.timer_seconds]);

  useEffect(() => {
    const nextAudioKey = isAudioItem && effectiveAudioKey ? effectiveAudioKey : null;
    if (lastAudioKeyRef.current !== nextAudioKey) {
      lastAudioKeyRef.current = nextAudioKey;
      setAudioRetryAttempt(0);
    }
    setAudioError(null);
    setAudioRequestId(null);
    remoteAudioPlayingSeenRef.current = false;
    if (!isAudioItem || !effectiveAudioKey) {
      setAudioLoading(false);
      setAudioUrl(null);
      setLocalAudioPlaying(false);
      syncAudioPlaying(false);
      return;
    }
    setAudioStoppedByTeamNotice(null);
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

  useEffect(() => {
    if (!eventId || !localAudioPlaying) return;
    let closed = false;
    const poll = async () => {
      const res = await api.getLiveState(eventId);
      if (closed || !res.ok || !res.data) return;
      if (res.data.audio_playing) {
        remoteAudioPlayingSeenRef.current = true;
        return;
      }
      // Only treat a remote false as a stop request after we've observed true at least once.
      if (remoteAudioPlayingSeenRef.current && !res.data.audio_playing) {
        audioRef.current?.pause();
        setLocalAudioPlaying(false);
        if (res.data.participant_audio_stopped_by_team_name) {
          setAudioStoppedByTeamNotice(`Stopped by ${res.data.participant_audio_stopped_by_team_name}`);
        } else if (res.data.participant_audio_stopped_by_team_id) {
          setAudioStoppedByTeamNotice('Stopped by a team');
        }
        remoteAudioPlayingSeenRef.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1000);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, [eventId, localAudioPlaying]);

  useEffect(() => {
    if (localAudioPlaying) return;
    // Ensure no stale remote-stop state carries into the next play session.
    remoteAudioPlayingSeenRef.current = false;
  }, [localAudioPlaying]);

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
    if (error?.code === MediaError.MEDIA_ERR_ABORTED) {
      logInfo('audio_error_ignored', {
        reason: 'aborted',
        itemId: item?.id ?? null,
        roundId: activeRound?.id ?? null,
        mediaKey: effectiveAudioKey ?? null,
        requestId: audioRequestId
      });
      return;
    }
    logError('audio_error', {
      itemId: item?.id ?? null,
      roundId: activeRound?.id ?? null,
      mediaKey: effectiveAudioKey ?? null,
      source: usesRoundAudio ? 'round' : 'item',
      requestId: audioRequestId,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null
    });
    if (effectiveAudioKey && audioRetryAttempt < 1) {
      setAudioRetryAttempt((prev) => prev + 1);
      setAudioError(null);
      setAudioLoading(true);
      setAudioRetryToken((prev) => prev + 1);
      return;
    }
    setAudioLoading(false);
    setAudioError('Audio unavailable.');
    setLocalAudioPlaying(false);
    syncAudioPlaying(false);
  };

  const handleAudioReady = (event: string) => {
    setAudioLoading(false);
    setAudioError(null);
    setAudioRetryAttempt(0);
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
    setWaitingSaveState('saving');
    setWaitingError(null);
    const nextSnapshot = {
      message: waitingMessage,
      showLeaderboard: waitingShowLeaderboard,
      showNextRound: waitingShowNextRound
    };
    const res = await api.updateLiveState(eventId, {
      waiting_message: waitingMessage.trim() ? waitingMessage.trim() : null,
      waiting_show_leaderboard: waitingShowLeaderboard,
      waiting_show_next_round: waitingShowNextRound,
      audio_playing: false,
      show_full_leaderboard: showFullLeaderboard
    });
    if (!res.ok) {
      setWaitingError(formatApiError(res, 'Failed to update waiting room.'));
      setWaitingSaveState('error');
      logError('waiting_room_update_failed', { eventId, error: res.error });
    } else {
      setWaitingSnapshot(nextSnapshot);
      setWaitingSaveState('saved');
    }
    setWaitingSaving(false);
  };

  const waitingRoomDirty = useMemo(() => {
    if (!waitingSnapshot) return false;
    return (
      waitingSnapshot.message !== waitingMessage ||
      waitingSnapshot.showLeaderboard !== waitingShowLeaderboard ||
      waitingSnapshot.showNextRound !== waitingShowNextRound
    );
  }, [waitingSnapshot, waitingMessage, waitingShowLeaderboard, waitingShowNextRound]);

  useEffect(() => {
    if (!eventId || !waitingSnapshot) return;
    if (!waitingRoomDirty) return;
    const timeout = window.setTimeout(() => {
      saveWaitingRoom();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [eventId, waitingSnapshot, waitingRoomDirty, waitingMessage, waitingShowLeaderboard, waitingShowNextRound]);

  useEffect(() => {
    if (waitingSaveState !== 'saved') return;
    const timeout = window.setTimeout(() => setWaitingSaveState('idle'), 1400);
    return () => window.clearTimeout(timeout);
  }, [waitingSaveState]);

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
    if (!activeRound || !item) return;
    const confirmed = window.confirm(
      item.question_type === 'multiple_choice'
        ? 'Clear all multiple-choice responses for this item?'
        : 'Clear all participant web submissions for this item?'
    );
    if (!confirmed) return;
    setClearResponsesStatus('clearing');
    setClearResponsesMessage(null);
    const res = await api.clearRoundResponses(activeRound.id, item.id);
    if (res.ok) {
      setClearResponsesStatus('done');
      setClearResponsesMessage(item.question_type === 'multiple_choice' ? 'Responses cleared.' : 'Submissions cleared.');
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
    setScoresSaveState('idle');
    setScoreDraftRoundId(activeRound.id);
    const scoresRes = await api.listRoundScores(activeRound.id);
    const scores = scoresRes.ok ? (scoresRes.data as EventRoundScore[]) : [];
    const scoresByTeam = new Map(scores.map((row) => [row.team_id, row.score]));
    const nextDrafts: Record<string, string> = {};
    teams.forEach((team) => {
      const value = scoresByTeam.get(team.id);
      nextDrafts[team.id] = value === undefined || value === null ? '' : String(value);
    });
    setScoreDrafts(nextDrafts);
    setScoreDraftBaseline(nextDrafts);
    if (!scoresRes.ok) {
      setScoresError(scoresRes.error.message ?? 'Failed to load scores.');
    }
  };

  const saveScores = async () => {
    if (!activeRound) return;
    setScoresSaving(true);
    setScoresSaveState('saving');
    setScoresError(null);
    const payload = teams.map((team) => {
      const raw = scoreDrafts[team.id];
      const parsed = raw === undefined || raw === '' ? 0 : Number.parseFloat(raw);
      return { team_id: team.id, score: Number.isFinite(parsed) ? parsed : 0 };
    });
    const res = await api.updateRoundScores(activeRound.id, payload);
    if (!res.ok) {
      setScoresError(formatApiError(res, 'Failed to save scores.'));
      setScoresSaveState('error');
    } else {
      const nextBaseline: Record<string, string> = {};
      teams.forEach((team) => {
        const raw = scoreDrafts[team.id];
        nextBaseline[team.id] = raw ?? '';
      });
      setScoreDraftBaseline(nextBaseline);
      setScoresSaveState('saved');
    }
    setScoresSaving(false);
  };

  const scoresDirty = useMemo(() => {
    if (!scoresOpen) return false;
    if (!activeRound || scoreDraftRoundId !== activeRound.id) return false;
    return teams.some((team) => (scoreDrafts[team.id] ?? '') !== (scoreDraftBaseline[team.id] ?? ''));
  }, [scoresOpen, teams, scoreDrafts, scoreDraftBaseline, activeRound, scoreDraftRoundId]);

  useEffect(() => {
    if (!scoresOpen || !activeRound) return;
    if (!scoresDirty) return;
    const timeout = window.setTimeout(() => {
      saveScores();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [scoresOpen, activeRound, scoresDirty, scoreDrafts, teams]);

  useEffect(() => {
    if (scoresSaveState !== 'saved') return;
    const timeout = window.setTimeout(() => setScoresSaveState('idle'), 1400);
    return () => window.clearTimeout(timeout);
  }, [scoresSaveState]);

  const startTimer = async () => {
    if (!eventId || !activeRound) return;
    if (isImageItem) return;
    const duration = activeRound.timer_seconds ?? timerDurationSeconds ?? 15;
    const startedAt = new Date().toISOString();
    if (item?.question_type === 'multiple_choice' || hasTextResponseWorkflow) {
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
                      {isExampleItem
                        ? 'Example item'
                        : isSpeedRoundMode
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
                  {item.question_type === 'multiple_choice' && (
                    <div className="mt-4 space-y-2">
                      {multipleChoiceOptions.length > 0 ? (
                        multipleChoiceOptions.map((choice, choiceIndex) => {
                          const choiceLabel = String.fromCharCode(65 + choiceIndex);
                          return (
                            <div key={`${item.id}-choice-${choiceIndex}`} className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-text">
                              <span className="font-semibold text-muted">{choiceLabel}.</span> {choice}
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">
                          No choices configured for this question.
                        </div>
                      )}
                    </div>
                  )}
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
                      {audioStoppedByTeamNotice && !audioError && (
                        <div className="rounded-lg border border-accent-ink bg-panel px-3 py-2 text-sm text-accent-ink">
                          {audioStoppedByTeamNotice}
                        </div>
                      )}
                      {stopAnswerReceivedNotice && !audioError && (
                        <div className="rounded-lg border border-[#2d9a59] bg-panel px-3 py-2 text-sm text-[#8ce7ad]">
                          {stopAnswerReceivedNotice}
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
                          remoteAudioPlayingSeenRef.current = false;
                          setAudioStoppedByTeamNotice(null);
                          setStopAnswerReceivedNotice(null);
                          setLocalAudioPlaying(true);
                          syncAudioPlaying(true);
                        }}
                        onPause={() => {
                          handleAudioEvent('pause');
                          remoteAudioPlayingSeenRef.current = false;
                          setLocalAudioPlaying(false);
                          syncAudioPlaying(false);
                        }}
                        onEnded={() => {
                          handleAudioEvent('ended');
                          remoteAudioPlayingSeenRef.current = false;
                          setLocalAudioPlaying(false);
                          syncAudioPlaying(false);
                        }}
                        onError={handleAudioError}
                      />
                      {audioError && (
                        <SecondaryButton className="h-11" onClick={() => setAudioRetryToken((prev) => prev + 1)}>
                          Retry Audio
                        </SecondaryButton>
                      )}
                      {isDedicatedAudioStopFlowItem && !audioError && (
                        <div className="text-xs text-muted">
                          Stop unlocks for participants {STOP_ENABLE_DELAY_MS / 1000} seconds after playback begins.
                        </div>
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
              {item && hasParticipantAnswerWorkflow && (
                <div className="surface-inset p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="ui-label">Participant Submission</div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.04em] ${submissionOutcomeClass(currentAudioSubmission)}`}>
                      {submissionOutcome(currentAudioSubmission)}
                    </span>
                  </div>
                  {audioSubmissionsLoading && !currentAudioSubmission && (
                    <div className="mt-2 text-sm text-muted">Loading submission…</div>
                  )}
                  {!currentAudioSubmission?.team_id || !currentAudioSubmission.response_parts_json ? (
                    <div className="mt-2 text-sm text-muted">No team has submitted for this item yet.</div>
                  ) : (
                    <>
                      <div className="mt-2 text-sm">
                        <span className="text-muted">Team:</span>{' '}
                        <span className="font-semibold text-text">{currentAudioSubmission.team_name ?? 'Unknown team'}</span>
                      </div>
                      <div className="mt-3 grid gap-3">
                        {(currentExpectedAudioParts.length > 0 ? currentExpectedAudioParts : currentSubmittedParts).map((part) => {
                          const submittedPart = currentSubmittedParts.find((entry) => entry.label === part.label);
                          const approvedPart = currentApprovedAudioParts.find((entry) => entry.label === part.label);
                          const nextPartMarks = (isCorrect: boolean | null) =>
                            (currentExpectedAudioParts.length > 0 ? currentExpectedAudioParts : currentSubmittedParts).map((candidate) => {
                              const existingMark = currentApprovedAudioParts.find((entry) => entry.label === candidate.label);
                              return {
                                label: candidate.label,
                                is_correct: candidate.label === part.label ? isCorrect : existingMark?.is_correct ?? null
                              };
                            });
                          const correctActive = approvedPart?.is_correct === true;
                          const incorrectActive = approvedPart?.is_correct === false;
                          const clearActive = approvedPart?.is_correct === null || !approvedPart;
                          return (
                            <div key={`submission-${item.id}-${part.label}`} className="rounded-md border border-border bg-panel px-3 py-3 text-sm">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="text-muted">{part.label}</div>
                                  <div className="font-medium text-text">{submittedPart?.answer?.trim() || '—'}</div>
                                </div>
                                {'points' in part && part.points > 0 && (
                                  <div className="text-xs text-muted">
                                    {approvedPart?.awarded_points ?? 0} / {part.points} pt
                                  </div>
                                )}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <SecondaryButton
                                  className={`h-9 ${correctActive ? 'border-[#2d9a59] bg-[#2d9a59]/10 text-[#8ce7ad] ring-1 ring-[#2d9a59]' : ''}`}
                                  onClick={() => markAudioSubmission(item.id, { approved_parts: nextPartMarks(true) })}
                                  disabled={audioMarkingItemId === item.id}
                                >
                                  Correct
                                </SecondaryButton>
                                <SecondaryButton
                                  className={`h-9 ${incorrectActive ? 'border-danger bg-danger text-danger-fg' : ''}`}
                                  onClick={() => markAudioSubmission(item.id, { approved_parts: nextPartMarks(false) })}
                                  disabled={audioMarkingItemId === item.id}
                                >
                                  Incorrect
                                </SecondaryButton>
                                <SecondaryButton
                                  className={`h-9 ${clearActive ? 'border-border-strong bg-panel2' : ''}`}
                                  onClick={() => markAudioSubmission(item.id, { approved_parts: nextPartMarks(null) })}
                                  disabled={audioMarkingItemId === item.id}
                                >
                                  Clear
                                </SecondaryButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div className="mt-3">
                    <SecondaryButton
                      className="h-10"
                      onClick={() => resetAudioSubmission(item.id)}
                      disabled={audioMarkingItemId === item.id}
                    >
                      Reset Item
                    </SecondaryButton>
                  </div>
                  {audioSubmissionsError && (
                    <div className="mt-3 rounded-lg border border-danger bg-panel px-3 py-2 text-sm text-danger-ink">
                      {audioSubmissionsError}
                    </div>
                  )}
                </div>
              )}
              {item && hasTextResponseWorkflow && (
                <div className="surface-inset p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="ui-label">Participant Submissions</div>
                    {roundResponsesLoading && <div className="text-xs text-muted">Refreshing…</div>}
                  </div>
                  {roundResponseRows.length === 0 ? (
                    <div className="mt-2 text-sm text-muted">No teams available for this event.</div>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full divide-y divide-border text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-[0.08em] text-muted">
                            <th className="px-2 py-2">Team</th>
                            {roundResponseLabels.map((label) => (
                              <th key={`submission-header-${item.id}-${label}`} className="px-2 py-2">
                                {label}
                              </th>
                            ))}
                            <th className="px-2 py-2">Submitted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {roundResponseRows.map((row) => (
                            <tr key={`submission-row-${item.id}-${row.team_id}`}>
                              <td className="px-2 py-2 font-medium text-text">{row.team_name}</td>
                              {roundResponseLabels.map((label) => {
                                const part = row.response_parts?.find((entry) => entry.label === label);
                                const answer = part?.answer ?? '';
                                return (
                                  <td key={`submission-row-${row.team_id}-${label}`} className="px-2 py-2 text-text">
                                    {answer.trim() ? answer : '—'}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-2 text-muted">
                                {row.submitted_at ? new Date(row.submitted_at).toLocaleTimeString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {roundResponsesError && (
                    <div className="mt-3 rounded-lg border border-danger bg-panel px-3 py-2 text-sm text-danger-ink">
                      {roundResponsesError}
                    </div>
                  )}
                </div>
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
                          <audio
                            className="w-full"
                            controls
                            src={api.mediaUrl(item.audio_answer_key)}
                            onPlay={() => syncAudioPlaying(true)}
                            onPause={() => syncAudioPlaying(false)}
                            onEnded={() => syncAudioPlaying(false)}
                            onEmptied={() => syncAudioPlaying(false)}
                            onError={() => syncAudioPlaying(false)}
                          />
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
                {(item?.question_type === 'multiple_choice' || hasTextResponseWorkflow) && (
                  <SecondaryButton
                    className="h-11"
                    onClick={clearRoundResponses}
                    disabled={!activeRound || clearResponsesStatus === 'clearing'}
                  >
                    {clearResponsesStatus === 'clearing'
                      ? 'Clearing…'
                      : item?.question_type === 'multiple_choice'
                        ? 'Clear Responses'
                        : 'Clear Submissions'}
                  </SecondaryButton>
                )}
                {item && isDedicatedAudioStopFlowItem && (
                  <SecondaryButton
                    className="h-11"
                    onClick={() => resetAudioSubmission(item.id)}
                    disabled={!activeRound || audioMarkingItemId === item.id}
                  >
                    Reset Stop! Item
                  </SecondaryButton>
                )}
                <SecondaryButton
                  className="h-11"
                  onClick={() => {
                    const next = !showAnswer;
                    const hasFactoid = Boolean(item?.fun_fact?.trim());
                    setShowAnswer(next);
                    if (next && hasFactoid) {
                      setShowFact(true);
                    }
                    if (eventId) {
                      api.updateLiveState(eventId, {
                        reveal_answer: next,
                        ...(next && hasFactoid ? { reveal_fun_fact: true } : {})
                      });
                    }
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
              {hasParticipantAnswerWorkflow &&
                (activeRound?.status === 'completed' || activeRound?.status === 'locked') &&
                audioSummaryByTeam.length > 0 && (
                <div className="surface-inset p-5">
                  <div className="ui-label">Round Submission Summary</div>
                  <div className="mt-3 flex flex-col gap-2">
                    {audioSummaryByTeam.map((teamGroup) => (
                      <div key={`audio-summary-team-${teamGroup.teamId}`} className="rounded-md border border-border bg-panel px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-text">{teamGroup.teamName}</div>
                          <div className="text-xs text-muted">
                            {teamGroup.rows.length} submission{teamGroup.rows.length === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          {teamGroup.rows.map(({ item: summaryItem, submission }) => {
                            const submittedParts = parseAnswerParts(submission?.response_parts_json);
                            return (
                              <div key={`audio-summary-item-${summaryItem.id}`} className="rounded-md border border-border bg-panel2 px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-text">
                                    {summaryItem.is_example_item ? 'Example' : `Item ${summaryItem.ordinal}`}
                                  </div>
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] ${submissionOutcomeClass(submission)}`}>
                                    {submissionOutcome(submission)}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-muted">{summaryItem.prompt?.trim() || 'Prompt not set.'}</div>
                                {submittedParts.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {submittedParts.map((part) => (
                                      <span key={`audio-summary-part-${summaryItem.id}-${part.label}`} className="rounded-md border border-border bg-panel px-2 py-1 text-xs">
                                        <span className="text-muted">{part.label}:</span>{' '}
                                        <span className="text-text">{part.answer}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hasParticipantAnswerWorkflow &&
                (activeRound?.status === 'completed' || activeRound?.status === 'locked') &&
                audioSummaryByTeam.length === 0 && (
                <div className="surface-inset p-5">
                  <div className="ui-label">Round Submission Summary</div>
                  <div className="mt-2 text-sm text-muted">No team submissions were recorded for this round.</div>
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
              <div className="text-xs" aria-live="polite">
                {waitingSaveState === 'saving' && <span className="text-muted">Saving changes…</span>}
                {waitingSaveState === 'saved' && <span className="text-accent-ink">All changes saved.</span>}
              </div>
              {waitingShowLeaderboard && (
                <SecondaryButton className="h-11" onClick={() => window.open(`/events/${eventId}/leaderboard`, '_blank')}>
                  View Full Leaderboard
                </SecondaryButton>
              )}
            </div>
          </AccordionSection>
          <AccordionSection title="Round Control" defaultOpen>
            <div className="flex flex-col gap-4">
              <div className="ui-label">Event</div>
              <div className="text-base font-semibold text-text">{event.title}</div>
              <ButtonLink to={`/events/${event.id}`} variant="secondary" className="h-11">
                Back to Event
              </ButtonLink>
              <ButtonLink to={`/events/${event.id}/submissions`} variant="outline" className="h-11">
                Review Submissions
              </ButtonLink>
              <div className="surface-inset p-3 text-sm text-muted">
                {activeRound ? `Status: ${roundStatusLabel(activeRound.status)}` : 'Awaiting round selection'}
              </div>
            </div>
          </AccordionSection>
        </div>
      </div>
      {scoresOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-4">
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
              {sortedTeams.map((team) => (
                <div key={team.id} className="flex items-center justify-between gap-3 border border-border bg-panel2 px-3 py-2">
                  <div className="text-sm font-display uppercase tracking-[0.2em]">{team.name}</div>
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    className="h-9 w-28 px-2 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={scoreDrafts[team.id] ?? ''}
                    onFocus={() => {
                      if ((scoreDrafts[team.id] ?? '') === '0') {
                        setScoreDrafts((prev) => ({ ...prev, [team.id]: '' }));
                      }
                    }}
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
              <div className="mr-auto text-xs" aria-live="polite">
                {scoresSaveState === 'saving' && <span className="text-muted">Saving changes…</span>}
                {scoresSaveState === 'saved' && <span className="text-accent-ink">All changes saved.</span>}
              </div>
              <SecondaryButton onClick={() => setScoresOpen(false)}>Close</SecondaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
