import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { execute, queryAll, queryFirst } from '../../../db';
import { requireAdmin } from '../../../access';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type RoundItem = {
  round_id: string;
  round_number: number;
  round_label: string;
  ordinal: number;
  prompt: string | null;
  answer: string | null;
  answer_a: string | null;
  answer_b: string | null;
  answer_a_label: string | null;
  answer_b_label: string | null;
  media_type: string | null;
};

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 48;

function formatQuestionText(item: RoundItem) {
  const prompt = (item.prompt ?? '').trim();
  if (prompt) return prompt;
  if (item.media_type === 'audio') return `Audio Clip ${item.ordinal}`;
  if (item.media_type === 'image') return `Image ${item.ordinal}`;
  return `Question ${item.ordinal}`;
}

function formatAnswerText(item: RoundItem) {
  const direct = (item.answer ?? '').trim();
  if (direct) return direct;
  if (item.answer_a || item.answer_b) {
    const aLabel = item.answer_a_label ? `${item.answer_a_label}: ` : 'A: ';
    const bLabel = item.answer_b_label ? `${item.answer_b_label}: ` : 'B: ';
    return `${aLabel}${item.answer_a ?? ''} / ${bLabel}${item.answer_b ?? ''}`.trim();
  }
  return '';
}

function wrapText(text: string, font: any, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

async function buildSheetPdf(options: {
  title: string;
  subtitle: string;
  rounds: { round_number: number; round_label: string; items: RoundItem[] }[];
  kind: 'scoresheet' | 'answersheet';
}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = PAGE_SIZE;

  const headerSize = 18;
  const subHeaderSize = 10;
  const roundHeaderSize = 12;
  const bodySize = 10;
  const lineHeight = bodySize + 6;
  const roundSpacing = 10;
  const answerLineGap = 8;

  const makePage = () => {
    const page = doc.addPage(PAGE_SIZE);
    let y = pageHeight - MARGIN;
    page.drawText(options.title, { x: MARGIN, y, size: headerSize, font: bold, color: rgb(0.15, 0.15, 0.15) });
    y -= headerSize + 4;
    page.drawText(options.subtitle, { x: MARGIN, y, size: subHeaderSize, font, color: rgb(0.4, 0.4, 0.4) });
    y -= subHeaderSize + 12;
    return { page, y };
  };

  const maxWidth = pageWidth - MARGIN * 2;
  let { page, y } = makePage();

  for (const round of options.rounds) {
    const roundTitle = `Round ${round.round_number}${round.round_label ? ` — ${round.round_label}` : ''}`;
    const roundHeaderHeight = roundHeaderSize + 8;
    let roundHeight = roundHeaderHeight + roundSpacing;
    const itemLines: string[][] = [];

    for (const item of round.items) {
      const text = options.kind === 'answersheet' ? formatAnswerText(item) : formatQuestionText(item);
      const lines = wrapText(text || '________', font, bodySize, maxWidth);
      itemLines.push(lines);
      roundHeight += lines.length * lineHeight + answerLineGap;
    }

    if (y - roundHeight < MARGIN) {
      ({ page, y } = makePage());
    }

    page.drawText(roundTitle, { x: MARGIN, y, size: roundHeaderSize, font: bold, color: rgb(0.2, 0.2, 0.2) });
    y -= roundHeaderHeight;

    round.items.forEach((item, index) => {
      const lines = itemLines[index];
      for (const line of lines) {
        page.drawText(line, { x: MARGIN, y, size: bodySize, font, color: rgb(0.1, 0.1, 0.1) });
        y -= lineHeight;
      }
      if (options.kind === 'scoresheet') {
        page.drawLine({
          start: { x: MARGIN, y: y + 2 },
          end: { x: MARGIN + maxWidth, y: y + 2 },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7)
        });
      }
      y -= answerLineGap;
    });

    y -= roundSpacing;
  }

  return doc.save();
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, data }) => {
  if (!data.user) {
    return jsonError({ code: 'unauthorized', message: 'Authentication required' }, 401);
  }
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const event = await queryFirst<{
    id: string;
    title: string;
    starts_at: string;
    public_code: string | null;
    scoresheet_key: string | null;
    answersheet_key: string | null;
  }>(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.id]);

  if (!event) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const rows = await queryAll<RoundItem>(
    env,
    `SELECT
      er.id AS round_id,
      er.round_number,
      er.label AS round_label,
      eri.ordinal,
      COALESCE(eri.overridden_prompt, ei.prompt) AS prompt,
      COALESCE(eri.overridden_answer, ei.answer) AS answer,
      ei.answer_a,
      ei.answer_b,
      ei.answer_a_label,
      ei.answer_b_label,
      ei.media_type
     FROM event_rounds er
     JOIN event_round_items eri ON eri.event_round_id = er.id
     JOIN edition_items ei ON ei.id = eri.edition_item_id
     WHERE er.event_id = ? AND COALESCE(er.deleted, 0) = 0 AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0
     ORDER BY er.round_number ASC, eri.ordinal ASC`,
    [event.id]
  );

  const roundsMap = new Map<string, { round_number: number; round_label: string; items: RoundItem[] }>();
  for (const row of rows) {
    const entry = roundsMap.get(row.round_id) ?? {
      round_number: row.round_number,
      round_label: row.round_label ?? '',
      items: []
    };
    entry.items.push(row);
    roundsMap.set(row.round_id, entry);
  }

  const rounds = [...roundsMap.values()].sort((a, b) => a.round_number - b.round_number);
  const dateLabel = event.starts_at ? new Date(event.starts_at).toLocaleString() : '';
  const baseLabel = event.public_code ?? event.id.slice(0, 6);

  const scoresheetPdf = await buildSheetPdf({
    title: event.title,
    subtitle: `Scoresheet • ${dateLabel}`,
    rounds,
    kind: 'scoresheet'
  });
  const answersheetPdf = await buildSheetPdf({
    title: event.title,
    subtitle: `Answer Sheet • ${dateLabel}`,
    rounds,
    kind: 'answersheet'
  });

  const scoresheetName = `scoresheet-${baseLabel}.pdf`;
  const answersheetName = `answersheet-${baseLabel}.pdf`;
  const scoresheetKey = `user/${data.user.id}/events/${event.id}/scoresheet-${crypto.randomUUID()}.pdf`;
  const answersheetKey = `user/${data.user.id}/events/${event.id}/answersheet-${crypto.randomUUID()}.pdf`;

  await env.BUCKET.put(scoresheetKey, scoresheetPdf, { httpMetadata: { contentType: 'application/pdf' } });
  await env.BUCKET.put(answersheetKey, answersheetPdf, { httpMetadata: { contentType: 'application/pdf' } });

  await execute(
    env,
    `UPDATE events SET scoresheet_key = ?, scoresheet_name = ?, answersheet_key = ?, answersheet_name = ? WHERE id = ?`,
    [scoresheetKey, scoresheetName, answersheetKey, answersheetName, event.id]
  );

  if (event.scoresheet_key && event.scoresheet_key !== scoresheetKey) {
    await env.BUCKET.delete(event.scoresheet_key);
  }
  if (event.answersheet_key && event.answersheet_key !== answersheetKey) {
    await env.BUCKET.delete(event.answersheet_key);
  }

  const updated = await queryFirst(env, 'SELECT * FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0', [event.id]);
  return jsonOk(updated);
};
