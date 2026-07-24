PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT,
  url TEXT NOT NULL UNIQUE,
  published_at TEXT,
  source_type TEXT NOT NULL DEFAULT 'web',
  license_note TEXT,
  verified INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  birth_date TEXT,
  nationality TEXT,
  primary_position TEXT,
  first_team_debut TEXT,
  last_appearance TEXT,
  appearances INTEGER,
  starts INTEGER,
  substitute_appearances INTEGER,
  goals INTEGER,
  assists INTEGER,
  clean_sheets INTEGER,
  is_current INTEGER NOT NULL DEFAULT 0,
  true_blue_eligible INTEGER NOT NULL DEFAULT 0,
  avatar_tier TEXT NOT NULL DEFAULT 'archive',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  UNIQUE(player_id, alias),
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_sources (
  player_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY(player_id, source_id),
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  full_name TEXT NOT NULL,
  nationality TEXT,
  started_on TEXT,
  ended_on TEXT,
  is_interim INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  start_year INTEGER NOT NULL,
  end_year INTEGER NOT NULL,
  manager_id TEXT,
  league_name TEXT,
  league_position INTEGER,
  notes TEXT,
  FOREIGN KEY(manager_id) REFERENCES managers(id)
);

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  competition_type TEXT,
  governing_body TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  played_at TEXT,
  season_id TEXT,
  competition_id TEXT,
  round_name TEXT,
  venue TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  went_to_extra_time INTEGER NOT NULL DEFAULT 0,
  went_to_penalties INTEGER NOT NULL DEFAULT 0,
  penalty_home INTEGER,
  penalty_away INTEGER,
  attendance INTEGER,
  source_id TEXT,
  FOREIGN KEY(season_id) REFERENCES seasons(id),
  FOREIGN KEY(competition_id) REFERENCES competitions(id),
  FOREIGN KEY(source_id) REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  team_side TEXT NOT NULL DEFAULT 'leeds',
  starter INTEGER NOT NULL DEFAULT 0,
  shirt_number TEXT,
  position TEXT,
  minute_on INTEGER,
  minute_off INTEGER,
  PRIMARY KEY(match_id, player_id),
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  player_id TEXT,
  event_type TEXT NOT NULL,
  minute INTEGER,
  stoppage_minute INTEGER,
  detail TEXT,
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS honours (
  id TEXT PRIMARY KEY,
  competition_id TEXT,
  season_id TEXT,
  honour_name TEXT NOT NULL,
  won_on TEXT,
  notes TEXT,
  source_id TEXT,
  FOREIGN KEY(competition_id) REFERENCES competitions(id),
  FOREIGN KEY(season_id) REFERENCES seasons(id),
  FOREIGN KEY(source_id) REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS player_honours (
  player_id TEXT NOT NULL,
  honour_id TEXT NOT NULL,
  PRIMARY KEY(player_id, honour_id),
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY(honour_id) REFERENCES honours(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  holder_type TEXT,
  holder_id TEXT,
  value_text TEXT NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  source_id TEXT,
  verified INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(source_id) REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  fact_type TEXT NOT NULL DEFAULT 'fact',
  entity_type TEXT,
  entity_id TEXT,
  tags TEXT,
  source_id TEXT,
  verified INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id) REFERENCES sources(id)
);

-- Membership/authentication layer. Kept here in its final shape so a fresh database
-- remains compatible with the later idempotent membership migration.
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

CREATE TABLE IF NOT EXISTS player_ratings (
  member_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  overall INTEGER NOT NULL CHECK(overall BETWEEN 1 AND 100),
  ability INTEGER CHECK(ability BETWEEN 1 AND 100),
  big_game INTEGER CHECK(big_game BETWEEN 1 AND 100),
  longevity INTEGER CHECK(longevity BETWEEN 1 AND 100),
  leadership INTEGER CHECK(leadership BETWEEN 1 AND 100),
  legend_status INTEGER CHECK(legend_status BETWEEN 1 AND 100),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(member_id, player_id),
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_players_name ON players(full_name);
CREATE INDEX IF NOT EXISTS idx_players_goals ON players(goals DESC);
CREATE INDEX IF NOT EXISTS idx_players_appearances ON players(appearances DESC);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON player_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(played_at);
CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entity ON knowledge_chunks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_verified ON knowledge_chunks(verified, updated_at);
CREATE INDEX IF NOT EXISTS idx_ratings_player ON player_ratings(player_id);
