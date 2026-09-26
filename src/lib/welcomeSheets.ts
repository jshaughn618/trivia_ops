import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import logoLight from '../assets/trivia_ops_logo_light.png';
import type { Event, Team } from '../types';

type PdfFonts = { regular: any; bold: any };
export type WelcomeEventType = 'Pub' | 'Music';

const LETTER_PORTRAIT_WIDTH = 8.5 * 72;
const LETTER_PORTRAIT_HEIGHT = 11 * 72;
const QUARTER_SHEET_WIDTH = LETTER_PORTRAIT_WIDTH / 2;
const QUARTER_SHEET_HEIGHT = LETTER_PORTRAIT_HEIGHT / 2;

const fitWelcomeText = (font: any, text: string, width: number, size: number) => {
  let value = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018-\u201b]/g, "'")
    .replace(/[\u201c-\u201f]/g, '"').replace(/[^\x20-\x7e]/g, ' ').trim();
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value && font.widthOfTextAtSize(`${value}...`, size) > width) value = value.slice(0, -1);
  return `${value}...`;
};

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
  logoImage?: any,
  teamWelcome?: { qrImage: any; teamCode: string; eventCode: string; eventTitle: string }
) => {
  const sidePadding = 20;
  const topPadding = 16;
  const contentX = panelX + sidePadding;
  const contentWidth = panelWidth - sidePadding * 2;
  let cursorY = panelY + panelHeight - topPadding;

  const titleLineOne = `Welcome to ${eventType} Trivia`;
  const titleLineTwo = `@ ${locationName}`;
  const titleSize = teamWelcome ? 20 : eventType === 'Music' ? 23 : 26;
  const subtitleSize = teamWelcome ? 11 : 16;
  const titleLines = [titleLineOne];
  const subtitleLines = teamWelcome
    ? [fitWelcomeText(fonts.bold, titleLineTwo, panelWidth - 44, subtitleSize)]
    : wrapText(fonts.bold, titleLineTwo, panelWidth - 44, subtitleSize);
  titleLines.forEach((line, lineIndex) => {
    drawCenteredText(page, line, fonts.bold, titleSize, panelX, panelWidth, cursorY - titleSize - lineIndex * 30);
  });
  cursorY -= (teamWelcome ? 2 : 8) + titleLines.length * (teamWelcome ? 24 : 30);
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
  cursorY -= (teamWelcome ? 3 : 8) + subtitleLines.length * (teamWelcome ? 14 : 20);

  if (logoImage && logoImage.width > 0 && logoImage.height > 0) {
    const label = 'Powered by';
    const labelSize = teamWelcome ? 8 : 9.5;
    const labelWidth = fonts.regular.widthOfTextAtSize(label, labelSize);
    const maxLogoWidth = teamWelcome ? 60 : 74;
    const maxLogoHeight = teamWelcome ? 14 : 21;
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
    cursorY -= rowHeight + (teamWelcome ? 3 : 14);
  } else {
    drawCenteredText(page, 'Powered by Trivia Ops', fonts.regular, 9.5, panelX, panelWidth, cursorY - 9.5);
    cursorY -= teamWelcome ? 17 : 24;
  }

  if (teamWelcome) {
    drawCenteredText(page, fitWelcomeText(fonts.regular, teamWelcome.eventTitle, contentWidth, 8), fonts.regular, 8, panelX, panelWidth, cursorY - 8);
    cursorY -= 12;
    const qrSize = 76;
    page.drawImage(teamWelcome.qrImage, { x: panelX + (panelWidth - qrSize) / 2, y: cursorY - qrSize, width: qrSize, height: qrSize });
    cursorY -= qrSize + 9;
    drawCenteredText(page, `Event: ${teamWelcome.eventCode}   Team code: ${teamWelcome.teamCode}`, fonts.regular, 8, panelX, panelWidth, cursorY);
    cursorY -= 4;
  }

  page.drawText('Start Here', {
    x: contentX,
    y: cursorY - (teamWelcome ? 11 : 14),
    size: teamWelcome ? 11 : 14,
    font: fonts.bold
  });
  cursorY -= teamWelcome ? 19 : 27;

  const steps = [
    teamWelcome ? 'Scan the QR code above with your mobile device.' : 'Scan the QR code on your scoresheet with your mobile device.',
    'Enter a team name when prompted and continue to your team site.',
    'Only one phone can be logged into your team site at a time (you may switch phones if needed).',
    teamWelcome ? 'Use the same name on each scoresheet (that was entered on the phone).' : 'Write your team name on the scoresheet, then sit back and wait for the host to start the game.'
  ];
  const stepTextSize = teamWelcome ? 9 : 11;
  const stepLineHeight = teamWelcome ? 10.5 : 13.4;
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

    cursorY -= lines.length * stepLineHeight + (teamWelcome ? 4 : 6);
  });

  const rules = [
    'Teams up to 6 players.',
    'No Googling or outside help.',
    'One team device out. All other phones away.'
  ];
  const ruleTextSize = teamWelcome ? 8.5 : 10.5;
  const ruleLineHeight = teamWelcome ? 10 : 12.5;
  const ruleIndent = 10;

  page.drawText('Rules', {
    x: contentX,
    y: cursorY - (teamWelcome ? 10 : 12),
    size: teamWelcome ? 10 : 12,
    font: fonts.bold
  });
  cursorY -= teamWelcome ? 15 : 20;

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
    cursorY -= lines.length * ruleLineHeight + (teamWelcome ? 2 : 4);
  });

  const note = 'Have fun and good luck!';
  drawCenteredText(page, note, fonts.bold, teamWelcome ? 11 : 16, panelX, panelWidth, panelY + (teamWelcome ? 12 : 16));
};

