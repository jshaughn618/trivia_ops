import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, FilePenLine, Gamepad2, Plus, Radio, PlayCircle, Sparkles } from 'lucide-react';
import { api, formatApiError } from '../api';
import { useAuth } from '../auth';
import { AppShell } from '../components/AppShell';
import { logError } from '../lib/log';
import type { Event, GameEdition } from '../types';

const formatEventDate = (value: string) => {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

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
      .slice(0, 6);
  }, [events]);

  const drafts = useMemo(() => {
    return [...editions]
      .filter((edition) => edition.status === 'draft')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 6);
  }, [editions]);

  const liveCount = events.filter((event) => event.status === 'live').length;
  const plannedCount = events.filter((event) => event.status === 'planned').length;
  const draftCount = editions.filter((edition) => edition.status === 'draft').length;

  return (
    <AppShell title="Dashboard" showTitle={false}>
      <div className="space-y-5">
        {error && (
          <div className="glass-card border-danger px-3 py-2 text-xs text-danger-ink">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-[1.85rem] font-display tracking-tight sm:text-[2rem]">Dashboard</h1>
          {isAdmin && (
            <Link
              to="/events/new"
              className="fab-create"
            >
              <Plus className="h-4 w-4" />
              Create Event
            </Link>
          )}
        </div>

        <section className={`grid gap-3 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <StatusCard
            to="/events?status=live"
            label="Live Events"
            value={liveCount}
            helper="On air now"
            icon={<Radio className="h-4 w-4" />}
          />
          <StatusCard
            to="/events?status=planned"
            label="Planned Events"
            value={plannedCount}
            helper="Scheduled"
            icon={<CalendarDays className="h-4 w-4" />}
          />
          {isAdmin && (
            <StatusCard
              to="/editions?status=draft"
              label="Draft Editions"
              value={draftCount}
              helper="In progress"
              icon={<FilePenLine className="h-4 w-4" />}
            />
          )}
        </section>

        <section className={`grid gap-4 ${isAdmin ? 'xl:grid-cols-[300px,minmax(0,1fr),minmax(0,1fr)]' : 'xl:grid-cols-[300px,minmax(0,1fr)]'}`}>
          <div className="glass-card p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="panel-title">Quick Actions</h2>
              <Sparkles className="h-4 w-4 text-accent-ink" />
            </div>
            <div className="grid gap-2.5">
              {isAdmin && (
                <ActionLink to="/editions/new" icon={<FilePenLine className="h-4 w-4" />}>
                  Build Edition
                </ActionLink>
              )}
              {isAdmin && (
                <ActionLink to="/games" icon={<Gamepad2 className="h-4 w-4" />}>
                  Games
                </ActionLink>
              )}
              <ActionLink to="/events" icon={<PlayCircle className="h-4 w-4" />}>
                Run Event
              </ActionLink>
            </div>
          </div>

          <ListColumn title="Upcoming Events" emptyMessage="No scheduled events.">
            {upcoming.map((event) => (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="list-row group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <div>
                  <div className="text-sm font-semibold text-text">{event.title}</div>
                  <div className="mt-1 text-xs text-muted">{formatEventDate(event.starts_at)}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted transition group-hover:text-accent-ink" />
              </Link>
            ))}
          </ListColumn>

          {isAdmin && (
            <ListColumn title="Draft Editions" emptyMessage="No draft editions.">
              {drafts.map((edition) => (
                <Link
                  key={edition.id}
                  to={`/editions/${edition.id}`}
                  className="list-row group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  <div>
                    <div className="text-sm font-semibold text-text">{edition.theme ?? 'Untitled Theme'}</div>
                    <div className="mt-1 text-xs text-muted">
                      Updated {new Date(edition.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted transition group-hover:text-accent-ink" />
                </Link>
              ))}
            </ListColumn>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatusCard({
  to,
  label,
  value,
  helper,
  icon
}: {
  to: string;
  label: string;
  value: number;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="status-kpi block p-4 transition-transform duration-200 motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="text-accent-ink">{icon}</span>
      </div>
      <div className="status-kpi-value font-display font-semibold text-accent-ink text-glow-accent">{value}</div>
      <div className="mt-2 text-[11px] text-muted">{helper}</div>
    </Link>
  );
}

function ListColumn({
  title,
  emptyMessage,
  children
}: {
  title: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="glass-card p-4 md:p-5">
      <div className="mb-3">
        <h2 className="panel-title">{title}</h2>
      </div>
      <div className="flex flex-col gap-2.5">
        {!hasItems && <div className="text-sm text-muted">{emptyMessage}</div>}
        {children}
      </div>
    </div>
  );
}

function ActionLink({
  to,
  children,
  icon
}: {
  to: string;
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="list-row group text-sm font-medium text-text-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <span className="inline-flex items-center gap-2">
        <span className="text-muted transition group-hover:text-accent-ink">{icon}</span>
        <span className="group-hover:text-text">{children}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted transition group-hover:text-accent-ink" />
    </Link>
  );
}
