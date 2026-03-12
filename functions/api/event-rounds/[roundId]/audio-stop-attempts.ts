import type { Env } from '../../../types';
import { jsonOk } from '../../../responses';
import { queryAll } from '../../../db';
import { requireHostOrAdmin, requireRoundAccess } from '../../../access';

type StopAttemptRow = {
  id: string;
  event_id: string;
  event_round_id: string;
  item_ordinal: number;
  team_id: string;
  team_name: string;
  won_race: number;
  attempted_at: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const guard = requireHostOrAdmin(data.user ?? null);
  if (guard) return guard;
  const access = await requireRoundAccess(env, data.user ?? null, params.roundId as string);
  if (access.response) return access.response;

  const rows = await queryAll<StopAttemptRow>(
    env,
    `SELECT id,
            event_id,
            event_round_id,
            item_ordinal,
            team_id,
            team_name,
            won_race,
            attempted_at
     FROM event_audio_stop_attempts
     WHERE event_round_id = ?
       AND COALESCE(deleted, 0) = 0
     ORDER BY item_ordinal ASC, attempted_at ASC, id ASC`,
    [params.roundId]
  );

  return jsonOk(
    rows.map((row) => ({
      ...row,
      won_race: Boolean(row.won_race)
    }))
  );
};
