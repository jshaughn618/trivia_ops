import type { Env } from './types';
import type { ApiError } from '../shared/types';
import { normalizeCode } from './public';
import { queryAll, queryFirst } from './db';

export type PublicEventView = 'play' | 'leaderboard';

export type PublicEventPayload = {
  event: {
    id: string;
    title: string;
    starts_at: string;
    status: string;
    public_code: string;
    location_name: string | null;
  };
  rounds: { id: string; round_number: number; label: string; status: string; timer_seconds: number | null }[];
  teams: { id: string; name: string }[];
  leaderboard: { team_id: string; name: string; total: number }[];
  round_scores: { event_round_id: string; team_id: string; score: number }[];
  live: {
    id: string;
    event_id: string;
    active_round_id: string | null;
    current_item_ordinal: number | null;
    reveal_answer: boolean;
    reveal_fun_fact: boolean;
    waiting_message: string | null;
    waiting_show_leaderboard: boolean;
    waiting_show_next_round: boolean;
    show_full_leaderboard: boolean;
    timer_started_at: string | null;
    timer_duration_seconds: number | null;
    updated_at: string;
  } | null;
  current_item: PublicItem | null;
  visual_round: boolean;
  visual_items: PublicItem[];
  response_counts: { total: number; counts: number[] } | null;
};

export type PublicItem = {
  id: string;
  question_type: string | null;
  choices_json: string | null;
  prompt: string;
  media_type: string | null;
  media_key: string | null;
  media_caption?: string | null;
  ordinal: number;
  answer?: string;
  answer_a?: string | null;
  answer_b?: string | null;
  answer_a_label?: string | null;
  answer_b_label?: string | null;
  answer_parts_json?: string | null;
  audio_answer_key?: string | null;
  fun_fact?: string | null;
};

type PublicEventResult =
  | { ok: true; data: PublicEventPayload }
  | { ok: false; error: ApiError; status: number };

