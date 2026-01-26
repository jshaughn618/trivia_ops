ALTER TABLE games ADD COLUMN show_theme INTEGER NOT NULL DEFAULT 1;
UPDATE games SET show_theme = 1 WHERE show_theme IS NULL;
