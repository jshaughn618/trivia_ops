import { useEffect, useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { api, formatApiError } from '../api';
import logoLight from '../assets/trivia_ops_logo_light.png';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import type { Location } from '../types';

type PdfFonts = { regular: any; bold: any };
type WelcomeEventType = 'Pub' | 'Music';

const LETTER_PORTRAIT_WIDTH = 8.5 * 72;
const LETTER_PORTRAIT_HEIGHT = 11 * 72;
const QUARTER_SHEET_WIDTH = LETTER_PORTRAIT_WIDTH / 2;
const QUARTER_SHEET_HEIGHT = LETTER_PORTRAIT_HEIGHT / 2;

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
  panelY: number,
  panelWidth: number,
  panelHeight: number,
  fonts: PdfFonts,
  eventType: WelcomeEventType,
  locationName: string,
  logoImage?: any
) => {
  const sidePadding = 20;
  const topPadding = 16;
  const contentX = panelX + sidePadding;
  const contentWidth = panelWidth - sidePadding * 2;
  let cursorY = panelY + panelHeight - topPadding;

  const titleLineOne = `Welcome to ${eventType} Trivia`;
  const titleLineTwo = `@ ${locationName}`;
  const titleSize = eventType === 'Music' ? 23 : 26;
  const subtitleSize = 16;
  const titleLines = [titleLineOne];
  const subtitleLines = wrapText(fonts.bold, titleLineTwo, panelWidth - 44, subtitleSize);
  titleLines.forEach((line, lineIndex) => {
    drawCenteredText(page, line, fonts.bold, titleSize, panelX, panelWidth, cursorY - titleSize - lineIndex * 30);
  });
  cursorY -= 8 + titleLines.length * 30;
  subtitleLines.forEach((line, lineIndex) => {
    drawCenteredText(
      page,
      line,
      fonts.bold,
      subtitleSize,
      panelX,
      panelWidth,
      cursorY - subtitleSize - lineIndex * 20
    );
  });
  cursorY -= 8 + subtitleLines.length * 20;

  if (logoImage && logoImage.width > 0 && logoImage.height > 0) {
    const label = 'Powered by';
    const labelSize = 9.5;
    const labelWidth = fonts.regular.widthOfTextAtSize(label, labelSize);
    const maxLogoWidth = 74;
    const maxLogoHeight = 21;
    const scale = Math.min(maxLogoWidth / logoImage.width, maxLogoHeight / logoImage.height, 1);
    const logoWidth = logoImage.width * scale;
    const logoHeight = logoImage.height * scale;
    const rowGap = 7;
    const groupWidth = labelWidth + rowGap + logoWidth;
    const groupX = panelX + (panelWidth - groupWidth) / 2;
    const rowHeight = Math.max(logoHeight, labelSize + 2);
    const rowBottomY = cursorY - rowHeight;

    page.drawText(label, {
      x: groupX,
      y: rowBottomY + (rowHeight - labelSize) / 2,
      size: labelSize,
      font: fonts.regular
    });
    page.drawImage(logoImage, {
      x: groupX + labelWidth + rowGap,
      y: rowBottomY + (rowHeight - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight
    });
    cursorY -= rowHeight + 14;
  } else {
    drawCenteredText(page, 'Powered by Trivia Ops', fonts.regular, 9.5, panelX, panelWidth, cursorY - 9.5);
    cursorY -= 24;
  }

  page.drawText('Start Here', {
    x: contentX,
    y: cursorY - 14,
    size: 14,
    font: fonts.bold
  });
  cursorY -= 27;

  const steps = [
    'Scan the QR code on your scoresheet with your mobile device.',
    'Enter a team name when prompted and continue to your team site.',
    'Only one phone can be logged into your team site at a time (you may switch phones if needed).',
    'Write your team name on the scoresheet, then sit back and wait for the host to start the game.'
  ];
  const stepTextSize = 11;
  const stepLineHeight = 13.4;
  const stepIndent = 13;

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

    cursorY -= lines.length * stepLineHeight + 6;
  });

  const rules = [
    'Teams up to 6 players.',
    'No Googling or outside help.',
    'One team device out. All other phones away.'
  ];
  const ruleTextSize = 10.5;
  const ruleLineHeight = 12.5;
  const ruleIndent = 10;

  page.drawText('Rules', {
    x: contentX,
    y: cursorY - 12,
    size: 12,
    font: fonts.bold
  });
  cursorY -= 20;

  rules.forEach((rule) => {
    const lines = wrapText(fonts.regular, rule, contentWidth - ruleIndent, ruleTextSize);
    lines.forEach((line, lineIndex) => {
      const bullet = lineIndex === 0 ? '- ' : '  ';
      page.drawText(`${bullet}${line}`, {
        x: contentX,
        y: cursorY - ruleTextSize - lineIndex * ruleLineHeight,
        size: ruleTextSize,
        font: fonts.regular
      });
    });
    cursorY -= lines.length * ruleLineHeight + 4;
  });

  const note = 'Have fun and good luck!';
  drawCenteredText(page, note, fonts.bold, 16, panelX, panelWidth, panelY + 16);
};

const buildWelcomeSheetPdf = async (eventType: WelcomeEventType, locationName: string) => {
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  };
  const page = pdfDoc.addPage([LETTER_PORTRAIT_WIDTH, LETTER_PORTRAIT_HEIGHT]);

  let logoImage: any | null = null;
  try {
    const response = await fetch(logoLight);
    const bytes = await response.arrayBuffer();
    logoImage = await pdfDoc.embedPng(bytes);
  } catch {
    logoImage = null;
  }

  const panels = [
    { x: 0, y: QUARTER_SHEET_HEIGHT },
    { x: QUARTER_SHEET_WIDTH, y: QUARTER_SHEET_HEIGHT },
    { x: 0, y: 0 },
    { x: QUARTER_SHEET_WIDTH, y: 0 }
  ];

  panels.forEach((panel) => {
    drawWelcomeHalfSheet(
      page,
      panel.x,
      panel.y,
      QUARTER_SHEET_WIDTH,
      QUARTER_SHEET_HEIGHT,
      fonts,
      eventType,
      locationName,
      logoImage ?? undefined
    );
  });

  page.drawLine({
    start: { x: QUARTER_SHEET_WIDTH, y: 16 },
    end: { x: QUARTER_SHEET_WIDTH, y: LETTER_PORTRAIT_HEIGHT - 16 },
    thickness: 0.8,
    color: rgb(0.75, 0.75, 0.75)
  });
  page.drawLine({
    start: { x: 16, y: QUARTER_SHEET_HEIGHT },
    end: { x: LETTER_PORTRAIT_WIDTH - 16, y: QUARTER_SHEET_HEIGHT },
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