export const buildWelcomeSheetPdf = async (
  eventType: WelcomeEventType,
  locationName: string,
  teamSheets?: { eventTitle: string; eventCode: string; teamCodes: string[] }
) => {
  const pdfDoc = await PDFDocument.create();
  const fonts: PdfFonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  };

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

  const sheetCount = teamSheets?.teamCodes.length ?? 4;
  for (let offset = 0; offset < sheetCount; offset += 4) {
    const page = pdfDoc.addPage([LETTER_PORTRAIT_WIDTH, LETTER_PORTRAIT_HEIGHT]);
    for (let index = 0; index < Math.min(4, sheetCount - offset); index += 1) {
      const panel = panels[index];
      let teamWelcome;
      if (teamSheets) {
        const teamCode = teamSheets.teamCodes[offset + index];
        const params = new URLSearchParams({ event: teamSheets.eventCode, team: teamCode });
        const qrDataUrl = await QRCode.toDataURL(`https://triviaops.com/login?${params}`, {
          margin: 4, width: 320, errorCorrectionLevel: 'M'
        });
        teamWelcome = {
          qrImage: await pdfDoc.embedPng(qrDataUrl), teamCode,
          eventCode: teamSheets.eventCode, eventTitle: teamSheets.eventTitle
        };
      }
      drawWelcomeHalfSheet(
        page,
        panel.x,
        panel.y,
        QUARTER_SHEET_WIDTH,
        QUARTER_SHEET_HEIGHT,
        fonts,
        eventType,
        locationName,
        logoImage ?? undefined,
        teamWelcome
      );
    }

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
  }

  return pdfDoc.save();
};

export const buildTeamWelcomeSheetsPdf = async (event: Event, locationName: string, teams: Team[]) => {
  if (!event.public_code?.trim()) throw new Error('This event needs an event code before team welcome sheets can be generated.');
  if (teams.length === 0) throw new Error('Add or pre-populate teams in the Teams section first, then generate their welcome sheets.');
  const teamCodes = teams.map(team => team.team_code?.trim() ?? '');
  if (teams.some(team => team.event_id !== event.id) || teamCodes.some(code => !/^\d{4}$/.test(code)) || new Set(teamCodes).size !== teamCodes.length) {
    throw new Error('Each team must belong to this event and have a unique four-digit team code. Refresh the event and try again.');
  }
  return buildWelcomeSheetPdf(event.event_type === 'Music Trivia' ? 'Music' : 'Pub', locationName, {
    eventTitle: event.title, eventCode: event.public_code.trim(), teamCodes
  });
};
