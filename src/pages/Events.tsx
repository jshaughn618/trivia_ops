import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { AppShell } from '../components/AppShell';
import { ButtonLink } from '../components/Buttons';
import { PageHeader } from '../components/PageHeader';
import { Section } from '../components/Section';
import { List, ListRow } from '../components/List';
import { StatusPill } from '../components/StatusPill';
import { logError } from '../lib/log';
import type { Event } from '../types';

export function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const auth = useAuth();
  const isAdmin = auth.user?.user_type === 'admin';

  const load = async () => {
    const res = await api.listEvents();
    if (res.ok) {
      setEvents(res.data);
      setError(null);
    } else {
      setError(res.error.message ?? 'Failed to load events.');
      logError('events_load_failed', { error: res.error });
    }
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
    <AppShell title="Events" showTitle={false}>
      <div className="space-y-4">
        <PageHeader
          title="Events"
          actions={
            isAdmin ? (
              <ButtonLink to="/events/new" variant="primary">
                New event
              </ButtonLink>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="flex w-full flex-col gap-2 text-xs font-display uppercase tracking-[0.2em] text-muted sm:max-w-[220px]">
              Status
              <select className="h-10 px-3" value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="">All</option>
                <option value="planned">Planned</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
            {error && (
              <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
                {error}
              </div>
            )}
          </div>
        </PageHeader>

        <Section title="Event log">
          {filtered.length === 0 && (
            <div className="text-xs uppercase tracking-[0.2em] text-muted">No events.</div>
          )}
          {filtered.length > 0 && (
            <List>
              {filtered.map((event) => (
                <ListRow
                  key={event.id}
                  to={isAdmin ? `/events/${event.id}` : `/events/${event.id}/run`}
                  className="py-3 sm:py-4"
                >
                  <div className="flex-1">
                    <div className="text-sm font-display tracking-[0.12em]">{event.title}</div>
                    <div className="mt-1 text-xs text-muted">{new Date(event.starts_at).toLocaleString()}</div>
                  </div>
                  <div className="pt-1">
                    <StatusPill status={event.status} label={event.status} />
                  </div>
                </ListRow>
              ))}
            </List>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
