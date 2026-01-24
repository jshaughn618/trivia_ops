ALTER TABLE editions ADD COLUMN timer_seconds INTEGER NOT NULL DEFAULT 15;

ALTER TABLE edition_items ADD COLUMN question_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE edition_items ADD COLUMN choices_json TEXT;

ALTER TABLE event_live_state ADD COLUMN timer_started_at TEXT;
ALTER TABLE event_live_state ADD COLUMN timer_duration_seconds INTEGER;

CREATE TABLE event_item_responses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_round_id TEXT NOT NULL,
  edition_item_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  choice_index INTEGER,
  choice_text TEXT,
  submitted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (event_round_id) REFERENCES event_rounds(id),
  FOREIGN KEY (edition_item_id) REFERENCES edition_items(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE UNIQUE INDEX idx_event_item_responses_unique
  ON event_item_responses(event_id, team_id, edition_item_id);
