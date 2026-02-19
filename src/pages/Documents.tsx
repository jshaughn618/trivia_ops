import { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { api, formatApiError } from '../api';
import logoDark from '../assets/trivia_ops_logo_dark.png';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import type { Location } from '../types';

type PdfFonts = { regular: any; bold: any };

const LETTER_LANDSCAPE_WIDTH = 11 * 72;
const LETTER_LANDSCAPE_HEIGHT = 8.5 * 72;
const HALF_SHEET_WIDTH = LETTER_LANDSCAPE_WIDTH / 2;

const wrapText = (font: any, text: string, maxWidth: number, size: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (line && width > maxWidth) {
      lines.push(line);
      line = word;
      return;
    }
    line = candidate;
  });
  if (line) lines.push(line);
  return lines;
};

const drawCenteredText = (
  page: any,
  text: string,
  font: any,
  size: number,
  panelX: number,
  panelWidth: number,
  y: number
) => {
  const width = font.widthOfTextAtSize(text, size);
  const x = panelX + Math.max(0, (panelWidth - width) / 2);
  page.drawText(text, {
    x,
    y,
    size,
    font
  });
};

const drawWelcomeHalfSheet = (
  page: any,
  panelX: number,
  panelWidth: number,
  panelHeight: number,
  fonts: PdfFonts,
  locationName: string,
  logoImage?: any
) => {
  const sidePadding = 30;
  const topPadding = 34;
  const contentX = panelX + sidePadding;
  const contentWidth = panelWidth - sidePadding * 2;
  let cursorY = panelHeight - topPadding;

  const titleText = `Welcome to Pub Trivia @ ${locationName}`;
  const titleSize = 21;
  const titleLines = wrapText(fonts.bold, titleText, panelWidth - 44, titleSize);
  titleLines.forEach((line, lineIndex) => {
    drawCenteredText(page, line, fonts.bold, titleSize, panelX, panelWidth, cursorY - titleSize - lineIndex * 24);
  });
  cursorY -= 30 + titleLines.length * 24;

  drawCenteredText(page, 'Powered by', fonts.regular, 12, panelX, panelWidth, cursorY - 12);
  cursorY -= 24;

  if (logoImage) {
    const maxLogoWidth = 165;
    const maxLogoHeight = 46;
    const scale = Math.min(maxLogoWidth / logoImage.width, maxLogoHeight / logoImage.height, 1);
    const logoWidth = logoImage.width * scale;
    const logoHeight = logoImage.height * scale;
    const logoX = panelX + (panelWidth - logoWidth) / 2;
    page.drawImage(logoImage, {
      x: logoX,
      y: cursorY - logoHeight,
      width: logoWidth,
      height: logoHeight
    });
    cursorY -= logoHeight + 24;
  } else {
    drawCenteredText(page, 'Trivia Ops', fonts.bold, 19, panelX, panelWidth, cursorY - 19);
    cursorY -= 42;
  }

  page.drawText('How to Join Your Team', {
    x: contentX,
    y: cursorY - 14,
    size: 14,
    font: fonts.bold
  });
  cursorY -= 34;

  const steps = [
    'Scan the QR code on your scoresheet with your mobile device.',
    'Enter a team name when prompted and continue into your team site.',
    'Only one phone can be logged in to your team site at a time.',
    'Sit back, keep your scoresheet at your table, and wait for the host to start the game.'
  ];
  const stepTextSize = 10.5;
  const stepLineHeight = 13;
  const stepIndent = 16;

  steps.forEach((step, index) => {
    const numberY = cursorY - stepTextSize;
    page.drawText(`${index + 1}.`, {
      x: contentX,
      y: numberY,
      size: stepTextSize,
      font: fonts.bold
    });

    const lines = wrapText(fonts.regular, step, contentWidth - stepIndent, stepTextSize);
    lines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: contentX + stepIndent,
        y: numberY - lineIndex * stepLineHeight,
        size: stepTextSize,
        font: fonts.regular
      });
    });

    cursorY -= lines.length * stepLineHeight + 10;
  });

  const note = 'Have fun and good luck!';
  drawCenteredText(page, note, fonts.bold, 11.5, panelX, panelWidth, 24);
};

const buildWelcomeSheetPdf = async (locationName: string) => {
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  };
  const page = pdfDoc.addPage([LETTER_LANDSCAPE_WIDTH, LETTER_LANDSCAPE_HEIGHT]);

  let logoImage: any | null = null;
  try {
    const response = await fetch(logoDark);
    const bytes = await response.arrayBuffer();
    logoImage = await pdfDoc.embedPng(bytes);
  } catch {
    logoImage = null;
  }

  drawWelcomeHalfSheet(
    page,
    0,
    HALF_SHEET_WIDTH,
    LETTER_LANDSCAPE_HEIGHT,
    fonts,
    locationName,
    logoImage ?? undefined
  );
  drawWelcomeHalfSheet(
    page,
    HALF_SHEET_WIDTH,
    HALF_SHEET_WIDTH,
    LETTER_LANDSCAPE_HEIGHT,
    fonts,
    locationName,
    logoImage ?? undefined
  );

  page.drawLine({
    start: { x: HALF_SHEET_WIDTH, y: 16 },
    end: { x: HALF_SHEET_WIDTH, y: LETTER_LANDSCAPE_HEIGHT - 16 },
    thickness: 0.8,
    color: rgb(0.75, 0.75, 0.75)
  });

  return pdfDoc.save();
};

const downloadBytes = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes], { type: 'application/pdf' });
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
      const bytes = await buildWelcomeSheetPdf(locationName);
      const slug = locationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const filename = slug ? `welcome-sheet-${slug}.pdf` : 'welcome-sheet.pdf';
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
            <section className="glass-inset p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                    <FileText className="h-4 w-4 text-accent-ink" />
                    Welcome Sheet
                  </div>
                  <p className="max-w-2xl text-sm text-muted">
                    Half-sheet handout designed for 2-up printing on letter paper (vertical orientation per cut
                    piece). Select a location, then generate a sheet that reads "Welcome to Pub Trivia @ {'{location}'}".
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-[280px]">
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
