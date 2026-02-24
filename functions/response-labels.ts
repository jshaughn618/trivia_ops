type ResponseLabelInput = {
  question_type?: string | null;
  answer?: string | null;
  answer_parts_json?: string | null;
  answer_a_label?: string | null;
  answer_b_label?: string | null;
  answer_a?: string | null;
  answer_b?: string | null;
};

type ResponseLabelOptions = {
  fallbackSingleAnswer?: boolean;
};

export type ExpectedAnswerPart = {
  label: string;
  answer: string;
  points: number;
};

function normalizePoints(value: unknown, fallback = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

export function deriveExpectedAnswerParts(
  item: ResponseLabelInput,
  options: ResponseLabelOptions = {}
): ExpectedAnswerPart[] {
  const parts: ExpectedAnswerPart[] = [];

  if (item.answer_parts_json) {
    try {
      const parsed = JSON.parse(item.answer_parts_json) as Array<{ label?: unknown; answer?: unknown; points?: unknown }>;
      if (Array.isArray(parsed)) {
        parsed.forEach((part) => {
          const label = typeof part?.label === 'string' ? part.label.trim() : '';
          const answer = typeof part?.answer === 'string' ? part.answer.trim() : '';
          if (!label) return;
          parts.push({
            label,
            answer,
            points: normalizePoints(part?.points, 1)
          });
        });
      }
    } catch {
      // Ignore malformed payloads and continue to legacy fields.
    }
  }

  if (parts.length === 0) {
    const answerA = item.answer_a?.trim() ?? '';
    const answerB = item.answer_b?.trim() ?? '';
    if (answerA) {
      parts.push({
        label: item.answer_a_label?.trim() || 'Part A',
        answer: answerA,
        points: 1
      });
    }
    if (answerB) {
      parts.push({
        label: item.answer_b_label?.trim() || 'Part B',
        answer: answerB,
        points: 1
      });
    }
  }

  if (
    parts.length === 0 &&
    options.fallbackSingleAnswer &&
    (item.question_type ?? 'text') !== 'multiple_choice'
  ) {
    parts.push({
      label: 'Answer',
      answer: item.answer?.trim() ?? '',
      points: 1
    });
  }

  return parts;
}

export function deriveResponseLabels(
  item: ResponseLabelInput,
  options: ResponseLabelOptions = {}
): string[] {
  const labels = deriveExpectedAnswerParts(item, options).map((part) => part.label);
  return labels;
}

export function normalizeResponseParts(
  labels: string[],
  answers: Array<{ label: string; answer: string }>
): Array<{ label: string; answer: string }> {
  const byLabel = new Map<string, string>();
  answers.forEach((entry) => {
    const normalizedLabel = entry.label.trim().toLowerCase();
    if (!normalizedLabel) return;
    byLabel.set(normalizedLabel, entry.answer);
  });

  return labels.map((label) => ({
    label,
    answer: byLabel.get(label.toLowerCase()) ?? ''
  }));
}
