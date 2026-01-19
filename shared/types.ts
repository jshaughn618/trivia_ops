export type Id = string;

export type EditionStatus = 'draft' | 'published' | 'archived';
export type EventStatus = 'planned' | 'live' | 'completed' | 'canceled';
export type EventRoundStatus = 'planned' | 'live' | 'locked';
export type MediaType = 'image' | 'audio';

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export type User = {
  id: Id;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  user_type: 'admin' | 'host' | 'player';
  email: string;
  created_at: string;
};

export type Location = {
  id: Id;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  created_at: string;
};

export type Game = {
  id: Id;
  name: string;
  game_type_id: Id;
  description: string | null;
  default_settings_json: string | null;
  created_at: string;
};

export type GameType = {
  id: Id;
  name: string;
  code: string;
  default_settings_json: string | null;
  created_at: string;
};

export type GameEdition = {
  id: Id;
  game_id: Id;
  title: string;
  description: string | null;
  status: EditionStatus;
  tags_csv: string | null;
  theme: string | null;
  created_at: string;
  updated_at: string;
};

export type EditionItem = {
  id: Id;
  edition_id: Id;
  prompt: string;
  answer: string;
  answer_a: string | null;
  answer_b: string | null;
  answer_a_label: string | null;
  answer_b_label: string | null;
  fun_fact: string | null;
  ordinal: number;
  media_type: MediaType | null;
  media_key: string | null;
  media_caption: string | null;
  created_at: string;
};

export type Event = {
  id: Id;
  title: string;
  starts_at: string;
  location_id: Id | null;
  public_code?: string | null;
  status: EventStatus;
  notes: string | null;
  created_at: string;
};

export type EventRound = {
  id: Id;
  event_id: Id;
  round_number: number;
  label: string;
  edition_id: Id;
  status: EventRoundStatus;
  created_at: string;
};

export type EventRoundItem = {
  id: Id;
  event_round_id: Id;
  edition_item_id: Id;
  ordinal: number;
  overridden_prompt: string | null;
  overridden_answer: string | null;
  overridden_fun_fact: string | null;
};

export type EventLiveState = {
  id: Id;
  event_id: Id;
  active_round_id: Id | null;
  current_item_ordinal: number | null;
  reveal_answer: boolean;
  reveal_fun_fact: boolean;
  updated_at: string;
};

export type EventRoundScore = {
  id: Id;
  event_round_id: Id;
  team_id: Id;
  score: number;
};

export type Team = {
  id: Id;
  event_id: Id;
  name: string;
  table_label: string | null;
  created_at: string;
};

export type Session = {
  id: Id;
  user_id: Id;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  ip: string | null;
};
