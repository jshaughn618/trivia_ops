import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatApiError } from '../api';
import { useAuth } from '../auth';
import { AppShell } from '../components/AppShell';
import { ButtonLink } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { StatTile } from '../components/StatTile';
import { StampBadge } from '../components/StampBadge';
import { logError } from '../lib/log';
import type { Event, GameEdition } from '../types';

export function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const isAdmin = auth.user?.user_type === 'admin';

  useEffect(() => {
    const load = async () => {
      const [eventsRes, editionsRes] = await Promise.all([
        api.listEvents(),
        isAdmin ? api.listEditions() : Promise.resolve({ ok: true as const, data: [] as GameEdition[] })
      ]);
      if (eventsRes.ok) setEvents(eventsRes.data);
      if (!eventsRes.ok) {
        setError(formatApiError(eventsRes, 'Failed to load events.'));
        logError('dashboard_events_load_failed', { error: eventsRes.error });
      }
      if (editionsRes.ok) setEditions(editionsRes.data);
      if (!editionsRes.ok) {
        setError(formatApiError(editionsRes, 'Failed to load editions.'));
        logError('dashboard_editions_load_failed', { error: editionsRes.error });
      }
    };
    load();
  }, [isAdmin]);

  const upcoming = useMemo(() => {
    return [...events]
      .filter((event) => event.status === 'planned')
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, 5);
  }, [events]);

  const drafts = useMemo(() => {
    return [...editions]
      .filter((edition) => edition.status === 'draft')
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .slice(0, 5);
  }, [editions]);

  const liveCount = events.filter((event) => event.status === 'live').length;
  const plannedCount = events.filter((event) => event.status === 'planned').length;
  const draftCount = editions.filter((edition) => edition.status === 'draft').length;
  const statusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <AppShell title="Dashboard">
      {error && (
        <div className="mb-4 border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
          {error}
        </div>
      )}
      <div className="space-y-6">
        <section className={`grid gap-4 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <Link
            to="/events?status=live"
            className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <StatTile
              label="Live events"
              value={String(liveCount)}
              helper="On air now"
              className="transition-transform duration-150 group-hover:-translate-y-0.5"
            />
          </Link>
          <Link
            to="/events?status=planned"
            className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <StatTile
              label="Planned events"
              value={String(plannedCount)}
              helper="Scheduled"
              className="transition-transform duration-150 group-hover:-translate-y-0.5"
            />
          </Link>
          {isAdmin && (
            <Link
              to="/editions?status=draft"
              className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <StatTile
                label="Draft editions"
                value={String(draftCount)}
                helper="In progress"
                className="transition-transform duration-150 group-hover:-translate-y-0.5"
              />
            </Link>
          )}
        </section>

        <section className={`grid gap-4 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
          <Panel title="Quick actions" className="p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {isAdmin && (
                <ButtonLink to="/events/new" variant="primary" className="h-11">
                  Create event
                </ButtonLink>
              )}
              {isAdmin && (
                <ButtonLink to="/editions/new" variant="secondary" className="h-11">
                  Build edition
                </ButtonLink>
              )}
              {isAdmin && (
                <ButtonLink to="/games" variant="secondary" className="h-11">
                  Games
                </ButtonLink>
              )}
              <ButtonLink to="/events" variant="secondary" className="h-11">
                Run event
              </ButtonLink>
            </div>
          </Panel>

          <Panel title="Upcoming events" className="p-5">
            <div className="flex flex-col gap-3">
              {upcoming.length === 0 && (
                <div className="text-sm text-muted">No scheduled events.</div>
              )}
              {upcoming.map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className="surface-inset flex flex-col gap-2 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text">{event.title}</div>
                      <div className="mt-1 text-xs text-muted">{new Date(event.starts_at).toLocaleString()}</div>
                    </div>
                    <StampBadge label={statusLabel(event.status)} variant="verified" />
                  </div>
                </Link>
              ))}
            </div>
          </Panel>

          {isAdmin && (
            <Panel title="Draft editions" className="p-5">
              <div className="flex flex-col gap-3">
                {drafts.length === 0 && <div className="text-sm text-muted">No draft editions.</div>}
                {drafts.map((edition) => (
                  <Link
                  key={edition.id}
                  to={`/editions/${edition.id}`}
                  className="surface-inset flex flex-col gap-2 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text">
                          {edition.theme ?? 'Untitled theme'}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          Updated {new Date(edition.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <StampBadge label="Draft" variant="inspected" />
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </section>
      </div>
    </AppShell>
  );
}
