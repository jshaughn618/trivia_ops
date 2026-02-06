import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { SecondaryButton } from '../components/Buttons';
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
  live?: {
    show_full_leaderboard: boolean;
  } | null;
};

const POLL_MS = 8000;
const POLL_BACKUP_MS = 15000;
const STREAM_RETRY_BASE_MS = 2000;
const STREAM_RETRY_MAX_MS = 30000;

export function PlayLeaderboardPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const normalizedCode = useMemo(() => (code ?? '').trim().toUpperCase(), [code]);
  const fromHost = useMemo(() => new URLSearchParams(location.search).get('from') === 'host', [location.search]);
  const [data, setData] = useState<PublicLeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!normalizedCode) return;
      const res = await api.publicEvent(normalizedCode, 'leaderboard');
      if (cancelled) return;
      if (res.ok) {
        const next = res.data as PublicLeaderboardResponse;
        setData(next);
        setError(null);
        if (next.live && !next.live.show_full_leaderboard) {
          setRedirecting(true);
          navigate(`/play/${normalizedCode}`);
        } else {
          setRedirecting(false);
        }
      } else {
        setError(formatApiError(res, 'Leaderboard unavailable.'));
      }
      setLoading(false);
    };
    let timer: number | null = null;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let retryCount = 0;

    const applyData = (next: PublicLeaderboardResponse) => {
      if (cancelled) return;
      setData(next);
      setError(null);
      if (next.live && !next.live.show_full_leaderboard) {
        setRedirecting(true);
        navigate(`/play/${normalizedCode}`);
      } else {
        setRedirecting(false);
      }
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
      source = new EventSource(`/api/public/event/${encodeURIComponent(normalizedCode)}/stream?view=leaderboard`);
      source.addEventListener('open', () => {
        retryCount = 0;
        stopPolling();
      });
      source.addEventListener('update', (event) => {
        try {
          const next = JSON.parse((event as MessageEvent).data) as PublicLeaderboardResponse;
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
  }, [normalizedCode, navigate]);

  if (!normalizedCode) {
    return (
      <div className="play-shell min-h-[100dvh] bg-bg text-text flex items-center justify-center px-4">
        <div className="play-panel rounded-sm px-6 py-4 text-sm font-medium text-muted">
          Invalid Code
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="play-shell min-h-[100dvh] bg-bg text-text flex items-center justify-center px-4">
        <div className="play-panel rounded-sm px-6 py-4 text-sm font-medium text-muted">
          Loading Leaderboard
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="play-shell min-h-[100dvh] bg-bg text-text flex items-center justify-center px-4">
        <div className="play-panel rounded-sm border-danger px-6 py-4 text-sm text-danger-ink">
          {error ?? 'Leaderboard unavailable'}
        </div>
      </div>
    );
  }

  const orderedRounds = (data.rounds ?? []).slice().sort((a, b) => a.round_number - b.round_number);
  const lastCompletedRound = [...orderedRounds]
    .reverse()
    .find((round) => round.status === 'completed' || round.status === 'locked');
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
    <div className="play-shell min-h-[100dvh] bg-bg text-text">
      <div className="mx-auto max-w-4xl px-3 py-3 sm:px-5 sm:py-4">
        {redirecting && (
          <div className="play-panel mb-4 rounded-sm px-3 py-2 text-xs font-medium text-muted" aria-live="polite">
            Returning to game…
          </div>
        )}
        <div className="mb-4 border-b border-border/60 px-1 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-muted">Event Code</div>
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
                className="play-touch rounded-md border border-border bg-panel2 px-3 py-1 text-xs font-medium text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              {!fromHost && (
                <SecondaryButton
                  className="play-touch h-10 rounded-md"
                  onClick={() =>
                    navigate(
                      `/play/${data.event.public_code}`
                    )
                  }
                >
                  Back to Event
                </SecondaryButton>
              )}
            </div>
          </div>
        </div>
        <div className="play-panel rounded-md p-3">
          <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted">
            <span>Ranked teams</span>
            <span>{rows.length} total</span>
          </div>
          <div className="landscape:hidden space-y-2 max-h-[70dvh] overflow-y-auto pr-0.5">
            {rows.map((row, index) => (
              <div
                key={row.team_id}
                className="play-list-row"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`play-rank ${index < 3 ? 'play-rank-top' : ''}`}>#{index + 1}</span>
                  <span className="truncate text-sm font-semibold text-text">{row.name}</span>
                </div>
                <div className={`grid gap-3 text-right ${lastCompletedRound ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {lastCompletedRound && (
                    <div>
                      <div className="text-[10px] font-medium text-muted">Last round</div>
                      <div className="text-sm font-semibold text-text">
                        {row.roundScores[lastCompletedRound.id] ?? 0}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] font-medium text-muted">Total</div>
                    <div className="text-base font-semibold text-text">{row.total}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden landscape:block">
            <div className="overflow-x-auto border border-border bg-panel2">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-panel3/70">
                  <tr>
                    <th className="px-3 py-2 text-xs font-medium text-muted">Rank</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted">Team</th>
                    {orderedRounds.map((round) => (
                      <th key={round.id} className="px-3 py-2 text-xs font-medium text-muted">
                        R{round.round_number}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-xs font-medium text-muted">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, index) => (
                    <tr key={row.team_id}>
                      <td className="px-3 py-2 text-xs text-muted">{index + 1}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-text">{row.name}</td>
                      {orderedRounds.map((round) => (
                        <td key={round.id} className="px-3 py-2 text-sm text-text">
                          {row.roundScores[round.id] ?? 0}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-sm font-semibold text-text">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
