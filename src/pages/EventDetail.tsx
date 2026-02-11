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
type ParsedAnswerPart = { label: string; answer: string; points: number };

const safeFileName = (value: string, fallback: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return fallback;
  return trimmed
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || fallback;
};

const formatEditionCode = (gameCode?: string | null, editionNumber?: number | null) => {
  const code = (gameCode ?? '').trim().toUpperCase();
  if (!code || editionNumber == null || !Number.isFinite(editionNumber)) return '';
  return `${code}${String(editionNumber).padStart(3, '0')}`;
};

const roundTitle = (round: EventRound) => {
  const title = round.scoresheet_title?.trim();
  return title ? `${round.round_number}. ${title}` : `${round.round_number}.`;
};

const parseAnswerPartsJson = (value?: string | null): ParsedAnswerPart[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof entry.label === 'string' ? entry.label.trim() : '';
        const answer = typeof entry.answer === 'string' ? entry.answer.trim() : '';
        const rawPoints = (entry as { points?: unknown }).points;
        const points =
          typeof rawPoints === 'number' && Number.isFinite(rawPoints) ? Math.max(0, Math.trunc(rawPoints)) : 1;
        if (!label) return null;
        return { label, answer, points } as ParsedAnswerPart;
      })
      .filter((entry): entry is ParsedAnswerPart => Boolean(entry));
  } catch {
    return [];
  }
};

const formatPointsLabel = (points: number) => `${points} ${points === 1 ? 'point' : 'points'}`;

const deriveAnswerTypeLabels = (item: EditionItem): Array<{ label: string; points: number }> => {
  const parts = parseAnswerPartsJson(item.answer_parts_json);
  if (parts.length > 0) {
    return parts
      .filter((part) => part.label.length > 0)
      .map((part) => ({ label: part.label, points: part.points }));
  }
  const labels: Array<{ label: string; points: number }> = [];
  const labelA = item.answer_a_label?.trim() || 'Answer A';
  const labelB = item.answer_b_label?.trim() || 'Answer B';
  if ((item.answer_a?.trim() ?? '') || (item.answer_a_label?.trim() ?? '')) labels.push({ label: labelA, points: 1 });
  if ((item.answer_b?.trim() ?? '') || (item.answer_b_label?.trim() ?? '')) labels.push({ label: labelB, points: 1 });
  return labels;
};

const resolveScoresheetAnswerColumns = (items: EditionItem[]) => {
  for (const item of items) {
    const labels = deriveAnswerTypeLabels(item);
    if (labels.length >= 2) {
      return [
        `${labels[0].label} (${formatPointsLabel(labels[0].points)})`,
        `${labels[1].label} (${formatPointsLabel(labels[1].points)})`
      ];
    }
  }
  return [] as string[];
};

const resolveInlineResponseLabel = (item: EditionItem) => {
  if (item.media_type === 'audio') return null;
  const labels = deriveAnswerTypeLabels(item);
  if (labels.length === 1) return `${labels[0].label} (${formatPointsLabel(labels[0].points)})`;
  return null;
};

const formatAnswer = (item: EditionItem) => {
  const answerParts = parseAnswerPartsJson(item.answer_parts_json);
  if (answerParts.length > 0) {
    const joined = answerParts
      .filter((part) => part.answer.length > 0)
      .map((part) => `${part.label}: ${part.answer}`)
      .join('  ');
    if (joined) return joined;
  }
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

  if (options?.showEventCode && event.public_code) {
    const codeText = `Event Code: ${event.public_code}`;
    const codeSize = metaSize;
    page.drawText(codeText, {
      x: PAGE_MARGIN,
      y: titleY - codeSize - 4,
      size: codeSize,
      font: fonts.regular
    });
  }
};

