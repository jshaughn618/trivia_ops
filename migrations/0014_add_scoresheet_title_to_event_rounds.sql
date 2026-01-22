ALTER TABLE event_rounds ADD COLUMN scoresheet_title TEXT;
UPDATE event_rounds SET scoresheet_title = label WHERE scoresheet_title IS NULL;
