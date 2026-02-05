import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { parseJson } from '../../../request';
import { eventRoundUpdateSchema } from '../../../../shared/validators';
import { execute, nowIso, queryAll, queryFirst } from '../../../db';
import { requireAdmin, requireHostOrAdmin, requireRoundAccess } from '../../../access';

const normalizeAnswer = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const onRequestPut: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const isAdmin = data.user?.user_type === 'admin';
  const guard = isAdmin ? null : requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  if (!isAdmin) {
    const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
    if (access.response) return access.response;
  }
  const payload = await parseJson(request);
  const parsed = eventRoundUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid round update', details: parsed.error.flatten() }, 400);
  }
  if (!isAdmin) {
    const forbiddenFields: Array<keyof typeof parsed.data> = [
      'round_number',
      'label',
      'scoresheet_title',
      'edition_id',
      'audio_key',
      'audio_name'
    ];
    if (parsed.data.status === undefined) {
      return jsonError({ code: 'forbidden', message: 'Hosts can only update round status.' }, 403);
    }
    const hasForbidden = forbiddenFields.some((field) => parsed.data[field] !== undefined);
    if (hasForbidden) {
      return jsonError({ code: 'forbidden', message: 'Hosts can only update round status.' }, 403);
    }
  }

  const existing = await queryFirst(env, 'SELECT * FROM event_rounds WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.roundId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Round not found' }, 404);
  }

  const merged = {
    ...existing,
    ...parsed.data,
    scoresheet_title: parsed.data.scoresheet_title ?? existing.scoresheet_title ?? existing.label
  };
  await execute(
    env,
    `UPDATE event_rounds
     SET round_number = ?, label = ?, scoresheet_title = ?, edition_id = ?, status = ?, audio_key = ?, audio_name = ?
     WHERE id = ?`,
    [
      merged.round_number,
      merged.label,
      merged.scoresheet_title,
      merged.edition_id,
      merged.status,
      merged.audio_key ?? null,
      merged.audio_name ?? null,
      params.roundId
    ]
  );

  const isCompleting = (existing.status !== 'completed' && existing.status !== 'locked') &&
    (merged.status === 'completed' || merged.status === 'locked');
  if (isCompleting) {
    const roundItems = await queryAll<{
      edition_item_id: string;
      question_type: string | null;
      answer: string | null;
    }>(
      env,
      `SELECT eri.edition_item_id,
              ei.question_type,
              COALESCE(eri.overridden_answer, ei.answer) AS answer
       FROM event_round_items eri
       JOIN edition_items ei ON ei.id = eri.edition_item_id
       WHERE eri.event_round_id = ? AND COALESCE(eri.deleted, 0) = 0 AND COALESCE(ei.deleted, 0) = 0`,
      [params.roundId]
    );

    const mcItems = roundItems.filter((item) => item.question_type === 'multiple_choice');
    if (mcItems.length > 0) {
      const teams = await queryAll<{ id: string }>(
        env,
        'SELECT id FROM teams WHERE event_id = ? AND COALESCE(deleted, 0) = 0',
        [existing.event_id]
      );

      const responses = await queryAll<{
        team_id: string;
        edition_item_id: string;
        choice_text: string | null;
      }>(
        env,
        `SELECT team_id, edition_item_id, choice_text
         FROM event_item_responses
         WHERE event_id = ?
           AND event_round_id = ?
           AND COALESCE(deleted, 0) = 0`,
        [existing.event_id, params.roundId]
      );

      const responsesByTeam = new Map<string, Map<string, string>>();
      for (const response of responses) {
        if (!response.team_id || !response.edition_item_id) continue;
        const teamMap = responsesByTeam.get(response.team_id) ?? new Map<string, string>();
        teamMap.set(response.edition_item_id, response.choice_text ?? '');
        responsesByTeam.set(response.team_id, teamMap);
      }

      const now = nowIso();
      for (const team of teams) {
        const teamResponses = responsesByTeam.get(team.id) ?? new Map<string, string>();
        let score = 0;
        for (const item of mcItems) {
          const answer = normalizeAnswer(item.answer);
          const response = normalizeAnswer(teamResponses.get(item.edition_item_id));
          if (answer && response && answer === response) {
            score += 1;
          }
        }

        const existingScore = await queryFirst<{ id: string; deleted: number }>(
          env,
          `SELECT id, deleted FROM event_round_scores
           WHERE event_round_id = ? AND team_id = ?`,
          [params.roundId, team.id]
        );

        if (existingScore) {
          await execute(
            env,
            `UPDATE event_round_scores
             SET score = ?, updated_at = ?, deleted = 0, deleted_at = NULL, deleted_by = NULL
             WHERE id = ?`,
            [score, now, existingScore.id]
          );
        } else {
          await execute(
            env,
            `INSERT INTO event_round_scores
             (id, event_round_id, team_id, score, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), params.roundId, team.id, score, now, now]
          );
        }
      }
    }
  }

  const event = await queryFirst<{ id: string; status: string }>(
    env,
    'SELECT id, status FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [existing.event_id]
  );
  if (event && event.status !== 'canceled') {
    const roundStatuses = await queryAll<{ status: string }>(
      env,
      'SELECT status FROM event_rounds WHERE event_id = ? AND COALESCE(deleted, 0) = 0',
      [existing.event_id]
    );
    const statuses = roundStatuses.map((round) => round.status);
    const anyNotCompleted = statuses.some((status) => status !== 'completed' && status !== 'locked');
    const anyLive = statuses.some((status) => status === 'live');
    let nextStatus: string | null = null;
    if (anyLive) {
      nextStatus = 'live';
    } else if (event.status === 'completed' && anyNotCompleted) {
      nextStatus = 'live';
    }
    if (nextStatus && nextStatus !== event.status) {
      await execute(
        env,
        'UPDATE events SET status = ?, updated_at = ? WHERE id = ?',
        [nextStatus, nowIso(), existing.event_id]
      );
    }
  }

  const row = await queryFirst(
    env,
    `SELECT er.*, ed.timer_seconds,
            ed.speed_round_audio_key AS edition_audio_key,
            ed.speed_round_audio_name AS edition_audio_name
     FROM event_rounds er
     JOIN editions ed ON ed.id = er.edition_id
     WHERE er.id = ? AND COALESCE(er.deleted, 0) = 0`,
    [params.roundId]
  );
  return jsonOk(row);
};

export const onRequestDelete: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;
  const existing = await queryFirst(env, 'SELECT id FROM event_rounds WHERE id = ? AND COALESCE(deleted, 0) = 0', [params.roundId]);
  if (!existing) {
    return jsonError({ code: 'not_found', message: 'Round not found' }, 404);
  }
  const now = nowIso();
  await execute(
    env,
    'UPDATE event_rounds SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?',
    [now, now, params.roundId]
  );
  return jsonOk({ ok: true });
};
