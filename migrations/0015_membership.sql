CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  tier TEXT NOT NULL DEFAULT 'blue',
  status TEXT NOT NULL DEFAULT 'active',
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS member_profiles (
  member_id TEXT PRIMARY KEY,
  favourite_current_player TEXT,
  favourite_ever_player TEXT,
  favourite_era TEXT,
  preferred_formation TEXT,
  predicted_finish TEXT,
  favourite_memory TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS member_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS member_magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  return_to TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_member_sessions_member ON member_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_member_magic_email_time ON member_magic_links(email,requested_at);
