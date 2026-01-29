CREATE UNIQUE INDEX IF NOT EXISTS editions_game_edition_number_unique
  ON editions (game_id, edition_number)
  WHERE edition_number IS NOT NULL
    AND COALESCE(deleted, 0) = 0;
