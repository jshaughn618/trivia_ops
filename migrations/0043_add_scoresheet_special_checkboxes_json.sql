ALTER TABLE events ADD COLUMN scoresheet_special_checkboxes_json TEXT;

UPDATE events
SET scoresheet_special_checkboxes_json = json_array(
  json_object(
    'header', scoresheet_special_checkbox_text,
    'detail', NULL
  )
)
WHERE scoresheet_special_checkbox_text IS NOT NULL
  AND TRIM(scoresheet_special_checkbox_text) <> '';
