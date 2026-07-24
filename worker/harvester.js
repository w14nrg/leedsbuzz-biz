import { harvestWikidataPlayers } from './adapters/wikidata.js';
import { harvestFootballData } from './adapters/football-data.js';
import { harvestCuratedWebSource } from './adapters/curated-web.js';
import { harvestOpenFootballHistory } from './adapters/openfootball-history.js';
import { harvestWikidataManagers } from './adapters/wikidata-managers.js';
import { harvestWikidataHonours } from './adapters/wikidata-honours.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS harvest_runs (
    id TEXT PRIMARY KEY,
    source_key TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    imported_count INTEGER NOT NULL DEFAULT 0,
    error_text TEXT,
    meta_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS harvest_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS harvest_sources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    publisher TEXT,
    url TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL DEFAULT 'web',
    trust_tier TEXT NOT NULL DEFAULT 'C',
    harvest_mode TEXT NOT NULL DEFAULT 'webpage',
    enabled INTEGER NOT NULL DEFAULT 1,
    refresh_hours INTEGER NOT NULL DEFAULT 168,
    last_fetched_at TEXT,
    next_fetch_at TEXT,
    etag TEXT,
    last_modified TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS harvest_documents (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    content_hash TEXT,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    http_status INTEGER,
    extract_status TEXT,
    error_text TEXT,
    FOREIGN KEY(source_id) REFERENCES sources(id)
  )`,
  `CREATE TABLE IF NOT EXISTS external_entities (
    source_key TEXT NOT NULL,
    external_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    label TEXT,
    raw_json TEXT,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(source_key, external_id)
  )`,
  `CREATE TABLE IF NOT EXISTS fact_observations (
    id TEXT PRIMARY KEY,
    claim_key TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    fact_type TEXT,
    tags TEXT,
    source_id TEXT NOT NULL,
    source_tier TEXT NOT NULL DEFAULT 'C',
    confidence REAL NOT NULL DEFAULT 0.6,
    content_hash TEXT,
    observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(claim_key, source_id),
    FOREIGN KEY(source_id) REFERENCES sources(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_harvest_runs_started ON harvest_runs(started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_harvest_sources_due ON harvest_sources(enabled, next_fetch_at)`,
  `CREATE INDEX IF NOT EXISTS idx_fact_observations_claim ON fact_observations(claim_key)`,
  `CREATE INDEX IF NOT EXISTS idx_external_entities_entity ON external_entities(entity_type, entity_id)`
];

const DEFAULT_SOURCES = [
  {
    id: 'provider-wikidata', title: 'Wikidata Leeds United F.C. entity graph', publisher: 'Wikidata',
    url: 'https://www.wikidata.org/wiki/Q1128631', sourceType: 'structured-open-data', trustTier: 'C', harvestMode: 'wikidata', refreshHours: 24,
    license: 'Wikidata structured data is available under CC0; individual statements should be checked against stronger football sources.'
  },
  {
    id: 'provider-football-data', title: 'football-data.org API', publisher: 'football-data.org',
    url: 'https://www.football-data.org/', sourceType: 'football-api', trustTier: 'B', harvestMode: 'football-data', refreshHours: 6,
    license: 'Used through the provider API subject to the account and provider terms.'
  },
  {
    id: 'provider-openfootball-england', title: 'OpenFootball England / football.json', publisher: 'OpenFootball',
    url: 'https://github.com/openfootball/football.json', sourceType: 'structured-open-data', trustTier: 'B', harvestMode: 'openfootball-history', refreshHours: 168,
    license: 'OpenFootball datasets are published by the project for open reuse.'
  },
  {
    id: 'official-leeds-squad', title: 'Leeds United men’s squad', publisher: 'Leeds United Football Club',
    url: 'https://www.leedsunited.com/en/teams/men', sourceType: 'official-club', trustTier: 'A', harvestMode: 'webpage', refreshHours: 24
  },
  {
    id: 'official-leeds-honours', title: 'Leeds United honours', publisher: 'Leeds United Football Club',
    url: 'https://www.leedsunited.com/en/club-honours', sourceType: 'official-club', trustTier: 'A', harvestMode: 'webpage', refreshHours: 720
  },
  {
    id: 'trusted-wikipedia-players', title: 'List of Leeds United F.C. players', publisher: 'Wikipedia contributors',
    url: 'https://en.wikipedia.org/wiki/List_of_Leeds_United_F.C._players', sourceType: 'structured-reference', trustTier: 'B', harvestMode: 'webpage', refreshHours: 168,
    license: 'Wikipedia material is attributed to its contributors; official and specialist sources take precedence.'
  },
  {
    id: 'trusted-wikipedia-club', title: 'Leeds United F.C. history reference', publisher: 'Wikipedia contributors',
    url: 'https://en.wikipedia.org/wiki/Leeds_United_F.C.', sourceType: 'structured-reference', trustTier: 'C', harvestMode: 'webpage', refreshHours: 720
  }
];

export async function ensureHarvesterSchema(db) {
  await db.batch(SCHEMA.map(sql => db.prepare(sql)));
  await seedDefaultSources(db);
}

export async function seedDefaultSources(db) {
  const statements = [];
  for (const s of DEFAULT_SOURCES) {
    statements.push(db.prepare(`INSERT INTO sources (id,title,publisher,url,source_type,license_note,verified,updated_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(url) DO UPDATE SET title=excluded.title,publisher=excluded.publisher,source_type=excluded.source_type,license_note=COALESCE(excluded.license_note,sources.license_note),updated_at=CURRENT_TIMESTAMP`)
      .bind(s.id, s.title, s.publisher || null, s.url, s.sourceType, s.license || null, s.trustTier === 'A' || s.trustTier === 'B' ? 1 : 0));
    statements.push(db.prepare(`INSERT INTO harvest_sources (id,title,publisher,url,source_type,trust_tier,harvest_mode,enabled,refresh_hours,next_fetch_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(url) DO UPDATE SET title=excluded.title,publisher=excluded.publisher,source_type=excluded.source_type,trust_tier=excluded.trust_tier,harvest_mode=excluded.harvest_mode,refresh_hours=excluded.refresh_hours,updated_at=CURRENT_TIMESTAMP`)
      .bind(s.id, s.title, s.publisher || null, s.url, s.sourceType, s.trustTier, s.harvestMode, 1, s.refreshHours));
  }
  await db.batch(statements);
}

export async function runScheduledHarvest(env, options = {}) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  await ensureHarvesterSchema(env.BLUE_ARCHIVE);
  const results = [];

  results.push(await runHarvestJob(env, 'wikidata-players', () => harvestWikidataPlayers(env)));
  results.push(await runHarvestJob(env, 'wikidata-managers', () => harvestWikidataManagers(env)));
  results.push(await runHarvestJob(env, 'wikidata-honours', () => harvestWikidataHonours(env)));

  if (env.FOOTBALL_DATA_API_KEY) {
    results.push(await runHarvestJob(env, 'football-data', () => harvestFootballData(env)));
  } else {
    results.push({ source: 'football-data', status: 'skipped', reason: 'FOOTBALL_DATA_API_KEY not configured' });
  }

  const due = await env.BLUE_ARCHIVE.prepare(`
    SELECT * FROM harvest_sources
    WHERE enabled=1 AND harvest_mode='webpage'
      AND (next_fetch_at IS NULL OR datetime(next_fetch_at) <= datetime('now'))
    ORDER BY CASE trust_tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, coalesce(last_fetched_at,'1900-01-01') ASC
    LIMIT ?
  `).bind(options.webLimit || 1).all();

  for (const source of due.results || []) {
    results.push(await runHarvestJob(env, `web:${source.id}`, () => harvestCuratedWebSource(env, source)));
  }

  return { ok: true, ranAt: new Date().toISOString(), results };
}

export async function runHarvestByName(env, name) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  await ensureHarvesterSchema(env.BLUE_ARCHIVE);
  if (name === 'wikidata' || name === 'wikidata-players') return runHarvestJob(env, 'wikidata-players', () => harvestWikidataPlayers(env));
  if (name === 'wikidata-managers') return runHarvestJob(env, 'wikidata-managers', () => harvestWikidataManagers(env));
  if (name === 'wikidata-honours') return runHarvestJob(env, 'wikidata-honours', () => harvestWikidataHonours(env));
  if (name === 'openfootball-history') return runHarvestJob(env, 'openfootball-history', () => harvestOpenFootballHistory(env));
  if (name === 'football-data') return runHarvestJob(env, 'football-data', () => harvestFootballData(env));
  if (name?.startsWith('web:')) {
    const id = name.slice(4);
    const source = await env.BLUE_ARCHIVE.prepare(`SELECT * FROM harvest_sources WHERE id=?`).bind(id).first();
    if (!source) throw new Error('Unknown web source');
    return runHarvestJob(env, name, () => harvestCuratedWebSource(env, source));
  }
  if (name === 'all') {
    const core = await runScheduledHarvest(env, { webLimit: 2 });
    const history = await runHarvestJob(env, 'openfootball-history', () => harvestOpenFootballHistory(env));
    return { ...core, history };
  }
  throw new Error('Unknown harvester');
}

async function runHarvestJob(env, sourceKey, fn) {
  const id = crypto.randomUUID();
  await env.BLUE_ARCHIVE.prepare(`INSERT INTO harvest_runs (id,source_key,status) VALUES (?,?, 'running')`).bind(id, sourceKey).run();
  try {
    const result = await fn();
    const imported = Number(result?.imported || result?.count || 0);
    await env.BLUE_ARCHIVE.prepare(`UPDATE harvest_runs SET finished_at=CURRENT_TIMESTAMP,status='success',imported_count=?,meta_json=? WHERE id=?`)
      .bind(imported, JSON.stringify(result || {}), id).run();
    return { source: sourceKey, status: 'success', ...result };
  } catch (error) {
    await env.BLUE_ARCHIVE.prepare(`UPDATE harvest_runs SET finished_at=CURRENT_TIMESTAMP,status='error',error_text=? WHERE id=?`)
      .bind(String(error?.message || error).slice(0, 1200), id).run();
    return { source: sourceKey, status: 'error', error: String(error?.message || error) };
  }
}

export async function getArchiveStats(db) {
  await ensureHarvesterSchema(db);
  const [players, managers, matches, seasons, honours, facts, sources, runs, observations] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS c FROM players`),
    db.prepare(`SELECT COUNT(*) AS c FROM managers`),
    db.prepare(`SELECT COUNT(*) AS c FROM matches`),
    db.prepare(`SELECT COUNT(*) AS c FROM seasons`),
    db.prepare(`SELECT COUNT(*) AS c FROM honours`),
    db.prepare(`SELECT COUNT(*) AS c FROM knowledge_chunks`),
    db.prepare(`SELECT COUNT(*) AS c FROM sources`),
    db.prepare(`SELECT COUNT(*) AS c FROM harvest_runs`),
    db.prepare(`SELECT COUNT(*) AS c FROM fact_observations`)
  ]);
  const latest = await db.prepare(`SELECT source_key,status,imported_count,started_at,finished_at,error_text FROM harvest_runs ORDER BY started_at DESC LIMIT 8`).all();
  return {
    counts: {
      players: countOf(players), managers: countOf(managers), matches: countOf(matches), seasons: countOf(seasons), honours: countOf(honours),
      facts: countOf(facts), sources: countOf(sources), harvestRuns: countOf(runs), observations: countOf(observations)
    },
    latestHarvests: latest.results || []
  };
}

function countOf(result) {
  return Number(result?.results?.[0]?.c || 0);
}

export async function getState(db, key, fallback = null) {
  const row = await db.prepare(`SELECT value FROM harvest_state WHERE key=?`).bind(key).first();
  return row?.value ?? fallback;
}

export async function setState(db, key, value) {
  await db.prepare(`INSERT INTO harvest_state (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(key, String(value)).run();
}

export async function upsertKnowledgeFact(db, fact, source) {
  const claimKey = fact.claim_key || `${fact.entity_type || 'club'}:${fact.entity_id || 'leeds'}:${slugify(fact.title || fact.body.slice(0, 80))}`;
  const observationId = `obs-${hashString(`${source.id}|${claimKey}`)}`;
  const knowledgeId = `harvest-${hashString(claimKey)}`;
  const trust = source.trust_tier || 'C';
  const verified = trust === 'A' || trust === 'B' ? 1 : 0;
  const body = String(fact.body || '').trim().slice(0, 1800);
  const title = String(fact.title || 'Archive fact').trim().slice(0, 240);
  if (!body) return false;
  const tags = Array.isArray(fact.tags) ? fact.tags.join(',') : String(fact.tags || '');
  const confidence = Math.max(0, Math.min(1, Number(fact.confidence ?? (trust === 'A' ? 0.95 : trust === 'B' ? 0.85 : 0.65))));
  const contentHash = hashString(`${title}|${body}`);

  await db.batch([
    db.prepare(`INSERT INTO fact_observations (id,claim_key,entity_type,entity_id,title,body,fact_type,tags,source_id,source_tier,confidence,content_hash,observed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(claim_key,source_id) DO UPDATE SET title=excluded.title,body=excluded.body,fact_type=excluded.fact_type,tags=excluded.tags,source_tier=excluded.source_tier,confidence=excluded.confidence,content_hash=excluded.content_hash,observed_at=CURRENT_TIMESTAMP`)
      .bind(observationId, claimKey, fact.entity_type || null, fact.entity_id || null, title, body, fact.fact_type || 'fact', tags || null, source.id, trust, confidence, contentHash),
    db.prepare(`INSERT INTO knowledge_chunks (id,title,body,fact_type,entity_type,entity_id,tags,source_id,verified,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        title=CASE WHEN excluded.verified >= knowledge_chunks.verified THEN excluded.title ELSE knowledge_chunks.title END,
        body=CASE WHEN excluded.verified >= knowledge_chunks.verified THEN excluded.body ELSE knowledge_chunks.body END,
        fact_type=CASE WHEN excluded.verified >= knowledge_chunks.verified THEN excluded.fact_type ELSE knowledge_chunks.fact_type END,
        entity_type=COALESCE(knowledge_chunks.entity_type,excluded.entity_type),
        entity_id=COALESCE(knowledge_chunks.entity_id,excluded.entity_id),
        tags=CASE WHEN excluded.verified >= knowledge_chunks.verified THEN excluded.tags ELSE knowledge_chunks.tags END,
        source_id=CASE WHEN excluded.verified >= knowledge_chunks.verified THEN excluded.source_id ELSE knowledge_chunks.source_id END,
        verified=MAX(knowledge_chunks.verified,excluded.verified),
        updated_at=CURRENT_TIMESTAMP`)
      .bind(knowledgeId, title, body, fact.fact_type || 'fact', fact.entity_type || null, fact.entity_id || null, tags || null, source.id, verified)
  ]);
  return true;
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'unknown';
}

export function hashString(value) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h1 ^= value.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0');
}

export async function markSourceFetched(db, source, responseMeta = {}) {
  const hours = Number(source.refresh_hours || 168);
  await db.prepare(`UPDATE harvest_sources SET last_fetched_at=CURRENT_TIMESTAMP,
    next_fetch_at=datetime('now', ?), etag=COALESCE(?,etag), last_modified=COALESCE(?,last_modified), updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(`+${hours} hours`, responseMeta.etag || null, responseMeta.lastModified || null, source.id).run();
}
