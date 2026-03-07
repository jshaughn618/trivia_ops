ALTER TABLE events ADD COLUMN include_scoresheet_event_name INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN include_scoresheet_date INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN include_scoresheet_location INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN include_scoresheet_event_code INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN include_scoresheet_team_code INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN include_scoresheet_qr_code INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN include_scoresheet_upcoming_events INTEGER NOT NULL DEFAULT 1;
