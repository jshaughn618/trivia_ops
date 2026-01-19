ALTER TABLE events ADD COLUMN public_code TEXT;
UPDATE events SET public_code = substr(hex(randomblob(3)), 1, 6) WHERE public_code IS NULL;
CREATE UNIQUE INDEX idx_events_public_code ON events(public_code);

CREATE TABLE event_live_state (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  active_round_id TEXT,
  current_item_ordinal INTEGER,
  reveal_answer INTEGER NOT NULL DEFAULT 0,
  reveal_fun_fact INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE event_round_scores (
  id TEXT PRIMARY KEY,
  event_round_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (event_round_id) REFERENCES event_rounds(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE UNIQUE INDEX idx_event_round_scores_round_team ON event_round_scores(event_round_id, team_id);
CREATE INDEX idx_event_round_scores_round_id ON event_round_scores(event_round_id);
CREATE INDEX idx_event_round_scores_team_id ON event_round_scores(team_id);
