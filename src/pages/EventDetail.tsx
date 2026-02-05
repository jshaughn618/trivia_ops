import { useEffect, useMemo, useState, useId, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { api, formatApiError } from '../api';
import logoLight from '../assets/trivia_ops_logo_light.png';
import { AppShell } from '../components/AppShell';
import { PrimaryButton, SecondaryButton, DangerButton, ButtonLink, TextLink } from '../components/Buttons';
import { Section } from '../components/Section';
import { List, ListRow } from '../components/List';
import { StatusPill } from '../components/StatusPill';
import { AccordionSection } from '../components/AccordionSection';
import { IconButton } from '../components/IconButton';
import { logError } from '../lib/log';
import { useAuth } from '../auth';
import type { Event, EventRound, GameEdition, Game, GameType, Team, Location, User, EditionItem } from '../types';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 36;
const HEADER_HEIGHT = 60;
const CELL_PADDING = 12;

type RoundBundle = {
  round: EventRound;
  items: EditionItem[];
};

const safeFileName = (value: string, fallback: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return fallback;
  return trimmed
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || fallback;
};

const roundTitle = (round: EventRound) => {
  const title = round.scoresheet_title?.trim();
  return title ? `${round.round_number}. ${title}` : `${round.round_number}.`;
};

const answerLabel = (items: EditionItem[], key: 'a' | 'b') => {
  if (key === 'a') {
    return items.find((item) => item.answer_a_label)?.answer_a_label ?? 'Answer A';
  }
  return items.find((item) => item.answer_b_label)?.answer_b_label ?? 'Answer B';
};

const formatAnswer = (item: EditionItem) => {
  const answerA = item.answer_a?.trim();
  const answerB = item.answer_b?.trim();
  if (answerA || answerB) {
    const labelA = item.answer_a_label?.trim() || 'A';
    const labelB = item.answer_b_label?.trim() || 'B';
    if (answerA && answerB) {
      return `${labelA}: ${answerA}  ${labelB}: ${answerB}`;
    }
    if (answerA) return `${labelA}: ${answerA}`;
    if (answerB) return `${labelB}: ${answerB}`;
  }
  return item.answer?.trim() || '—';
};

const truncateText = (font: any, text: string, maxWidth: number, size: number) => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
};

const drawPageHeader = (
  page: any,
  event: Event,
  locationName: string,
  fonts: { regular: any; bold: any },
  options?: { showEventCode?: boolean }
) => {
  const titleSize = 14;
  const metaSize = 9;
  const headerTop = PAGE_HEIGHT - PAGE_MARGIN;
  const titleY = headerTop - titleSize;
  page.drawText(event.title, {
    x: PAGE_MARGIN,
    y: titleY,
    size: titleSize,
    font: fonts.bold
  });
  const dateLabel = new Date(event.starts_at).toLocaleDateString();
  const metaParts = [locationName, dateLabel].filter((value) => value && value.trim().length > 0);
  const metaLine = metaParts.join(' • ');
  if (metaLine) {
    page.drawText(metaLine, {
      x: PAGE_MARGIN,
      y: titleY - metaSize - 4,
      size: metaSize,
      font: fonts.regular
    });
  }

  if (options?.showEventCode && event.public_code) {
    const codeText = `Event Code: ${event.public_code}`;
    const codeSize = 10;
    const codeWidth = fonts.bold.widthOfTextAtSize(codeText, codeSize);
    page.drawText(codeText, {
      x: PAGE_WIDTH - PAGE_MARGIN - codeWidth,
      y: titleY,
      size: codeSize,
      font: fonts.bold
    });
  }
};

const drawGridLines = (page: any) => {
  const gridTop = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;
  const gridBottom = PAGE_MARGIN;
  const gridHeight = gridTop - gridBottom;
  const gridWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const midX = PAGE_MARGIN + gridWidth / 2;
  const midY = gridBottom + gridHeight / 2;
  const lineColor = rgb(0.75, 0.75, 0.75);

  page.drawLine({
    start: { x: midX, y: gridBottom },
    end: { x: midX, y: gridTop },
    thickness: 0.6,
    color: lineColor
  });
  page.drawLine({
    start: { x: PAGE_MARGIN, y: midY },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: midY },
    thickness: 0.6,
    color: lineColor
  });
};

const renderRoundBlock = (
  page: any,
  bundle: RoundBundle,
  cell: { x: number; y: number; width: number; height: number },
  fonts: { regular: any; bold: any },
  mode: 'scoresheet' | 'answersheet'
) => {
  const titleSize = 11;
  const numberSize = 9;
  const textSize = mode === 'scoresheet' ? 9 : 8.5;
  const items = bundle.items;
  const hasParts = items.some((item) => item.answer_a || item.answer_b);
  const titleY = cell.y + cell.height - CELL_PADDING - titleSize;
  page.drawText(roundTitle(bundle.round), {
    x: cell.x + CELL_PADDING,
    y: titleY,
    size: titleSize,
    font: fonts.bold
  });

  const titleGap = 14;
  let contentTop = titleY - titleGap;
  const numberWidth = fonts.regular.widthOfTextAtSize('00.', numberSize);
  const contentX = cell.x + CELL_PADDING;
  const textStartX = contentX + numberWidth + 6;
  const availableWidth = cell.width - CELL_PADDING * 2 - numberWidth - 6;

  if (hasParts && mode === 'scoresheet') {
    const labelSize = 8.5;
    const labelY = contentTop - labelSize;
    const gap = 12;
    const colWidth = (availableWidth - gap) / 2;
    page.drawText(answerLabel(items, 'a'), {
      x: textStartX,
      y: labelY,
      size: labelSize,
      font: fonts.regular
    });
    page.drawText(answerLabel(items, 'b'), {
      x: textStartX + colWidth + gap,
      y: labelY,
      size: labelSize,
      font: fonts.regular
    });
    const labelGap = 8;
    contentTop = labelY - labelGap;
  }

  const itemCount = items.length;
  const minLineSpacing = mode === 'scoresheet' ? 14 : 12;
  const availableHeight = contentTop - (cell.y + CELL_PADDING);
  if (itemCount > 0 && availableHeight / itemCount < minLineSpacing) {
    throw new Error(`Round ${bundle.round.round_number} has too many items to fit on one page.`);
  }
  const lineSpacing = itemCount > 0 ? availableHeight / itemCount : availableHeight;
  const baseY = contentTop - numberSize;

  if (itemCount === 0) {
    page.drawText('No items.', {
      x: contentX,
      y: baseY,
      size: textSize,
      font: fonts.regular
    });
    return;
  }

  for (let index = 0; index < itemCount; index += 1) {
    const item = items[index];
    const rowY = baseY - lineSpacing * index;
    page.drawText(`${index + 1}.`, {
      x: contentX,
      y: rowY,
      size: numberSize,
      font: fonts.regular
    });
    if (mode === 'scoresheet') {
      if (hasParts) {
        const gap = 12;
        const colWidth = (availableWidth - gap) / 2;
        const lineY = rowY - 2;
        page.drawLine({
          start: { x: textStartX, y: lineY },
          end: { x: textStartX + colWidth, y: lineY },
          thickness: 0.8,
          color: rgb(0, 0, 0)
        });
        page.drawLine({
          start: { x: textStartX + colWidth + gap, y: lineY },
          end: { x: textStartX + colWidth + gap + colWidth, y: lineY },
          thickness: 0.8,
          color: rgb(0, 0, 0)
        });
      } else {
        const lineY = rowY - 2;
        page.drawLine({
          start: { x: textStartX, y: lineY },
          end: { x: textStartX + availableWidth, y: lineY },
          thickness: 0.8,
          color: rgb(0, 0, 0)
        });
      }
    } else {
      const answer = truncateText(fonts.regular, formatAnswer(item), availableWidth, textSize);
      page.drawText(answer, {
        x: textStartX,
        y: rowY,
        size: textSize,
        font: fonts.regular
      });
    }
  }
};

