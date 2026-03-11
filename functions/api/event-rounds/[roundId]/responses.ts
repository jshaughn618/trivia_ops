import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { queryAll, queryFirst } from '../../../db';
import { requireHostOrAdmin, requireRoundAccess } from '../../../access';
import { deriveResponseLabels, normalizeResponseParts } from '../../../response-labels';
import { buildRuntimeGameExampleItem, getGameExampleItemId, parseGameExampleItem } from '../../../game-example-item';

type ParsedResponsePart = { label: string; answer: string };

function parseResponseParts(value: string | null): ParsedResponsePart[] {
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
        return { label, answer } as ParsedResponsePart;
      })
      .filter((entry): entry is ParsedResponsePart => Boolean(entry));
  } catch {
    return [];
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
  if (access.response) return access.response;

  const url = new URL(request.url);
  const itemId = (url.searchParams.get('item_id') ?? '').trim();
  if (!itemId) {
    return jsonError({ code: 'validation_error', message: 'item_id is required.' }, 400);
  }

  const round = await queryFirst<{ event_id: string; game_id: string; example_item_json: string | null }>(
    env,
    `SELECT er.event_id, g.id AS game_id, g.example_item_json
     FROM event_rounds er
     JOIN editions ed ON ed.id = er.edition_id AND COALESCE(ed.deleted, 0) = 0
     JOIN games g ON g.id = ed.game_id AND COALESCE(g.deleted, 0) = 0
     WHERE er.id = ? AND COALESCE(er.deleted, 0) = 0`,
    [params.roundId]
  );

  const exampleItem = parseGameExampleItem(round?.example_item_json);
  if (round && exampleItem && itemId === getGameExampleItemId(round.game_id)) {
    const runtimeExample = buildRuntimeGameExampleItem(round.game_id, round.example_item_json);
    const labels = runtimeExample ? deriveResponseLabels(runtimeExample, { fallbackSingleAnswer: true }) : [];
    const teams = await queryAll<{ id: string; name: string }>(
      env,
      `SELECT id, name
       FROM teams
       WHERE event_id = ? AND COALESCE(deleted, 0) = 0
       ORDER BY name ASC`,
      [round.event_id]
    );

    return jsonOk({
      item_id: itemId,
      labels,
      rows: teams.map((team) => ({
        team_id: team.id,
        team_name: team.name,
        submitted_at: null,
        response_parts: null
      }))
    });
  }

  const item = await queryFirst<{
    event_id: string;
    question_type: string | null;
    media_type: string | null;
    answer_parts_json: string | null;
    answer_a_label: string | null;
    answer_b_label: string | null;
    answer_a: string | null;
    answer_b: string | null;
    game_type_code: string | null;
    game_subtype: string | null;
    allow_participant_audio_stop: number | null;
  }>(
    env,
    `SELECT er.event_id,
            ei.question_type,
            ei.media_type,
            ei.answer_parts_json,
            ei.answer_a_label,
            ei.answer_b_label,
            ei.answer_a,
            ei.answer_b,
            gt.code AS game_type_code,
            g.subtype AS game_subtype,
            g.allow_participant_audio_stop
     FROM event_round_items eri
     JOIN event_rounds er ON er.id = eri.event_round_id AND COALESCE(er.deleted, 0) = 0
     JOIN edition_items ei ON ei.id = eri.edition_item_id AND COALESCE(ei.deleted, 0) = 0
     JOIN editions ed ON ed.id = er.edition_id AND COALESCE(ed.deleted, 0) = 0
     JOIN games g ON g.id = ed.game_id AND COALESCE(g.deleted, 0) = 0
     JOIN game_types gt ON gt.id = g.game_type_id AND COALESCE(gt.deleted, 0) = 0
     WHERE eri.event_round_id = ?
       AND eri.edition_item_id = ?
       AND COALESCE(eri.deleted, 0) = 0`,
    [params.roundId, itemId]
  );

  if (!item) {
    return jsonError({ code: 'not_found', message: 'Item not found in round.' }, 404);
  }
  if (item.question_type === 'multiple_choice') {
    return jsonError({ code: 'invalid_type', message: 'Item does not support text-part submissions.' }, 400);
  }

  const isMusicAudioStopItem =
    item.game_type_code === 'music' &&
    item.game_subtype === 'stop' &&
    Number(item.allow_participant_audio_stop ?? 0) === 1 &&
    item.media_type === 'audio';
  if (isMusicAudioStopItem) {
    return jsonError({ code: 'invalid_type', message: 'Item uses the dedicated audio-stop submission flow.' }, 400);
  }

  const labels = deriveResponseLabels(
    {
      question_type: item.question_type,
      answer_parts_json: item.answer_parts_json,
      answer_a_label: item.answer_a_label,
      answer_b_label: item.answer_b_label,
      answer_a: item.answer_a,
      answer_b: item.answer_b
    },
    { fallbackSingleAnswer: true }
  );

  const teams = await queryAll<{ id: string; name: string }>(
    env,
    `SELECT id, name
     FROM teams
     WHERE event_id = ? AND COALESCE(deleted, 0) = 0
     ORDER BY name ASC`,
    [item.event_id]
  );

  const submissions = await queryAll<{
    team_id: string;
    response_parts_json: string | null;
    submitted_at: string | null;
  }>(
    env,
    `SELECT team_id, response_parts_json, submitted_at
     FROM event_item_responses
     WHERE event_round_id = ?
       AND edition_item_id = ?
       AND COALESCE(deleted, 0) = 0
     ORDER BY submitted_at DESC, updated_at DESC`,
    [params.roundId, itemId]
  );

  const latestByTeam = new Map<string, { response_parts_json: string | null; submitted_at: string | null }>();
  submissions.forEach((submission) => {
    if (latestByTeam.has(submission.team_id)) return;
    latestByTeam.set(submission.team_id, {
      response_parts_json: submission.response_parts_json,
      submitted_at: submission.submitted_at ?? null
    });
  });

  const rows = teams.map((team) => {
    const latest = latestByTeam.get(team.id);
    if (!latest) {
      return {
        team_id: team.id,
        team_name: team.name,
        submitted_at: null as string | null,
        response_parts: null as Array<{ label: string; answer: string }> | null
      };
    }

    const parsed = parseResponseParts(latest.response_parts_json);
    const normalized = normalizeResponseParts(labels, parsed);
    return {
      team_id: team.id,
      team_name: team.name,
      submitted_at: latest.submitted_at ?? null,
      response_parts: normalized
    };
  });

  return jsonOk({
    item_id: itemId,
    labels,
    rows
  });
};
