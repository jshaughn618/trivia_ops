import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton } from '../components/Buttons';
import type { Location } from '../types';

export function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const load = async () => {
    const res = await api.listLocations();
    if (res.ok) setLocations(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const res = await api.createLocation({ name, address, city, state });
    if (res.ok) {
      setName('');
      setAddress('');
      setCity('');
      setState('');
      load();
    }
  };

  return (
    <AppShell title="Locations">
      <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
        <Panel title="Locations">
          <div className="flex flex-col gap-3">
            {locations.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No locations.</div>
            )}
            {locations.map((location) => (
              <Link
                key={location.id}
                to={`/locations/${location.id}`}
                className="border-2 border-border bg-panel2 p-3"
              >
                <div className="text-sm font-display uppercase tracking-[0.25em]">{location.name}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                  {location.city ?? 'City'} {location.state ?? ''}
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Add Location">
          <div className="flex flex-col gap-4">
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
            <div className="flex items-center gap-2">
              <PrimaryButton onClick={handleCreate}>Create</PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setName('');
                  setAddress('');
                  setCity('');
                  setState('');
                }}
              >
                Clear
              </SecondaryButton>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
