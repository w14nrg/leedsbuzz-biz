const RADAR_STAGES = [
  { stage: 1, key: 'rumour', label: 'Rumour', minScore: 0 },
  { stage: 2, key: 'interest', label: 'Reported interest', minScore: 35 },
  { stage: 3, key: 'credible', label: 'Credible', minScore: 52 },
  { stage: 4, key: 'advanced', label: 'Advanced', minScore: 70 },
  { stage: 5, key: 'imminent', label: 'Imminent', minScore: 86 },
  { stage: 6, key: 'completed', label: 'Completed', minScore: 96 },
];

const DEFAULT_SOURCES = [
  { handle: 'LUFC', name: 'Leeds United', tier: 'official', weight: 100, official: 1 },
  { handle: 'David_Ornstein', name: 'David Ornstein', tier: 'elite', weight: 96, official: 0 },
  { handle: 'FabrizioRomano', name: 'Fabrizio Romano', tier: 'elite', weight: 94, official: 0 },
  { handle: 'PhilHay_', name: 'Phil Hay', tier: 'trusted', weight: 92, official: 0 },
  { handle: 'GrahamSmyth', name: 'Graham Smyth', tier: 'trusted', weight: 89, official: 0 },
  { handle: 'apopey', name: 'Adam Pope', tier: 'trusted', weight: 88, official: 0 },
  { handle: 'JoeDonnohue', name: 'Joe Donnohue', tier: 'trusted', weight: 84, official: 0 },
];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS transfer_sources (
    handle TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'trusted',
    weight INTEGER NOT NULL DEFAULT 75,
    official INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS transfer_posts (
    id TEXT PRIMARY KEY,
    author_id TEXT,
    author_handle TEXT NOT NULL,
    author_name TEXT,
    source_tier TEXT,
    source_weight INTEGER NOT NULL DEFAULT 70,
    post_text TEXT NOT NULL,
    post_url TEXT NOT NULL,
    published_at TEXT,
    public_metrics_json TEXT,
    player_name TEXT,
    player_slug TEXT,
    direction TEXT,
    category TEXT,
    stage INTEGER,
    confidence INTEGER,
    rationale TEXT,
    current_club TEXT,
    reported_fee TEXT,
    raw_json TEXT,
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS transfer_targets (
    player_slug TEXT PRIMARY KEY,
    player_name TEXT NOT NULL,
    current_club TEXT,
    direction TEXT NOT NULL DEFAULT 'incoming',
    category TEXT NOT NULL DEFAULT 'transfer',
    stage INTEGER NOT NULL DEFAULT 1,
    confidence INTEGER NOT NULL DEFAULT 25,
    reported_fee TEXT,
    strongest_source TEXT,
    strongest_source_weight INTEGER NOT NULL DEFAULT 0,
    evidence_count INTEGER NOT NULL DEFAULT 0,
    independent_sources INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_post_id TEXT,
    movement TEXT NOT NULL DEFAULT 'new',
    completed INTEGER NOT NULL DEFAULT 0,
    manual_stage INTEGER,
    manual_note TEXT,
    hidden INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(last_post_id) REFERENCES transfer_posts(id)
  )`,
  `CREATE TABLE IF NOT EXISTS transfer_events (
    id TEXT PRIMARY KEY,
    player_slug TEXT NOT NULL,
    post_id TEXT,
    from_stage INTEGER,
    to_stage INTEGER NOT NULL,
    confidence INTEGER,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS trusted_news_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'transfer',
    headline TEXT NOT NULL,
    summary TEXT,
    source_handle TEXT,
    source_name TEXT,
    source_url TEXT NOT NULL,
    published_at TEXT,
    credibility INTEGER NOT NULL DEFAULT 70,
    player_slug TEXT,
    transfer_stage INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS automation_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_posts_published ON transfer_posts(published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_posts_player ON transfer_posts(player_slug,published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_targets_stage ON transfer_targets(completed,stage DESC,last_updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_events_player ON transfer_events(player_slug,created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_trusted_news_published ON trusted_news_items(published_at DESC)`,
];

const SCHEMA_READY = new WeakMap();

export async function ensureTransferSchema(db) {
  const existing = SCHEMA_READY.get(db);
  if (existing) return existing;
  const pending = (async () => {
    // Run schema statements in order. Index statements must not be prepared before
    // their tables exist on a fresh D1 database.
    for (const sql of SCHEMA) await db.prepare(sql).run();
    const sourceRows = DEFAULT_SOURCES.map(source => db.prepare(`INSERT INTO transfer_sources
      (handle,display_name,tier,weight,official,enabled,updated_at)
      VALUES (?,?,?,?,?,1,CURRENT_TIMESTAMP)
      ON CONFLICT(handle) DO NOTHING`)
      .bind(source.handle, source.name, source.tier, source.weight, source.official));
    if (sourceRows.length) await db.batch(sourceRows);
    await applyLaunchDataCorrections(db);
  })();
  SCHEMA_READY.set(db, pending);
  try { return await pending; }
  catch (error) { SCHEMA_READY.delete(db); throw error; }
}

export async function getTransferRadar(env, options = {}) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  const db = env.BLUE_ARCHIVE;
  await ensureTransferSchema(db);
  const direction = normaliseDirection(options.direction || 'all');
  const completedOnly = String(options.completed || '') === '1';
  const where = ['hidden=0'];
  const binds = [];
  if (direction !== 'all') { where.push('direction=?'); binds.push(direction); }
  if (completedOnly) where.push('completed=1');
  else where.push('completed=0');

  const targetsQuery = db.prepare(`SELECT * FROM transfer_targets WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(manual_stage,stage) DESC,confidence DESC,last_updated_at DESC LIMIT 80`);
  const targetRows = binds.length ? await targetsQuery.bind(...binds).all() : await targetsQuery.all();
  const postRows = await db.prepare(`SELECT id,author_handle,author_name,source_tier,source_weight,post_text,post_url,
      published_at,player_name,player_slug,direction,category,stage,confidence,rationale,current_club,reported_fee
    FROM transfer_posts WHERE player_slug IS NOT NULL AND category IN ('transfer','loan','contract') ORDER BY datetime(published_at) DESC LIMIT 80`).all();
  const stateRows = await db.prepare(`SELECT key,value,updated_at FROM automation_state`).all();
  const sourceRows = await db.prepare(`SELECT handle,display_name,tier,weight,official,enabled FROM transfer_sources ORDER BY weight DESC`).all();

  const state = Object.fromEntries((stateRows.results || []).map(row => [row.key, parseStateValue(row.value)]));
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    stages: RADAR_STAGES,
    automation: {
      xConfigured: Boolean(env.X_BEARER_TOKEN),
      classifierConfigured: Boolean(env.OPENAI_API_KEY),
      lastRefreshAt: state.transfer_last_refresh_at || null,
      lastSuccessfulRefreshAt: state.transfer_last_success_at || null,
      lastError: state.transfer_last_error || null,
      lastPostCount: Number(state.transfer_last_post_count || 0),
      lastRefreshMode: state.transfer_last_mode || null,
      mode: env.X_BEARER_TOKEN ? 'automatic' : 'awaiting-x-token',
      refreshTargetMinutes: 1,
      widerSourceRefreshMinutes: 5,
    },
    sourceCount: (sourceRows.results || []).filter(row => Number(row.enabled) !== 0).length,
    sources: options.includeSources ? (sourceRows.results || []) : [],
    targets: (targetRows.results || []).filter(isPublicTransferTarget).map(mapTarget),
    posts: (postRows.results || []).filter(isPublicTransferPost),
  };
}

export async function getTrustedNews(env, options = {}) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  const db = env.BLUE_ARCHIVE;
  await ensureTransferSchema(db);
  const requested = Number(options.limit || 40);
  const limit = Math.max(1, Math.min(Number.isFinite(requested) ? requested : 40, 100));
  const kind = String(options.kind || 'all').toLowerCase();
  let query = `SELECT * FROM trusted_news_items`;
  const binds = [];
  if (kind !== 'all') { query += ` WHERE kind=?`; binds.push(kind); }
  else query += ` WHERE kind IN ('transfer','team-news')`;
  query += ` ORDER BY datetime(published_at) DESC LIMIT ?`;
  binds.push(limit);
  const rows = await db.prepare(query).bind(...binds).all();
  const state = await readAutomationState(db);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    automation: {
      xConfigured: Boolean(env.X_BEARER_TOKEN),
      lastRefreshAt: state.transfer_last_refresh_at || null,
      lastSuccessfulRefreshAt: state.transfer_last_success_at || null,
      lastError: state.transfer_last_error || null,
      mode: env.X_BEARER_TOKEN ? 'automatic' : 'awaiting-x-token',
    },
    items: (rows.results || []).filter(isEditorialNewsItem),
  };
}

export async function refreshTransferRadar(env, options = {}) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  const db = env.BLUE_ARCHIVE;
  await ensureTransferSchema(db);
  await setState(db, 'transfer_last_refresh_at', new Date().toISOString());

  if (!env.X_BEARER_TOKEN) {
    const result = { ok: false, skipped: true, reason: 'X_BEARER_TOKEN is not configured.', imported: 0 };
    await setState(db, 'transfer_last_error', result.reason);
    return result;
  }

  const lockRow = await db.prepare(`SELECT value FROM automation_state WHERE key='transfer_refresh_lock'`).first();
  const lockTime = lockRow?.value ? Date.parse(lockRow.value) : 0;
  if (!options.force && lockTime && Date.now() - lockTime < 55 * 1000) {
    return { ok: true, skipped: true, reason: 'A Transfer Radar refresh is already running.', imported: 0 };
  }
  await setState(db, 'transfer_refresh_lock', new Date().toISOString());

  try {
    const sources = await db.prepare(`SELECT * FROM transfer_sources WHERE enabled=1 ORDER BY weight DESC`).all();
    const allSources = sources.results || [];
    // The biggest breaking-news sources are checked every minute. The wider trusted
    // list is checked every five minutes to protect the prepaid X API balance.
    const sourceList = options.fast ? allSources.filter(source => Number(source.official)===1 || Number(source.weight||0)>=94) : allSources;
    const queries = buildQueries(sourceList);
    const fetched = [];
    for (const queryEntry of queries) {
      const result = await fetchRecentPosts(env, db, queryEntry,{maxResults:options.fast?10:20});
      fetched.push(...result.posts);
    }
    await setState(db,'transfer_last_mode',options.fast?'fast':'full');

    const uniquePosts = dedupeBy(fetched, post => post.id);
    const newPosts = [];
    for (const post of uniquePosts) {
      const exists = await db.prepare(`SELECT id FROM transfer_posts WHERE id=?`).bind(post.id).first();
      if (!exists?.id) newPosts.push(post);
    }

    const classified = await classifyPosts(env, newPosts, sourceList);
    let imported = 0;
    for (const item of classified) {
      if (!item.isLeedsRelevant) continue;
      await persistPostAndTarget(db, item);
      imported += 1;
    }

    await setState(db, 'transfer_last_success_at', new Date().toISOString());
    await setState(db, 'transfer_last_error', '');
    await setState(db, 'transfer_last_post_count', String(imported));
    return { ok: true, mode: options.fast?'fast':'full', imported, fetched: uniquePosts.length, classified: classified.length };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 600);
    await setState(db, 'transfer_last_error', message);
    throw error;
  } finally {
    await setState(db, 'transfer_refresh_lock', '');
  }
}

export async function overrideTransferTarget(env, payload = {}) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  const db = env.BLUE_ARCHIVE;
  await ensureTransferSchema(db);
  const slug = slugify(payload.playerSlug || payload.playerName || '');
  if (!slug) throw new Error('Player is required.');
  const playerName = clean(payload.playerName || titleFromSlug(slug), 120);
  const stage = clampInt(payload.stage, 1, 6, 1);
  const direction = normaliseDirection(payload.direction || 'incoming');
  const note = clean(payload.note || 'Admin override', 500);
  const hidden = payload.hidden ? 1 : 0;
  const completed = stage === 6 ? 1 : (payload.completed ? 1 : 0);
  await db.prepare(`INSERT INTO transfer_targets
    (player_slug,player_name,direction,stage,confidence,strongest_source,strongest_source_weight,evidence_count,
      independent_sources,last_updated_at,movement,completed,manual_stage,manual_note,hidden)
    VALUES (?,?,?,?,100,'LeedsBuzz.biz admin',100,0,0,CURRENT_TIMESTAMP,'manual',?,?,?,?)
    ON CONFLICT(player_slug) DO UPDATE SET player_name=excluded.player_name,direction=excluded.direction,
      stage=excluded.stage,confidence=100,last_updated_at=CURRENT_TIMESTAMP,movement='manual',completed=excluded.completed,
      manual_stage=excluded.manual_stage,manual_note=excluded.manual_note,hidden=excluded.hidden`)
    .bind(slug, playerName, direction, stage, completed, stage, note, hidden).run();
  return { ok: true, playerSlug: slug, stage, direction, hidden: Boolean(hidden) };
}

export async function updateTransferSource(env, payload = {}) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  const db = env.BLUE_ARCHIVE;
  await ensureTransferSchema(db);
  const handle = clean(String(payload.handle || '').replace(/^@/, ''), 60);
  if (!handle || !/^[A-Za-z0-9_]+$/.test(handle)) throw new Error('Valid X handle required.');
  const displayName = clean(payload.displayName || handle, 100);
  const tier = clean(payload.tier || 'trusted', 30);
  const weight = clampInt(payload.weight, 1, 100, 75);
  const official = payload.official ? 1 : 0;
  const enabled = payload.enabled === false ? 0 : 1;
  await db.prepare(`INSERT INTO transfer_sources(handle,display_name,tier,weight,official,enabled,updated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(handle) DO UPDATE SET display_name=excluded.display_name,tier=excluded.tier,
      weight=excluded.weight,official=excluded.official,enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`)
    .bind(handle, displayName, tier, weight, official, enabled).run();
  return { ok: true, handle, displayName, tier, weight, official:Boolean(official), enabled:Boolean(enabled) };
}

function buildQueries(sources) {
  // Query one approved account at a time. This removes paid user/profile expansions,
  // gives every returned post an unambiguous source and keeps since_id state per account.
  return sources.filter(source => source?.handle).map(source => {
    const handle=String(source.handle).replace(/^@/,'');
    const official=Number(source.official)===1;
    const terms=official
      ? '(sign OR signed OR signing OR joins OR joined OR welcome OR loan OR contract OR depart OR leaves OR lineup OR "line-up" OR injury OR result OR "full time" OR goal)'
      : '(Leeds United OR #LBUZZ OR LBUZZ OR "Elland Road")';
    return {source,query:`from:${handle} ${terms} -is:retweet`};
  });
}

async function fetchRecentPosts(env, db, entry, options = {}) {
  const source=entry.source||{};
  const query=entry.query||'';
  const handle=String(source.handle||'').replace(/^@/,'');
  const key = `x_since_source:${handle.toLowerCase()}`;
  const state = await db.prepare(`SELECT value FROM automation_state WHERE key=?`).bind(key).first();
  const params = new URLSearchParams({
    query,
    max_results: String(Math.max(10,Math.min(100,Number(options.maxResults||20)))),
    sort_order: 'recency',
    'tweet.fields': 'created_at,author_id,public_metrics,entities,lang,referenced_tweets',
  });
  if (state?.value) params.set('since_id', state.value);
  const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params.toString()}`, {
    headers: { authorization: `Bearer ${env.X_BEARER_TOKEN}` },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`X recent search for @${handle} returned ${response.status}: ${detail.slice(0, 500)}`);
  }
  const data = await response.json();
  const posts = (data.data || []).map(post => ({
    id: post.id,
    authorId: post.author_id || null,
    authorHandle: handle,
    authorName: source.display_name || source.name || handle,
    text: post.text || '',
    createdAt: post.created_at || new Date().toISOString(),
    url: `https://x.com/${handle}/status/${post.id}`,
    metrics: post.public_metrics || {},
    raw: post,
  })).filter(post=>!isCommercialNoise(post.text));
  if (data.meta?.newest_id) await setState(db, key, data.meta.newest_id);
  return { posts, meta: data.meta || {} };
}

async function classifyPosts(env, posts, sourceList) {
  if (!posts.length) return [];
  const sourceMap = new Map(sourceList.map(source => [String(source.handle).toLowerCase(), source]));
  const prepared = posts.filter(post=>!isCommercialNoise(post.text)).map(post => {
    const source = sourceMap.get(String(post.authorHandle).toLowerCase()) || { tier:'trusted',weight:70,official:0,display_name:post.authorName };
    return { ...post, sourceTier: source.tier, sourceWeight: Number(source.weight || 70), sourceOfficial: Boolean(source.official), sourceName: source.display_name || post.authorName };
  });
  if (!env.OPENAI_API_KEY) return prepared.map(fallbackClassification);

  try {
    const compact = prepared.slice(0, 50).map(post => ({
      id: post.id,
      author: post.authorHandle,
      sourceWeight: post.sourceWeight,
      official: post.sourceOfficial,
      createdAt: post.createdAt,
      text: post.text,
    }));
    const instructions = `You classify posts for LeedsBuzz.biz's Leeds United transfer radar. Return JSON only: an array with one object per supplied post, preserving id.
For each post output: id, isLeedsRelevant (boolean), kind (transfer|official|team-news|general), playerName (string or null), direction (incoming|outgoing|loan-in|loan-out|unknown), category (transfer|loan|contract|official|news), stage (1-6), confidence (0-100), currentClub (string or null), reportedFee (string or null), headline (max 120 chars), summary (max 240 chars), rationale (max 180 chars), cooling (boolean).
Radar stage meanings: 1 vague rumour; 2 reported interest/monitoring; 3 credible contact, approach, concrete interest or multiple trusted confirmations; 4 bid, talks, negotiations or personal terms; 5 agreement close/reached, medical booked, documents or 'here we go'; 6 official Leeds United announcement/completed registration.
Only approved-source evidence can move a player. Do not invent a player, fee, club or status. If a post is about Leeds United but not a transfer, set kind accordingly, playerName null when no specific player, direction unknown and stage 1. A denial or cooling report should set cooling true and the stage that remains supported after the denial.`;
    const payload = {
      model: env.TRANSFER_CLASSIFIER_MODEL || env.BIZBOT_MODEL || 'gpt-5-mini',
      instructions,
      input: JSON.stringify(compact),
      reasoning: { effort: 'low' },
      max_output_tokens: 5000,
      store: false,
    };
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization:`Bearer ${env.OPENAI_API_KEY}`, 'content-type':'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Classifier returned ${response.status}`);
    const data = await response.json();
    const text = extractResponseText(data);
    const parsed = parseJsonArray(text);
    const byId = new Map(parsed.map(item => [String(item.id), item]));
    return prepared.map(post => normaliseClassification(post, byId.get(String(post.id)) || fallbackClassification(post)));
  } catch (error) {
    console.warn('Transfer classifier fallback', error);
    return prepared.map(fallbackClassification);
  }
}

function fallbackClassification(post) {
  const text = String(post.text || '');
  const lower = text.toLowerCase();
  if(isCommercialNoise(text)) return normaliseClassification(post,{id:post.id,isLeedsRelevant:false,kind:'general',playerName:null,direction:'unknown',category:'news',stage:1,confidence:0,headline:'',summary:'',rationale:'Commercial/non-football post rejected.',cooling:false});
  const officialTransferWording = post.sourceOfficial && /welcome|sign(?:ed|ing|s)|joins?|joined|loan|contract|depart(?:s|ed|ure)?|leaves?|left the club|transfer/.test(lower);
  const relevant = /leeds|#lufc|\blufc\b|elland road/.test(lower) || officialTransferWording;
  const completed = post.sourceOfficial && /welcome|sign(?:ed|ing|s)|joins?|joined|completed the signing|deal confirmed|depart(?:s|ed|ure)?|leaves?|left the club/.test(lower);
  let stage = 1;
  if (/monitoring|keeping tabs|interested|interest in|considering|admire/.test(lower)) stage = 2;
  if (/contact|approach|concrete interest|priority target|shortlist|in talks with representatives/.test(lower)) stage = 3;
  if (/bid|offer|negotiations|talks ongoing|personal terms|club-to-club talks|advanced talks/.test(lower)) stage = 4;
  if (/agreement reached|agreed deal|medical|documents|here we go|set to sign|close to joining/.test(lower)) stage = 5;
  if (completed) stage = 6;
  const direction = /leave leeds|exit|depart|sold to|loaned out|outgoing|leaves? the club|left the club/.test(lower) ? 'outgoing' : (/joins? leeds|sign(?:s|ed|ing)? for leeds|leeds (?:are |have )?(?:interested|monitoring|tracking|signed)|leeds want|leeds bid|leeds .*to sign|welcome/.test(lower) ? 'incoming' : 'unknown');
  const playerName = extractPlayerNameHeuristic(text);
  return normaliseClassification(post, {
    id: post.id,
    isLeedsRelevant: relevant,
    kind: relevant ? 'transfer' : 'general',
    playerName,
    direction,
    category: /loan/.test(lower) ? 'loan' : 'transfer',
    stage,
    confidence: Math.min(99, Math.max(20, Math.round((post.sourceWeight || 70) * .72 + stage * 5))),
    currentClub: null,
    reportedFee: extractFee(text),
    headline: text.slice(0, 120),
    summary: text.slice(0, 240),
    rationale: 'Classified from approved-source wording.',
    cooling: /not interested|no interest|deal off|collapsed|unlikely|not pursuing|denied/.test(lower),
  });
}

function normaliseClassification(post, item) {
  if(isCommercialNoise(post.text)) item={...item,isLeedsRelevant:false,kind:'general',playerName:null,stage:1,direction:'unknown'};
  let playerName = clean(item.playerName || '', 120) || null;
  const officialName = post.sourceOfficial ? extractPlayerNameHeuristic(post.text) : null;
  const officialCompleted = post.sourceOfficial && isOfficialCompletedTransfer(post.text) && officialName;
  if (officialCompleted) playerName = officialName;
  if (playerName && looksLikeClubName(playerName)) playerName = null;
  let kind = ['transfer','official','team-news','general'].includes(item.kind) ? item.kind : 'transfer';
  let stage = clampInt(item.stage, 1, 6, 1);
  let direction = normaliseDirection(item.direction || 'unknown');
  if (officialCompleted) { kind='transfer'; stage=6; direction=inferOfficialDirection(post.text); }
  if (kind==='transfer' && !playerName) { kind='general'; stage=1; direction='unknown'; }
  return {
    ...post,
    isLeedsRelevant: Boolean(item.isLeedsRelevant) && !isCommercialNoise(post.text),
    kind,
    playerName,
    playerSlug: playerName ? slugify(playerName) : null,
    direction,
    category: clean(item.category || 'transfer', 30),
    stage,
    confidence: clampInt(item.confidence, 0, 100, 45),
    currentClub: clean(item.currentClub || '', 120) || null,
    reportedFee: clean(item.reportedFee || '', 80) || extractFee(post.text) || null,
    headline: clean(item.headline || post.text, 140),
    summary: clean(item.summary || post.text, 360),
    rationale: clean(item.rationale || 'Approved source report.', 240),
    cooling: Boolean(item.cooling),
  };
}

async function persistPostAndTarget(db, item) {
  if(!item?.isLeedsRelevant || isCommercialNoise(item.text)) return;
  const postStatement = db.prepare(`INSERT INTO transfer_posts
    (id,author_id,author_handle,author_name,source_tier,source_weight,post_text,post_url,published_at,
      public_metrics_json,player_name,player_slug,direction,category,stage,confidence,rationale,current_club,
      reported_fee,raw_json,processed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING`)
    .bind(item.id,item.authorId,item.authorHandle,item.authorName,item.sourceTier,item.sourceWeight,item.text,item.url,
      item.createdAt,JSON.stringify(item.metrics || {}),item.playerName,item.playerSlug,item.direction,item.category,
      item.stage,item.confidence,item.rationale,item.currentClub,item.reportedFee,JSON.stringify(item.raw || {}));
  await postStatement.run();

  if(!isEditorialNewsItem({kind:item.kind,headline:item.headline,summary:item.summary})) return;

  await db.prepare(`INSERT INTO trusted_news_items
    (id,kind,headline,summary,source_handle,source_name,source_url,published_at,credibility,player_slug,transfer_stage)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET headline=excluded.headline,summary=excluded.summary,
      credibility=excluded.credibility,player_slug=excluded.player_slug,transfer_stage=excluded.transfer_stage`)
    .bind(item.id,item.kind,item.headline,item.summary,item.authorHandle,item.authorName,item.url,item.createdAt,
      item.confidence,item.playerSlug,item.stage).run();

  if (!item.playerSlug || !item.playerName || item.kind !== 'transfer') return;
  const existing = await db.prepare(`SELECT * FROM transfer_targets WHERE player_slug=?`).bind(item.playerSlug).first();
  const oldStage = Number(existing?.manual_stage || existing?.stage || 1);
  let nextStage = item.stage;
  if (item.cooling && existing) nextStage = Math.max(1, Math.min(oldStage - 1, item.stage));
  else if (existing) nextStage = Math.max(Number(existing.stage || 1), item.stage);
  if (existing?.manual_stage) nextStage = Number(existing.manual_stage);
  const movement = !existing ? 'new' : nextStage > oldStage ? 'in' : nextStage < oldStage ? 'out' : 'steady';
  const sourceCountRow = await db.prepare(`SELECT COUNT(DISTINCT lower(author_handle)) AS c FROM transfer_posts WHERE player_slug=?`).bind(item.playerSlug).first();
  const independentSources = Number(sourceCountRow?.c || 1);
  const corroborationBoost = Math.min(12, Math.max(0, independentSources - 1) * 4);
  const confidence = Math.min(100, Math.max(Number(existing?.confidence || 0) * .86, item.confidence + corroborationBoost));
  const strongestWeight = Math.max(Number(existing?.strongest_source_weight || 0), Number(item.sourceWeight || 0));
  const strongestSource = Number(item.sourceWeight || 0) >= Number(existing?.strongest_source_weight || 0)
    ? `@${item.authorHandle}` : existing?.strongest_source;
  const completed = nextStage === 6 ? 1 : Number(existing?.completed || 0);

  await db.prepare(`INSERT INTO transfer_targets
    (player_slug,player_name,current_club,direction,category,stage,confidence,reported_fee,strongest_source,
      strongest_source_weight,evidence_count,independent_sources,first_seen_at,last_updated_at,last_post_id,movement,completed)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?)
    ON CONFLICT(player_slug) DO UPDATE SET
      player_name=excluded.player_name,
      current_club=COALESCE(excluded.current_club,transfer_targets.current_club),
      direction=CASE WHEN excluded.direction='unknown' THEN transfer_targets.direction ELSE excluded.direction END,
      category=excluded.category,stage=excluded.stage,confidence=excluded.confidence,
      reported_fee=COALESCE(excluded.reported_fee,transfer_targets.reported_fee),
      strongest_source=excluded.strongest_source,strongest_source_weight=excluded.strongest_source_weight,
      evidence_count=transfer_targets.evidence_count+1,independent_sources=excluded.independent_sources,
      last_updated_at=CURRENT_TIMESTAMP,last_post_id=excluded.last_post_id,movement=excluded.movement,
      completed=excluded.completed`)
    .bind(item.playerSlug,item.playerName,item.currentClub,item.direction,item.category,nextStage,Math.round(confidence),
      item.reportedFee,strongestSource,strongestWeight,independentSources,item.id,movement,completed).run();

  if (!existing || nextStage !== oldStage) {
    const eventId = `${item.playerSlug}:${item.id}:${nextStage}`;
    await db.prepare(`INSERT INTO transfer_events(id,player_slug,post_id,from_stage,to_stage,confidence,reason)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
      .bind(eventId,item.playerSlug,item.id,existing ? oldStage : null,nextStage,Math.round(confidence),item.rationale).run();
  }
}

function mapTarget(row) {
  const effectiveStage = Number(row.manual_stage || row.stage || 1);
  return {
    playerSlug: row.player_slug,
    playerName: row.player_name,
    currentClub: row.current_club || null,
    direction: row.direction,
    category: row.category,
    stage: effectiveStage,
    stageKey: RADAR_STAGES.find(item => item.stage === effectiveStage)?.key || 'rumour',
    stageLabel: RADAR_STAGES.find(item => item.stage === effectiveStage)?.label || 'Rumour',
    confidence: Number(row.confidence || 0),
    reportedFee: row.reported_fee || null,
    strongestSource: row.strongest_source || null,
    evidenceCount: Number(row.evidence_count || 0),
    independentSources: Number(row.independent_sources || 0),
    firstSeenAt: row.first_seen_at,
    lastUpdatedAt: row.last_updated_at,
    lastPostId: row.last_post_id || null,
    movement: row.movement || 'steady',
    completed: Boolean(Number(row.completed || 0)),
    manual: Boolean(row.manual_stage),
    manualNote: row.manual_note || null,
  };
}

async function readAutomationState(db) {
  const rows = await db.prepare(`SELECT key,value FROM automation_state`).all();
  return Object.fromEntries((rows.results || []).map(row => [row.key, parseStateValue(row.value)]));
}

async function setState(db, key, value) {
  await db.prepare(`INSERT INTO automation_state(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(key, String(value ?? '')).run();
}

function parseStateValue(value) {
  const text = String(value ?? '');
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
      else if (typeof content?.text?.value === 'string') parts.push(content.text.value);
    }
  }
  return parts.join('\n');
}

function parseJsonArray(text) {
  const stripped = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
  try { const value = JSON.parse(stripped); return Array.isArray(value) ? value : (Array.isArray(value?.items) ? value.items : []); }
  catch {
    const start = stripped.indexOf('['), end = stripped.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try { const value = JSON.parse(stripped.slice(start, end + 1)); return Array.isArray(value) ? value : []; } catch {}
    }
  }
  return [];
}

function extractPlayerNameHeuristic(text) {
  const cleaned = String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#][A-Za-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = `([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})`;
  const patterns = [
    new RegExp(`Welcome(?:\\s+to\\s+Leeds United)?[,!:\\-\\s]+${name}`),
    new RegExp(`Leeds United(?:\\s+FC)?(?:\\s+have)?\\s+(?:signed|signs|announce(?:s|d)?(?:\\s+the)?\\s+signing\\s+of)\\s+${name}`),
    new RegExp(`(?:to sign|signing|interested in|monitoring|tracking|targeting|want(?:s)?|bid for|offer for|approach for|talks (?:to sign|for)|agreement (?:for|with)|deal (?:for|with))\\s+${name}`),
    new RegExp(`${name}\\s+(?:is|has|looks|seems|remains|set to|close to)\\s+(?:join|joining|sign for|leave|leaving)\\s+Leeds United`),
    new RegExp(`${name}\\s+(?:signs|has signed|joins|has joined)\\s+(?:for\\s+)?Leeds United`),
    new RegExp(`Leeds United(?:\\s+(?:are|have|remain|will|could|may|want|wants|consider|considering)){0,3}\\s+${name}`),
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    const candidate = String(match[1] || '').trim().replace(/[.,;:!?]+$/, '');
    if (!candidate || /^Leeds United(?: Football Club| FC)?$/i.test(candidate)) continue;
    return candidate;
  }
  return null;
}

function isOfficialCompletedTransfer(text) {
  const lower=String(text||'').toLowerCase();
  return /\b(welcome|signs for leeds|signed for leeds|joins leeds|joined leeds|leeds (?:have )?signed|completed the signing|transfer completed)\b/.test(lower);
}

function inferOfficialDirection(text) {
  const lower=String(text||'').toLowerCase();
  if (/depart|leaves?|left the club|joins? [a-z].* from leeds|loaned out/.test(lower)) return 'outgoing';
  return 'incoming';
}

function looksLikeClubName(value) {
  const name=String(value||'').trim().toLowerCase();
  const clubs=new Set(['aston villa','villa','leeds','leeds fc','crystal palace','manchester city','manchester united','tottenham hotspur','arsenal','liverpool','everton','newcastle united','nottingham forest','west ham united','brighton and hove albion','bayern munich','real madrid','barcelona','sporting lisbon']);
  return clubs.has(name)||/\b(?:football club| fc| united| city| palace| hotspur)\b$/.test(name);
}

function isCommercialNoise(value) {
  const text=String(value||'').toLowerCase();
  return /\b(app|download(?: the)? app|away shirt|home shirt|third shirt|kit launch|new kit|club shop|megastore|tickets? on sale|hospitality|travel package|fan app|lutv|subscription|wallpaper|retail collection)\b/.test(text);
}

function isPublicTransferTarget(row) {
  const name=String(row?.player_name||'').trim();
  const slug=String(row?.player_slug||'').trim().toLowerCase();
  if(!name||!slug||Number(row?.hidden||0)!==0)return false;
  const combined=`${name} ${slug} ${row?.manual_note||''}`;
  if(isCommercialNoise(combined))return false;
  if(['leeds','leeds-fc','lufc','leeds-united'].includes(slug))return false;
  if(/^(leeds|leeds fc|lufc|leeds united)$/i.test(name))return false;
  return /[a-zà-ž]/i.test(name);
}

function isPublicTransferPost(row) {
  return Boolean(row?.player_slug&&row?.player_name)&&!isCommercialNoise(row?.post_text||'')&&!['leeds','leeds-united','lufc'].includes(String(row.player_slug).toLowerCase());
}

function isEditorialNewsItem(row) {
  const text=`${row?.headline||''} ${row?.summary||''}`;
  if (isCommercialNoise(text)) return false;
  return row?.kind==='transfer'||row?.kind==='team-news'||row?.kind==='official';
}

async function applyLaunchDataCorrections(db) {
  // New correction key deliberately supersedes every earlier one-time patch.
  const correctionKey='leedsbuzz_launch_data_correction_20260724_v1';
  const marker=await db.prepare(`SELECT value FROM automation_state WHERE key=?`).bind(correctionKey).first();
  if(marker?.value==='done') return;

  const noise=`%away shirt%|%home shirt%|%third shirt%|%kit launch%|%download the app%|%leeds app%|%club shop%|%megastore%|%tickets on sale%|%hospitality%|%travel package%|%lutv%|%new season range%|%pre-order%|%official store%|%training wear%`;
  const patterns=noise.split('|');
  for(const pattern of patterns){
    await db.prepare(`DELETE FROM trusted_news_items WHERE lower(headline||' '||coalesce(summary,'')) LIKE ?`).bind(pattern).run();
    await db.prepare(`DELETE FROM transfer_posts WHERE lower(post_text) LIKE ?`).bind(pattern).run();
    try{await db.prepare(`DELETE FROM x_content_opportunities WHERE lower(source_text) LIKE ?`).bind(pattern).run();}catch{}
  }
  // Remove targets which were accidentally created from commercial club posts.
  // Filtering the response below is the final safety net, but this permanently cleans D1 too.
  const badTargetRows=await db.prepare(`SELECT player_slug FROM transfer_targets WHERE
    lower(player_name) IN ('leeds','leeds united','lufc')
    OR player_slug IN ('leeds','leeds-united','lufc')
    OR lower(player_name||' '||player_slug) LIKE '%shirt%'
    OR lower(player_name||' '||player_slug) LIKE '%app%'
    OR lower(player_name||' '||player_slug) LIKE '%kit%'
    OR lower(player_name||' '||player_slug) LIKE '%ticket%'
    OR lower(player_name||' '||player_slug) LIKE '%shop%'
    OR lower(player_name||' '||player_slug) LIKE '%travel%'
    OR lower(player_name||' '||player_slug) LIKE '%hospitality%'`).all();
  const badSlugs=[...new Set((badTargetRows.results||[]).map(row=>row.player_slug).filter(Boolean))];
  for(const slug of badSlugs){
    try{await db.prepare(`DELETE FROM x_content_opportunities WHERE player_slug=?`).bind(slug).run();}catch{}
    await db.prepare(`DELETE FROM trusted_news_items WHERE player_slug=?`).bind(slug).run();
    await db.prepare(`DELETE FROM transfer_events WHERE player_slug=?`).bind(slug).run();
    await db.prepare(`UPDATE transfer_targets SET last_post_id=NULL,hidden=1 WHERE player_slug=?`).bind(slug).run();
    await db.prepare(`DELETE FROM transfer_posts WHERE player_slug=?`).bind(slug).run();
    await db.prepare(`DELETE FROM transfer_targets WHERE player_slug=?`).bind(slug).run();
  }

  // A new LeedsBuzz database starts without pre-seeded transfer claims.
  // Completed moves are added only by an official source or a human editor.
  await db.prepare(`INSERT INTO automation_state(key,value,updated_at) VALUES(?, 'done',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='done',updated_at=CURRENT_TIMESTAMP`).bind(correctionKey).run();
}

function extractFee(text) {
  const match = String(text || '').match(/(?:£|€|\$)\s?\d+(?:\.\d+)?\s?(?:m|million|bn|billion)?/i);
  return match ? match[0] : null;
}

function normaliseDirection(value) {
  const text = String(value || '').toLowerCase().replace(/_/g,'-');
  if (['incoming','outgoing','loan-in','loan-out','unknown','all'].includes(text)) return text;
  if (text === 'loan') return 'loan-in';
  return 'unknown';
}

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0, max);
}

function slugify(value) {
  return clean(value, 160).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
}

function titleFromSlug(slug) {
  return String(slug || '').split('-').filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? Math.round(number) : fallback));
}

function dedupeBy(items, keyFn) {
  const map = new Map();
  for (const item of items) map.set(keyFn(item), item);
  return [...map.values()];
}

function hashLite(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

export async function ingestXWebhookPayload(env, payload = {}) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  const db = env.BLUE_ARCHIVE;
  await ensureTransferSchema(db);
  const sources = await db.prepare(`SELECT * FROM transfer_sources WHERE enabled=1 ORDER BY weight DESC`).all();
  const sourceList = sources.results || [];
  const users = new Map((payload.includes?.users || []).map(user => [String(user.id), user]));
  const rawPosts = Array.isArray(payload.data) ? payload.data : (payload.data?.id ? [payload.data] : []);
  const posts = rawPosts.map(post => {
    const user = users.get(String(post.author_id)) || {};
    const handle = user.username || '';
    return {
      id: String(post.id || ''),
      authorId: post.author_id || null,
      authorHandle: handle,
      authorName: user.name || handle,
      text: post.text || '',
      createdAt: post.created_at || new Date().toISOString(),
      url: handle ? `https://x.com/${handle}/status/${post.id}` : `https://x.com/i/web/status/${post.id}`,
      metrics: post.public_metrics || {},
      raw: post,
    };
  }).filter(post => post.id && post.authorHandle);
  const newPosts=[];
  for(const post of posts){const exists=await db.prepare(`SELECT id FROM transfer_posts WHERE id=?`).bind(post.id).first();if(!exists?.id)newPosts.push(post);}
  const classified=await classifyPosts(env,newPosts,sourceList);let imported=0;
  for(const item of classified){if(!item.isLeedsRelevant)continue;await persistPostAndTarget(db,item);imported+=1;}
  if(imported){await setState(db,'transfer_last_success_at',new Date().toISOString());await setState(db,'transfer_last_post_count',String(imported));}
  return {ok:true,received:posts.length,classified:classified.length,imported};
}