export async function getPublicEventPayload(env: Env, rawCode: string, view?: PublicEventView): Promise<PublicEventResult> {
  const code = normalizeCode(rawCode);
  const event = await queryFirst<{
    id: string;
    title: string;
    starts_at: string;
    status: string;
    public_code: string;
    location_name: string | null;
  }>(
    env,
    `SELECT e.id, e.title, e.starts_at, e.status, e.public_code, l.name AS location_name
     FROM events e
     LEFT JOIN locations l ON l.id = e.location_id
     WHERE e.public_code = ? AND COALESCE(e.deleted, 0) = 0`,
    [code]
  );

  if (!event) {
    return { ok: false, error: { code: 'not_found', message: 'Event not found' }, status: 404 };
  }

  const rounds = await queryAll<{ id: string; round_number: number; label: string; status: string; timer_seconds: number | null }>(
    env,
    `SELECT er.id,
            er.round_number,
            CASE WHEN g.show_theme = 0 THEN g.name ELSE er.label END AS label,
            er.status,
            ed.timer_seconds
     FROM event_rounds er
     JOIN editions ed ON ed.id = er.edition_id
     JOIN games g ON g.id = ed.game_id
     WHERE er.event_id = ? AND COALESCE(er.deleted, 0) = 0
     ORDER BY er.round_number ASC`,
    [event.id]
  );

  const live = await queryFirst<{
    id: string;
    event_id: string;
    active_round_id: string | null;
    current_item_ordinal: number | null;
    reveal_answer: number;
    reveal_fun_fact: number;
    waiting_message: string | null;
    waiting_show_leaderboard: number;
    waiting_show_next_round: number;
    show_full_leaderboard: number;
    timer_started_at: string | null;
    timer_duration_seconds: number | null;
    updated_at: string;
  }>(
    env,
    `SELECT id, event_id, active_round_id, current_item_ordinal, reveal_answer, reveal_fun_fact,
            waiting_message, waiting_show_leaderboard, waiting_show_next_round, show_full_leaderboard, timer_started_at, timer_duration_seconds, updated_at
     FROM event_live_state WHERE event_id = ? AND COALESCE(deleted, 0) = 0`,
    [event.id]
  );

  const normalizedLive = live
    ? {
        ...live,
        reveal_answer: Boolean(live.reveal_answer),
        reveal_fun_fact: Boolean(live.reveal_fun_fact),
        waiting_message: live.waiting_message ?? null,
        waiting_show_leaderboard: Boolean(live.waiting_show_leaderboard),
        waiting_show_next_round: Boolean(live.waiting_show_next_round),
        show_full_leaderboard: Boolean(live.show_full_leaderboard),
        timer_started_at: live.timer_started_at ?? null,
        timer_duration_seconds: live.timer_duration_seconds ?? null
      }
    : null;

  const canRevealAnswer = Boolean(live?.reveal_answer);
  const canRevealFunFact = Boolean(live?.reveal_fun_fact);

  const sanitizeItem = (item: {
    id: string;
    question_type: string | null;
    choices_json: string | null;
    prompt: string;
    answer: string;
    answer_a: string | null;
    answer_b: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_parts_json: string | null;
    fun_fact: string | null;
    media_type: string | null;
    media_key: string | null;
    audio_answer_key: string | null;
    media_caption?: string | null;
    ordinal: number;
  }): PublicItem => {
    const base: PublicItem = {
      id: item.id,
      question_type: item.question_type,
      choices_json: item.choices_json,
      prompt: item.prompt,
      media_type: item.media_type,
      media_key: item.media_key,
      media_caption: item.media_caption ?? null,
      ordinal: item.ordinal
    };

    if (canRevealAnswer) {
      base.answer = item.answer;
      base.answer_a = item.answer_a;
      base.answer_b = item.answer_b;
      base.answer_a_label = item.answer_a_label;
      base.answer_b_label = item.answer_b_label;
      base.answer_parts_json = item.answer_parts_json;
      base.audio_answer_key = item.audio_answer_key;
    }
    if (canRevealFunFact) {
      base.fun_fact = item.fun_fact ?? null;
    }
    return base;
  };

  const isLeaderboardView = view === 'leaderboard';
  const includeLeaderboard = isLeaderboardView || Boolean(normalizedLive?.waiting_show_leaderboard);
  const includeTeams = !isLeaderboardView;

  const teams = includeTeams
    ? await queryAll<{ id: string; name: string }>(
      env,
      'SELECT id, name FROM teams WHERE event_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY created_at ASC',
      [event.id]
    )
    : [];

  const leaderboard = includeLeaderboard
    ? await queryAll<{ team_id: string; name: string; total: number }>(
      env,
      `SELECT t.id AS team_id, t.name, COALESCE(SUM(s.score), 0) AS total
       FROM teams t
       LEFT JOIN event_round_scores s ON s.team_id = t.id AND COALESCE(s.deleted, 0) = 0
       LEFT JOIN event_rounds r ON r.id = s.event_round_id
       WHERE t.event_id = ? AND COALESCE(t.deleted, 0) = 0
       GROUP BY t.id
       ORDER BY total DESC, t.name ASC`,
      [event.id]
    )
    : [];

  const roundScores = isLeaderboardView
    ? await queryAll<{ event_round_id: string; team_id: string; score: number }>(
      env,
      `SELECT event_round_id, team_id, score
       FROM event_round_scores
       WHERE COALESCE(deleted, 0) = 0
         AND event_round_id IN (
           SELECT id FROM event_rounds WHERE event_id = ? AND COALESCE(deleted, 0) = 0
         )`,
      [event.id]
    )
    : [];

  let currentItem: PublicItem | null = null;
  let visualRound = false;
  let visualItems: PublicItem[] = [];
  let responseCounts: { total: number; counts: number[] } | null = null;

  if (!isLeaderboardView && live?.active_round_id) {
    const roundStatus = await queryFirst<{ status: string }>(
      env,
      'SELECT status FROM event_rounds WHERE id = ? AND COALESCE(deleted, 0) = 0',
      [live.active_round_id]
    );
    if (roundStatus?.status === 'live') {
      const roundItems = await queryAll<{
        id: string;
        question_type: string | null;
        choices_json: string | null;
        prompt: string;
        answer: string;
        answer_a: string | null;
        answer_b: string | null;
        answer_a_label: string | null;
        answer_b_label: string | null;
        answer_parts_json: string | null;
        fun_fact: string | null;
        media_type: string | null;
        media_key: string | null;
        audio_answer_key: string | null;
        ordinal: number;
      }>(
        env,
        `SELECT
          ei.id,
          ei.question_type,
          ei.choices_json,
          COALESCE(eri.overridden_prompt, ei.prompt) AS prompt,
          COALESCE(eri.overridden_answer, ei.answer) AS answer,
          ei.answer_a,
          ei.answer_b,
          ei.answer_a_label,
          ei.answer_b_label,
          ei.answer_parts_json,
          COALESCE(eri.overridden_fun_fact, ei.fun_fact) AS fun_fact,
          ei.media_type,
          ei.media_key,
          ei.audio_answer_key,
          ei.media_caption,
          eri.ordinal
         FROM event_round_items eri
         JOIN edition_items ei ON ei.id = eri.edition_item_id
         WHERE eri.event_round_id = ? AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0
         ORDER BY eri.ordinal ASC`,
        [live.active_round_id]
      );
      const imageItems = roundItems.filter((item) => item.media_type === 'image' && item.media_key);
      if (roundItems.length > 0 && imageItems.length === roundItems.length) {
        visualRound = true;
        visualItems = imageItems.map((item) => sanitizeItem(item));
      }
    }
  }

  if (!isLeaderboardView && live?.active_round_id && live.current_item_ordinal) {
    const rawItem = await queryFirst(
      env,
      `SELECT
        ei.id,
        ei.edition_id,
        ei.question_type,
        ei.choices_json,
        COALESCE(eri.overridden_prompt, ei.prompt) AS prompt,
        COALESCE(eri.overridden_answer, ei.answer) AS answer,
        ei.answer_a,
        ei.answer_b,
        ei.answer_a_label,
        ei.answer_b_label,
        ei.answer_parts_json,
        COALESCE(eri.overridden_fun_fact, ei.fun_fact) AS fun_fact,
        ei.media_type,
        ei.media_key,
        ei.audio_answer_key,
        ei.media_caption
       FROM event_round_items eri
       JOIN edition_items ei ON ei.id = eri.edition_item_id
       WHERE eri.event_round_id = ? AND eri.ordinal = ? AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0
       LIMIT 1`,
      [live.active_round_id, live.current_item_ordinal]
    );
    if (rawItem) {
      currentItem = sanitizeItem(rawItem);
    }
  }

  if (!isLeaderboardView && currentItem?.choices_json && live?.active_round_id && normalizedLive?.timer_started_at && normalizedLive?.timer_duration_seconds) {
    const startMs = Date.parse(normalizedLive.timer_started_at);
    const expiresAt = startMs + normalizedLive.timer_duration_seconds * 1000;
    const graceMs = 5000;
    const expired = !Number.isNaN(startMs) && Date.now() > expiresAt + graceMs;
    if (!expired) {
      responseCounts = null;
    } else {
      let choices: string[] = [];
      try {
        const parsed = JSON.parse(currentItem.choices_json);
        if (Array.isArray(parsed)) {
          choices = parsed.filter((choice) => typeof choice === 'string' && choice.trim().length > 0);
        }
      } catch {
        choices = [];
      }
      if (choices.length > 0) {
        const countsRows = await queryAll<{ choice_index: number; total: number }>(
          env,
          `SELECT choice_index, COUNT(*) AS total
         FROM event_item_responses
         WHERE event_id = ?
           AND edition_item_id = ?
           AND COALESCE(deleted, 0) = 0
         GROUP BY choice_index`,
          [event.id, currentItem.id]
        );
        const counts = choices.map((_, idx) => {
          const row = countsRows.find((entry) => Number(entry.choice_index) === idx);
          return row ? row.total : 0;
        });
        responseCounts = { total: counts.reduce((sum, value) => sum + value, 0), counts };
      }
    }
  }

  let data: PublicEventPayload = {
    event,
    rounds,
    teams,
    leaderboard,
    round_scores: roundScores,
    live: normalizedLive,
    current_item: currentItem,
    visual_round: visualRound,
    visual_items: visualItems,
    response_counts: responseCounts
  };

  if (view === 'leaderboard') {
    data = {
      ...data,
      teams: [],
      current_item: null,
      visual_round: false,
      visual_items: [],
      response_counts: null
    };
  }

  return { ok: true, data };
}
