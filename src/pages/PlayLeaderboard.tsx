import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Panel } from '../components/Panel';
import { SecondaryButton } from '../components/Buttons';
import { Table } from '../components/Table';
import { useTheme } from '../lib/theme';

type PublicLeaderboardResponse = {
  event: {
    id: string;
    title: string;
    starts_at: string;
    status: string;
    public_code: string;
    location_name: string | null;
  };
  leaderboard: { team_id: string; name: string; total: number }[];
  rounds?: { id: string; round_number: number; label: string; status: string }[];
  round_scores?: { event_round_id: string; team_id: string; score: number }[];
};

export function PlayLeaderboardPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const normalizedCode = useMemo(() => (code ?? '').trim().toUpperCase(), [code]);
  const storedTeamId = useMemo(() => {
    if (!normalizedCode) return '';
    return localStorage.getItem(`player_team_code_${normalizedCode}`) ?? '';
  }, [normalizedCode]);
  const [data, setData] = useState<PublicLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!normalizedCode) return;
      const res = await api.publicEvent(normalizedCode);
      if (res.ok) {
        setData(res.data as PublicLeaderboardResponse);
        setError(null);
      } else {
        setError(res.error.message);
      }
      setLoading(false);
    };
    load();
  }, [normalizedCode]);

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
          Loading Leaderboard
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="rounded-lg border border-danger bg-panel2 px-6 py-4 text-sm text-danger-ink">
          {error ?? 'Leaderboard unavailable'}
        </div>
      </div>
    );
  }

  const orderedRounds = (data.rounds ?? []).slice().sort((a, b) => a.round_number - b.round_number);
  const scoreMap = new Map<string, Record<string, number>>();
  (data.round_scores ?? []).forEach((row) => {
    const teamScores = scoreMap.get(row.team_id) ?? {};
    teamScores[row.event_round_id] = row.score;
    scoreMap.set(row.team_id, teamScores);
  });
  const rows = [...data.leaderboard]
    .map((row) => ({
      ...row,
      roundScores: scoreMap.get(row.team_id) ?? {}
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

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
              <SecondaryButton
                onClick={() =>
                  navigate(
                    `/play/${data.event.public_code}${storedTeamId ? `?team_id=${storedTeamId}` : ''}`
                  )
                }
              >
                Back to Event
              </SecondaryButton>
            </div>
          </div>
        </div>
        <Panel title="Leaderboard">
          <Table
            headers={[
              'Rank',
              'Team',
              ...orderedRounds.map((round) => `R${round.round_number}`),
              'Total'
            ]}
          >
            {rows.map((row, index) => (
              <tr key={row.team_id}>
                <td className="px-3 py-2 text-xs text-muted">{index + 1}</td>
                <td className="px-3 py-2 text-sm font-medium text-text">{row.name}</td>
                {orderedRounds.map((round) => (
                  <td key={round.id} className="px-3 py-2 text-sm text-text">
                    {row.roundScores[round.id] ?? 0}
                  </td>
                ))}
                <td className="px-3 py-2 text-sm font-semibold text-text">{row.total}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </div>
  );
}
