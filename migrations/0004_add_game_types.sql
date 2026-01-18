CREATE TABLE game_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  default_settings_json TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT
);

INSERT INTO game_types (id, name, code, default_settings_json, created_at)
VALUES
  ('general', 'General Trivia', 'general', '{"fields":["prompt","answer","fun_fact"],"media":null}', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('audio', 'Audio', 'audio', '{"fields":["prompt","answer_a","answer_b","fun_fact"],"media":"audio"}', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('visual', 'Visual', 'visual', '{"fields":["prompt","answer"],"media":"image"}', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

ALTER TABLE games ADD COLUMN game_type_id TEXT;
UPDATE games SET game_type_id = 'general' WHERE game_type_id IS NULL;

ALTER TABLE edition_items ADD COLUMN answer_a TEXT;
ALTER TABLE edition_items ADD COLUMN answer_b TEXT;
