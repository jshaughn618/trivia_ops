CREATE UNIQUE INDEX IF NOT EXISTS games_name_unique
ON games (lower(name))
WHERE COALESCE(deleted, 0) = 0;
