ALTER TABLE events ADD COLUMN host_user_id TEXT;
CREATE INDEX idx_events_host_user_id ON events(host_user_id);
