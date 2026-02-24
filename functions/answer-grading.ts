import type { Env } from './types';
import { execute, nowIso, queryFirst } from './db';
import { generateText } from './openai';
import { deriveExpectedAnswerParts, normalizeResponseParts } from './response-labels';

type SubmittedPart = { label: string; answer: string };
type GradedPart = {
  label: string;
  expected_answer: string;
  submitted_answer: string;
  max_points: number;
  awarded_points: number;
  is_correct: boolean;
  confidence: number;
  reason: string;
};

type GradeResult = {
  source: 'ai' | 'fallback';
  total_points: number;
  max_points: number;
  overall_confidence: number;
  needs_review: boolean;
  threshold: number;
  parts: GradedPart[];
};

type ResponseRow = {
  id: string;
  updated_at: string | null;
  event_round_id: string;
  team_id: string;
  question_type: string | null;
  prompt: string;
  choice_text: string | null;
  response_parts_json: string | null;
  answer: string | null;
  answer_a: string | null;
  answer_b: string | null;
  answer_a_label: string | null;
  answer_b_label: string | null;
  answer_parts_json: string | null;
};

function parseThreshold(env: Env) {
  const raw = env.AI_GRADE_LOW_CONFIDENCE_THRESHOLD;
  if (!raw) return 0.75;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0.75;
  return Math.max(0, Math.min(1, parsed));
}

