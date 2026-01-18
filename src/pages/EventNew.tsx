import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import type { Location } from '../types';

export function EventNewPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.listLocations().then((res) => {
      if (res.ok) setLocations(res.data);
    });
  }, []);

  const handleCreate = async () => {
    if (!title.trim() || !startsAt) return;
    const iso = new Date(startsAt).toISOString();
    const res = await api.createEvent({
      title,
      starts_at: iso,
      location_id: locationId || null,
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
