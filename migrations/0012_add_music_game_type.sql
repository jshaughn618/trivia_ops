ALTER TABLE games ADD COLUMN subtype TEXT;

INSERT OR IGNORE INTO game_types (id, name, code, default_settings_json, created_at)
VALUES (
  'music',
  'Music',
  'music',
  '{"fields":["prompt","answer","fun_fact"],"media":"audio"}',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);

