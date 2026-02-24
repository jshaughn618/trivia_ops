ALTER TABLE event_item_responses ADD COLUMN ai_grade_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE event_item_responses ADD COLUMN ai_grade_json TEXT;
ALTER TABLE event_item_responses ADD COLUMN ai_graded_at TEXT;
ALTER TABLE event_item_responses ADD COLUMN ai_grade_error TEXT;
ALTER TABLE event_item_responses ADD COLUMN approved_points REAL;
ALTER TABLE event_item_responses ADD COLUMN approved_at TEXT;
ALTER TABLE event_item_responses ADD COLUMN approved_by TEXT;

