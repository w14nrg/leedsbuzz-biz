-- Stage 7 reference migration. The Worker also creates these tables automatically with CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS harvest_runs (
  id TEXT PRIMARY KEY, source_key TEXT NOT NULL, started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT, status TEXT NOT NULL DEFAULT 'running', imported_count INTEGER NOT NULL DEFAULT 0,
  error_text TEXT, meta_json TEXT
);
CREATE TABLE IF NOT EXISTS harvest_state (
  key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS harvest_sources (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, publisher TEXT, url TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL DEFAULT 'web', trust_tier TEXT NOT NULL DEFAULT 'C',
  harvest_mode TEXT NOT NULL DEFAULT 'webpage', enabled INTEGER NOT NULL DEFAULT 1,
  refresh_hours INTEGER NOT NULL DEFAULT 168, last_fetched_at TEXT, next_fetch_at TEXT,
  etag TEXT, last_modified TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS harvest_documents (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT, content_hash TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, http_status INTEGER, extract_status TEXT, error_text TEXT,
  FOREIGN KEY(source_id) REFERENCES sources(id)
);
CREATE TABLE IF NOT EXISTS external_entities (
  source_key TEXT NOT NULL, external_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT,
  label TEXT, raw_json TEXT, first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(source_key, external_id)
);
CREATE TABLE IF NOT EXISTS fact_observations (
  id TEXT PRIMARY KEY, claim_key TEXT NOT NULL, entity_type TEXT, entity_id TEXT, title TEXT NOT NULL,
  body TEXT NOT NULL, fact_type TEXT, tags TEXT, source_id TEXT NOT NULL, source_tier TEXT NOT NULL DEFAULT 'C',
  confidence REAL NOT NULL DEFAULT 0.6, content_hash TEXT, observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(claim_key, source_id), FOREIGN KEY(source_id) REFERENCES sources(id)
);
CREATE INDEX IF NOT EXISTS idx_harvest_runs_started ON harvest_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_harvest_sources_due ON harvest_sources(enabled, next_fetch_at);
CREATE INDEX IF NOT EXISTS idx_fact_observations_claim ON fact_observations(claim_key);
CREATE INDEX IF NOT EXISTS idx_external_entities_entity ON external_entities(entity_type, entity_id);
