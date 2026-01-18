import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { ButtonLink } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { StatTile } from '../components/StatTile';
import { StampBadge } from '../components/StampBadge';
import type { Event, GameEdition } from '../types';

export function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [editions, setEditions] = useState<GameEdition[]>([]);

  useEffect(() => {
    const load = async () => {
      const [eventsRes, editionsRes] = await Promise.all([api.listEvents(), api.listEditions()]);
      if (eventsRes.ok) setEvents(eventsRes.data);
      if (editionsRes.ok) setEditions(editionsRes.data);
    };
    load();
  }, []);

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

  return (
    <AppShell title="Dashboard">
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile label="Live Events" value={String(liveCount)} helper="On Air" />
        <Link to="/events?status=planned">
          <StatTile label="Planned Events" value={String(plannedCount)} helper="Scheduled" />
        </Link>
        <StatTile label="Draft Editions" value={String(draftCount)} helper="Build Queue" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Panel title="Quick Actions">
          <div className="flex flex-col gap-3">
            <ButtonLink to="/events/new" variant="primary">
              Create Event
            </ButtonLink>
            <ButtonLink to="/editions/new" variant="secondary">
              Build Edition
            </ButtonLink>
            <ButtonLink to="/games" variant="secondary">
              Games
            </ButtonLink>
            <ButtonLink to="/events" variant="secondary">
              Run Event
            </ButtonLink>
          </div>
        </Panel>

        <Panel title="Upcoming Events">
          <div className="flex flex-col gap-3">
            {upcoming.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No scheduled events.</div>
            )}
            {upcoming.map((event) => (
              <Link key={event.id} to={`/events/${event.id}`} className="border-2 border-border bg-panel2 p-3">
                <div className="text-sm font-display uppercase tracking-[0.25em]">{event.title}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted uppercase tracking-[0.2em]">
                  <span>{new Date(event.starts_at).toLocaleString()}</span>
                  <StampBadge label={event.status.toUpperCase()} variant="verified" />
                </div>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Draft Editions">
          <div className="flex flex-col gap-3">
            {drafts.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No draft editions.</div>
            )}
            {drafts.map((edition) => (
              <Link
                key={edition.id}
                to={`/editions/${edition.id}`}
                className="border-2 border-border bg-panel2 p-3"
              >
                <div className="text-sm font-display uppercase tracking-[0.25em]">{edition.title}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted uppercase tracking-[0.2em]">
                  <span>Updated {new Date(edition.updated_at).toLocaleDateString()}</span>
                  <StampBadge label="DRAFT" variant="inspected" />
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
