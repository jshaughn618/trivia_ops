import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import type { Location, User } from '../types';

export function EventNewPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [hosts, setHosts] = useState<User[]>([]);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [locationId, setLocationId] = useState('');
  const [hostUserId, setHostUserId] = useState('');
  const [notes, setNotes] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.listLocations().then((res) => {
      if (res.ok) setLocations(res.data);
    });
    api.listHosts().then((res) => {
      if (res.ok) setHosts(res.data);
    });
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !startsAt || !hostUserId) return;
    const iso = new Date(startsAt).toISOString();
    const res = await api.createEvent({
      title,
      starts_at: iso,
      location_id: locationId || null,
      host_user_id: hostUserId,
      status: 'planned',
      notes
    });
    if (res.ok) {
      navigate(`/events/${res.data.id}`);
    }
  };

  return (
    <AppShell title="New Event">
      <Panel title="Event Setup">
        <div className="flex flex-col gap-4 max-w-xl">
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Title
            <input className="h-10 px-3" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Date / Time
            <input
              type="datetime-local"
              className="h-10 px-3"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Location
            <select className="h-10 px-3" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">No location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Host
            <select className="h-10 px-3" value={hostUserId} onChange={(event) => setHostUserId(event.target.value)}>
              <option value="">Select host</option>
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.first_name || host.last_name
                    ? `${host.first_name ?? ''} ${host.last_name ?? ''}`.trim()
                    : host.username ?? host.email}
                  {' '}
                  ({host.user_type})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Notes
            <textarea className="min-h-[100px] px-3 py-2" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="flex items-center gap-2">
            <PrimaryButton onClick={handleCreate}>Create Event</PrimaryButton>
            <SecondaryButton onClick={() => navigate('/events')}>Cancel</SecondaryButton>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
