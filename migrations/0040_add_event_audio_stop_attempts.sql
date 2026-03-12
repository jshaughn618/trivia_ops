CREATE TABLE event_audio_stop_attempts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_round_id TEXT NOT NULL,
  item_ordinal INTEGER NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  won_race INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (event_round_id) REFERENCES event_rounds(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE INDEX idx_event_audio_stop_attempts_round_item_time
  ON event_audio_stop_attempts(event_round_id, item_ordinal, attempted_at);

CREATE INDEX idx_event_audio_stop_attempts_round_team
  ON event_audio_stop_attempts(event_round_id, team_id);
