import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton } from '../components/Buttons';
import type { Location } from '../types';

export function LocationDetailPage() {
  const { locationId } = useParams();
  const navigate = useNavigate();
  const [location, setLocation] = useState<Location | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!locationId) return;
      const res = await api.getLocation(locationId);
      if (res.ok) {
        setLocation(res.data);
        setName(res.data.name);
        setAddress(res.data.address ?? '');
        setCity(res.data.city ?? '');
        setState(res.data.state ?? '');
        setNotes(res.data.notes ?? '');
      }
    };
    load();
  }, [locationId]);

  const handleUpdate = async () => {
    if (!locationId) return;
    const res = await api.updateLocation(locationId, {
      name,
      address,
      city,
      state,
      notes
    });
    if (res.ok) setLocation(res.data);
  };

  const handleDelete = async () => {
    if (!locationId) return;
    await api.deleteLocation(locationId);
    navigate('/locations');
  };

  if (!location) {
    return (
      <AppShell title="Location Detail">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Location Detail">
      <Panel title="Location">
        <div className="flex flex-col gap-4 max-w-xl">
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Name
            <input className="h-10 px-3" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Address
            <input className="h-10 px-3" value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            City
            <input className="h-10 px-3" value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            State
            <input className="h-10 px-3" value={state} onChange={(event) => setState(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Notes
            <textarea className="min-h-[100px] px-3 py-2" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton onClick={handleUpdate}>Update</PrimaryButton>
            <DangerButton onClick={handleDelete}>Delete</DangerButton>
            <SecondaryButton onClick={() => navigate('/locations')}>Back</SecondaryButton>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
