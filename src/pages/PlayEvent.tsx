import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import { logError } from '../lib/log';
import { useTheme } from '../lib/theme';

const POLL_MS = 1500;

type PublicEventResponse = {
  event: {
    id: string;
    title: string;
    starts_at: string;
    status: string;
    public_code: string;
    location_name: string | null;
  };
  rounds: { id: string; round_number: number; label: string; status: string }[];
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
  } | null;
  visual_round?: boolean;
  visual_items?: {
    id: string;
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
};

export function PlayEventPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PublicEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamNameLabel, setTeamNameLabel] = useState<string | null>(null);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [visualIndex, setVisualIndex] = useState(0);
  const { theme, toggleTheme } = useTheme();
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

  const handleJoin = async () => {
    if (!data) return;
    if (!teamId && !teamName.trim()) return;
    const payload = teamId ? { team_id: teamId } : { team_name: teamName.trim() };
    const res = await api.publicJoin(data.event.public_code, payload);
    if (res.ok) {
      setTeamId(res.data.team.id);
      setTeamNameLabel(res.data.team.name);
      localStorage.setItem(`player_team_${data.event.id}`, res.data.team.id);
      setTeamName('');
    }
  };

  const handleChangeTeam = () => {
    if (!data?.event?.id) return;
    localStorage.removeItem(`player_team_${data.event.id}`);
    setTeamId('');
    setTeamNameLabel(null);
    setTeamName('');
    setTeamMenuOpen(false);
  };

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
  const activeRound = data.rounds.find((round) => round.id === data.live?.active_round_id) ?? null;
  const isLive = activeRound?.status === 'live';
  const visualItems = data.visual_items ?? [];
  const visualMode = isLive && data.visual_round && visualItems.length > 0;
  const waitingMessage = data.live?.waiting_message?.trim() ?? '';
  const waitingShowLeaderboard = data.live?.waiting_show_leaderboard ?? false;
  const waitingShowNextRound = data.live?.waiting_show_next_round ?? true;
  const displayItem = visualMode ? visualItems[visualIndex] : data.current_item;
  const questionLabel = visualMode
    ? `Round ${activeRound?.round_number ?? ''} • Image ${visualIndex + 1} of ${visualItems.length}`.trim()
    : activeRound && data.live?.current_item_ordinal
      ? `Round ${activeRound.round_number} • Question ${data.live.current_item_ordinal}`
      : 'Question';
  const answerText = displayItem?.answer || (displayItem?.answer_a && displayItem?.answer_b
    ? `${displayItem.answer_a_label ? `${displayItem.answer_a_label}: ` : 'A: '}${displayItem.answer_a} / ${displayItem.answer_b_label ? `${displayItem.answer_b_label}: ` : 'B: '}${displayItem.answer_b}`
    : null);
  const nextRound = (() => {
    const rounds = data?.rounds ?? [];
    const ordered = [...rounds].sort((a, b) => a.round_number - b.round_number);
    return ordered.find((round) => !['completed', 'locked', 'canceled'].includes(round.status)) ?? null;
  })();

  const waitingRoom = (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-panel2 p-4">
        <div className="ui-label">Waiting Room</div>
        <div className="mt-2 text-lg font-display">{waitingMessage || 'Stand by for the next round.'}</div>
        {waitingShowNextRound && nextRound && (
          <div className="mt-2 text-sm text-muted">
            Up Next: Round {nextRound.round_number}
            {nextRound.label ? ` — ${nextRound.label}` : ''}
          </div>
        )}
      </div>
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
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 border-b border-border pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="ui-label">Event Code</div>
              <div className="text-3xl font-display tracking-tight">{data.event.public_code}</div>
              <div className="mt-1 text-sm text-muted">{data.event.title}</div>
              <div className="mt-1 text-sm text-muted">
                {data.event.location_name ?? 'Location TBD'} • {new Date(data.event.starts_at).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <button
                type="button"
                aria-pressed={theme === 'light'}
                onClick={toggleTheme}
                className="rounded-md border border-border bg-panel2 px-3 py-1 text-xs font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              {teamId && teamNameLabel && (
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium">{teamNameLabel}</div>
                  <div className="relative">
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
                      <div className="absolute right-0 mt-2 min-w-[160px] rounded-md border border-border bg-panel p-2 text-left shadow-sm">
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
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
          <div className={isLive ? 'lg:col-span-2' : undefined}>
            <Panel title="Now Showing">
              {!teamId ? (
                <div className="text-sm text-muted">
                  Join or create a team to view the live question.
                </div>
              ) : isLive ? (
                <div className="flex flex-col gap-6">
                  <div className="rounded-md bg-panel2 p-4">
                    <div className="ui-label">Current Round</div>
                    <div className="mt-2 text-lg font-display">Round {activeRound.round_number}</div>
                    <div className="mt-1 text-sm text-muted">{activeRound.label}</div>
                  </div>
                  {displayItem ? (
                    <>
                      <div className="rounded-md bg-panel2 p-4">
                        <div className="ui-label">{questionLabel}</div>
                        <div className="mt-3 text-3xl font-display leading-tight md:text-5xl">
                          {displayItem.prompt}
                        </div>
                        {visualMode && (
                          <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
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
                        {displayItem.media_type === 'image' && displayItem.media_key && (
                          <div className="mt-4 rounded-md border border-border bg-panel p-2">
                            <img
                              className="max-h-[50vh] w-full object-contain"
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
                        {mediaError && (
                          <div className="mt-3 rounded-md border border-danger bg-panel px-3 py-2 text-xs text-danger-ink">
                            {mediaError}
                          </div>
                        )}
                        {displayItem.media_type === 'audio' && (
                          <div className="mt-4 flex items-center gap-3 rounded-md border border-border bg-panel px-3 py-3">
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
                              <div className="ui-label">Audio Clue</div>
                              <div className="text-sm text-muted">Listen for the clip.</div>
                            </div>
                          </div>
                        )}
                      </div>
                      {data.live?.reveal_answer && answerText && (
                        <div className="rounded-md bg-panel p-4">
                          <div className="ui-label">Answer</div>
                          <div className="mt-2 text-xl font-display md:text-2xl">
                            {answerText}
                          </div>
                        </div>
                      )}
                      {data.live?.reveal_fun_fact && displayItem.fun_fact && (
                        <div className="rounded-md bg-panel p-4">
                          <div className="ui-label">Factoid</div>
                          <div className="mt-2 text-base text-text">{displayItem.fun_fact}</div>
                        </div>
                      )}
                    </>
                  ) : (
                    waitingRoom
                  )}
                </div>
              ) : (
                waitingRoom
              )}
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            {!teamId && !isClosed && (
              <Panel title="Join a Team">
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-2">
                    <span className="ui-label">Select Team</span>
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
                  <div className="text-center text-xs text-muted">Or</div>
                  <label className="flex flex-col gap-2">
                    <span className="ui-label">New Team Name</span>
                    <input
                      className="h-10 px-3"
                      value={teamName}
                      onChange={(event) => setTeamName(event.target.value)}
                    />
                  </label>
                  <PrimaryButton onClick={handleJoin}>Join</PrimaryButton>
                </div>
              </Panel>
            )}
            {!isLive && waitingShowLeaderboard && (
              <Panel title="Leaderboard">
                <div className="mt-1 flex flex-col gap-2">
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
              </Panel>
            )}
          </div>
        </div>

        {!isLive && (
          <div className="mt-6">
            <Panel title="Rounds">
              <div className="flex flex-col gap-2">
                {data.rounds
                  .filter((round) => round.status !== 'canceled')
                  .map((round) => (
                    <div key={round.id} className="rounded-md border border-border bg-panel2 px-3 py-2">
                      <div className="text-sm text-muted">
                        {round.round_number}. {round.label}
                      </div>
                      <div className="text-xs text-muted">
                        {round.status === 'locked' ? 'completed' : round.status}
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>
          </div>
        )}

        <div className="mt-6">
          <SecondaryButton onClick={() => navigate('/login')}>Back to Login</SecondaryButton>
        </div>
      </div>
    </div>
  );
}
