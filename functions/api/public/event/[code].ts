import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { normalizeCode } from '../../../public';
import { queryAll, queryFirst } from '../../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const code = normalizeCode(params.code as string);
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
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }

  const rounds = await queryAll<{ id: string; round_number: number; label: string; status: string }>(
    env,
    'SELECT id, round_number, label, status FROM event_rounds WHERE event_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY round_number ASC',
    [event.id]
  );

  const teams = await queryAll<{ id: string; name: string }>(
    env,
    'SELECT id, name FROM teams WHERE event_id = ? AND COALESCE(deleted, 0) = 0 ORDER BY created_at ASC',
    [event.id]
  );

  const leaderboard = await queryAll<{ team_id: string; name: string; total: number }>(
    env,
    `SELECT t.id AS team_id, t.name, COALESCE(SUM(s.score), 0) AS total
     FROM teams t
     LEFT JOIN event_round_scores s ON s.team_id = t.id AND COALESCE(s.deleted, 0) = 0
     LEFT JOIN event_rounds r ON r.id = s.event_round_id
     WHERE t.event_id = ? AND COALESCE(t.deleted, 0) = 0
     GROUP BY t.id
     ORDER BY total DESC, t.name ASC`,
    [event.id]
  );

  const roundScores = await queryAll<{ event_round_id: string; team_id: string; score: number }>(
    env,
    `SELECT event_round_id, team_id, score
     FROM event_round_scores
     WHERE COALESCE(deleted, 0) = 0
       AND event_round_id IN (
         SELECT id FROM event_rounds WHERE event_id = ? AND COALESCE(deleted, 0) = 0
       )`,
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
    timer_started_at: string | null;
    timer_duration_seconds: number | null;
    updated_at: string;
  }>(
    env,
    `SELECT id, event_id, active_round_id, current_item_ordinal, reveal_answer, reveal_fun_fact,
            waiting_message, waiting_show_leaderboard, waiting_show_next_round, timer_started_at, timer_duration_seconds, updated_at
     FROM event_live_state WHERE event_id = ? AND COALESCE(deleted, 0) = 0`,
    [event.id]
  );

  let currentItem = null;
  let visualRound = false;
  let visualItems: Array<{
    id: string;
    prompt: string;
    answer: string;
    answer_a: string | null;
    answer_b: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    fun_fact: string | null;
    media_type: string | null;
    media_key: string | null;
    audio_answer_key: string | null;
    ordinal: number;
  }> = [];

  if (live?.active_round_id) {
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
          COALESCE(eri.overridden_fun_fact, ei.fun_fact) AS fun_fact,
          ei.media_type,
          ei.media_key,
          ei.audio_answer_key,
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
        visualItems = imageItems;
      }
    }
  }
  if (live?.active_round_id && live.current_item_ordinal) {
    currentItem = await queryFirst(
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
  }

  return jsonOk({
    event,
    rounds,
    teams,
    leaderboard,
    round_scores: roundScores,
    live: live
      ? {
          ...live,
          reveal_answer: Boolean(live.reveal_answer),
          reveal_fun_fact: Boolean(live.reveal_fun_fact),
          waiting_message: live.waiting_message ?? null,
          waiting_show_leaderboard: Boolean(live.waiting_show_leaderboard),
          waiting_show_next_round: Boolean(live.waiting_show_next_round),
          timer_started_at: live.timer_started_at ?? null,
          timer_duration_seconds: live.timer_duration_seconds ?? null
        }
      : null,
    current_item: currentItem,
    visual_round: visualRound,
    visual_items: visualItems
  });
};
