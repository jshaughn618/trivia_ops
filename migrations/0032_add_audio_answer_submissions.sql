ALTER TABLE event_item_responses ADD COLUMN response_parts_json TEXT;
ALTER TABLE event_item_responses ADD COLUMN is_correct INTEGER;
ALTER TABLE event_item_responses ADD COLUMN marked_at TEXT;
ALTER TABLE event_item_responses ADD COLUMN marked_by TEXT;

CREATE INDEX IF NOT EXISTS idx_event_item_responses_round_item
  ON event_item_responses(event_round_id, edition_item_id);
