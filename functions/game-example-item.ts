import type { GameExampleItem } from '../shared/types';
import { gameExampleItemSchema } from '../shared/validators';

export function parseGameExampleItem(raw: string | null | undefined): GameExampleItem | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const validated = gameExampleItemSchema.safeParse(parsed);
    if (!validated.success) return null;
    return {
      question_type: validated.data.question_type ?? 'text',
      choices_json: validated.data.choices_json ?? null,
      prompt: validated.data.prompt,
      answer: validated.data.answer ?? '',
      answer_a: validated.data.answer_a ?? null,
      answer_b: validated.data.answer_b ?? null,
      answer_a_label: validated.data.answer_a_label ?? null,
      answer_b_label: validated.data.answer_b_label ?? null,
      answer_parts_json: validated.data.answer_parts_json ?? null,
      fun_fact: validated.data.fun_fact ?? null,
      media_type: validated.data.media_type ?? null,
      media_key: validated.data.media_key ?? null,
      media_caption: validated.data.media_caption ?? null,
      audio_answer_key: validated.data.audio_answer_key ?? null
    };
  } catch {
    return null;
  }
}

export function serializeGameExampleItem(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const parsed = gameExampleItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  return JSON.stringify(parsed.data);
}

export function getGameExampleItemId(gameId: string) {
  return `game-example:${gameId}`;
}

export function buildRuntimeGameExampleItem(gameId: string, raw: string | null | undefined) {
  const item = parseGameExampleItem(raw);
  if (!item) return null;

  return {
    id: getGameExampleItemId(gameId),
    edition_id: '',
    question_type: item.question_type ?? 'text',
    choices_json: item.choices_json ? JSON.stringify(item.choices_json) : null,
    prompt: item.prompt,
    answer: item.answer ?? '',
    answer_a: item.answer_a ?? null,
    answer_b: item.answer_b ?? null,
    answer_a_label: item.answer_a_label ?? null,
    answer_b_label: item.answer_b_label ?? null,
    answer_parts_json: item.answer_parts_json ? JSON.stringify(item.answer_parts_json) : null,
    fun_fact: item.fun_fact ?? null,
    ordinal: 0,
    media_type: item.media_type ?? null,
    media_key: item.media_key ?? null,
    media_caption: item.media_caption ?? null,
    audio_answer_key: item.audio_answer_key ?? null,
    created_at: '',
    is_example_item: 1 as const
  };
}
