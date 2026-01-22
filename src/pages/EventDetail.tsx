import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { api } from '../api';
import { AppShell } from '../components/AppShell';
import { Panel } from '../components/Panel';
import { PrimaryButton, SecondaryButton, DangerButton, ButtonLink } from '../components/Buttons';
import { StampBadge } from '../components/StampBadge';
import type { Event, EventRound, GameEdition, Game, Team, Location, User, EditionItem } from '../types';

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

const roundTitle = (round: EventRound) => `Round ${round.round_number} - ${round.label}`;

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

const drawPageHeader = (page: any, event: Event, fonts: { regular: any; bold: any }) => {
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
  const startsAt = new Date(event.starts_at).toLocaleString();
  page.drawText(startsAt, {
    x: PAGE_MARGIN,
    y: titleY - metaSize - 4,
    size: metaSize,
    font: fonts.regular
  });

  const label = 'Team Name:';
  const labelSize = 9;
  const labelWidth = fonts.regular.widthOfTextAtSize(label, labelSize);
  const lineWidth = 200;
  const lineStartX = PAGE_WIDTH - PAGE_MARGIN - lineWidth;
  const labelX = lineStartX - labelWidth - 6;
  page.drawText(label, {
    x: labelX,
    y: titleY,
    size: labelSize,
    font: fonts.regular
  });
  page.drawLine({
    start: { x: lineStartX, y: titleY - 2 },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: titleY - 2 },
    thickness: 1,
    color: rgb(0, 0, 0)
  });
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

  let contentTop = titleY - 6;
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
    contentTop = labelY - 6;
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

const buildPdf = async (event: Event, rounds: RoundBundle[], mode: 'scoresheet' | 'answersheet') => {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  };
  const gridTop = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;
  const gridBottom = PAGE_MARGIN;
  const gridHeight = gridTop - gridBottom;
  const gridWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const cellWidth = gridWidth / 2;
  const cellHeight = gridHeight / 2;

  for (let index = 0; index < rounds.length; index += 1) {
    if (index % 4 === 0) {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawPageHeader(page, event, fonts);
      drawGridLines(page);
    }
    const page = pdfDoc.getPages()[pdfDoc.getPages().length - 1];
    const cellIndex = index % 4;
    const row = cellIndex < 2 ? 0 : 1;
    const col = cellIndex % 2;
    const cellX = PAGE_MARGIN + col * cellWidth;
    const cellY = row === 0 ? gridBottom + cellHeight : gridBottom;
    renderRoundBlock(
      page,
      rounds[index],
      { x: cellX, y: cellY, width: cellWidth, height: cellHeight },
      fonts,
      mode
    );
  }

  return pdfDoc.save();
};

