CREATE UNIQUE INDEX IF NOT EXISTS teams_event_name_unique
ON teams (event_id, lower(name))
WHERE COALESCE(deleted, 0) = 0;
