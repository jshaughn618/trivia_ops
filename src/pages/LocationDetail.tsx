import { useEffect, useId, useState } from 'react';
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
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputId = useId();

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

  const handleLogoUpload = async (file: File) => {
    if (!locationId) return;
    if (file.type && !file.type.startsWith('image/')) {
      setLogoError('Image files only.');
      return;
    }
    setLogoUploading(true);
    setLogoError(null);
    const res = await api.uploadLocationLogo(locationId, file);
    if (res.ok) {
      setLocation(res.data);
    } else {
      setLogoError(res.error.message ?? 'Upload failed.');
    }
    setLogoUploading(false);
  };

  const handleLogoRemove = async () => {
    if (!locationId) return;
    setLogoUploading(true);
    setLogoError(null);
    const res = await api.deleteLocationLogo(locationId);
    if (res.ok) {
      setLocation(res.data);
    } else {
      setLogoError(res.error.message ?? 'Remove failed.');
    }
    setLogoUploading(false);
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
          <div className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
            Logo
            <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-panel p-3">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-bg">
                {location.logo_key ? (
                  <img
                    src={api.mediaUrl(location.logo_key)}
                    alt={`${location.name} logo`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted">No logo</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={logoInputId}
                  className="inline-flex items-center justify-center rounded-md border border-border bg-panel px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-panel2 focus-within:outline-none focus-within:ring-2 focus-within:ring-accent-ink focus-within:ring-offset-2 focus-within:ring-offset-bg"
                >
                  {location.logo_key ? 'Replace logo' : 'Upload logo'}
                </label>
                <input
                  id={logoInputId}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleLogoUpload(file);
                    event.currentTarget.value = '';
                  }}
                  disabled={logoUploading}
                />
                {location.logo_key && (
                  <SecondaryButton onClick={handleLogoRemove} disabled={logoUploading}>
                    Remove
                  </SecondaryButton>
                )}
                {logoUploading && <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Updating…</span>}
              </div>
              {location.logo_name && (
                <div className="w-full text-[10px] uppercase tracking-[0.2em] text-muted">
                  {location.logo_name}
                </div>
              )}
            </div>
            {logoError && <div className="text-[10px] uppercase tracking-[0.2em] text-danger-ink">{logoError}</div>}
          </div>
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