export function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [rounds, setRounds] = useState<EventRound[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
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
  const [scoreRoundId, setScoreRoundId] = useState('');
  const [scoreMap, setScoreMap] = useState<Record<string, number>>({});
  const [scoreLoading, setScoreLoading] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [roundMenuId, setRoundMenuId] = useState<string | null>(null);
  const [draggedRoundId, setDraggedRoundId] = useState<string | null>(null);
  const [scoresheetUploading, setScoresheetUploading] = useState(false);
  const [scoresheetError, setScoresheetError] = useState<string | null>(null);
  const [answersheetUploading, setAnswersheetUploading] = useState(false);
  const [answersheetError, setAnswersheetError] = useState<string | null>(null);
  const [scoresheetGenerating, setScoresheetGenerating] = useState(false);
  const [scoresheetGenerateError, setScoresheetGenerateError] = useState<string | null>(null);

  const load = async () => {
    if (!eventId) return;
    const [eventRes, roundsRes, teamsRes, editionsRes, locationsRes, gamesRes, hostsRes] = await Promise.all([
      api.getEvent(eventId),
      api.listEventRounds(eventId),
      api.listTeams(eventId),
      api.listEditions(),
      api.listLocations(),
      api.listGames(),
      api.listHosts()
    ]);
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
    if (editionsRes.ok) setEditions(editionsRes.data);
    if (locationsRes.ok) setLocations(locationsRes.data);
    if (gamesRes.ok) setGames(gamesRes.data);
    if (hostsRes.ok) setHosts(hostsRes.data);
  };

  useEffect(() => {
    load();
  }, [eventId]);

  useEffect(() => {
    if (!scoreRoundId && rounds.length > 0) {
      setScoreRoundId(rounds[0].id);
      loadScores(rounds[0].id);
    }
  }, [rounds, scoreRoundId]);

  const publicUrl = useMemo(() => {
    if (!event?.public_code) return '';
    return `https://triviaops.com/play/${event.public_code}`;
  }, [event?.public_code]);

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

  const updateEvent = async () => {
    if (!eventId) return;
    const res = await api.updateEvent(eventId, {
      status,
      event_type: eventType,
      notes,
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
      edition_id: roundEditionId,
      status: 'planned'
    });
    setRoundGameId('');
    setRoundEditionId('');
    load();
  };

  const createTeam = async () => {
    if (!eventId || !teamName.trim()) return;
    await api.createTeam(eventId, { name: teamName, table_label: teamTable || null });
    setTeamName('');
    setTeamTable('');
    load();
  };

  const deleteRound = async (roundId: string) => {
    await api.deleteEventRound(roundId);
    load();
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
    load();
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
      setError(res.error.message ?? 'Upload failed.');
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
      setError(res.error.message ?? 'Remove failed.');
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

      const scoresheetBytes = await buildPdf(event, bundles, 'scoresheet');
      const answersheetBytes = await buildPdf(event, bundles, 'answersheet');
      const baseName = safeFileName(event.title, `event-${event.id.slice(0, 8)}`);
      const scoresheetFile = new File([scoresheetBytes], `${baseName}-scoresheet.pdf`, {
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
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Event Detail">
      <div className="grid gap-4 lg:grid-cols-[1fr,340px]">
        <Panel
          title="Event Status"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink to={`/events/${event.id}/leaderboard`} variant="secondary">
                Leaderboard
              </ButtonLink>
              <ButtonLink to={`/events/${event.id}/run`} variant="primary">
                Run Event
              </ButtonLink>
            </div>
          }
        >
          <div className="grid gap-4">
            <div className="border-2 border-border bg-panel2 p-3">
              <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Title</div>
              <div className="mt-2 text-sm font-display uppercase tracking-[0.2em]">{event.title}</div>
            </div>
            {event.public_code && (
              <div className="border-2 border-border bg-panel2 p-3">
                <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Event Code</div>
                <div className="mt-2 text-lg font-display uppercase tracking-[0.3em]">{event.public_code}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">Share for player view</div>
              </div>
            )}
            {event.public_code && (
              <div className="border-2 border-border bg-panel2 p-3">
                <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">QR Code</div>
                {qrLoading && (
                  <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">Generating…</div>
                )}
                {qrError && (
                  <div className="mt-2 text-xs uppercase tracking-[0.2em] text-danger">{qrError}</div>
                )}
                {qrUrl && (
                  <div className="mt-3 flex flex-col items-start gap-3">
                    <img src={qrUrl} alt="Event QR Code" className="h-40 w-40 border-2 border-border bg-panel" />
                    <a
                      href={qrUrl}
                      download={`trivia-ops-${event.public_code}.png`}
                      className="text-xs uppercase tracking-[0.2em] text-accent-ink"
                    >
                      Download QR Code
                    </a>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between border-2 border-border bg-panel2 p-3 text-xs uppercase tracking-[0.2em] text-muted">
              <span>Starts</span>
              <span>{new Date(event.starts_at).toLocaleString()}</span>
            </div>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Location
              <select
                className="h-10 px-3"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
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
              <select
                className="h-10 px-3"
                value={hostUserId}
                onChange={(event) => setHostUserId(event.target.value)}
              >
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
              Status
              <select className="h-10 px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="planned">Planned</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Event Type
              <select
                className="h-10 px-3"
                value={eventType}
                onChange={(event) => setEventType(event.target.value as 'Pub Trivia' | 'Music Trivia')}
              >
                <option value="Pub Trivia">Pub Trivia</option>
                <option value="Music Trivia">Music Trivia</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Notes
              <textarea className="min-h-[80px] px-3 py-2" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={updateEvent}>Update Event</PrimaryButton>
              <StampBadge label={event.status.toUpperCase()} variant="verified" />
              <DangerButton onClick={deleteEvent}>Delete Event</DangerButton>
            </div>
          </div>
        </Panel>

        <Panel title="Event Documents">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={generateScoresheets} disabled={scoresheetGenerating}>
                {scoresheetGenerating ? 'Generating…' : 'Generate Scoresheets'}
              </PrimaryButton>
              {scoresheetGenerateError && (
                <div className="text-xs uppercase tracking-[0.2em] text-danger">{scoresheetGenerateError}</div>
              )}
            </div>
            <div className="border-2 border-border bg-panel2 p-3">
              <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Scoresheet (PDF)</div>
              {event.scoresheet_key ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={api.mediaUrl(event.scoresheet_key)}
                    className="text-xs uppercase tracking-[0.2em] text-accent-ink"
                    download={event.scoresheet_name ?? 'scoresheet.pdf'}
                  >
                    Download {event.scoresheet_name ?? 'scoresheet.pdf'}
                  </a>
                  <DangerButton
                    onClick={() => removeDocument('scoresheet')}
                    disabled={scoresheetUploading}
                  >
                    Remove
                  </DangerButton>
                </div>
              ) : (
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">No scoresheet uploaded.</div>
              )}
              <div className="mt-3 flex w-full items-center gap-3">
                <label className="flex w-full items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="w-full max-w-full text-xs"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) uploadDocument('scoresheet', file);
                    }}
                    disabled={scoresheetUploading}
                  />
                </label>
                {scoresheetUploading && (
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Uploading…</div>
                )}
              </div>
              {scoresheetError && (
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-danger">{scoresheetError}</div>
              )}
            </div>

            <div className="border-2 border-border bg-panel2 p-3">
              <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Answer Sheet (PDF)</div>
              {event.answersheet_key ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={api.mediaUrl(event.answersheet_key)}
                    className="text-xs uppercase tracking-[0.2em] text-accent-ink"
                    download={event.answersheet_name ?? 'answersheet.pdf'}
                  >
                    Download {event.answersheet_name ?? 'answersheet.pdf'}
                  </a>
                  <DangerButton
                    onClick={() => removeDocument('answersheet')}
                    disabled={answersheetUploading}
                  >
                    Remove
                  </DangerButton>
                </div>
              ) : (
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">No answer sheet uploaded.</div>
              )}
              <div className="mt-3 flex w-full items-center gap-3">
                <label className="flex w-full items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="w-full max-w-full text-xs"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) uploadDocument('answersheet', file);
                    }}
                    disabled={answersheetUploading}
                  />
                </label>
                {answersheetUploading && (
                  <div className="text-xs uppercase tracking-[0.2em] text-muted">Uploading…</div>
                )}
              </div>
              {answersheetError && (
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-danger">{answersheetError}</div>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Rounds">
          <div className="flex flex-col gap-3">
            {rounds.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No rounds yet.</div>
            )}
            {rounds.map((round) => {
              const display = roundDisplay(round);
              const statusLabel = round.status === 'locked' ? 'COMPLETED' : round.status.toUpperCase();
              return (
                <div
                  key={round.id}
                  className="border-2 border-border bg-panel2 p-2"
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-display uppercase tracking-[0.2em]">{display.title}</div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/events/${event.id}/run?round=${round.id}`}
                        className="text-[10px] uppercase tracking-[0.2em] text-accent-ink"
                      >
                        Open Runner
                      </Link>
                      <div className="relative">
                        <button
                          type="button"
                          aria-label="Round actions"
                          aria-haspopup="menu"
                          aria-expanded={roundMenuId === round.id}
                          onClick={() => setRoundMenuId((current) => (current === round.id ? null : round.id))}
                          className="flex h-7 w-7 items-center justify-center border border-border text-text"
                        >
                          ⋯
                        </button>
                        {roundMenuId === round.id && (
                          <div className="absolute right-0 mt-2 min-w-[160px] rounded-md border border-border bg-panel p-2 text-left shadow-sm">
                            <button
                              type="button"
                              onClick={() => {
                                setRoundMenuId(null);
                                deleteRound(round.id);
                              }}
                              className="w-full rounded-md border border-danger bg-panel2 px-3 py-2 text-xs font-medium text-danger-ink"
                            >
                              Delete Round
                            </button>
                          </div>
                        )}
                      </div>
                      <StampBadge label={statusLabel} variant="inspected" />
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">{display.detail}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t-2 border-border pt-4">
            <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Add Round</div>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Game
                <select
                  className="h-10 px-3"
                  value={roundGameId}
                  onChange={(event) => {
                    setRoundGameId(event.target.value);
                    setRoundEditionId('');
                  }}
                >
                  <option value="">Select game</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Edition
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
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Round Number: {roundNumber}</div>
              <PrimaryButton onClick={createRound}>Add Round</PrimaryButton>
            </div>
          </div>
        </Panel>

        <Panel title="Teams">
          <div className="flex flex-col gap-3">
            {teams.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">No teams yet.</div>
            )}
            {teams.map((team) => (
              <div key={team.id} className="border-2 border-border bg-panel2 p-3">
                <div className="text-sm font-display uppercase tracking-[0.2em]">{team.name}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
                  {team.table_label ?? 'No table label'}
                </div>
                <div className="mt-2">
                  <DangerButton onClick={() => deleteTeam(team.id)}>Remove</DangerButton>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t-2 border-border pt-4">
            <div className="text-xs font-display uppercase tracking-[0.3em] text-muted">Add Team</div>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Name
                <input className="h-10 px-3" value={teamName} onChange={(event) => setTeamName(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
                Table Label
                <input className="h-10 px-3" value={teamTable} onChange={(event) => setTeamTable(event.target.value)} />
              </label>
              <SecondaryButton onClick={createTeam}>Add Team</SecondaryButton>
            </div>
          </div>
        </Panel>

        <Panel title="Round Scores">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-xs font-display uppercase tracking-[0.25em] text-muted">
              Select Round
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
            {teams.length === 0 && (
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Add teams to score.</div>
            )}
            {teams.map((team) => (
              <label
                key={team.id}
                className="flex items-center justify-between gap-3 border-2 border-border bg-panel2 px-3 py-2 text-xs uppercase tracking-[0.2em] text-muted"
              >
                <span>{team.name}</span>
                <input
                  type="number"
                  className="h-9 w-20 px-2 text-right"
                  value={scoreMap[team.id] ?? 0}
                  onChange={(event) =>
                    setScoreMap((prev) => ({ ...prev, [team.id]: Number(event.target.value) }))
                  }
                />
              </label>
            ))}
            <PrimaryButton onClick={saveScores} disabled={!scoreRoundId || scoreLoading}>
              {scoreLoading ? 'Saving' : 'Save Scores'}
            </PrimaryButton>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