const drawMusicScoresheetHeader = (
  page: any,
  event: Event,
  fonts: { regular: any; bold: any },
  extras?: {
    qrImage?: any;
    logoImage?: any;
    eventCode?: string;
    teamCode?: string;
    teamName?: string;
    teamPlaceholder?: boolean;
  }
) => {
  const headerTop = PAGE_HEIGHT - PAGE_MARGIN;
  const titleSize = 14;
  const metaSize = 9.5;
  const leftColumnWidth = 210;
  const rightColumnWidth = 210;
  const rightX = PAGE_WIDTH - PAGE_MARGIN - rightColumnWidth;
  const titleY = headerTop - titleSize;
  const eventCode = extras?.eventCode ?? event.public_code ?? '';

  const title = truncateText(fonts.bold, event.title, leftColumnWidth, titleSize);
  page.drawText(title, {
    x: PAGE_MARGIN,
    y: titleY,
    size: titleSize,
    font: fonts.bold
  });

  if (eventCode) {
    const codeText = truncateText(fonts.regular, `Event Code: ${eventCode}`, leftColumnWidth, metaSize);
    page.drawText(codeText, {
      x: PAGE_MARGIN,
      y: titleY - metaSize - 3,
      size: metaSize,
      font: fonts.regular
    });
  }

  const centerLaneInset = 10;
  const centerLaneStartX = PAGE_MARGIN + leftColumnWidth + centerLaneInset;
  const centerLaneEndX = rightX - centerLaneInset;
  const centerLaneWidth = Math.max(68, centerLaneEndX - centerLaneStartX);
  const qrImageSize = extras?.qrImage ? 42 : 0;

  let logoWidth = 0;
  let logoHeight = 0;
  if (extras?.logoImage) {
    const maxLogoWidth = Math.min(120, centerLaneWidth);
    const maxLogoHeight = 30;
    const scale = Math.min(
      maxLogoWidth / extras.logoImage.width,
      maxLogoHeight / extras.logoImage.height,
      1
    );
    logoWidth = extras.logoImage.width * scale;
    logoHeight = extras.logoImage.height * scale;
  }

  const centerWidth = logoWidth;
  const centerStartX = centerLaneStartX + Math.max(0, (centerLaneWidth - centerWidth) / 2);
  const centerTopY = headerTop - 2;
  const centerBlockHeight = logoHeight;

  if (extras?.logoImage && logoWidth > 0 && logoHeight > 0) {
    const logoX = centerStartX + (centerWidth - logoWidth) / 2;
    const logoY = centerTopY - logoHeight;
    page.drawImage(extras.logoImage, {
      x: logoX,
      y: logoY,
      width: logoWidth,
      height: logoHeight
    });
  }

  if (extras?.qrImage && qrImageSize > 0) {
    const qrX = rightX;
    const qrY = titleY - metaSize - 3 - qrImageSize - 6;
    page.drawImage(extras.qrImage, {
      x: qrX,
      y: qrY,
      width: qrImageSize,
      height: qrImageSize
    });
  }

  const rawTeamName = extras?.teamName?.trim() ?? '';
  const teamLabel = 'Team Name:';
  const teamLabelSize = 10.5;
  const teamLabelWidth = fonts.bold.widthOfTextAtSize(teamLabel, teamLabelSize);
  page.drawText(teamLabel, {
    x: rightX,
    y: titleY,
    size: teamLabelSize,
    font: fonts.bold
  });
  if (rawTeamName && !extras?.teamPlaceholder) {
    const nameText = truncateText(
      fonts.regular,
      rawTeamName,
      Math.max(30, rightColumnWidth - teamLabelWidth - 8),
      teamLabelSize
    );
    page.drawText(nameText, {
      x: rightX + teamLabelWidth + 6,
      y: titleY,
      size: teamLabelSize,
      font: fonts.regular
    });
  } else {
    const lineStartX = rightX + teamLabelWidth + 6;
    page.drawLine({
      start: { x: lineStartX, y: titleY + 1 },
      end: { x: rightX + rightColumnWidth, y: titleY + 1 },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
  }

  const teamCodeLine = truncateText(
    fonts.regular,
    `Team Code: ${extras?.teamCode?.trim() || '—'}`,
    rightColumnWidth,
    metaSize
  );

  page.drawText(teamCodeLine, {
    x: rightX,
    y: titleY - metaSize - 3,
    size: metaSize,
    font: fonts.regular
  });
};

const drawGridLines = (page: any, layout: 'quad' | 'two-up' = 'quad') => {
  const gridTop = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;
  const gridBottom = PAGE_MARGIN;
  const gridHeight = gridTop - gridBottom;
  const gridWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const midX = PAGE_MARGIN + gridWidth / 2;
  const midY = gridBottom + gridHeight / 2;
  const lineColor = rgb(0.75, 0.75, 0.75);

  if (layout === 'quad') {
    page.drawLine({
      start: { x: midX, y: gridBottom },
      end: { x: midX, y: gridTop },
      thickness: 0.6,
      color: lineColor
    });
  }
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
  const answerColumns = mode === 'scoresheet' ? resolveScoresheetAnswerColumns(items) : [];
  const hasSplitAnswerColumns = mode === 'scoresheet' && answerColumns.length > 0;
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

  if (hasSplitAnswerColumns) {
    const labelSize = 8.5;
    const labelY = contentTop - labelSize;
    const gap = 12;
    const colCount = answerColumns.length;
    const totalGap = gap * Math.max(0, colCount - 1);
    const colWidth = (availableWidth - totalGap) / colCount;
    answerColumns.forEach((columnLabel, index) => {
      page.drawText(columnLabel, {
        x: textStartX + index * (colWidth + gap),
        y: labelY,
        size: labelSize,
        font: fonts.regular
      });
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

  let numberedRow = 0;
  for (let index = 0; index < itemCount; index += 1) {
    const item = items[index];
    const rowY = baseY - lineSpacing * index;
    const inlineLabel = mode === 'scoresheet' ? resolveInlineResponseLabel(item) : null;
    if (mode === 'scoresheet') {
      if (inlineLabel) {
        const labelText = `${inlineLabel}:`;
        page.drawText(labelText, {
          x: textStartX,
          y: rowY,
          size: textSize,
          font: fonts.regular
        });
        const labelWidth = fonts.regular.widthOfTextAtSize(labelText, textSize);
        const lineY = rowY - 2;
        const lineStart = Math.min(textStartX + labelWidth + 6, textStartX + availableWidth - 12);
        page.drawLine({
          start: { x: lineStart, y: lineY },
          end: { x: textStartX + availableWidth, y: lineY },
          thickness: 0.8,
          color: rgb(0, 0, 0)
        });
      } else if (hasSplitAnswerColumns) {
        numberedRow += 1;
        page.drawText(`${numberedRow}.`, {
          x: contentX,
          y: rowY,
          size: numberSize,
          font: fonts.regular
        });
        const gap = 12;
        const colCount = answerColumns.length;
        const totalGap = gap * Math.max(0, colCount - 1);
        const colWidth = (availableWidth - totalGap) / colCount;
        const lineY = rowY - 2;
        answerColumns.forEach((_, columnIndex) => {
          const columnStart = textStartX + columnIndex * (colWidth + gap);
          page.drawLine({
            start: { x: columnStart, y: lineY },
            end: { x: columnStart + colWidth, y: lineY },
            thickness: 0.8,
            color: rgb(0, 0, 0)
          });
        });
      } else {
        numberedRow += 1;
        page.drawText(`${numberedRow}.`, {
          x: contentX,
          y: rowY,
          size: numberSize,
          font: fonts.regular
        });
        const lineY = rowY - 2;
        page.drawLine({
          start: { x: textStartX, y: lineY },
          end: { x: textStartX + availableWidth, y: lineY },
          thickness: 0.8,
          color: rgb(0, 0, 0)
        });
      }
    } else {
      page.drawText(`${index + 1}.`, {
        x: contentX,
        y: rowY,
        size: numberSize,
        font: fonts.regular
      });
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
  const topY = cell.y + cell.height - padding;
  const leftX = cell.x + padding;
  const contentWidth = cell.width - padding * 2;
  const leftColumnWidth = Math.min(220, Math.max(160, contentWidth * 0.55));
  const rightX = leftX + leftColumnWidth + 12;
  const rightWidth = Math.max(60, cell.x + cell.width - padding - rightX);
  const qrImageSize = extras.qrImage ? 78 : 0;
  const qrPadding = extras.qrImage ? 4 : 0;
  const qrFrameSize = qrImageSize > 0 ? qrImageSize + qrPadding * 2 : 0;

  let logoWidth = 0;
  let logoHeight = 0;
  if (extras.logoImage) {
    const maxLogoWidth = Math.min(112, Math.max(56, leftColumnWidth - qrFrameSize - 14));
    const maxLogoHeight = 34;
    const scale = Math.min(
      maxLogoWidth / extras.logoImage.width,
      maxLogoHeight / extras.logoImage.height,
      1
    );
    logoWidth = extras.logoImage.width * scale;
    logoHeight = extras.logoImage.height * scale;
  }

  const clusterGap = logoWidth > 0 && qrFrameSize > 0 ? 10 : 0;
  const clusterHeight = Math.max(logoHeight, qrFrameSize);
  if (extras.logoImage && logoWidth > 0 && logoHeight > 0) {
    const logoY = topY - (clusterHeight - logoHeight) / 2 - logoHeight;
    page.drawImage(extras.logoImage, {
      x: leftX,
      y: logoY,
      width: logoWidth,
      height: logoHeight
    });
  }

  if (extras.qrImage && qrFrameSize > 0) {
    const qrFrameX = leftX + (logoWidth > 0 ? logoWidth + clusterGap : 0);
    const qrFrameY = topY - (clusterHeight - qrFrameSize) / 2 - qrFrameSize;
    page.drawRectangle({
      x: qrFrameX,
      y: qrFrameY,
      width: qrFrameSize,
      height: qrFrameSize,
      color: rgb(1, 1, 1),
      borderColor: rgb(0.78, 0.78, 0.78),
      borderWidth: 0.8
    });
    const qrX = qrFrameX + qrPadding;
    const qrY = qrFrameY + qrPadding;
    page.drawImage(extras.qrImage, {
      x: qrX,
      y: qrY,
      width: qrImageSize,
      height: qrImageSize
    });
  }

  const nameLabel = 'Team Name:';
  const lineBaseY = topY - textSize;
  const nameLabelWidth = fonts.bold.widthOfTextAtSize(nameLabel, textSize);
  const lineStartX = rightX + nameLabelWidth + 6;
  const lineEndX = rightX + rightWidth;
  page.drawText(nameLabel, {
    x: rightX,
    y: lineBaseY,
    size: textSize,
    font: fonts.bold
  });
  page.drawLine({
    start: { x: Math.min(lineStartX, lineEndX - 12), y: lineBaseY - 2 },
    end: { x: lineEndX, y: lineBaseY - 2 },
    thickness: 1,
    color: rgb(0, 0, 0)
  });

  const teamCodeText = extras.teamCode ? `Team Code: ${extras.teamCode}` : 'Team Code: —';
  page.drawText(teamCodeText, {
    x: rightX,
    y: lineBaseY - 28,
    size: textSize,
    font: fonts.bold
  });
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
  const createPage = (
    showEventCode = false,
    layout: 'quad' | 'two-up' = 'quad',
    drawHeader = true
  ) => {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (drawHeader) {
      drawPageHeader(page, event, locationName, fonts, { showEventCode });
    }
    drawGridLines(page, layout);
    return page;
  };

  const getCell = (cellIndex: number) => {
    const row = cellIndex < 2 ? 0 : 1;
    const col = cellIndex % 2;
    const cellX = PAGE_MARGIN + col * cellWidth;
    const cellY = row === 0 ? gridBottom + cellHeight : gridBottom;
    return { x: cellX, y: cellY, width: cellWidth, height: cellHeight };
  };

  const getTwoUpCell = (cellIndex: number) => {
    const row = cellIndex === 0 ? 0 : 1;
    const sectionHeight = gridHeight / 2;
    const cellX = PAGE_MARGIN;
    const cellY = row === 0 ? gridBottom + sectionHeight : gridBottom;
    return { x: cellX, y: cellY, width: gridWidth, height: sectionHeight };
  };

  const hasUpcoming = Boolean(extras?.upcomingLines?.some((line) => line.trim()));

  if (mode === 'scoresheet') {
    const useMusicLayout = event.event_type === 'Music Trivia';
    if (useMusicLayout) {
      let page = createPage(false, 'two-up', false);
      drawMusicScoresheetHeader(page, event, fonts, {
        qrImage: qrImage ?? undefined,
        logoImage: logoImage ?? undefined,
        eventCode: extras?.eventCode,
        teamCode: extras?.teamCode,
        teamName: extras?.teamName,
        teamPlaceholder: extras?.teamPlaceholder
      });
      let positionIndex = 0;
      for (let index = 0; index < rounds.length; index += 1) {
        if (positionIndex >= 2) {
          page = createPage(false, 'two-up', false);
          drawMusicScoresheetHeader(page, event, fonts, {
            qrImage: qrImage ?? undefined,
            logoImage: logoImage ?? undefined,
            eventCode: extras?.eventCode,
            teamCode: extras?.teamCode,
            teamName: extras?.teamName,
            teamPlaceholder: extras?.teamPlaceholder
          });
          positionIndex = 0;
        }
        const cellIndex = positionIndex;
        positionIndex += 1;
        renderRoundBlock(page, rounds[index], getTwoUpCell(cellIndex), fonts, mode);
      }
    } else {
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
  const [teamEditState, setTeamEditState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [teamEditError, setTeamEditError] = useState<string | null>(null);
  const [scoreRoundId, setScoreRoundId] = useState('');
  const [scoreMap, setScoreMap] = useState<Record<string, number>>({});
  const [scoreMapBaseline, setScoreMapBaseline] = useState<Record<string, number>>({});
  const [scoreBaselineRoundId, setScoreBaselineRoundId] = useState('');
  const [scoreSaveState, setScoreSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [scoreSaveError, setScoreSaveError] = useState<string | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [roundMenuId, setRoundMenuId] = useState<string | null>(null);
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);
  const [draggedRoundId, setDraggedRoundId] = useState<string | null>(null);
  const [scoresheetTitles, setScoresheetTitles] = useState<Record<string, string>>({});
  const [scoresheetSaveState, setScoresheetSaveState] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [scoresheetSaveError, setScoresheetSaveError] = useState<Record<string, string>>({});
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
  const [titleSaveState, setTitleSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [startsAtError, setStartsAtError] = useState<string | null>(null);
  const [settingsSaveState, setSettingsSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
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

  const parsedStartsAt = useMemo(() => {
    if (!startsAtLocal) {
      return { valid: true, iso: event?.starts_at ?? '' };
    }
    const parsed = new Date(startsAtLocal);
    if (Number.isNaN(parsed.getTime())) {
      return { valid: false, iso: event?.starts_at ?? '' };
    }
    return { valid: true, iso: parsed.toISOString() };
  }, [startsAtLocal, event?.starts_at]);

  const eventSettingsDraft = useMemo(
    () => ({
      status,
      event_type: eventType,
      notes,
      starts_at: parsedStartsAt.iso || event?.starts_at || '',
      location_id: locationId || null,
      host_user_id: hostUserId || null
    }),
    [status, eventType, notes, parsedStartsAt.iso, locationId, hostUserId, event?.starts_at]
  );

  const eventSettingsSaved = useMemo(
    () =>
      event
        ? {
            status: event.status,
            event_type: event.event_type ?? 'Pub Trivia',
            notes: event.notes ?? '',
            starts_at: event.starts_at,
            location_id: event.location_id ?? null,
            host_user_id: event.host_user_id ?? null
          }
        : null,
    [event]
  );

  const eventSettingsDirty = useMemo(() => {
    if (!eventSettingsSaved) return false;
    return JSON.stringify(eventSettingsDraft) !== JSON.stringify(eventSettingsSaved);
  }, [eventSettingsDraft, eventSettingsSaved]);

  useEffect(() => {
    if (!eventId || !event) return;
    if (!eventSettingsDirty) return;
    if (!parsedStartsAt.valid) {
      setStartsAtError('Invalid date/time.');
      setSettingsSaveState('error');
      setSettingsSaveError('Fix the date/time to continue.');
      return;
    }
    setStartsAtError(null);
    setSettingsSaveState('saving');
    setSettingsSaveError(null);
    const timeout = window.setTimeout(async () => {
      const res = await api.updateEvent(eventId, eventSettingsDraft);
      if (res.ok) {
        setEvent(res.data);
        setSettingsSaveState('saved');
        setSettingsSaveError(null);
      } else {
        setSettingsSaveState('error');
        setSettingsSaveError(formatApiError(res, 'Auto-save failed.'));
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [eventId, event, eventSettingsDraft, eventSettingsDirty, parsedStartsAt.valid]);

  useEffect(() => {
    if (settingsSaveState !== 'saved') return;
    const timeout = window.setTimeout(() => setSettingsSaveState('idle'), 1400);
    return () => window.clearTimeout(timeout);
  }, [settingsSaveState]);

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

  const saveEventTitle = async (closeEditor = true) => {
    if (!eventId) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError('Title cannot be empty.');
      setTitleSaveState('error');
      return;
    }
    setTitleSaving(true);
    setTitleSaveState('saving');
    setTitleError(null);
    const res = await api.updateEvent(eventId, { title: nextTitle });
    if (res.ok) {
      setEvent(res.data);
      if (closeEditor) setEditingTitle(false);
      setTitleSaveState('saved');
    } else {
      setTitleError(formatApiError(res, 'Failed to update title.'));
      setTitleSaveState('error');
    }
    setTitleSaving(false);
  };

  useEffect(() => {
    if (!editingTitle || !eventId || !event) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === event.title) return;
    const timeout = window.setTimeout(() => {
      saveEventTitle(false);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [editingTitle, eventId, event, titleDraft]);

  useEffect(() => {
    if (titleSaveState !== 'saved') return;
    const timeout = window.setTimeout(() => setTitleSaveState('idle'), 1400);
    return () => window.clearTimeout(timeout);
  }, [titleSaveState]);

  useEffect(() => {
    if (!publicUrl) return;
    setQrLoading(true);
    setQrError(null);
    QRCode.toDataURL(publicUrl, { margin: 2, width: 320 })
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

  const editionPickerLabel = (edition: GameEdition) => {
    const game = gameById[edition.game_id];
    const theme = edition.theme?.trim() || edition.title?.trim() || 'Untitled Theme';
    const editionCode = formatEditionCode(game?.game_code, edition.edition_number);
    return editionCode ? `${editionCode} - ${theme}` : theme;
  };

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
    setScoresheetSaveState((prev) => ({ ...prev, [round.id]: 'saving' }));
    setScoresheetSaveError((prev) => ({ ...prev, [round.id]: '' }));
    const res = await api.updateEventRound(round.id, { scoresheet_title: nextTitle });
    if (res.ok) {
      setRounds((prev) => prev.map((item) => (item.id === round.id ? res.data : item)));
      setScoresheetTitles((prev) => ({ ...prev, [round.id]: res.data.scoresheet_title ?? res.data.label }));
      setScoresheetSaveState((prev) => ({ ...prev, [round.id]: 'saved' }));
      window.setTimeout(() => {
        setScoresheetSaveState((prev) => ({ ...prev, [round.id]: 'idle' }));
      }, 1200);
    } else {
      setScoresheetSaveState((prev) => ({ ...prev, [round.id]: 'error' }));
      setScoresheetSaveError((prev) => ({ ...prev, [round.id]: formatApiError(res, 'Save failed.') }));
    }
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
    setTeamEditState('idle');
    setEditingTeamId(team.id);
    setEditingTeamName(team.name ?? '');
    setEditingTeamTable(team.table_label ?? '');
  };

  const cancelEditTeam = () => {
    setTeamEditError(null);
    setTeamEditState('idle');
    setEditingTeamId(null);
    setEditingTeamName('');
    setEditingTeamTable('');
  };

  const saveEditTeam = async (closeEditor = true) => {
    if (!editingTeamId) return;
    if (!editingTeamName.trim()) {
      setTeamEditError('Team name is required.');
      setTeamEditState('error');
      return;
    }
    setTeamEditState('saving');
    setTeamEditError(null);
    const res = await api.updateTeam(editingTeamId, {
      name: editingTeamName.trim(),
      table_label: editingTeamTable.trim() || null
    });
    if (res.ok) {
      setTeams((prev) => prev.map((team) => (team.id === editingTeamId ? res.data : team)));
      setTeamEditState('saved');
      if (closeEditor) {
        cancelEditTeam();
      }
    } else {
      setTeamEditError(formatApiError(res, 'Unable to update team.'));
      setTeamEditState('error');
    }
  };

  const editingTeam = useMemo(() => {
    if (!editingTeamId) return null;
    return teams.find((team) => team.id === editingTeamId) ?? null;
  }, [teams, editingTeamId]);

  const teamEditDirty = useMemo(() => {
    if (!editingTeam) return false;
    return (
      editingTeam.name !== editingTeamName.trim() ||
      (editingTeam.table_label ?? '') !== (editingTeamTable.trim() || '')
    );
  }, [editingTeam, editingTeamName, editingTeamTable]);

  useEffect(() => {
    if (!editingTeamId || !editingTeam || !teamEditDirty) return;
    if (!editingTeamName.trim()) {
      setTeamEditError('Team name is required.');
      setTeamEditState('error');
      return;
    }
    const timeout = window.setTimeout(() => {
      saveEditTeam(false);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [editingTeamId, editingTeam, teamEditDirty, editingTeamName, editingTeamTable]);

  useEffect(() => {
    if (teamEditState !== 'saved') return;
    const timeout = window.setTimeout(() => setTeamEditState('idle'), 1400);
    return () => window.clearTimeout(timeout);
  }, [teamEditState]);

  const loadScores = async (roundId: string) => {
    if (!roundId) return;
    setScoreSaveError(null);
    setScoreSaveState('idle');
    const res = await api.listRoundScores(roundId);
    if (res.ok) {
      const map: Record<string, number> = {};
      res.data.forEach((row) => {
        map[row.team_id] = row.score;
      });
      setScoreMap(map);
      setScoreMapBaseline(map);
      setScoreBaselineRoundId(roundId);
    }
  };

  const saveScores = async () => {
    if (!scoreRoundId) return;
    setScoreLoading(true);
    setScoreSaveState('saving');
    setScoreSaveError(null);
    const scores = teams.map((team) => ({
      team_id: team.id,
      score: Number(scoreMap[team.id] ?? 0)
    }));
    const res = await api.updateRoundScores(scoreRoundId, scores);
    if (res.ok) {
      setScoreMapBaseline({ ...scoreMap });
      setScoreSaveState('saved');
    } else {
      setScoreSaveState('error');
      setScoreSaveError(formatApiError(res, 'Failed to save scores.'));
    }
    setScoreLoading(false);
  };

  const scoreDirty = useMemo(
    () =>
      scoreRoundId === scoreBaselineRoundId &&
      teams.some((team) => Number(scoreMap[team.id] ?? 0) !== Number(scoreMapBaseline[team.id] ?? 0)),
    [teams, scoreMap, scoreMapBaseline, scoreRoundId, scoreBaselineRoundId]
  );

  useEffect(() => {
    if (!scoreRoundId || !scoreDirty) return;
    const timeout = window.setTimeout(() => {
      saveScores();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [scoreRoundId, scoreDirty, scoreMap, teams]);

  useEffect(() => {
    if (scoreSaveState !== 'saved') return;
    const timeout = window.setTimeout(() => setScoreSaveState('idle'), 1400);
    return () => window.clearTimeout(timeout);
  }, [scoreSaveState]);

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
            qrDataUrl = await QRCode.toDataURL(qrTarget, { margin: 2, width: 240 });
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
                      <input
                        className="h-9 flex-1 px-2 text-xs"
                        value={scoresheetTitles[round.id] ?? ''}
                        onChange={(event) =>
                          setScoresheetTitles((prev) => ({ ...prev, [round.id]: event.target.value }))
                        }
                        onBlur={() => saveScoresheetTitle(round)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                      />
                      <div className="text-xs" aria-live="polite">
                        {scoresheetSaveState[round.id] === 'saving' && <span className="text-muted">Saving…</span>}
                        {scoresheetSaveState[round.id] === 'saved' && <span className="text-accent-ink">Saved</span>}
                        {scoresheetSaveState[round.id] === 'error' && (
                          <span className="text-danger-ink">{scoresheetSaveError[round.id] || 'Save failed.'}</span>
                        )}
                      </div>
                    </label>
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
                  {editionPickerLabel(edition)}
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
                        onBlur={() => saveEditTeam(false)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveEditTeam(false);
                          }
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-muted">
                      <span>Table label</span>
                      <input
                        className="h-10 px-3"
                        value={editingTeamTable}
                        onChange={(event) => setEditingTeamTable(event.target.value)}
                        onBlur={() => saveEditTeam(false)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            saveEditTeam(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="text-xs text-muted">Team code: {team.team_code ?? '—'}</div>
                  {Number(team.team_placeholder ?? 0) === 1 ? (
                    <div className="text-xs text-muted">Status: Unclaimed</div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton className="px-3 py-2 text-xs" onClick={cancelEditTeam}>
                      Close
                    </SecondaryButton>
                    <DangerButton className="px-3 py-2 text-xs" onClick={() => deleteTeam(team.id)}>
                      Remove
                    </DangerButton>
                    <div className="text-xs" aria-live="polite">
                      {teamEditState === 'saving' && <span className="text-muted">Saving…</span>}
                      {teamEditState === 'saved' && <span className="text-accent-ink">Saved</span>}
                    </div>
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
        <div className="text-xs" aria-live="polite">
          {scoreSaveState === 'saving' && <span className="text-muted">Saving changes…</span>}
          {scoreSaveState === 'saved' && <span className="text-accent-ink">All changes saved.</span>}
          {scoreSaveState === 'error' && <span className="text-danger-ink">{scoreSaveError ?? 'Save failed.'}</span>}
        </div>
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
      <div aria-live="polite" className="text-xs">
        {settingsSaveState === 'saving' && <span className="text-muted">Saving changes…</span>}
        {settingsSaveState === 'saved' && <span className="text-accent-ink">All changes saved.</span>}
        {settingsSaveState === 'error' && (
          <span className="text-danger-ink">{settingsSaveError ?? 'Auto-save failed.'}</span>
        )}
      </div>
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
                    onBlur={() => {
                      if (titleDraft.trim() && titleDraft.trim() !== event.title) {
                        saveEventTitle();
                      }
                    }}
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
                    <SecondaryButton
                      onClick={() => {
                        setEditingTitle(false);
                        setTitleError(null);
                        setTitleDraft(event.title);
                      }}
                    >
                      Cancel
                    </SecondaryButton>
                    <span className="text-xs" aria-live="polite">
                      {titleSaveState === 'saving' && <span className="text-muted">Saving…</span>}
                      {titleSaveState === 'saved' && <span className="text-accent-ink">Saved</span>}
                    </span>
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
