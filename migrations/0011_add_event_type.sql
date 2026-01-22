ALTER TABLE events ADD COLUMN event_type TEXT;
UPDATE events SET event_type = 'Pub Trivia' WHERE event_type IS NULL;
