import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type GenericRoundSheet = {
  title: string;
  answerCount: number;
  columns: string[];
};

export const ROUND_SHEET_PRESETS: Record<string, GenericRoundSheet> = {
  general: { title: 'General Trivia', answerCount: 10, columns: [''] },
  audio: { title: 'Audio', answerCount: 5, columns: ['Song', 'Artist'] },
  visual: { title: 'Visual', answerCount: 10, columns: ['Answer'] },
  music: { title: 'Music', answerCount: 10, columns: ['Song', 'Artist'] },
  justOneWord: { title: 'Just One Word', answerCount: 10, columns: ['Answer'] }
};

// Standard PDF fonts need printable Latin text; normalize punctuation and accents.
const printable = (text: string) => text.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/[\u2018-\u201b]/g, "'")
  .replace(/[\u201c-\u201f]/g, '"')
  .replace(/\u2026/g, '...')
  .replace(/[^\x20-\x7e]/g, ' ').trim();

export const validateRoundSheet = (sheet: GenericRoundSheet) => {
  if (!printable(sheet.title)) throw new Error('Enter a printable sheet title.');
  if (sheet.title.length > 60) throw new Error('Keep sheet titles to 60 characters or fewer.');
  if (!Number.isInteger(sheet.answerCount) || sheet.answerCount < 1 || sheet.answerCount > 15) {
    throw new Error('Choose between 1 and 15 answers per round.');
  }
  if (sheet.columns.length < 1 || sheet.columns.length > 2 || sheet.columns.some(label => label.length > 24)) {
    throw new Error('Use one or two answer columns with optional labels of up to 24 characters.');
  }
};

const line = (page: PDFPage, x: number, y: number, endX: number) => page.drawLine({
  start: { x, y }, end: { x: endX, y }, thickness: 0.6, color: rgb(0.35, 0.35, 0.35)
});

const fittedText = (page: PDFPage, text: string, font: PDFFont, size: number, x: number, y: number, width: number) => {
  const value = printable(text);
  const fittedSize = Math.min(size, size * width / Math.max(1, font.widthOfTextAtSize(value, size)));
  // Reject labels that cannot fit without becoming unreadable.
  if (fittedSize < 9) throw new Error('This title or column label is too long for the selected layout. Shorten it before generating.');
  page.drawText(value, { x, y, font, size: fittedSize, color: rgb(0, 0, 0) });
};

/** US Letter, two identical half-sheets, optionally containing two adjacent rounds. */
export const buildGenericRoundSheetsPdf = async (sheets: GenericRoundSheet[]) => {
  if (sheets.length < 1 || sheets.length > 2) throw new Error('Choose one or two rounds per half-sheet.');
  sheets.forEach(validateRoundSheet);
  const document = await PDFDocument.create();
  document.setTitle(sheets.map(sheet => sheet.title).join(' + ') + ' - Blank Round Sheets');
  const page = document.addPage([612, 792]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const paired = sheets.length === 2;
  const margin = 28;
  const gap = 28;
  const width = (612 - margin * 2 - (paired ? gap : 0)) / sheets.length;

  for (const bottom of [396, 0]) {
    const top = bottom + 396;
    page.drawText('Team name:', { x: margin, y: top - 39, font: regular, size: 11 });
    const roundX = 612 - margin - 110;
    line(page, margin + 67, top - 42, roundX - 20);
    page.drawText('Round:', { x: roundX, y: top - 39, font: regular, size: 11 });
    line(page, roundX + 40, top - 42, 612 - margin);
    sheets.forEach((sheet, sheetIndex) => {
      const x = margin + sheetIndex * (width + gap);
      fittedText(page, sheet.title, bold, 17, x, top - 76, width);
      const answerX = x + 23;
      const columnGap = 14;
      const columnWidth = (width - 23 - columnGap * (sheet.columns.length - 1)) / sheet.columns.length;
      sheet.columns.forEach((label, columnIndex) => {
        if (!printable(label)) return;
        fittedText(page, label, regular, 10, answerX + columnIndex * (columnWidth + columnGap), top - 103, columnWidth);
      });
      const firstRowY = top - 127;
      const lastRowY = bottom + 29;
      const rowSpacing = sheet.answerCount === 1 ? 0 : Math.min(30, (firstRowY - lastRowY) / (sheet.answerCount - 1));
      for (let row = 0; row < sheet.answerCount; row += 1) {
        const y = firstRowY - row * rowSpacing;
        page.drawText(`${row + 1}.`, { x, y: y + 2, font: regular, size: 10 });
        sheet.columns.forEach((_, columnIndex) => {
          const startX = answerX + columnIndex * (columnWidth + columnGap);
          line(page, startX, y, startX + columnWidth);
        });
      }
    });
    if (paired) page.drawLine({ start: { x: 306, y: bottom + 24 }, end: { x: 306, y: top - 64 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  }
  page.drawLine({ start: { x: 14, y: 396 }, end: { x: 598, y: 396 }, thickness: 0.6, dashArray: [4, 4], color: rgb(0.55, 0.55, 0.55) });
  return document.save();
};
