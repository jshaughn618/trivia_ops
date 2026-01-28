CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  accepted_user_id TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (accepted_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX invites_token_idx ON invites(token);
CREATE INDEX invites_email_idx ON invites(email);