const dataUrlToBytes = (dataUrl: string) => {
  const match = /^data:.*?;base64,(.+)$/.exec(dataUrl);
  if (!match) return new Uint8Array();
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const renderTeamBlock = (
  page: any,
  cell: { x: number; y: number; width: number; height: number },
  fonts: { regular: any; bold: any },
  extras: {
    qrImage?: any;
    logoImage?: any;
    eventCode?: string;
    teamCode?: string;
    teamName?: string;
    teamPlaceholder?: boolean;
  }
) => {
  const padding = CELL_PADDING;
  const textSize = 11;
  let cursorY = cell.y + cell.height - padding;

  const teamName = extras.teamName?.trim() ?? '';
  if (teamName && !extras.teamPlaceholder) {
    page.drawText(`Team: ${teamName}`, {
      x: cell.x + padding,
      y: cursorY - textSize,
      size: textSize,
      font: fonts.bold
    });
    cursorY -= textSize + 36;
  } else {
    const label = 'Team Name:';
    const labelWidth = fonts.bold.widthOfTextAtSize(label, textSize);
    const baseY = cursorY - textSize;
    const lineStartX = cell.x + padding + labelWidth + 6;
    const lineEndX = cell.x + cell.width - padding;
    page.drawText(label, {
      x: cell.x + padding,
      y: baseY,
      size: textSize,
      font: fonts.bold
    });
    page.drawLine({
      start: { x: lineStartX, y: baseY - 2 },
      end: { x: lineEndX, y: baseY - 2 },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
    cursorY -= textSize + 36;
  }

  if (extras.logoImage) {
    const maxLogoWidth = 150;
    const maxLogoHeight = 44;
    const scale = Math.min(
      maxLogoWidth / extras.logoImage.width,
      maxLogoHeight / extras.logoImage.height,
      1
    );
    const logoWidth = extras.logoImage.width * scale;
    const logoHeight = extras.logoImage.height * scale;
    page.drawImage(extras.logoImage, {
      x: cell.x + padding,
      y: cursorY - logoHeight,
      width: logoWidth,
      height: logoHeight
    });
    cursorY -= logoHeight + 4;
  }

  cursorY -= textSize * 0.5;

  const teamCodeText = extras.teamCode ? `Team Code: ${extras.teamCode}` : 'Team Code: —';
  page.drawText(teamCodeText, {
    x: cell.x + padding,
    y: cursorY - textSize,
    size: textSize,
    font: fonts.bold
  });
  cursorY -= textSize + 8;

  const qrSize = 96;
  if (extras.qrImage) {
    page.drawImage(extras.qrImage, {
      x: cell.x + padding,
      y: cursorY - qrSize,
      width: qrSize,
      height: qrSize
    });
    cursorY -= qrSize + 10;
  }
};

const renderUpcomingBlock = (
  page: any,
  cell: { x: number; y: number; width: number; height: number },
  fonts: { regular: any; bold: any },
  extras: {
    upcomingLines?: string[];
    locationName?: string;
  }
) => {
  const padding = CELL_PADDING;
  const upcomingTitleSize = 10.5;
  const upcomingTextSize = 11;
  let cursorY = cell.y + cell.height - padding;
  const upcoming = extras.upcomingLines ?? [];
  if (upcoming.length > 0) {
    const locationLabel = extras.locationName?.trim()
      ? `Upcoming Trivia Events at ${extras.locationName.trim()}`
      : 'Upcoming Trivia Events';
    page.drawText(locationLabel, {
      x: cell.x + padding,
      y: cursorY - upcomingTitleSize,
      size: upcomingTitleSize,
      font: fonts.bold
    });
    cursorY -= upcomingTitleSize + 8;
    upcoming.forEach((line) => {
      if (!line.trim()) {
        cursorY -= upcomingTextSize + 8;
        return;
      }
      page.drawText(line, {
        x: cell.x + padding,
        y: cursorY - upcomingTextSize,
        size: upcomingTextSize,
        font: fonts.regular
      });
      cursorY -= upcomingTextSize + 6;
    });
  }
};

const buildPdf = async (
  event: Event,
  locationName: string,
  rounds: RoundBundle[],
  mode: 'scoresheet' | 'answersheet',
  extras?: {
    qrDataUrl?: string;
    eventCode?: string;
    teamCode?: string;
    teamName?: string;
    teamPlaceholder?: boolean;
    upcomingLines?: string[];
    locationName?: string;
    logoBytes?: Uint8Array;
  }
) => {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  };
  let qrImage: any | null = null;
  let logoImage: any | null = null;
  if (mode === 'scoresheet' && extras?.qrDataUrl) {
    const qrBytes = dataUrlToBytes(extras.qrDataUrl);
    if (qrBytes.length > 0) {
      try {
        qrImage = await pdfDoc.embedPng(qrBytes);
      } catch {
        qrImage = null;
      }
    }
  }
  if (mode === 'scoresheet' && extras?.logoBytes) {
    try {
      logoImage = await pdfDoc.embedPng(extras.logoBytes);
    } catch {
      logoImage = null;
    }
  }
  const gridTop = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;
  const gridBottom = PAGE_MARGIN;
  const gridHeight = gridTop - gridBottom;
  const gridWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const cellWidth = gridWidth / 2;
  const cellHeight = gridHeight / 2;

  const pageCount = () => pdfDoc.getPages().length;
  const createPage = (showEventCode = false) => {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageHeader(page, event, locationName, fonts, { showEventCode });
    drawGridLines(page);
    return page;
  };

  const getCell = (cellIndex: number) => {
    const row = cellIndex < 2 ? 0 : 1;
    const col = cellIndex % 2;
    const cellX = PAGE_MARGIN + col * cellWidth;
    const cellY = row === 0 ? gridBottom + cellHeight : gridBottom;
    return { x: cellX, y: cellY, width: cellWidth, height: cellHeight };
  };

  const hasUpcoming = Boolean(extras?.upcomingLines?.some((line) => line.trim()));

  if (mode === 'scoresheet') {
    let pageIndex = -1;
    let page = createPage(true);
    pageIndex = 0;
    let positionIndex = 0;
    const positionsForPage = (index: number) => {
      if (index === 0) return [1, 2, 3];
      if (index === 1 && hasUpcoming) return [0, 1, 2];
      return [0, 1, 2, 3];
    };

    for (let index = 0; index < rounds.length; index += 1) {
      let positions = positionsForPage(pageIndex);
      if (positionIndex >= positions.length) {
        page = createPage(false);
        pageIndex += 1;
        positionIndex = 0;
        positions = positionsForPage(pageIndex);
      }
      const cellIndex = positions[positionIndex];
      positionIndex += 1;
      renderRoundBlock(page, rounds[index], getCell(cellIndex), fonts, mode);
    }

    const firstPage = pdfDoc.getPages()[0] ?? createPage(true);
    renderTeamBlock(firstPage, getCell(0), fonts, {
      qrImage: qrImage ?? undefined,
      logoImage: logoImage ?? undefined,
      eventCode: extras?.eventCode,
      teamCode: extras?.teamCode,
      teamName: extras?.teamName,
      teamPlaceholder: extras?.teamPlaceholder
    });

    if (hasUpcoming) {
      while (pageCount() < 2) {
        createPage(false);
      }
      const upcomingPage = pdfDoc.getPages()[1];
      renderUpcomingBlock(upcomingPage, getCell(3), fonts, {
        upcomingLines: extras?.upcomingLines,
        locationName: extras?.locationName
      });
    }
  } else {
    for (let index = 0; index < rounds.length; index += 1) {
      if (index % 4 === 0) {
        createPage(pageCount() === 0);
      }
      const page = pdfDoc.getPages()[pdfDoc.getPages().length - 1];
      const cellIndex = index % 4;
      renderRoundBlock(page, rounds[index], getCell(cellIndex), fonts, mode);
    }
  }

  return pdfDoc.save();
};

export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const isAdmin = auth.user?.user_type === 'admin';
  const [event, setEvent] = useState<Event | null>(null);
  const [rounds, setRounds] = useState<EventRound[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [gameTypes, setGameTypes] = useState<GameType[]>([]);
  const [editions, setEditions] = useState<GameEdition[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [hosts, setHosts] = useState<User[]>([]);
  const [status, setStatus] = useState('planned');
  const [eventType, setEventType] = useState<'Pub Trivia' | 'Music Trivia'>('Pub Trivia');
  const [notes, setNotes] = useState('');
  const [locationId, setLocationId] = useState('');
  const [hostUserId, setHostUserId] = useState('');
  const [roundGameId, setRoundGameId] = useState('');
  const [roundEditionId, setRoundEditionId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamTable, setTeamTable] = useState('');
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSeedCount, setTeamSeedCount] = useState(20);
  const [teamSeedLoading, setTeamSeedLoading] = useState(false);
  const [teamSeedError, setTeamSeedError] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState('');
  const [editingTeamTable, setEditingTeamTable] = useState('');
  const [teamEditError, setTeamEditError] = useState<string | null>(null);
  const [scoreRoundId, setScoreRoundId] = useState('');
  const [scoreMap, setScoreMap] = useState<Record<string, number>>({});
  const [scoreLoading, setScoreLoading] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [roundMenuId, setRoundMenuId] = useState<string | null>(null);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [draggedRoundId, setDraggedRoundId] = useState<string | null>(null);
  const [scoresheetTitles, setScoresheetTitles] = useState<Record<string, string>>({});
  const [roundAudioUploadingId, setRoundAudioUploadingId] = useState<string | null>(null);
  const [roundAudioError, setRoundAudioError] = useState<Record<string, string>>({});
  const [roundSyncingId, setRoundSyncingId] = useState<string | null>(null);
  const [roundSyncMessage, setRoundSyncMessage] = useState<Record<string, string>>({});
  const [roundSyncError, setRoundSyncError] = useState<Record<string, string>>({});
  const [scoresheetUploading, setScoresheetUploading] = useState(false);
  const [scoresheetError, setScoresheetError] = useState<string | null>(null);
  const [answersheetUploading, setAnswersheetUploading] = useState(false);
  const [answersheetError, setAnswersheetError] = useState<string | null>(null);
  const [scoresheetGenerating, setScoresheetGenerating] = useState(false);
  const [scoresheetGenerateError, setScoresheetGenerateError] = useState<string | null>(null);
  const [openDocumentMenu, setOpenDocumentMenu] = useState<'scoresheet' | 'answersheet' | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [startsAtError, setStartsAtError] = useState<string | null>(null);
  const scoresheetInputId = useId();
  const answersheetInputId = useId();
  const documentMenuRef = useRef<HTMLDivElement | null>(null);

  const loadCore = async (isActive: () => boolean = () => true) => {
    if (!eventId) return;
    const [eventRes, roundsRes, teamsRes] = await Promise.all([
      api.getEvent(eventId),
      api.listEventRounds(eventId),
      api.listTeams(eventId)
    ]);
    if (!isActive()) return;
    if (eventRes.ok) {
      setEvent(eventRes.data);
      setStatus(eventRes.data.status);
      setEventType(eventRes.data.event_type ?? 'Pub Trivia');
      setNotes(eventRes.data.notes ?? '');
      setLocationId(eventRes.data.location_id ?? '');
      setHostUserId(eventRes.data.host_user_id ?? '');
    }
    if (roundsRes.ok) setRounds(roundsRes.data.sort((a, b) => a.round_number - b.round_number));
    if (teamsRes.ok) setTeams(teamsRes.data);
  };

  const loadBootstrap = async (isActive: () => boolean = () => true) => {
    if (!eventId) return false;
    const res = await api.getEventBootstrap(eventId);
    if (!isActive()) return false;
    if (!res.ok) return false;
    setEvent(res.data.event);
    setStatus(res.data.event.status);
    setEventType(res.data.event.event_type ?? 'Pub Trivia');
    setNotes(res.data.event.notes ?? '');
    setLocationId(res.data.event.location_id ?? '');
    setHostUserId(res.data.event.host_user_id ?? '');
    setRounds(res.data.rounds.sort((a, b) => a.round_number - b.round_number));
    setTeams(res.data.teams);
    setEditions(res.data.editions);
    setLocations(res.data.locations);
    setGames(res.data.games);
    setHosts(res.data.hosts);
    setGameTypes(res.data.game_types);
    return true;
  };

  const loadReferences = async (isActive: () => boolean = () => true) => {
    if (!eventId) return;
    const [editionsRes, locationsRes, gamesRes, hostsRes, gameTypesRes] = await Promise.all([
      api.listEditions(),
      api.listLocations(),
      api.listGames(),
      api.listHosts(),
      api.listGameTypes()
    ]);
    if (!isActive()) return;
    if (editionsRes.ok) setEditions(editionsRes.data);
    if (locationsRes.ok) setLocations(locationsRes.data);
    if (gamesRes.ok) setGames(gamesRes.data);
    if (hostsRes.ok) setHosts(hostsRes.data);
    if (gameTypesRes.ok) setGameTypes(gameTypesRes.data);
  };

  useEffect(() => {
    let active = true;
    const isActive = () => active;
    const run = async () => {
      if (isAdmin) {
        const loaded = await loadBootstrap(isActive);
        if (!loaded && isActive()) {
          await Promise.all([loadCore(isActive), loadReferences(isActive)]);
        }
        return;
      }
      await loadCore(isActive);
    };
    run();
    return () => {
      active = false;
    };
  }, [eventId, isAdmin]);

  useEffect(() => {
    if (!scoreRoundId && rounds.length > 0) {
      setScoreRoundId(rounds[0].id);
      loadScores(rounds[0].id);
    }
  }, [rounds, scoreRoundId]);

  useEffect(() => {
    if (!event) return;
    if (!editingTitle) {
      setTitleDraft(event.title);
    }
  }, [event, editingTitle]);

  useEffect(() => {
    if (!event) return;
    const date = new Date(event.starts_at);
    if (Number.isNaN(date.getTime())) return;
    const pad = (value: number) => String(value).padStart(2, '0');
    const localValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
    setStartsAtLocal(localValue);
  }, [event?.starts_at]);

  useEffect(() => {
    setScoresheetTitles((prev) => {
      const next = { ...prev };
      rounds.forEach((round) => {
        if (next[round.id] === undefined) {
          next[round.id] = round.scoresheet_title ?? round.label;
        }
      });
      return next;
    });
  }, [rounds]);

  useEffect(() => {
    if (!openDocumentMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (documentMenuRef.current && target && !documentMenuRef.current.contains(target)) {
        setOpenDocumentMenu(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenDocumentMenu(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openDocumentMenu]);

  const publicUrl = useMemo(() => {
    if (!event?.public_code) return '';
    return `https://triviaops.com/login?event=${event.public_code}`;
  }, [event?.public_code]);

  const locationName = useMemo(() => {
    if (!event?.location_id) return '';
    return locations.find((location) => location.id === event.location_id)?.name ?? '';
  }, [event?.location_id, locations]);

  const copyEventCode = async () => {
    if (!event?.public_code) return;
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(event.public_code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1600);
    } catch (error) {
      logError('event_code_copy_failed', { error });
    }
  };

  const saveEventTitle = async () => {
    if (!eventId) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError('Title cannot be empty.');
      return;
    }
    setTitleSaving(true);
    setTitleError(null);
    const res = await api.updateEvent(eventId, { title: nextTitle });
    if (res.ok) {
      setEvent(res.data);
      setEditingTitle(false);
    } else {
      setTitleError(formatApiError(res, 'Failed to update title.'));
    }
    setTitleSaving(false);
  };

  useEffect(() => {
    if (!publicUrl) return;
    setQrLoading(true);
    setQrError(null);
    QRCode.toDataURL(publicUrl, { margin: 1, width: 320 })
      .then((url) => {
        setQrUrl(url);
        setQrLoading(false);
      })
      .catch(() => {
        setQrError('Failed to generate QR code.');
        setQrLoading(false);
      });
  }, [publicUrl]);

  const roundNumber = useMemo(() => {
    return rounds.length === 0 ? 1 : Math.max(...rounds.map((round) => round.round_number)) + 1;
  }, [rounds]);

  const editionById = useMemo(() => {
    return Object.fromEntries(editions.map((edition) => [edition.id, edition]));
  }, [editions]);

  const gameById = useMemo(() => {
    return Object.fromEntries(games.map((game) => [game.id, game]));
  }, [games]);

  const gameTypeById = useMemo(() => {
    return Object.fromEntries(gameTypes.map((type) => [type.id, type]));
  }, [gameTypes]);

  const gamesForEvent = useMemo(() => {
    if (eventType !== 'Music Trivia') return games;
    return games.filter((game) => gameTypeById[game.game_type_id]?.code === 'music');
  }, [eventType, games, gameTypeById]);

  const roundEditions = useMemo(() => {
    if (!roundGameId) return [];
    return editions.filter((edition) => edition.game_id === roundGameId);
  }, [editions, roundGameId]);

  const reorderRounds = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ordered = [...rounds].sort((a, b) => a.round_number - b.round_number);
    const fromIndex = ordered.findIndex((round) => round.id === sourceId);
    const toIndex = ordered.findIndex((round) => round.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    const updated = ordered.map((round, index) => ({ ...round, round_number: index + 1 }));
    setRounds(updated);
    await Promise.all(
      updated.map((round) => api.updateEventRound(round.id, { round_number: round.round_number }))
    );
  };

  const roundDisplay = (round: EventRound) => {
    const edition = editionById[round.edition_id];
    const game = edition ? gameById[edition.game_id] : null;
    const editionLabel = edition?.theme ?? edition?.title ?? 'Edition';
    const gameLabel = game?.name ?? 'Game';
    return {
      title: `Round ${round.round_number}`,
      detail: `${gameLabel} — ${editionLabel}`
    };
  };

  const isSpeedRound = (round: EventRound) => {
    const edition = editionById[round.edition_id];
    const game = edition ? gameById[edition.game_id] : null;
    return game?.subtype === 'speed_round';
  };

  const updateEvent = async () => {
    if (!eventId) return;
    const startsAtIso = startsAtLocal ? new Date(startsAtLocal) : null;
    if (startsAtLocal && (!startsAtIso || Number.isNaN(startsAtIso.getTime()))) {
      setStartsAtError('Invalid date/time.');
      return;
    }
    setStartsAtError(null);
    const res = await api.updateEvent(eventId, {
      status,
      event_type: eventType,
      notes,
      starts_at: startsAtIso ? startsAtIso.toISOString() : event?.starts_at,
      location_id: locationId || null,
      host_user_id: hostUserId || null
    });
    if (res.ok) setEvent(res.data);
  };

  const createRound = async () => {
    if (!eventId || !roundGameId || !roundEditionId) return;
    const edition = editionById[roundEditionId];
    const game = edition ? gameById[edition.game_id] : gameById[roundGameId];
    const editionLabel = edition?.theme ?? edition?.title ?? 'Edition';
    const gameLabel = game?.name ?? 'Game';
    const label = `${gameLabel} — ${editionLabel}`;
    await api.createEventRound(eventId, {
      round_number: roundNumber,
      label,
      scoresheet_title: label,
      edition_id: roundEditionId,
      status: 'planned'
    });
    setRoundGameId('');
    setRoundEditionId('');
    loadCore();
  };

  const saveScoresheetTitle = async (round: EventRound) => {
    const rawTitle = scoresheetTitles[round.id];
    const nextTitle = rawTitle?.trim() || round.label;
    const res = await api.updateEventRound(round.id, { scoresheet_title: nextTitle });
    if (res.ok) {
      setRounds((prev) => prev.map((item) => (item.id === round.id ? res.data : item)));
      setScoresheetTitles((prev) => ({ ...prev, [round.id]: res.data.scoresheet_title ?? res.data.label }));
    }
  };

  const uploadRoundAudio = async (round: EventRound, file: File) => {
    const isMp3 = file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3');
    if (!isMp3) {
      setRoundAudioError((prev) => ({ ...prev, [round.id]: 'Speed rounds require an MP3 file.' }));
      return;
    }
    setRoundAudioUploadingId(round.id);
    setRoundAudioError((prev) => ({ ...prev, [round.id]: '' }));
    const uploadRes = await api.uploadMedia(file, 'audio');
    if (!uploadRes.ok) {
      setRoundAudioUploadingId(null);
      setRoundAudioError((prev) => ({ ...prev, [round.id]: formatApiError(uploadRes, 'Upload failed.') }));
      return;
    }
    const previousKey = round.audio_key;
    const updateRes = await api.updateEventRound(round.id, {
      audio_key: uploadRes.data.key,
      audio_name: file.name
    });
    setRoundAudioUploadingId(null);
    if (!updateRes.ok) {
      setRoundAudioError((prev) => ({ ...prev, [round.id]: formatApiError(updateRes, 'Failed to save audio.') }));
      await api.deleteMedia(uploadRes.data.key);
      return;
    }
    setRounds((prev) => prev.map((item) => (item.id === round.id ? updateRes.data : item)));
    if (previousKey && previousKey !== uploadRes.data.key) {
      await api.deleteMedia(previousKey);
    }
  };

  const removeRoundAudio = async (round: EventRound) => {
    if (!round.audio_key) return;
    setRoundAudioUploadingId(round.id);
    setRoundAudioError((prev) => ({ ...prev, [round.id]: '' }));
    const updateRes = await api.updateEventRound(round.id, { audio_key: null, audio_name: null });
    setRoundAudioUploadingId(null);
    if (!updateRes.ok) {
      setRoundAudioError((prev) => ({ ...prev, [round.id]: formatApiError(updateRes, 'Failed to remove audio.') }));
      return;
    }
    setRounds((prev) => prev.map((item) => (item.id === round.id ? updateRes.data : item)));
    await api.deleteMedia(round.audio_key);
  };

  const syncRoundItems = async (round: EventRound) => {
    setRoundSyncingId(round.id);
    setRoundSyncError((prev) => ({ ...prev, [round.id]: '' }));
    setRoundSyncMessage((prev) => ({ ...prev, [round.id]: '' }));
    const res = await api.syncEventRoundItems(round.id);
    if (res.ok) {
      const count = res.data.inserted ?? 0;
      setRoundSyncMessage((prev) => ({
        ...prev,
        [round.id]: count > 0 ? `Added ${count} new item${count === 1 ? '' : 's'}.` : 'No new items.'
      }));
    } else {
      setRoundSyncError((prev) => ({ ...prev, [round.id]: formatApiError(res, 'Sync failed.') }));
    }
    setRoundSyncingId(null);
  };

  const createTeam = async () => {
    if (!eventId || !teamName.trim()) return;
    setTeamError(null);
    const res = await api.createTeam(eventId, { name: teamName, table_label: teamTable || null });
    if (res.ok) {
      setTeamName('');
      setTeamTable('');
      setTeamError(null);
      loadCore();
    } else {
      setTeamError(formatApiError(res, 'Unable to create team.'));
    }
  };

  const prepopulateTeams = async () => {
    if (!eventId || teamSeedLoading) return;
    setTeamSeedLoading(true);
    setTeamSeedError(null);
    const res = await api.prepopulateTeams(eventId, { count: teamSeedCount });
    if (res.ok) {
      await loadCore();
    } else {
      setTeamSeedError(formatApiError(res, 'Failed to prepopulate teams.'));
    }
    setTeamSeedLoading(false);
  };

  const deleteRound = async (roundId: string) => {
    await api.deleteEventRound(roundId);
    loadCore();
  };

  const deleteEvent = async () => {
    if (!eventId) return;
    const confirmed = window.confirm('Delete this event? This cannot be undone.');
    if (!confirmed) return;
    await api.deleteEvent(eventId);
    navigate('/events');
  };

  const deleteTeam = async (teamId: string) => {
    await api.deleteTeam(teamId);
    loadCore();
  };

  const startEditTeam = (team: Team) => {
    setTeamEditError(null);
    setEditingTeamId(team.id);
    setEditingTeamName(team.name ?? '');
    setEditingTeamTable(team.table_label ?? '');
  };

  const cancelEditTeam = () => {
    setTeamEditError(null);
    setEditingTeamId(null);
    setEditingTeamName('');
    setEditingTeamTable('');
  };

  const saveEditTeam = async () => {
    if (!editingTeamId) return;
    if (!editingTeamName.trim()) {
      setTeamEditError('Team name is required.');
      return;
    }
    const res = await api.updateTeam(editingTeamId, {
      name: editingTeamName.trim(),
      table_label: editingTeamTable.trim() || null
    });
    if (res.ok) {
      cancelEditTeam();
      loadCore();
    } else {
      setTeamEditError(formatApiError(res, 'Unable to update team.'));
    }
  };

  const loadScores = async (roundId: string) => {
    if (!roundId) return;
    const res = await api.listRoundScores(roundId);
    if (res.ok) {
      const map: Record<string, number> = {};
      res.data.forEach((row) => {
        map[row.team_id] = row.score;
      });
      setScoreMap(map);
    }
  };

  const saveScores = async () => {
    if (!scoreRoundId) return;
    setScoreLoading(true);
    const scores = teams.map((team) => ({
      team_id: team.id,
      score: Number(scoreMap[team.id] ?? 0)
    }));
    await api.updateRoundScores(scoreRoundId, scores);
    setScoreLoading(false);
  };

  const uploadDocument = async (type: 'scoresheet' | 'answersheet', file: File) => {
    if (!eventId) return;
    const setUploading = type === 'scoresheet' ? setScoresheetUploading : setAnswersheetUploading;
    const setError = type === 'scoresheet' ? setScoresheetError : setAnswersheetError;
    setUploading(true);
    setError(null);

    if (file.type && file.type !== 'application/pdf') {
      setError('PDF only.');
      setUploading(false);
      return;
    }

    const res = await api.uploadEventDocument(eventId, type, file);
    if (res.ok) {
      setEvent(res.data);
    } else {
      setError(formatApiError(res, 'Upload failed.'));
    }
    setUploading(false);
  };

  const removeDocument = async (type: 'scoresheet' | 'answersheet') => {
    if (!eventId) return;
    const setUploading = type === 'scoresheet' ? setScoresheetUploading : setAnswersheetUploading;
    const setError = type === 'scoresheet' ? setScoresheetError : setAnswersheetError;
    setUploading(true);
    setError(null);
    const res = await api.deleteEventDocument(eventId, type);
    if (res.ok) {
      setEvent(res.data);
    } else {
      setError(formatApiError(res, 'Remove failed.'));
    }
    setUploading(false);
  };

  const generateScoresheets = async () => {
    if (!eventId || !event) return;
    if (rounds.length === 0) {
      setScoresheetGenerateError('No rounds available to generate scoresheets.');
      return;
    }
    setScoresheetGenerating(true);
    setScoresheetGenerateError(null);
    try {
      const itemResponses = await Promise.all(rounds.map((round) => api.listEventRoundItems(round.id)));
      const bundles: RoundBundle[] = [];
      for (let index = 0; index < rounds.length; index += 1) {
        const response = itemResponses[index];
        if (!response.ok) {
          throw new Error(response.error.message ?? `Failed to load items for round ${rounds[index].round_number}.`);
        }
        bundles.push({ round: rounds[index], items: response.data });
      }

      const locationName = locations.find((location) => location.id === event.location_id)?.name ?? '';
      let upcomingLines: string[] = [];
      if (event.location_id) {
        const eventsRes = await api.listEvents();
        if (eventsRes.ok) {
          const now = Date.now();
          const formatUpcoming = (date: Date) => {
            const dateLine = date.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            });
            const startTime = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            return { dateLine: `${dateLine}`, timeLine: `${startTime}` };
          };
          upcomingLines = eventsRes.data
            .filter(
              (candidate) =>
                candidate.location_id === event.location_id &&
                candidate.id !== event.id &&
                new Date(candidate.starts_at).getTime() > now
            )
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .slice(0, 2)
            .flatMap((candidate, index) => {
              const start = new Date(candidate.starts_at);
              const lines = formatUpcoming(start);
              const block = [candidate.event_type, `${lines.dateLine} ${lines.timeLine}`];
              return index === 0 ? block.concat(['']) : block;
            });
        }
      }
      let logoBytes: Uint8Array | undefined;
      try {
        const logoRes = await fetch(logoLight);
        if (logoRes.ok) {
          const buffer = await logoRes.arrayBuffer();
          logoBytes = new Uint8Array(buffer);
        }
      } catch {
        logoBytes = undefined;
      }
      const scoresheetDoc = await PDFDocument.create();
      const teamsForSheets = teams.length > 0 ? teams : [null];
      for (const team of teamsForSheets) {
        let qrDataUrl: string | undefined;
        if (event.public_code) {
          const params = new URLSearchParams();
          params.set('event', event.public_code);
          if (team?.team_code) params.set('team', team.team_code);
          const qrTarget = `https://triviaops.com/login?${params.toString()}`;
          try {
            qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 1, width: 240 });
          } catch {
            qrDataUrl = undefined;
          }
        }
        const teamScoresheet = await buildPdf(event, locationName, bundles, 'scoresheet', {
          qrDataUrl,
          eventCode: event.public_code ?? undefined,
          teamCode: team?.team_code ?? undefined,
          teamName: team?.name ?? undefined,
          teamPlaceholder: Number(team?.team_placeholder ?? 0) === 1,
          upcomingLines,
          locationName,
          logoBytes
        });
        const teamDoc = await PDFDocument.load(teamScoresheet);
        const pages = await scoresheetDoc.copyPages(teamDoc, teamDoc.getPageIndices());
        pages.forEach((page) => scoresheetDoc.addPage(page));
      }
      const scoresheetBytes = await scoresheetDoc.save();
      const answersheetBytes = await buildPdf(event, locationName, bundles, 'answersheet');
      const baseName = safeFileName(event.title, `event-${event.id.slice(0, 8)}`);
      const scoresheetLabel = teams.length > 1 ? `${baseName}-scoresheets.pdf` : `${baseName}-scoresheet.pdf`;
      const scoresheetFile = new File([scoresheetBytes], scoresheetLabel, {
        type: 'application/pdf'
      });
      const answersheetFile = new File([answersheetBytes], `${baseName}-answersheet.pdf`, {
        type: 'application/pdf'
      });

      const scoresheetRes = await api.uploadEventDocument(eventId, 'scoresheet', scoresheetFile);
      if (!scoresheetRes.ok) {
        throw new Error(scoresheetRes.error.message ?? 'Failed to upload scoresheet.');
      }
      setEvent(scoresheetRes.data);

      const answersheetRes = await api.uploadEventDocument(eventId, 'answersheet', answersheetFile);
      if (!answersheetRes.ok) {
        throw new Error(answersheetRes.error.message ?? 'Failed to upload answer sheet.');
      }
      setEvent(answersheetRes.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate scoresheets.';
      setScoresheetGenerateError(message);
    } finally {
      setScoresheetGenerating(false);
    }
  };

  if (!event) {
    return (
      <AppShell title="Event Detail">
        <div className="text-sm text-muted">Loading...</div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell title="Event Detail" showTitle={false}>
        <div className="space-y-4">
          <Section
            title={event.title}
            actions={
              <ButtonLink to={`/events/${event.id}/run`} variant="primary">
                Present
              </ButtonLink>
            }
          >
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <span>{new Date(event.starts_at).toLocaleString()}</span>
              <StatusPill status={event.status} label={event.status} />
            </div>
            {event.notes && <div className="mt-3 text-sm text-text">{event.notes}</div>}
          </Section>
          <Section title="Rounds">
            {rounds.length === 0 && (
              <div className="text-sm text-muted">No rounds yet.</div>
            )}
            {rounds.length > 0 && (
              <List>
                {rounds.map((round) => (
                  <ListRow
                    key={round.id}
                    to={`/events/${event.id}/run?round=${round.id}`}
                    className="items-center"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-display tracking-[0.12em]">Round {round.round_number}</div>
                    <div className="mt-1 text-xs text-muted">
                        {round.scoresheet_title?.trim() || round.label}
                      </div>
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

  const documentMenuButtonClass =
    'inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-panel px-3 text-xs font-medium text-text transition-colors hover:bg-panel2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg';
  const documentMenuItemClass =
    'block w-full rounded-md px-3 py-2 text-left text-xs text-text transition-colors hover:bg-panel2';

  const roundsContent = (
    <div className="space-y-3">
      {rounds.length === 0 && <div className="text-sm text-muted">No rounds yet.</div>}
      {rounds.length > 0 && (
        <List>
          {rounds.map((round) => {
            const display = roundDisplay(round);
            const title = `${display.title} — ${round.scoresheet_title?.trim() || round.label}`;
            return (
              <ListRow
                key={round.id}
                interactive
                role="button"
                tabIndex={0}
                aria-expanded={expandedRoundId === round.id}
                className="flex-col items-stretch gap-2"
                onClick={() =>
                  setExpandedRoundId((current) => (current === round.id ? null : round.id))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setExpandedRoundId((current) => (current === round.id ? null : round.id));
                  }
                }}
                draggable
                onDragStart={() => setDraggedRoundId(round.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedRoundId) {
                    reorderRounds(draggedRoundId, round.id);
                    setDraggedRoundId(null);
                  }
                }}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-display tracking-[0.12em]">{title}</div>
                    <div className="mt-1 text-xs text-muted">{display.detail}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/events/${event.id}/run?round=${round.id}`}
                      className="text-xs font-medium text-accent-ink"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Present
                    </Link>
                    <div className="relative">
                      <IconButton
                        label="Round actions"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRoundMenuId((current) => (current === round.id ? null : round.id));
                        }}
                        aria-haspopup="menu"
                        aria-expanded={roundMenuId === round.id}
                      >
                        ⋯
                      </IconButton>
                      {roundMenuId === round.id && (
                        <div className="absolute right-0 z-10 mt-2 min-w-[160px] rounded-md border border-border bg-panel p-2 text-left shadow-sm">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRoundMenuId(null);
                              syncRoundItems(round);
                            }}
                            className="mb-2 w-full rounded-md border border-border bg-panel2 px-3 py-2 text-xs font-medium text-text"
                            disabled={roundSyncingId === round.id}
                          >
                            {roundSyncingId === round.id ? 'Syncing…' : 'Sync items'}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRoundMenuId(null);
                              deleteRound(round.id);
                            }}
                            className="w-full rounded-md border border-danger bg-panel2 px-3 py-2 text-xs font-medium text-danger-ink"
                          >
                            Delete round
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {roundSyncMessage[round.id] && (
                  <div className="text-xs text-accent-ink">{roundSyncMessage[round.id]}</div>
                )}
                {roundSyncError[round.id] && (
                  <div className="text-xs text-danger-ink">{roundSyncError[round.id]}</div>
                )}
                {expandedRoundId === round.id && (
                  <div
                    className="mt-2 w-full border-t border-border pt-3"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <label className="flex flex-col gap-2 text-sm text-muted">
                      <span>Scoresheet title</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="h-9 flex-1 px-2 text-xs"
                          value={scoresheetTitles[round.id] ?? ''}
                          onChange={(event) =>
                            setScoresheetTitles((prev) => ({ ...prev, [round.id]: event.target.value }))
                          }
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                        />
                        <SecondaryButton
                          className="px-3 py-2 text-xs"
                          onClick={() => saveScoresheetTitle(round)}
                        >
                          Save
                        </SecondaryButton>
                      </div>
                    </label>
                    {isSpeedRound(round) && (
                      <div className="mt-4 border-t border-border pt-3">
                        <div className="text-sm text-muted">Speed round audio</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            id={`round-audio-${round.id}`}
                            type="file"
                            accept="audio/mpeg,audio/mp3"
                            className="sr-only"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              if (file) uploadRoundAudio(round, file);
                            }}
                            disabled={roundAudioUploadingId === round.id}
                          />
                          <label
                            htmlFor={`round-audio-${round.id}`}
                            className={`rounded-md border border-border px-3 py-1 text-xs text-muted hover:border-accent-ink hover:text-text ${roundAudioUploadingId === round.id ? 'opacity-50' : ''}`}
                          >
                            {roundAudioUploadingId === round.id ? 'Uploading' : 'Upload MP3'}
                          </label>
                          {round.audio_key && (
                            <SecondaryButton
                              className="px-3 py-2 text-xs"
                              onClick={() => removeRoundAudio(round)}
                              disabled={roundAudioUploadingId === round.id}
                            >
                              Remove
                            </SecondaryButton>
                          )}
                          {round.audio_name && (
                            <span className="text-xs text-muted">{round.audio_name}</span>
                          )}
                          {!round.audio_key && roundAudioUploadingId !== round.id && (
                            <span className="text-xs text-muted">No clip uploaded.</span>
                          )}
                        </div>
                        {round.audio_key && (
                          <div className="mt-2">
                            <audio className="w-full" controls src={api.mediaUrl(round.audio_key)} />
                          </div>
                        )}
                        {roundAudioError[round.id] && (
                          <div className="mt-2 text-xs text-danger-ink">{roundAudioError[round.id]}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </ListRow>
            );
          })}
        </List>
      )}
      <div className="border-t border-border pt-4">
        <div className="text-sm font-medium text-muted">Add round</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-muted">
            <span>Game</span>
            <select
              className="h-10 px-3"
              value={roundGameId}
              onChange={(event) => {
                setRoundGameId(event.target.value);
                setRoundEditionId('');
              }}
            >
              <option value="">Select game</option>
              {gamesForEvent.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted">
            <span>Edition</span>
            <select
              className="h-10 px-3"
              value={roundEditionId}
              onChange={(event) => setRoundEditionId(event.target.value)}
              disabled={!roundGameId}
            >
              <option value="">{roundGameId ? 'Select edition' : 'Select a game first'}</option>
              {roundEditions.map((edition) => (
                <option key={edition.id} value={edition.id}>
                  {edition.theme ?? 'Untitled Theme'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>Round number</span>
          <span>{roundNumber}</span>
        </div>
        <div className="mt-3">
          <PrimaryButton onClick={createRound}>Add Round</PrimaryButton>
        </div>
      </div>
    </div>
  );

  const teamsContent = (
    <div className="space-y-3">
      {teams.length === 0 && <div className="text-sm text-muted">No teams yet.</div>}
      {teams.length > 0 && (
        <List>
          {teams.map((team) => (
            <ListRow key={team.id} className="items-center">
              {editingTeamId === team.id ? (
                <>
                  <div className="grid w-full gap-2 sm:grid-cols-[2fr,1fr]">
                    <label className="flex flex-col gap-1 text-sm text-muted">
                      <span>Name</span>
                      <input
                        className="h-10 px-3"
                        value={editingTeamName}
                        onChange={(event) => setEditingTeamName(event.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-muted">
                      <span>Table label</span>
                      <input
                        className="h-10 px-3"
                        value={editingTeamTable}
                        onChange={(event) => setEditingTeamTable(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="text-xs text-muted">Team code: {team.team_code ?? '—'}</div>
                  {Number(team.team_placeholder ?? 0) === 1 ? (
                    <div className="text-xs text-muted">Status: Unclaimed</div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton className="px-3 py-2 text-xs" onClick={saveEditTeam}>
                      Save
                    </PrimaryButton>
                    <SecondaryButton className="px-3 py-2 text-xs" onClick={cancelEditTeam}>
                      Cancel
                    </SecondaryButton>
                    <DangerButton className="px-3 py-2 text-xs" onClick={() => deleteTeam(team.id)}>
                      Remove
                    </DangerButton>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-sm font-display tracking-[0.12em]">{team.name}</div>
                    <div className="mt-1 text-xs text-muted">{team.table_label ?? 'No table label'}</div>
                    <div className="mt-1 text-xs text-muted">Team code: {team.team_code ?? '—'}</div>
                    {Number(team.team_placeholder ?? 0) === 1 ? (
                      <div className="mt-1 text-xs text-muted">Status: Unclaimed</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton className="px-3 py-2 text-xs" onClick={() => startEditTeam(team)}>
                      Edit
                    </SecondaryButton>
                    <DangerButton className="px-3 py-2 text-xs" onClick={() => deleteTeam(team.id)}>
                      Remove
                    </DangerButton>
                  </div>
                </>
              )}
            </ListRow>
          ))}
        </List>
      )}
      {teamEditError && (
        <div className="border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
          {teamEditError}
        </div>
      )}
      <div className="border-t border-border pt-4">
        <div className="text-sm font-medium text-muted">Add team</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr,1fr,auto] sm:items-end">
          <label className="flex flex-col gap-2 text-sm text-muted">
            <span>Name</span>
            <input className="h-10 px-3" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted">
            <span>Table label</span>
            <input className="h-10 px-3" value={teamTable} onChange={(event) => setTeamTable(event.target.value)} />
          </label>
          <SecondaryButton className="h-10" onClick={createTeam}>
            Add Team
          </SecondaryButton>
        </div>
        {teamError && (
          <div className="mt-2 border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
            {teamError}
          </div>
        )}
      </div>
      <div className="border-t border-border pt-4">
        <div className="text-sm font-medium text-muted">Prepopulate teams</div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2 text-sm text-muted">
            <span>Count</span>
            <input
              className="h-10 w-24 px-3"
              type="number"
              min={1}
              max={100}
              value={teamSeedCount}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setTeamSeedCount(next);
              }}
            />
          </label>
          <SecondaryButton className="h-10" onClick={prepopulateTeams} disabled={teamSeedLoading}>
            {teamSeedLoading ? 'Generating…' : 'Generate team codes'}
          </SecondaryButton>
        </div>
        {teamSeedError && (
          <div className="mt-2 border border-danger bg-panel2 px-3 py-2 text-xs text-danger-ink">
            {teamSeedError}
          </div>
        )}
      </div>
    </div>
  );

  const scoresContent = (
    <div className="space-y-3">
      <label className="flex flex-col gap-2 text-sm text-muted">
        <span>Select round</span>
        <select
          className="h-10 px-3"
          value={scoreRoundId}
          onChange={(event) => {
            const value = event.target.value;
            setScoreRoundId(value);
            loadScores(value);
          }}
        >
          <option value="">Choose round</option>
          {rounds.map((round) => (
            <option key={round.id} value={round.id}>
              {roundDisplay(round).title} — {roundDisplay(round).detail}
            </option>
          ))}
        </select>
      </label>
      {teams.length === 0 && <div className="text-sm text-muted">Add teams to score.</div>}
      {teams.length > 0 && (
        <List>
          {teams.map((team) => (
            <ListRow key={team.id} className="items-center">
              <div className="text-sm">{team.name}</div>
              <input
                type="number"
                className="h-9 w-20 px-2 text-right"
                value={scoreMap[team.id] ?? 0}
                onChange={(event) =>
                  setScoreMap((prev) => ({ ...prev, [team.id]: Number(event.target.value) }))
                }
              />
            </ListRow>
          ))}
        </List>
      )}
      <div className="flex justify-end">
        <PrimaryButton onClick={saveScores} disabled={!scoreRoundId || scoreLoading}>
          {scoreLoading ? 'Saving' : 'Save scores'}
        </PrimaryButton>
      </div>
    </div>
  );

  const documentsContent = (
    <div className="space-y-3" ref={documentMenuRef}>
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton onClick={generateScoresheets} disabled={scoresheetGenerating}>
          {scoresheetGenerating ? 'Generating…' : 'Generate scoresheets'}
        </SecondaryButton>
        {scoresheetGenerateError && <div className="text-xs text-danger-ink">{scoresheetGenerateError}</div>}
      </div>
      <List>
        <ListRow className="flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="text-sm font-display tracking-[0.12em]">Scoresheet</div>
            <div className="mt-1 text-xs text-muted">
              {event.scoresheet_key ? event.scoresheet_name ?? 'scoresheet.pdf' : 'Not generated yet'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={scoresheetInputId}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) uploadDocument('scoresheet', file);
              }}
              disabled={scoresheetUploading}
            />
            <div className="relative">
              <button
                type="button"
                className={documentMenuButtonClass}
                aria-haspopup="menu"
                aria-expanded={openDocumentMenu === 'scoresheet'}
                onClick={() =>
                  setOpenDocumentMenu((current) => (current === 'scoresheet' ? null : 'scoresheet'))
                }
              >
                Actions
                <span aria-hidden>▾</span>
              </button>
              {openDocumentMenu === 'scoresheet' && (
                <div className="surface-card absolute right-0 z-10 mt-2 w-40 p-1" role="menu">
                  {event.scoresheet_key && (
                    <a
                      href={api.mediaUrl(event.scoresheet_key)}
                      download={event.scoresheet_name ?? 'scoresheet.pdf'}
                      className={documentMenuItemClass}
                      role="menuitem"
                      onClick={() => setOpenDocumentMenu(null)}
                    >
                      Download
                    </a>
                  )}
                  <label
                    htmlFor={scoresheetInputId}
                    className={`${documentMenuItemClass} cursor-pointer`}
                    role="menuitem"
                    onClick={() => setOpenDocumentMenu(null)}
                  >
                    Replace
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDocumentMenu(null);
                      removeDocument('scoresheet');
                    }}
                    className={`${documentMenuItemClass} text-danger-ink`}
                    disabled={!event.scoresheet_key || scoresheetUploading}
                    role="menuitem"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            {scoresheetUploading && <span className="text-xs text-muted">Uploading…</span>}
          </div>
        </ListRow>
        {scoresheetError && <div className="px-4 py-2 text-xs text-danger-ink">{scoresheetError}</div>}
        <ListRow className="flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="text-sm font-display tracking-[0.12em]">Answer sheet</div>
            <div className="mt-1 text-xs text-muted">
              {event.answersheet_key ? event.answersheet_name ?? 'answersheet.pdf' : 'Not generated yet'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={answersheetInputId}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) uploadDocument('answersheet', file);
              }}
              disabled={answersheetUploading}
            />
            <div className="relative">
              <button
                type="button"
                className={documentMenuButtonClass}
                aria-haspopup="menu"
                aria-expanded={openDocumentMenu === 'answersheet'}
                onClick={() =>
                  setOpenDocumentMenu((current) => (current === 'answersheet' ? null : 'answersheet'))
                }
              >
                Actions
                <span aria-hidden>▾</span>
              </button>
              {openDocumentMenu === 'answersheet' && (
                <div className="surface-card absolute right-0 z-10 mt-2 w-40 p-1" role="menu">
                  {event.answersheet_key && (
                    <a
                      href={api.mediaUrl(event.answersheet_key)}
                      download={event.answersheet_name ?? 'answersheet.pdf'}
                      className={documentMenuItemClass}
                      role="menuitem"
                      onClick={() => setOpenDocumentMenu(null)}
                    >
                      Download
                    </a>
                  )}
                  <label
                    htmlFor={answersheetInputId}
                    className={`${documentMenuItemClass} cursor-pointer`}
                    role="menuitem"
                    onClick={() => setOpenDocumentMenu(null)}
                  >
                    Replace
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDocumentMenu(null);
                      removeDocument('answersheet');
                    }}
                    className={`${documentMenuItemClass} text-danger-ink`}
                    disabled={!event.answersheet_key || answersheetUploading}
                    role="menuitem"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            {answersheetUploading && <span className="text-xs text-muted">Uploading…</span>}
          </div>
        </ListRow>
        {answersheetError && <div className="px-4 py-2 text-xs text-danger-ink">{answersheetError}</div>}
      </List>
      {event.public_code && (
        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-muted">Share event</div>
            <SecondaryButton className="px-3 py-2 text-xs" onClick={() => setShowQr((prev) => !prev)}>
              {showQr ? 'Hide QR' : 'Show QR'}
            </SecondaryButton>
          </div>
          {showQr && (
            <div className="mt-3 space-y-2">
              {qrLoading && <div className="text-xs text-muted">Generating…</div>}
              {qrError && <div className="text-xs text-danger-ink">{qrError}</div>}
              {qrUrl && (
                <div className="flex flex-col items-start gap-3">
                  <img src={qrUrl} alt="Event QR Code" className="h-36 w-36 border border-border bg-panel" />
                  <TextLink href={qrUrl} download={`trivia-ops-${event.public_code}.png`}>
                    Download QR code
                  </TextLink>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const settingsContent = (
    <div className="min-w-0 space-y-3">
      <div className="grid min-w-0 gap-4">
        <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">
          <span>Start date/time</span>
          <input
            type="datetime-local"
            className="h-10 w-full min-w-0 px-3"
            value={startsAtLocal}
            onChange={(event) => {
              setStartsAtLocal(event.target.value);
              if (startsAtError) setStartsAtError(null);
            }}
          />
          {startsAtError && <span className="text-xs text-danger-ink">{startsAtError}</span>}
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">
          <span>Location</span>
          <select className="h-10 w-full min-w-0 px-3" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">No location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">
          <span>Host</span>
          <select className="h-10 w-full min-w-0 px-3" value={hostUserId} onChange={(event) => setHostUserId(event.target.value)}>
            <option value="">Select host</option>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.first_name || host.last_name
                  ? `${host.first_name ?? ''} ${host.last_name ?? ''}`.trim()
                  : host.username ?? host.email}{' '}
                ({host.user_type})
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">
          <span>Status</span>
          <select className="h-10 w-full min-w-0 px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="planned">Planned</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
            <option value="canceled">Canceled</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">
          <span>Event type</span>
          <select
            className="h-10 w-full min-w-0 px-3"
            value={eventType}
            onChange={(event) => setEventType(event.target.value as 'Pub Trivia' | 'Music Trivia')}
          >
            <option value="Pub Trivia">Pub Trivia</option>
            <option value="Music Trivia">Music Trivia</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm text-muted">
          <span>Notes</span>
          <textarea
            className="min-h-[80px] w-full min-w-0 px-3 py-2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>
      <SecondaryButton onClick={updateEvent}>Update Event</SecondaryButton>
      <div className="border-t border-border pt-4">
        <div className="text-sm font-medium text-danger-ink">Danger zone</div>
        <div className="mt-2 text-xs text-muted">Deleting an event cannot be undone.</div>
        <div className="mt-3">
          <DangerButton onClick={deleteEvent}>Delete Event</DangerButton>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell title="Event Detail" showTitle={false}>
      <div className="space-y-4">
        <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-bg/95 px-4 pb-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-none sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              {!editingTitle && (
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-display tracking-tight">{event.title}</h1>
                  {isAdmin && (
                    <IconButton
                      label="Edit event title"
                      onClick={() => {
                        setTitleDraft(event.title);
                        setTitleError(null);
                        setEditingTitle(true);
                      }}
                    >
                      ✎
                    </IconButton>
                  )}
                </div>
              )}
              {editingTitle && (
                <div className="w-full max-w-lg space-y-2">
                  <label className="sr-only" htmlFor="event-title-input">
                    Event title
                  </label>
                  <input
                    id="event-title-input"
                    className="h-10 w-full px-3"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        saveEventTitle();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setEditingTitle(false);
                        setTitleError(null);
                        setTitleDraft(event.title);
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <SecondaryButton onClick={saveEventTitle} disabled={titleSaving}>
                      {titleSaving ? 'Saving…' : 'Save title'}
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() => {
                        setEditingTitle(false);
                        setTitleError(null);
                        setTitleDraft(event.title);
                      }}
                    >
                      Cancel
                    </SecondaryButton>
                    {titleError && <span className="text-xs text-danger-ink">{titleError}</span>}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{new Date(event.starts_at).toLocaleString()}</span>
                {locationName && <span>• {locationName}</span>}
                <StatusPill status={event.status} label={event.status} />
              </div>
              {event.public_code && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>Code</span>
                  <span className="font-display tracking-[0.2em] text-text">{event.public_code}</span>
                  <SecondaryButton className="h-8 px-2 text-xs" onClick={copyEventCode}>
                    Copy
                  </SecondaryButton>
                  {codeCopied && <span className="text-xs text-accent-ink">Copied</span>}
                </div>
              )}
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
              <ButtonLink to={`/events/${event.id}/leaderboard`} variant="outline" className="w-full sm:w-auto">
                Leaderboard
              </ButtonLink>
              <ButtonLink to={`/events/${event.id}/run`} variant="primary" className="w-full sm:w-auto">
                Run event
              </ButtonLink>
            </div>
          </div>
        </div>

        <div className="hidden sm:block">
          <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
            <div className="space-y-4">
              <AccordionSection title="Rounds" defaultOpen>
                {roundsContent}
              </AccordionSection>
              <AccordionSection title="Teams" defaultOpen>
                {teamsContent}
              </AccordionSection>
              <AccordionSection title="Round Scores">
                {scoresContent}
              </AccordionSection>
            </div>
            <div className="space-y-4">
              <AccordionSection title="Documents & Share" defaultOpen>
                {documentsContent}
              </AccordionSection>
              <AccordionSection title="Event Settings">
                {settingsContent}
              </AccordionSection>
            </div>
          </div>
        </div>

        <div className="space-y-3 sm:hidden">
          <AccordionSection title="Rounds" defaultOpen>
            {roundsContent}
          </AccordionSection>
          <AccordionSection title="Teams">{teamsContent}</AccordionSection>
          <AccordionSection title="Round Scores">{scoresContent}</AccordionSection>
          <AccordionSection title="Documents & Share">{documentsContent}</AccordionSection>
          <AccordionSection title="Event Settings">{settingsContent}</AccordionSection>
        </div>
      </div>
    </AppShell>
  );
}
