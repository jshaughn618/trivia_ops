PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  user_type TEXT NOT NULL DEFAULT 'host',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT
);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_settings_json TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT
);

CREATE TABLE editions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  tags_csv TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE edition_items (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  fun_fact TEXT,
  ordinal INTEGER NOT NULL,
  media_type TEXT,
  media_key TEXT,
  media_caption TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (edition_id) REFERENCES editions(id)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  location_id TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

CREATE TABLE event_rounds (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  label TEXT NOT NULL,
  edition_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (edition_id) REFERENCES editions(id)
);

CREATE TABLE event_round_items (
  id TEXT PRIMARY KEY,
  event_round_id TEXT NOT NULL,
  edition_item_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  overridden_prompt TEXT,
  overridden_answer TEXT,
  overridden_fun_fact TEXT,
  created_at TEXT,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (event_round_id) REFERENCES event_rounds(id),
  FOREIGN KEY (edition_item_id) REFERENCES edition_items(id)
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  table_label TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_editions_game_id ON editions(game_id);
CREATE INDEX idx_editions_status ON editions(status);
CREATE INDEX idx_edition_items_edition_id ON edition_items(edition_id);
CREATE INDEX idx_edition_items_ordinal ON edition_items(ordinal);
CREATE INDEX idx_events_starts_at ON events(starts_at);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_event_rounds_event_id ON event_rounds(event_id);
CREATE INDEX idx_event_rounds_round_number ON event_rounds(round_number);
CREATE INDEX idx_teams_event_id ON teams(event_id);
