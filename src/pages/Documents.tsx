import { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { toOwnedArrayBuffer } from '../../shared/binary';
import { api, formatApiError } from '../api';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { GenericRoundSheets } from '../components/GenericRoundSheets';
import type { Location } from '../types';
import { buildWelcomeSheetPdf, type WelcomeEventType } from '../lib/welcomeSheets';

const downloadBytes = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([toOwnedArrayBuffer(bytes)], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export function DocumentsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationId, setLocationId] = useState('');
  const [eventType, setEventType] = useState<WelcomeEventType>('Pub');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [welcomeGenerating, setWelcomeGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLocations = async () => {
      setLocationLoading(true);
      setLocationError(null);
      const res = await api.listLocations();
      if (res.ok) {
        const sorted = [...res.data].sort((a, b) => a.name.localeCompare(b.name));
        setLocations(sorted);
        setLocationId((current) => current || sorted[0]?.id || '');
      } else {
        setLocationError(formatApiError(res, 'Failed to load locations.'));
      }
      setLocationLoading(false);
    };
    loadLocations();
  }, []);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === locationId) ?? null,
    [locations, locationId]
  );

  const downloadWelcomeSheet = async () => {
    if (!selectedLocation) {
      setError('Choose a location first.');
      return;
    }
    setWelcomeGenerating(true);
    setError(null);
    try {
      const locationName = selectedLocation.name.trim() || 'Location';
      const bytes = await buildWelcomeSheetPdf(eventType, locationName);
      const locationSlug = locationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const eventTypeSlug = eventType.toLowerCase();
      const filename = locationSlug ? `welcome-sheet-${eventTypeSlug}-${locationSlug}.pdf` : `welcome-sheet-${eventTypeSlug}.pdf`;
      downloadBytes(bytes, filename);
    } catch {
      setError('Failed to build welcome sheet.');
    } finally {
      setWelcomeGenerating(false);
    }
  };

  return (
    <AppShell title="Documents">
      <div className="space-y-4">
        <Panel title="Documents Library">
          <div className="grid gap-3">
            <GenericRoundSheets />
            <section className="glass-inset p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                    <FileText className="h-4 w-4 text-accent-ink" />
                    Welcome Sheet
                  </div>
                  <p className="max-w-2xl text-sm text-muted">
                    Quarter-sheet handout designed for 4-up printing on letter paper in vertical orientation. Select a
                    location and event type, then generate a sheet that reads "Welcome to {'{event type}'} Trivia" and
                    "@ {'{location}'}".
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-[280px]">
                  <label className="ui-label" htmlFor="welcome-event-type">
                    Event type
                  </label>
                  <select
                    id="welcome-event-type"
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value as WelcomeEventType)}
                    className="h-10"
                  >
                    <option value="Pub">Pub</option>
                    <option value="Music">Music</option>
                  </select>
                  <label className="ui-label" htmlFor="welcome-location">
                    Location
                  </label>
                  <select
                    id="welcome-location"
                    value={locationId}
                    onChange={(event) => setLocationId(event.target.value)}
                    disabled={locationLoading || locations.length === 0}
                    className="h-10"
                  >
                    {locationLoading && <option value="">Loading locations…</option>}
                    {!locationLoading && locations.length === 0 && <option value="">No locations available</option>}
                    {!locationLoading &&
                      locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                  </select>
                  <PrimaryButton
                    onClick={downloadWelcomeSheet}
                    disabled={welcomeGenerating || locationLoading || !locationId}
                  >
                    <Download className="h-4 w-4" />
                    {welcomeGenerating ? 'Generating…' : 'Generate Welcome Sheet'}
                  </PrimaryButton>
                </div>
              </div>
            </section>
          </div>
        </Panel>
        {locationError && <div className="glass-card border-danger px-3 py-2 text-xs text-danger-ink">{locationError}</div>}
        {error && <div className="glass-card border-danger px-3 py-2 text-xs text-danger-ink">{error}</div>}
      </div>
    </AppShell>
  );
}
