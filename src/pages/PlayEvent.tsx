import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';

const POLL_MS = 4000;

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
  } | null;
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
  };

  if (!normalizedCode) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="border-2 border-border bg-panel px-6 py-4 text-xs font-display uppercase tracking-[0.3em] text-muted">
          Invalid Code
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="border-2 border-border bg-panel px-6 py-4 text-xs font-display uppercase tracking-[0.3em] text-muted">
          Loading Event
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="border-2 border-danger bg-panel2 px-6 py-4 text-xs uppercase tracking-[0.2em] text-danger">
          {error ?? 'Event not found'}
        </div>
      </div>
    );
  }

  const activeRound = data.rounds.find((round) => round.id === data.live?.active_round_id) ?? null;
  const answerText = data.current_item?.answer || (data.current_item?.answer_a && data.current_item?.answer_b
    ? `${data.current_item.answer_a_label ? `${data.current_item.answer_a_label}: ` : 'A: '}${data.current_item.answer_a} / ${data.current_item.answer_b_label ? `${data.current_item.answer_b_label}: ` : 'B: '}${data.current_item.answer_b}`
    : null);
  const waitingRoom = (
    <div className="border-2 border-border bg-panel2 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-muted">Waiting Room</div>
      <div className="mt-2 text-sm font-display uppercase tracking-[0.2em]">Stand by for the next round.</div>
      {activeRound && (
        <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">
          Round {activeRound.round_number} starts soon.
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 border-b-2 border-border pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Event Code</div>
              <div className="text-2xl font-display uppercase tracking-[0.3em]">{data.event.public_code}</div>
              <div className="mt-1 text-sm uppercase tracking-[0.2em] text-muted">{data.event.title}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                {data.event.location_name ?? 'Location TBD'} • {new Date(data.event.starts_at).toLocaleString()}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              {teamId && (
                <SecondaryButton onClick={handleChangeTeam}>Change Team</SecondaryButton>
              )}
              {teamId && teamNameLabel && (
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Your Team</div>
                  <div className="mt-1 text-sm font-display uppercase tracking-[0.2em]">{teamNameLabel}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
          <Panel title="Now Showing">
            {!teamId ? (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">
                Join or create a team to view the live question.
              </div>
            ) : activeRound ? (
              <div className="flex flex-col gap-4">
                <div className="border-2 border-border bg-panel2 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Current Round</div>
                  <div className="mt-2 text-base font-display uppercase tracking-[0.2em]">
                    Round {activeRound.round_number}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">{activeRound.label}</div>
                </div>
                {data.current_item ? (
                  <>
                    <div className="border-2 border-border bg-panel2 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted">Question</div>
                      <div className="mt-2 text-lg font-display uppercase tracking-[0.2em]">
                        {data.current_item.prompt}
                      </div>
                      {data.current_item.media_type === 'image' && data.current_item.media_key && (
                        <img
                          className="mt-4 max-h-64 w-full object-cover border-2 border-border"
                          src={api.mediaUrl(data.current_item.media_key)}
                          alt="Media"
                        />
                      )}
                      {data.current_item.media_type === 'audio' && data.current_item.media_key && (
                        <audio className="mt-4 w-full" controls src={api.mediaUrl(data.current_item.media_key)} />
                      )}
                    </div>
                    {data.live?.reveal_answer && answerText && (
                      <div className="border-2 border-border bg-panel p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted">Answer</div>
                        <div className="mt-2 text-base font-display uppercase tracking-[0.2em]">
                          {answerText}
                        </div>
                      </div>
                    )}
                    {data.live?.reveal_fun_fact && data.current_item.fun_fact && (
                      <div className="border-2 border-border bg-panel p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted">Factoid</div>
                        <div className="mt-2 text-sm text-text">{data.current_item.fun_fact}</div>
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

          <div className="flex flex-col gap-4">
            <Panel title={teamId ? 'Your Team' : 'Join a Team'}>
              <div className="flex flex-col gap-3">
                {teamId && teamNameLabel ? (
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">
                    You&apos;re in a team. Use Change Team to switch.
                  </div>
                ) : (
                  <>
                    <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                      Select Team
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
                    <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                      New Team Name
                      <input
                        className="h-10 px-3"
                        value={teamName}
                        onChange={(event) => setTeamName(event.target.value)}
                      />
                    </label>
                    <PrimaryButton onClick={handleJoin}>Join</PrimaryButton>
                  </>
                )}
              </div>
            </Panel>

          </div>
        </div>

        <div className="mt-6">
          <Panel title="Rounds">
            <div className="flex flex-col gap-2">
              {data.rounds.map((round) => (
                <div key={round.id} className="border-2 border-border bg-panel2 px-3 py-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">
                    {round.round_number}. {round.label}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{round.status}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="mt-6">
          <SecondaryButton onClick={() => navigate('/login')}>Back to Login</SecondaryButton>
        </div>
      </div>
    </div>
  );
}
