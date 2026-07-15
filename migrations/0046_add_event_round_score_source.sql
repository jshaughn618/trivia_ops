ALTER TABLE event_round_scores
ADD COLUMN score_source TEXT NOT NULL DEFAULT 'manual';