function parseResponseParts(value: string | null): SubmittedPart[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
        if (!label) return null;
        const answer = typeof (entry as { answer?: unknown }).answer === 'string' ? (entry as { answer: string }).answer : '';
        return { label, answer } as SubmittedPart;
      })
      .filter((entry): entry is SubmittedPart => Boolean(entry));
  } catch {
    return [];
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function diceCoefficient(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const pair = a.slice(i, i + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const pair = b.slice(i, i + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      pairs.set(pair, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length + b.length - 2);
}

function fallbackGrade(expected: Array<{ label: string; answer: string; points: number }>, submitted: SubmittedPart[], threshold: number): GradeResult {
  const normalized = normalizeResponseParts(
    expected.map((part) => part.label),
    submitted
  );

  const parts: GradedPart[] = expected.map((part, idx) => {
    const submittedAnswer = normalized[idx]?.answer ?? '';
    const expectedNorm = normalizeText(part.answer);
    const submittedNorm = normalizeText(submittedAnswer);
    const includesMatch = expectedNorm.length > 0 && submittedNorm.includes(expectedNorm);
    const reverseIncludes = expectedNorm.length > 0 && expectedNorm.includes(submittedNorm) && submittedNorm.length >= 4;
    const similarity = diceCoefficient(expectedNorm, submittedNorm);
    const fuzzyMatch = similarity >= 0.86;
    const correct = includesMatch || reverseIncludes || fuzzyMatch;
    return {
      label: part.label,
      expected_answer: part.answer,
      submitted_answer: submittedAnswer,
      max_points: part.points,
      awarded_points: correct ? part.points : 0,
      is_correct: correct,
      confidence: correct ? Math.max(0.7, similarity) : 0.55,
      reason: correct ? 'Fallback match accepted.' : 'Fallback did not find a strong match.'
    };
  });

  const totalPoints = parts.reduce((sum, part) => sum + part.awarded_points, 0);
  const maxPoints = parts.reduce((sum, part) => sum + part.max_points, 0);
  const overallConfidence = parts.length > 0 ? parts.reduce((sum, part) => sum + part.confidence, 0) / parts.length : 0.5;
  return {
    source: 'fallback',
    total_points: totalPoints,
    max_points: maxPoints,
    overall_confidence: overallConfidence,
    needs_review: overallConfidence < threshold || parts.some((part) => part.confidence < threshold),
    threshold,
    parts
  };
}

function extractJsonObject(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function aiGrade(env: Env, input: {
  prompt: string;
  question_type: string;
  expected: Array<{ label: string; answer: string; points: number }>;
  submitted: SubmittedPart[];
  threshold: number;
}): Promise<GradeResult> {
  const submitted = normalizeResponseParts(
    input.expected.map((part) => part.label),
    input.submitted
  );
  const maxPoints = input.expected.reduce((sum, part) => sum + part.points, 0);
  const aiModel = env.AI_GRADING_MODEL ?? env.AI_DEFAULT_MODEL ?? 'gpt-5-mini';
  const prompt = [
    'You are grading trivia responses. Return JSON only.',
    'Rules:',
    '- Accept close spelling if meaning is clearly the same.',
    '- Jeopardy-style inclusion rule: if team answer contains the expected answer plus extra words, treat as correct.',
    '- Names: require full names unless expected answer is only a last name. Initials can count as full-name equivalents when they clearly identify the same person.',
    '- Score each part from 0..max_points and provide confidence 0..1.',
    '- Set needs_review true when uncertain or borderline.',
    '',
    `Question type: ${input.question_type}`,
    `Prompt: ${input.prompt}`,
    `Low-confidence threshold: ${input.threshold}`,
    '',
    `Expected parts JSON: ${JSON.stringify(input.expected.map((part) => ({ label: part.label, expected_answer: part.answer, max_points: part.points })))} `,
    `Submitted parts JSON: ${JSON.stringify(submitted.map((part) => ({ label: part.label, submitted_answer: part.answer })))} `,
    '',
    'Return exactly this JSON shape:',
    '{"parts":[{"label":"string","awarded_points":0,"confidence":0.0,"is_correct":true,"reason":"short"}],"overall_confidence":0.0,"needs_review":false,"total_points":0}'
  ].join('\n');

  const res = await generateText(env, {
    prompt,
    model: aiModel,
    max_output_tokens: 700
  });
  const parsed = extractJsonObject(res.text);
  if (!parsed) {
    throw new Error('AI grading response was not valid JSON.');
  }

  const parsedParts = Array.isArray(parsed.parts) ? parsed.parts : [];
  const gradedParts: GradedPart[] = input.expected.map((part, idx) => {
    const aiPart = parsedParts[idx];
    const aiPartObj = aiPart && typeof aiPart === 'object' ? (aiPart as Record<string, unknown>) : {};
    const submittedAnswer = submitted[idx]?.answer ?? '';
    const awardedPoints = clampNumber(aiPartObj.awarded_points, 0, part.points, 0);
    return {
      label: part.label,
      expected_answer: part.answer,
      submitted_answer: submittedAnswer,
      max_points: part.points,
      awarded_points: awardedPoints,
      is_correct: Boolean(aiPartObj.is_correct ?? awardedPoints >= part.points),
      confidence: clampNumber(aiPartObj.confidence, 0, 1, 0.5),
      reason: typeof aiPartObj.reason === 'string' ? aiPartObj.reason.slice(0, 280) : ''
    };
  });

  const totalPoints = clampNumber(
    parsed.total_points,
    0,
    maxPoints,
    gradedParts.reduce((sum, part) => sum + part.awarded_points, 0)
  );
  const overallConfidence = clampNumber(parsed.overall_confidence, 0, 1, 0.5);
  const needsReviewByConfidence = overallConfidence < input.threshold || gradedParts.some((part) => part.confidence < input.threshold);
  const needsReview = Boolean(parsed.needs_review) || needsReviewByConfidence;

  return {
    source: 'ai',
    total_points: totalPoints,
    max_points: maxPoints,
    overall_confidence: overallConfidence,
    needs_review: needsReview,
    threshold: input.threshold,
    parts: gradedParts
  };
}

async function loadResponseForGrading(env: Env, responseId: string) {
  return queryFirst<ResponseRow>(
    env,
    `SELECT
      resp.id,
      resp.updated_at,
      resp.event_round_id,
      resp.team_id,
      ei.question_type,
      COALESCE(eri.overridden_prompt, ei.prompt) AS prompt,
      resp.choice_text,
      resp.response_parts_json,
      COALESCE(eri.overridden_answer, ei.answer) AS answer,
      ei.answer_a,
      ei.answer_b,
      ei.answer_a_label,
      ei.answer_b_label,
      ei.answer_parts_json
     FROM event_item_responses resp
     JOIN event_round_items eri
       ON eri.event_round_id = resp.event_round_id
      AND eri.edition_item_id = resp.edition_item_id
      AND COALESCE(eri.deleted, 0) = 0
     JOIN edition_items ei ON ei.id = resp.edition_item_id AND COALESCE(ei.deleted, 0) = 0
     WHERE resp.id = ? AND COALESCE(resp.deleted, 0) = 0
     LIMIT 1`,
    [responseId]
  );
}

export async function runAutoGradeForResponse(env: Env, responseId: string, expectedUpdatedAt: string) {
  const threshold = parseThreshold(env);
  const now = nowIso();
  const start = await execute(
    env,
    `UPDATE event_item_responses
     SET ai_grade_status = 'grading',
         ai_grade_error = NULL,
         updated_at = ?
     WHERE id = ?
       AND COALESCE(deleted, 0) = 0
       AND updated_at = ?`,
    [now, responseId, expectedUpdatedAt]
  );
  if ((start.meta?.changes ?? 0) === 0) {
    return;
  }

  const response = await loadResponseForGrading(env, responseId);
  if (!response) return;

  const expected = deriveExpectedAnswerParts(
    {
      question_type: response.question_type,
      answer: response.answer,
      answer_a: response.answer_a,
      answer_b: response.answer_b,
      answer_a_label: response.answer_a_label,
      answer_b_label: response.answer_b_label,
      answer_parts_json: response.answer_parts_json
    },
    { fallbackSingleAnswer: true }
  );

  const submitted = response.question_type === 'multiple_choice'
    ? [{ label: 'Answer', answer: response.choice_text ?? '' }]
    : parseResponseParts(response.response_parts_json);

  let result: GradeResult;
  try {
    if (expected.length === 0) {
      result = {
        source: 'fallback',
        total_points: 0,
        max_points: 0,
        overall_confidence: 0,
        needs_review: true,
        threshold,
        parts: []
      };
    } else {
      result = await aiGrade(env, {
        prompt: response.prompt,
        question_type: response.question_type ?? 'text',
        expected,
        submitted,
        threshold
      });
    }
  } catch {
    result = fallbackGrade(expected, submitted, threshold);
  }

  const gradedAt = nowIso();
  await execute(
    env,
    `UPDATE event_item_responses
     SET ai_grade_status = 'graded',
         ai_grade_json = ?,
         ai_graded_at = ?,
         ai_grade_error = NULL,
         updated_at = ?
     WHERE id = ?
       AND COALESCE(deleted, 0) = 0
       AND ai_grade_status = 'grading'`,
    [JSON.stringify(result), gradedAt, gradedAt, responseId]
  );
}

export function queueAutoGradeForResponse(
  env: Env,
  responseId: string,
  expectedUpdatedAt: string,
  waitUntil?: (promise: Promise<unknown>) => void
) {
  const task = runAutoGradeForResponse(env, responseId, expectedUpdatedAt).catch(async (error) => {
    const message = error instanceof Error ? error.message : 'AI grading failed';
    await execute(
      env,
      `UPDATE event_item_responses
       SET ai_grade_status = 'error',
           ai_grade_error = ?,
           updated_at = ?
       WHERE id = ? AND COALESCE(deleted, 0) = 0`,
      [message.slice(0, 500), nowIso(), responseId]
    );
  });

  if (waitUntil) {
    waitUntil(task);
  } else {
    void task;
  }
}

