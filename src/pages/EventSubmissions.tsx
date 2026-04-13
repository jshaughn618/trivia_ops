import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { AppShell } from '../components/AppShell';
import { ButtonLink, SecondaryButton } from '../components/Buttons';
import { PageHeader } from '../components/PageHeader';
import { Section } from '../components/Section';
import { StatusPill } from '../components/StatusPill';
import { logError } from '../lib/log';
import type { Event, EventRoundAudioStopAttempt, EventRoundAudioSubmission } from '../types';

const POLL_INTERVAL_MS = 6000;

type RoundSummary = {
  id: string;
  round_number: number;
  label: string;
  status: string;
  is_stop_round: boolean;
};

type TeamSummary = {
  id: string;
  name: string;
};

type AiGradePart = {
  label: string;
  expected_answer: string;
  submitted_answer: string;
  max_points: number;
  awarded_points: number;
  is_correct: boolean;
  confidence: number;
  reason: string;
};

type AiGrade = {
  source: 'ai' | 'fallback';
  total_points: number;
  max_points: number;
  overall_confidence: number;
  needs_review: boolean;
  threshold: number;
  parts: AiGradePart[];
};

type SubmissionRow = {
  response_id: string | null;
  edition_item_id: string;
  team_id: string;
  team_name: string;
  event_round_id: string;
  round_number: number;
  round_label: string;
  question_type: string | null;
  item_ordinal: number;
  prompt: string;
  expected_parts: Array<{ label: string; answer: string; points: number }>;
  max_points: number;
  submitted_at: string | null;
  response_parts: Array<{ label: string; answer: string }>;
  normalized_response_parts: Array<{ label: string; answer: string }>;
  ai_grade_status: string;
  ai_grade: AiGrade | null;
  ai_graded_at: string | null;
  ai_grade_error: string | null;
  approved_points: number | null;
  approved_at: string | null;
};

function parseResponseParts(value: string | null) {
  if (!value) return [] as Array<{ label: string; answer: string }>;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
        if (!label) return null;
        const answer = typeof (entry as { answer?: unknown }).answer === 'string' ? (entry as { answer: string }).answer : '';
        return { label, answer };
      })
      .filter((entry): entry is { label: string; answer: string } => Boolean(entry));
  } catch {
    return [];
  }
}

function parseApprovedParts(value: string | null) {
  if (!value) return [] as Array<{ label: string; is_correct: boolean | null; awarded_points: number; max_points: number }>;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
        if (!label) return null;
        const isCorrectValue = (entry as { is_correct?: unknown }).is_correct;
        const awardedPointsValue = (entry as { awarded_points?: unknown }).awarded_points;
        const maxPointsValue = (entry as { max_points?: unknown }).max_points;
        return {
          label,
          is_correct: typeof isCorrectValue === 'boolean' ? isCorrectValue : null,
          awarded_points: typeof awardedPointsValue === 'number' && Number.isFinite(awardedPointsValue) ? awardedPointsValue : 0,
          max_points: typeof maxPointsValue === 'number' && Number.isFinite(maxPointsValue) ? maxPointsValue : 0
        };
      })
      .filter(
        (
          entry
        ): entry is { label: string; is_correct: boolean | null; awarded_points: number; max_points: number } => Boolean(entry)
      );
  } catch {
    return [];
  }
}

function formatStopAttemptTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  const hours = parsed.getHours() % 12 || 12;
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  const seconds = String(parsed.getSeconds()).padStart(2, '0');
  const milliseconds = String(parsed.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function formatPoints(value: number | null) {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function toDraftValue(value: number | null) {
  if (value === null) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function toStatusLabel(status: string) {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function EventSubmissionsPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roundFilter, setRoundFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [savingByResponse, setSavingByResponse] = useState<Record<string, boolean>>({});
  const [activeTeamByRound, setActiveTeamByRound] = useState<Record<string, string>>({});
  const [applyingAiAll, setApplyingAiAll] = useState(false);
  const [visibleStopResults, setVisibleStopResults] = useState<Record<string, boolean>>({});
  const [stopResultsByRound, setStopResultsByRound] = useState<Record<string, EventRoundAudioSubmission[]>>({});
  const [stopAttemptsByRound, setStopAttemptsByRound] = useState<Record<string, EventRoundAudioStopAttempt[]>>({});
  const [stopResultsLoading, setStopResultsLoading] = useState<Record<string, boolean>>({});
  const [stopResultsError, setStopResultsError] = useState<Record<string, string | null>>({});
  const autosaveTimersRef = useRef<Record<string, number>>({});

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!eventId) return;
    if (!options?.silent) setLoading(true);

    const [eventRes, submissionsRes] = await Promise.all([api.getEvent(eventId), api.listEventSubmissions(eventId)]);
    if (eventRes.ok) {
      setEvent(eventRes.data);
    }
    if (submissionsRes.ok) {
      setRounds(submissionsRes.data.rounds);
      setTeams(submissionsRes.data.teams);
      setRows(submissionsRes.data.rows);
      setScoreDrafts((prev) => {
        const next = { ...prev };
        submissionsRes.data.rows.forEach((row) => {
          if (!row.response_id) return;
          if (next[row.response_id] !== undefined) return;
          next[row.response_id] = toDraftValue(row.approved_points);
        });
        return next;
      });
      setError(null);
    } else {
      const message = formatApiError(submissionsRes, 'Failed to load submissions.');
      setError(message);
      logError('event_submissions_load_failed', { eventId, error: submissionsRes.error });
    }
    if (!eventRes.ok && !submissionsRes.ok) {
      setError(formatApiError(eventRes, 'Failed to load event.'));
    }

    if (!options?.silent) setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!eventId) return;
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [eventId, load]);

  const filteredRows = useMemo(() => {
    const teamQuery = teamFilter.trim().toLowerCase();
    return rows.filter((row) => {
      if (roundFilter && row.event_round_id !== roundFilter) return false;
      if (teamQuery && !row.team_name.toLowerCase().includes(teamQuery)) return false;
      return true;
    });
  }, [rows, roundFilter, teamFilter]);

  const groupedByRound = useMemo(() => {
    const rowsByRoundTeam = new Map<string, Map<string, SubmissionRow[]>>();
    filteredRows.forEach((row) => {
      const byTeam = rowsByRoundTeam.get(row.event_round_id) ?? new Map<string, SubmissionRow[]>();
      const teamRows = byTeam.get(row.team_id) ?? [];
      teamRows.push(row);
      byTeam.set(row.team_id, teamRows);
      rowsByRoundTeam.set(row.event_round_id, byTeam);
    });

    const teamQuery = teamFilter.trim().toLowerCase();
    return rounds
      .filter((round) => !roundFilter || round.id === roundFilter)
      .sort((a, b) => a.round_number - b.round_number)
      .map((round) => {
        const byTeam = rowsByRoundTeam.get(round.id) ?? new Map<string, SubmissionRow[]>();
        const entries = teams
          .filter((team) => !teamQuery || team.name.toLowerCase().includes(teamQuery))
          .map((team) => {
            const teamRows = (byTeam.get(team.id) ?? []).slice().sort((a, b) => a.item_ordinal - b.item_ordinal);
            const approvedTotal = teamRows.reduce((sum, row) => sum + (row.approved_points ?? 0), 0);
            const suggestedTotal = teamRows.reduce((sum, row) => sum + (row.ai_grade?.total_points ?? 0), 0);
            const maxPoints = teamRows.reduce((sum, row) => sum + row.max_points, 0);
            const pendingApproval = teamRows.filter((row) => row.response_id && row.approved_points === null).length;
            const flaggedForReview = teamRows.filter((row) => row.ai_grade?.needs_review).length;
            const missingSubmissions = teamRows.filter((row) => !row.response_id).length;
            return {
              teamId: team.id,
              teamName: team.name,
              rows: teamRows,
              approvedTotal,
              suggestedTotal,
              maxPoints,
              pendingApproval,
              flaggedForReview,
              missingSubmissions
            };
          })
          .filter((entry) => entry.rows.length > 0);
        return { round, teams: entries };
      });
  }, [filteredRows, roundFilter, rounds, teamFilter, teams]);

  useEffect(() => {
    setActiveTeamByRound((prev) => {
      const next = { ...prev };
      groupedByRound.forEach((group) => {
        if (group.teams.length === 0) return;
        const existing = next[group.round.id];
        const existsInRound = existing ? group.teams.some((team) => team.teamId === existing) : false;
        if (!existsInRound) {
          next[group.round.id] = group.teams[0].teamId;
        }
      });
      return next;
    });
  }, [groupedByRound]);

  const saveApprovedScore = useCallback(
    async (row: SubmissionRow, nextApprovedPoints: number | null) => {
      if (!row.response_id) return;
      setSavingByResponse((prev) => ({ ...prev, [row.response_id as string]: true }));
      const res = await api.gradeEventItemResponse(row.response_id, { approved_points: nextApprovedPoints });
      if (res.ok) {
        setRows((prev) =>
          prev.map((candidate) =>
            candidate.response_id === row.response_id
              ? {
                ...candidate,
                approved_points: res.data.approved_points,
                approved_at: res.data.approved_points === null ? null : new Date().toISOString()
              }
              : candidate
          )
        );
        setScoreDrafts((prev) => ({ ...prev, [row.response_id as string]: toDraftValue(res.data.approved_points) }));
        setError(null);
      } else {
        setError(formatApiError(res, 'Failed to save points.'));
        logError('event_submissions_save_failed', { responseId: row.response_id, error: res.error });
      }
      setSavingByResponse((prev) => ({ ...prev, [row.response_id as string]: false }));
    },
    []
  );

  const handleSaveClick = useCallback(
    async (row: SubmissionRow) => {
      if (!row.response_id) return;
      const draftValue = (scoreDrafts[row.response_id] ?? '').trim();
      if (!draftValue) {
        await saveApprovedScore(row, null);
        return;
      }
      const parsed = Number(draftValue);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Points must be a number greater than or equal to zero.');
        return;
      }
      if (parsed > row.max_points) {
        setError(`Points cannot exceed max points (${formatPoints(row.max_points)}).`);
        return;
      }
      await saveApprovedScore(row, parsed);
    },
    [saveApprovedScore, scoreDrafts]
  );

  const handlePointsChange = useCallback(
    (row: SubmissionRow, value: string) => {
      if (!row.response_id) return;
      setScoreDrafts((prev) => ({ ...prev, [row.response_id as string]: value }));
      const responseId = row.response_id;
      const existingTimer = autosaveTimersRef.current[responseId];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      autosaveTimersRef.current[responseId] = window.setTimeout(() => {
        void handleSaveClick(row);
      }, 450);
    },
    [handleSaveClick]
  );

  useEffect(() => {
    const timerMap = autosaveTimersRef.current;
    return () => {
      Object.values(timerMap).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const loadStopResults = useCallback(async (roundId: string, options?: { silent?: boolean }) => {
    if (!roundId) return;
    if (!options?.silent) {
      setStopResultsLoading((prev) => ({ ...prev, [roundId]: true }));
    }
    const [submissionsRes, attemptsRes] = await Promise.all([
      api.listRoundAudioSubmissions(roundId),
      api.listRoundAudioStopAttempts(roundId)
    ]);
    if (submissionsRes.ok) {
      setStopResultsByRound((prev) => ({ ...prev, [roundId]: submissionsRes.data }));
    }
    if (attemptsRes.ok) {
      setStopAttemptsByRound((prev) => ({ ...prev, [roundId]: attemptsRes.data }));
    }
    if (submissionsRes.ok && attemptsRes.ok) {
      setStopResultsError((prev) => ({ ...prev, [roundId]: null }));
    } else if (!options?.silent) {
      const message = submissionsRes.ok
        ? attemptsRes.ok
          ? null
          : formatApiError(attemptsRes, 'Failed to load Stop! attempts.')
        : formatApiError(submissionsRes, 'Failed to load Stop! results.');
      setStopResultsError((prev) => ({
        ...prev,
        [roundId]: message ?? 'Failed to load Stop! results.'
      }));
    }
    if (!options?.silent) {
      setStopResultsLoading((prev) => ({ ...prev, [roundId]: false }));
    }
  }, []);

  useEffect(() => {
    const activeRoundIds = Object.entries(visibleStopResults)
      .filter(([, visible]) => visible)
      .map(([roundId]) => roundId);
    if (activeRoundIds.length === 0) return;
    const timer = window.setInterval(() => {
      activeRoundIds.forEach((roundId) => {
        void loadStopResults(roundId, { silent: true });
      });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadStopResults, visibleStopResults]);

  const applyAiToVisibleRows = useCallback(async () => {
    const rowsToApply = groupedByRound.flatMap((group) => {
      const activeTeamId = activeTeamByRound[group.round.id] ?? group.teams[0]?.teamId;
      const activeTeam = group.teams.find((team) => team.teamId === activeTeamId);
      if (!activeTeam) return [];
      return activeTeam.rows.filter((row) => row.response_id && row.ai_grade && row.ai_grade.total_points !== null);
    });
    if (rowsToApply.length === 0) {
      setError('No AI-graded visible submissions to apply.');
      return;
    }

    setApplyingAiAll(true);
    setError(null);
    try {
      await Promise.all(
        rowsToApply.map(async (row) => {
          if (!row.response_id || !row.ai_grade) return;
          const next = Math.max(0, Math.min(row.max_points, row.ai_grade.total_points));
          const res = await api.gradeEventItemResponse(row.response_id, { approved_points: next });
          if (!res.ok) {
            throw new Error(formatApiError(res, `Failed to apply AI score for item #${row.item_ordinal}.`));
          }
        })
      );
      await load({ silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply AI scores.';
      setError(message);
    } finally {
      setApplyingAiAll(false);
    }
  }, [activeTeamByRound, groupedByRound, load]);

  if (loading) {
    return (
      <AppShell title="Event Submissions">
        <div className="text-sm text-muted">Loading submissions…</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Event Submissions" showTitle={false}>
      <div className="space-y-4">
        <PageHeader
          title={event ? `${event.title} Submissions` : 'Event Submissions'}
          actions={
            eventId ? (
              <>
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    void applyAiToVisibleRows();
                  }}
                  disabled={applyingAiAll}
                >
                  {applyingAiAll ? 'Applying AI…' : 'Use AI (Visible)'}
                </SecondaryButton>
                <ButtonLink to={`/events/${eventId}`} variant="outline">
                  Event
                </ButtonLink>
                <ButtonLink to={`/events/${eventId}/run`} variant="outline">
                  Run event
                </ButtonLink>
              </>
            ) : undefined
          }
        >
          <div className="grid gap-3 md:grid-cols-[220px,1fr]">
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.2em] text-muted">
              Round
              <select className="h-10 px-3" value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)}>
                <option value="">All rounds</option>
                {rounds
                  .slice()
                  .sort((a, b) => a.round_number - b.round_number)
                  .map((round) => (
                    <option key={round.id} value={round.id}>
                      Round {round.round_number}: {round.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.2em] text-muted">
              Team filter
              <input
                className="h-10 px-3"
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value)}
                placeholder="Search teams"
              />
            </label>
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
              {error}
            </div>
          )}
        </PageHeader>

        {groupedByRound.map((group) => (
          <Section
            key={`round-submissions-${group.round.id}`}
            title={`Round ${group.round.round_number}: ${group.round.label}`}
            actions={
              <div className="flex items-center gap-2">
                {group.round.is_stop_round && (
                  <SecondaryButton
                    type="button"
                    className="h-9 px-3 text-xs"
                    onClick={() => {
                      const nextVisible = !visibleStopResults[group.round.id];
                      setVisibleStopResults((prev) => ({ ...prev, [group.round.id]: nextVisible }));
                      if (nextVisible) {
                        void loadStopResults(group.round.id);
                      }
                    }}
                  >
                    {visibleStopResults[group.round.id] ? 'Hide Stop! Results' : 'Display Stop! Results'}
                  </SecondaryButton>
                )}
                <StatusPill status={group.round.status} />
              </div>
            }
          >
            {group.round.is_stop_round && visibleStopResults[group.round.id] ? (
              <div className="space-y-3">
                {stopResultsLoading[group.round.id] && !stopResultsByRound[group.round.id] ? (
                  <div className="text-sm text-muted">Loading Stop! results…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-[0.08em] text-muted">
                          <th className="px-2 py-2">Item</th>
                          <th className="px-2 py-2">Stopped By</th>
                          <th className="px-2 py-2">Stop Attempts</th>
                          <th className="px-2 py-2">Submitted</th>
                          <th className="px-2 py-2">Net Points</th>
                          <th className="px-2 py-2">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(stopResultsByRound[group.round.id] ?? []).map((submission) => {
                          const submittedParts = parseResponseParts(submission.response_parts_json);
                          const approvedParts = parseApprovedParts(submission.approved_parts_json);
                          const attempts = (stopAttemptsByRound[group.round.id] ?? []).filter(
                            (attempt) => attempt.item_ordinal === submission.ordinal
                          );
                          return (
                            <tr key={`stop-result-${group.round.id}-${submission.edition_item_id}`}>
                              <td className="px-2 py-2 text-muted">#{submission.ordinal}</td>
                              <td className="px-2 py-2 text-text">{submission.team_name?.trim() || '—'}</td>
                              <td className="px-2 py-2 text-text">
                                {attempts.length === 0 ? (
                                  <span className="text-xs text-muted">No attempts recorded</span>
                                ) : (
                                  <div className="space-y-1">
                                    {attempts.map((attempt) => (
                                      <div key={attempt.id} className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="font-medium text-text">{attempt.team_name.trim() || 'Unknown team'}</span>
                                        <span className="text-muted">
                                          {formatStopAttemptTime(attempt.attempted_at)}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${
                                            attempt.won_race
                                              ? 'border-[#2d9a59] bg-[#2d9a59]/20 text-[#8ce7ad]'
                                              : 'border-border text-muted'
                                          }`}
                                        >
                                          {attempt.won_race ? 'Winner' : 'Late'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-2 text-text">
                                {submittedParts.length === 0 ? (
                                  <span className="text-xs text-muted">—</span>
                                ) : (
                                  <div className="space-y-1">
                                    {submittedParts.map((part) => (
                                      <div key={`stop-result-part-${submission.edition_item_id}-${part.label}`} className="text-xs">
                                        <span className="text-muted">{part.label}:</span> {part.answer.trim() || '—'}{' '}
                                        {(() => {
                                          const approvedPart = approvedParts.find((entry) => entry.label === part.label);
                                          if (approvedPart?.is_correct === true) {
                                            return (
                                              <span className="font-semibold text-[#8ce7ad]">
                                                ✓ {formatPoints(approvedPart.awarded_points)}
                                              </span>
                                            );
                                          }
                                          if (approvedPart?.is_correct === false) {
                                            return (
                                              <span className="font-semibold text-danger-ink">
                                                ✕ {formatPoints(approvedPart.awarded_points)}
                                              </span>
                                            );
                                          }
                                          return <span className="text-muted">Pending</span>;
                                        })()}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-2 text-text">
                                {submission.approved_points === null ? (
                                  <span className="text-xs text-muted">Pending</span>
                                ) : (
                                  <span
                                    className={
                                      submission.approved_points > 0
                                        ? 'font-semibold text-[#8ce7ad]'
                                        : submission.approved_points < 0
                                          ? 'font-semibold text-danger-ink'
                                          : 'font-semibold text-text'
                                    }
                                  >
                                    {formatPoints(submission.approved_points)}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-xs text-muted">
                                {submission.submitted_at ? new Date(submission.submitted_at).toLocaleTimeString() : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {!stopResultsLoading[group.round.id] && (stopResultsByRound[group.round.id] ?? []).length === 0 && (
                  <div className="text-sm text-muted">No Stop! items found for this round.</div>
                )}
                {stopResultsError[group.round.id] && (
                  <div className="rounded-lg border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
                    {stopResultsError[group.round.id]}
                  </div>
                )}
              </div>
            ) : group.teams.length === 0 ? (
              <div className="text-sm text-muted">No teams or items found for this round.</div>
            ) : (
              <div className="space-y-3">
                {(() => {
                  const activeTeamId = activeTeamByRound[group.round.id] ?? group.teams[0].teamId;
                  const activeIndex = Math.max(0, group.teams.findIndex((team) => team.teamId === activeTeamId));
                  const team = group.teams[activeIndex] ?? group.teams[0];
                  return (
                    <div key={`round-${group.round.id}-team-${team.teamId}`} className="rounded-lg border border-border bg-panel2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-text">{team.teamName}</div>
                        <div className="mt-1 text-xs text-muted">
                          Points {formatPoints(team.approvedTotal)} / {formatPoints(team.maxPoints)} • AI suggested{' '}
                          {formatPoints(team.suggestedTotal)}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted">
                        <div>{team.pendingApproval} awaiting points</div>
                        <div>{team.flaggedForReview} flagged by AI</div>
                        <div>{team.missingSubmissions} no submission</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <SecondaryButton
                        type="button"
                        className="h-8 px-3 text-xs"
                        disabled={activeIndex <= 0}
                        onClick={() =>
                          setActiveTeamByRound((prev) => ({
                            ...prev,
                            [group.round.id]: group.teams[Math.max(0, activeIndex - 1)].teamId
                          }))
                        }
                      >
                        ← Prev Team
                      </SecondaryButton>
                      <div className="text-xs text-muted">
                        Team {activeIndex + 1} of {group.teams.length}
                      </div>
                      <SecondaryButton
                        type="button"
                        className="h-8 px-3 text-xs"
                        disabled={activeIndex >= group.teams.length - 1}
                        onClick={() =>
                          setActiveTeamByRound((prev) => ({
                            ...prev,
                            [group.round.id]: group.teams[Math.min(group.teams.length - 1, activeIndex + 1)].teamId
                          }))
                        }
                      >
                        Next Team →
                      </SecondaryButton>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full divide-y divide-border text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-[0.08em] text-muted">
                            <th className="px-2 py-2">Item</th>
                            <th className="px-2 py-2">Prompt</th>
                            <th className="px-2 py-2">Expected</th>
                            <th className="px-2 py-2">Submitted</th>
                            <th className="px-2 py-2">AI pass</th>
                            <th className="px-2 py-2">Points</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {team.rows.map((row) => {
                            const currentDraft = row.response_id ? (scoreDrafts[row.response_id] ?? toDraftValue(row.approved_points)) : '';
                            const isSaving = row.response_id ? Boolean(savingByResponse[row.response_id]) : false;
                            return (
                              <tr key={`submission-row-${group.round.id}-${team.teamId}-${row.edition_item_id}`}>
                                <td className="px-2 py-2 text-muted">#{row.item_ordinal}</td>
                                <td className="max-w-[320px] px-2 py-2 text-text">{row.prompt?.trim() || '—'}</td>
                                <td className="px-2 py-2 text-text">
                                  {row.expected_parts.length === 0 ? (
                                    '—'
                                  ) : (
                                    <div className="space-y-1">
                                      {row.expected_parts.map((part) => (
                                        <div key={`expected-${row.edition_item_id}-${part.label}`} className="text-xs">
                                          {row.expected_parts.length > 1 ? (
                                            <span className="text-muted">{part.label}:</span>
                                          ) : null}{' '}
                                          {part.answer || '—'}{' '}
                                          <span className="text-muted">({formatPoints(part.points)} pt)</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-text">
                                  {!row.response_id ? (
                                    <span className="text-xs text-muted">No submission</span>
                                  ) : (
                                    <div className="space-y-1">
                                      {row.normalized_response_parts.map((part) => (
                                        <div key={`submitted-${row.response_id}-${part.label}`} className="text-xs">
                                          {row.normalized_response_parts.length > 1 ? (
                                            <span className="text-muted">{part.label}:</span>
                                          ) : null}{' '}
                                          {part.answer.trim() || '—'}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-xs text-text">
                                  {!row.response_id ? (
                                    <span className="text-muted">—</span>
                                  ) : row.ai_grade_status === 'error' ? (
                                    <div className="space-y-1">
                                      <StatusPill status="canceled" label="AI Error" />
                                      <div className="text-danger-ink">{row.ai_grade_error || 'AI grading failed.'}</div>
                                    </div>
                                  ) : row.ai_grade_status === 'pending' || row.ai_grade_status === 'grading' ? (
                                    <StatusPill status="planned" label={toStatusLabel(row.ai_grade_status)} />
                                  ) : row.ai_grade ? (
                                    <div className="space-y-1">
                                      <div>
                                        <span className="font-semibold">{formatPoints(row.ai_grade.total_points)}</span> /{' '}
                                        {formatPoints(row.max_points)}
                                      </div>
                                      <div
                                        className={
                                          row.ai_grade.overall_confidence < row.ai_grade.threshold
                                            ? 'font-semibold text-danger-ink'
                                            : 'text-muted'
                                        }
                                      >
                                        Confidence {(row.ai_grade.overall_confidence * 100).toFixed(0)}%
                                      </div>
                                      {row.ai_grade.total_points >= row.max_points ? (
                                        <StatusPill status="live" label="Correct" />
                                      ) : (
                                        <StatusPill status="canceled" label="Incorrect" />
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted">No AI grade yet</span>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-text">
                                  {!row.response_id ? (
                                    <span className="text-xs text-muted">—</span>
                                  ) : (
                                    <div className="flex flex-col gap-2">
                                      <input
                                        type="number"
                                        min={0}
                                        max={row.max_points}
                                        step="0.1"
                                        className="h-9 rounded-md border border-border bg-panel px-2 text-sm"
                                        value={currentDraft}
                                        onChange={(event) => handlePointsChange(row, event.target.value)}
                                        placeholder={`0 - ${formatPoints(row.max_points)}`}
                                      />
                                      <div className="text-[11px] text-muted">
                                        Points: {formatPoints(row.approved_points)} / {formatPoints(row.max_points)}
                                        {isSaving ? ' • Saving…' : ''}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                })()}
              </div>
            )}
          </Section>
        ))}
      </div>
    </AppShell>
  );
}
