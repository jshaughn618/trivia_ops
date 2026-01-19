import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { SecondaryButton } from '../components/Buttons';
import { Table } from '../components/Table';
import { logError } from '../lib/log';
import type { Event, EventRound, Team, EventRoundScore } from '../types';

type ScoreMap = Record<string, Record<string, number>>;

export function EventLeaderboardPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [event, setEvent] = useState<Event | null>(null);
  const [rounds, setRounds] = useState<EventRound[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scores, setScores] = useState<ScoreMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!eventId) return;
      setLoading(true);
      setError(null);
      const [eventRes, roundsRes, teamsRes] = await Promise.all([
        api.getEvent(eventId),
        api.listEventRounds(eventId),
        api.listTeams(eventId)
      ]);
      if (eventRes.ok) setEvent(eventRes.data);
      if (!eventRes.ok) {
        setError(eventRes.error.message ?? 'Failed to load event.');
        logError('leaderboard_event_load_failed', { error: eventRes.error });
      }
      if (roundsRes.ok) setRounds(roundsRes.data);
      if (!roundsRes.ok) {
        setError(roundsRes.error.message ?? 'Failed to load rounds.');
        logError('leaderboard_rounds_load_failed', { error: roundsRes.error });
      }
      if (teamsRes.ok) setTeams(teamsRes.data);
      if (!teamsRes.ok) {
        setError(teamsRes.error.message ?? 'Failed to load teams.');
        logError('leaderboard_teams_load_failed', { error: teamsRes.error });
      }

      if (roundsRes.ok && roundsRes.data.length > 0) {
        const scoreResults = await Promise.all(
          roundsRes.data.map((round) => api.listRoundScores(round.id))
        );
        const nextScores: ScoreMap = {};
        roundsRes.data.forEach((round, index) => {
          const res = scoreResults[index];
          if (!res.ok) {
            logError('leaderboard_scores_load_failed', { roundId: round.id, error: res.error });
            return;
          }
          (res.data as EventRoundScore[]).forEach((row) => {
            if (!nextScores[row.team_id]) nextScores[row.team_id] = {};
            nextScores[row.team_id][round.id] = row.score;
          });
        });
        setScores(nextScores);
      }
      setLoading(false);
    };
    load();
  }, [eventId]);

  const orderedRounds = useMemo(
    () => [...rounds].sort((a, b) => a.round_number - b.round_number),
    [rounds]
  );

  const rows = useMemo(() => {
    return teams
      .map((team) => {
        const roundScores = scores[team.id] ?? {};
        const total = orderedRounds.reduce((sum, round) => sum + (roundScores[round.id] ?? 0), 0);
        return { team, roundScores, total };
      })
      .sort((a, b) => b.total - a.total || a.team.name.localeCompare(b.team.name));
  }, [teams, scores, orderedRounds]);

  if (!eventId) {
    return (
      <AppShell title="Leaderboard">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Missing event.</div>
      </AppShell>
    );
  }

  const backTarget = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const from = params.get('from');
    const code = params.get('code') ?? event?.public_code ?? '';
    if (from === 'participant' && code) {
      return { label: 'Back to Event', href: `/play/${code}` };
    }
    return { label: 'Back to Event', href: `/events/${eventId}` };
  }, [location.search, event?.public_code, eventId]);

  return (
    <AppShell title="Leaderboard">
      <div className="flex flex-col gap-4">
        {error && (
          <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">{error}</div>
        )}
        <Panel title={event ? `Event — ${event.title}` : 'Event'}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">
              {event ? new Date(event.starts_at).toLocaleString() : 'Loading...'}
            </div>
            <SecondaryButton onClick={() => navigate(backTarget.href)}>{backTarget.label}</SecondaryButton>
          </div>
        </Panel>
        <Panel title="Leaderboard Table">
          {loading ? (
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading scores…</div>
          ) : (
            <Table
              headers={[
                'Rank',
                'Team',
                ...orderedRounds.map((round) => `R${round.round_number}`),
                'Total'
              ]}
            >
              {rows.map((row, index) => (
                <tr key={row.team.id}>
                  <td className="px-3 py-2 text-xs text-muted">{index + 1}</td>
                  <td className="px-3 py-2 text-sm font-medium text-text">{row.team.name}</td>
                  {orderedRounds.map((round) => (
                    <td key={round.id} className="px-3 py-2 text-sm text-text">
                      {row.roundScores[round.id] ?? 0}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-sm font-semibold text-text">{row.total}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
