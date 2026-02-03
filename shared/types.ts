export type Id = string;

export type EditionStatus = 'draft' | 'published' | 'archived';
export type EventStatus = 'planned' | 'live' | 'completed' | 'canceled';
export type EventRoundStatus = 'planned' | 'live' | 'locked' | 'completed';
export type MediaType = 'image' | 'audio';
export type EventType = 'Pub Trivia' | 'Music Trivia';

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError; requestId?: string };

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
  logo_key: string | null;
  logo_name: string | null;
  created_at: string;
};

export type Game = {
  id: Id;
  name: string;
  game_type_id: Id;
  game_code: string | null;
  description: string | null;
  subtype: string | null;
  default_settings_json: string | null;
  show_theme: number | null;
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
  edition_number: number | null;
  title: string;
  description: string | null;
  status: EditionStatus;
  tags_csv: string | null;
  theme: string | null;
  timer_seconds: number;
  created_at: string;
  updated_at: string;
};

export type EditionItem = {
  id: Id;
  edition_id: Id;
  question_type: 'text' | 'multiple_choice';
  choices_json: string | null;
  prompt: string;
  answer: string;
  answer_a: string | null;
  answer_b: string | null;
  answer_a_label: string | null;
  answer_b_label: string | null;
  answer_parts_json: string | null;
  fun_fact: string | null;
  ordinal: number;
  media_type: MediaType | null;
  media_key: string | null;
  media_caption: string | null;
  audio_answer_key: string | null;
  created_at: string;
};

export type Event = {
  id: Id;
  title: string;
  starts_at: string;
  location_id: Id | null;
  host_user_id: Id | null;
  public_code?: string | null;
  status: EventStatus;
  event_type: EventType;
  notes: string | null;
  scoresheet_key: string | null;
  scoresheet_name: string | null;
  answersheet_key: string | null;
  answersheet_name: string | null;
  created_at: string;
};

export type EventRound = {
  id: Id;
  event_id: Id;
  round_number: number;
  label: string;
  scoresheet_title: string | null;
  audio_key: string | null;
  audio_name: string | null;
  timer_seconds: number | null;
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
  waiting_message: string | null;
  waiting_show_leaderboard: boolean;
  waiting_show_next_round: boolean;
  show_full_leaderboard: boolean;
  timer_started_at: string | null;
  timer_duration_seconds: number | null;
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
  team_code: string | null;
  created_at: string;
};

export type EventBootstrap = {
  event: Event;
  rounds: EventRound[];
  teams: Team[];
  editions: GameEdition[];
  locations: Location[];
  games: Game[];
  hosts: User[];
  game_types: GameType[];
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
