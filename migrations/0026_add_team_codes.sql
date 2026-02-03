ALTER TABLE teams ADD COLUMN team_code TEXT;
ALTER TABLE teams ADD COLUMN team_session_token TEXT;
ALTER TABLE teams ADD COLUMN team_session_updated_at TEXT;

CREATE UNIQUE INDEX idx_teams_event_team_code ON teams(event_id, team_code);
