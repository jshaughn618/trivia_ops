import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { ButtonLink } from '../components/Buttons';
import { StampBadge } from '../components/StampBadge';
import type { Event } from '../types';

export function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState('');
  const location = useLocation();

  const load = async () => {
    const res = await api.listEvents();
    if (res.ok) setEvents(res.data);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status') ?? '';
    setFilter(status);
    load();
  }, [location.search]);

  const filtered = useMemo(() => {
    return filter ? events.filter((event) => event.status === filter) : events;
  }, [events, filter]);

  return (
    <AppShell title="Events">
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Event Log" action={<ButtonLink to="/events/new" variant="primary">New Event</ButtonLink>}>
          <div className="flex flex-col gap-3">
            {filtered.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No events.</div>
            )}
            {filtered.map((event) => (
              <Link key={event.id} to={`/events/${event.id}`} className="border-2 border-border bg-panel2 p-3">
                <div className="text-sm font-display uppercase tracking-[0.25em]">{event.title}</div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted uppercase tracking-[0.2em]">
                  <span>{new Date(event.starts_at).toLocaleString()}</span>
                  <StampBadge label={event.status.toUpperCase()} variant={event.status === 'live' ? 'approved' : 'verified'} />
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Status Filter">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Status
              <select className="h-10 px-3" value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="">All</option>
                <option value="planned">Planned</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
