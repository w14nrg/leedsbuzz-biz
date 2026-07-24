const AUDIT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS site_audit_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    issue_count INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT,
    error_text TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS site_audit_issues (
    issue_key TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    title TEXT NOT NULL,
    detail TEXT,
    entity_type TEXT,
    entity_id TEXT,
    source_url TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    meta_json TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_issues_status ON site_audit_issues(status,severity,last_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_runs_started ON site_audit_runs(started_at DESC)`,
];

const ROUTES = [
  ['home','/'],
  ['vault','/white-vault'],
  ['history','/history'],
  ['transfers','/transfers'],
  ['news','/news'],
  ['xi','/build-your-xi'],
  ['account','/account'],
  ['bizbot','/bizbot'],
  ['content-desk','/content-desk'],
  ['privacy','/privacy'],
  ['terms','/terms'],
];

const ASSETS = [
  '/styles.css','/white-vault-3d.js','/history.js','/transfer-radar.js','/news-wire.js','/xi-builder.js','/membership-v154.js',
  '/content-desk.js','/content-desk-sw.js','/content-desk-manifest.webmanifest','/content-desk-icon-192.png','/content-desk-icon-512.png'
];
const ASSET_SIGNATURES = {
  '/white-vault-3d.js':['THREE','BLUE_VAULT_DATABASE'],
  '/history.js':['renderManagerCard','TIMELINE_EVENTS'],
  '/transfer-radar.js':['renderRadar','selectTarget'],
  '/news-wire.js':['newsGrid','trusted'],
  '/xi-builder.js':['CURRENT_PLAYER_METADATA','BLUE_DNA_OVERRIDES'],
  '/content-desk.js':['OPEN REPLY IN X','Notification'],
};

export async function ensureAuditSchema(db) {
  for (const sql of AUDIT_SCHEMA) await db.prepare(sql).run();
}

export async function runSiteAudit(env, options = {}) {
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  const db = env.BLUE_ARCHIVE;
  await ensureAuditSchema(db);
  const runId = crypto.randomUUID();
  await db.prepare(`INSERT INTO site_audit_runs(id,status) VALUES(?,'running')`).bind(runId).run();
  const issues=[];
  try {
    issues.push(...await auditAssets(env));
    issues.push(...await auditDatabase(db));
    issues.push(...await auditAutomation(db, env));
    issues.push(...await auditContradictions(db));
    await persistIssues(db, issues);
    await clearMissingIssues(db, issues.map(issue=>issue.key));
    const summary = buildSummary(issues);
    await db.prepare(`UPDATE site_audit_runs SET finished_at=CURRENT_TIMESTAMP,status='success',issue_count=?,summary_json=? WHERE id=?`)
      .bind(issues.length,JSON.stringify(summary),runId).run();
    return {ok:true,runId,generatedAt:new Date().toISOString(),summary,issues};
  } catch (error) {
    await db.prepare(`UPDATE site_audit_runs SET finished_at=CURRENT_TIMESTAMP,status='error',error_text=? WHERE id=?`)
      .bind(String(error?.message||error).slice(0,1000),runId).run();
    throw error;
  }
}

export async function getAuditReport(db) {
  await ensureAuditSchema(db);
  const [issues,runs] = await Promise.all([
    db.prepare(`SELECT * FROM site_audit_issues WHERE status='open'
      ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'error' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END,last_seen_at DESC LIMIT 250`).all(),
    db.prepare(`SELECT id,started_at,finished_at,status,issue_count,summary_json,error_text FROM site_audit_runs ORDER BY started_at DESC LIMIT 12`).all(),
  ]);
  return {
    ok:true,
    generatedAt:new Date().toISOString(),
    issues:(issues.results||[]).map(mapIssue),
    runs:(runs.results||[]).map(row=>({...row,summary:parseJson(row.summary_json)})),
  };
}

export async function resolveAuditIssue(db, issueKey) {
  await ensureAuditSchema(db);
  await db.prepare(`UPDATE site_audit_issues SET status='resolved',resolved_at=CURRENT_TIMESTAMP WHERE issue_key=?`).bind(String(issueKey||'')).run();
  return {ok:true,issueKey};
}

async function auditAssets(env) {
  const issues=[];
  if (!env.ASSETS) return [issue('assets-binding','routing','critical','Static asset binding is missing','The Worker cannot inspect or serve site assets.')];
  const origin='https://leedsbuzz.biz';
  for (const [name,path] of ROUTES) {
    try {
      const response=await env.ASSETS.fetch(new Request(`${origin}${path}`));
      const type=response.headers.get('content-type')||'';
      const text=response.ok?await response.text():'';
      if(!response.ok) issues.push(issue(`route:${name}:status`,'routing','critical',`${name} page is unavailable`,`${path} returned HTTP ${response.status}.`, 'route', path));
      else if(!type.includes('text/html')) issues.push(issue(`route:${name}:type`,'routing','critical',`${name} page has the wrong content type`,`${path} returned ${type||'no content type'} instead of HTML.`, 'route', path));
      else if(looksLikeRawCode(text)) issues.push(issue(`route:${name}:code`,'routing','critical',`${name} page is displaying source code`,`${path} contains JavaScript source where an HTML document should be served.`, 'route', path));
      else if(!/<html[\s>]/i.test(text)||!/<body[\s>]/i.test(text)) issues.push(issue(`route:${name}:html`,'routing','error',`${name} page HTML is incomplete`,`${path} does not contain a complete HTML document.`, 'route', path));
    } catch(error) {
      issues.push(issue(`route:${name}:fetch`,'routing','critical',`${name} page could not be inspected`,String(error?.message||error), 'route', path));
    }
  }
  for (const path of ASSETS) {
    try {
      const response=await env.ASSETS.fetch(new Request(`${origin}${path}`));
      if(!response.ok){issues.push(issue(`asset:${path}`,'assets','error','Required site asset is missing',`${path} returned HTTP ${response.status}.`,'asset',path));continue;}
      const signatures=ASSET_SIGNATURES[path]||[];
      if(signatures.length){const body=await response.text();if(!signatures.every(signature=>body.includes(signature)))issues.push(issue(`asset:${path}:mapping`,'assets','critical','Site asset appears to contain the wrong file',`${path} does not contain its expected code signatures. This can cause a page to display another file or raw source code.`,'asset',path));}
    } catch(error){issues.push(issue(`asset:${path}`,'assets','error','Required site asset could not be inspected',`${path}: ${String(error?.message||error)}`,'asset',path));}
  }
  return issues;
}

async function auditDatabase(db) {
  const issues=[];
  const players=await scalar(db,`SELECT COUNT(*) AS c FROM players WHERE COALESCE(appearances,0)>=50 OR COALESCE(is_current,0)=1`);
  const currentPlayers=await scalar(db,`SELECT COUNT(*) AS c FROM players WHERE COALESCE(is_current,0)=1`);
  const managers=await scalar(db,`SELECT COUNT(*) AS c FROM managers`);
  const honours=await scalar(db,`SELECT COUNT(*) AS c FROM honours`);
  const matches=await scalar(db,`SELECT COUNT(*) AS c FROM matches`);
  if(players!==null&&players<379)issues.push(issue('data:player-count','data','critical','White Vault player catalogue is incomplete',`Only ${players} eligible player records are currently loaded; the public launch catalogue contains 379 profiles.`));
  if(currentPlayers!==null&&currentPlayers!==29)issues.push(issue('data:current-player-count','data','error','Current squad flags need refreshing',`${currentPlayers} current players are marked; the official 2026/27 squad baseline contains 29.`));
  if(managers!==null&&managers<40)issues.push(issue('data:manager-count','data','warning','Manager archive is incomplete',`Only ${managers} manager records are currently loaded.`));
  if(matches!==null&&matches<500)issues.push(issue('data:match-count','data','warning','Match archive coverage is limited',`Only ${matches} source-loaded match records are currently available.`));

  const badPlayers=await rows(db,`SELECT slug,full_name,appearances,goals FROM players WHERE full_name IS NULL OR trim(full_name)='' OR appearances<0 OR goals<0 OR goals>appearances*2 LIMIT 50`);
  for(const row of badPlayers)issues.push(issue(`player:${row.slug||row.full_name}:invalid`,'data','error','Player record needs review',`${row.full_name||row.slug}: appearances=${row.appearances}, goals=${row.goals}.`,'player',row.slug||row.full_name));
  const duplicates=await rows(db,`SELECT lower(trim(full_name)) AS name,COUNT(*) AS c FROM players GROUP BY lower(trim(full_name)) HAVING COUNT(*)>1 LIMIT 50`);
  for(const row of duplicates)issues.push(issue(`player-duplicate:${row.name}`,'data','warning','Possible duplicate player record',`${row.name} appears ${row.c} times.`,'player',row.name));
  const badManagers=await rows(db,`SELECT id,full_name,started_on,ended_on FROM managers WHERE full_name IS NULL OR trim(full_name)='' OR (started_on IS NOT NULL AND ended_on IS NOT NULL AND date(ended_on)<date(started_on)) LIMIT 50`);
  for(const row of badManagers)issues.push(issue(`manager:${row.id}:dates`,'data','error','Manager record needs review',`${row.full_name||row.id} has invalid or incomplete tenure dates.`,'manager',row.id));
  return issues;
}

async function auditAutomation(db, env) {
  const issues=[];
  const state=await rows(db,`SELECT key,value,updated_at FROM automation_state`);
  const map=Object.fromEntries(state.map(row=>[row.key,row]));
  if(!env.X_BEARER_TOKEN)issues.push(issue('automation:x-read-token','automation','warning','X reading connection is not configured','Add X_BEARER_TOKEN to enable the trusted news and Transfer Radar feed.'));
  else if(map.x_reading_status?.value && map.x_reading_status.value!=='ok')issues.push(issue('automation:x-read-verification','automation','error','X reading connection is not verified',`Latest connection test: ${map.x_reading_status.value}. ${map.x_connection_message?.value||''}`));
  if(String(env.X_AUTO_REPLY_ENABLED||'').toLowerCase()==='true')issues.push(issue('automation:auto-replies','automation','critical','Automatic external replies must remain disabled','Brandon should post suggested replies himself through the X reply composer. Remove or set X_AUTO_REPLY_ENABLED=false.'));
  const last=Date.parse(map.transfer_last_success_at?.value||'');
  if(env.X_BEARER_TOKEN&&(!Number.isFinite(last)||Date.now()-last>45*60*1000))issues.push(issue('automation:x-stale','automation','error','Transfer and news feed is stale',`Last successful X refresh: ${map.transfer_last_success_at?.value||'never'}.`));
  const harvestSources=await rows(db,`SELECT id,title,last_fetched_at,refresh_hours FROM harvest_sources WHERE enabled=1`);
  for(const source of harvestSources){
    const fetched=Date.parse(source.last_fetched_at||'');const allowance=Math.max(48,Number(source.refresh_hours||24)*2)*3600000;
    if(!Number.isFinite(fetched)||Date.now()-fetched>allowance)issues.push(issue(`harvest:${source.id}:stale`,'verification','warning','Archive verification source is stale',`${source.title||source.id} was last checked ${source.last_fetched_at||'never'}.`,'source',source.id));
  }
  const observationCount=await scalar(db,`SELECT COUNT(*) AS c FROM fact_observations`);
  if(observationCount!==null&&observationCount===0)issues.push(issue('verification:no-observations','verification','warning','No external fact observations have been stored','The archive harvester has not yet stored source observations for contradiction checking.'));
  return issues;
}

async function auditContradictions(db) {
  const issues=[];
  const conflicts=await rows(db,`SELECT claim_key,COUNT(DISTINCT content_hash) AS versions,COUNT(*) AS observations
    FROM fact_observations GROUP BY claim_key HAVING COUNT(DISTINCT content_hash)>1 ORDER BY versions DESC LIMIT 100`);
  for(const row of conflicts)issues.push(issue(`claim:${row.claim_key}`,'verification','warning','Sources disagree on an archive fact',`${row.observations} observations contain ${row.versions} different versions. This requires review before the public fact is changed.`,'claim',row.claim_key));
  return issues;
}

async function persistIssues(db, issues) {
  for(const item of issues){
    await db.prepare(`INSERT INTO site_audit_issues(issue_key,category,severity,title,detail,entity_type,entity_id,source_url,status,last_seen_at,meta_json)
      VALUES(?,?,?,?,?,?,?,?, 'open',CURRENT_TIMESTAMP,?)
      ON CONFLICT(issue_key) DO UPDATE SET category=excluded.category,severity=excluded.severity,title=excluded.title,detail=excluded.detail,
        entity_type=excluded.entity_type,entity_id=excluded.entity_id,source_url=excluded.source_url,status='open',last_seen_at=CURRENT_TIMESTAMP,resolved_at=NULL,meta_json=excluded.meta_json`)
      .bind(item.key,item.category,item.severity,item.title,item.detail||null,item.entityType||null,item.entityId||null,item.sourceUrl||null,JSON.stringify(item.meta||{})).run();
  }
}

async function clearMissingIssues(db, activeKeys) {
  if(!activeKeys.length){await db.prepare(`UPDATE site_audit_issues SET status='cleared',resolved_at=CURRENT_TIMESTAMP WHERE status='open'`).run();return;}
  const placeholders=activeKeys.map(()=>'?').join(',');
  await db.prepare(`UPDATE site_audit_issues SET status='cleared',resolved_at=CURRENT_TIMESTAMP WHERE status='open' AND issue_key NOT IN (${placeholders})`).bind(...activeKeys).run();
}

function issue(key,category,severity,title,detail='',entityType=null,entityId=null,sourceUrl=null,meta={}){return{key,category,severity,title,detail,entityType,entityId,sourceUrl,meta};}
function buildSummary(issues){const counts={critical:0,error:0,warning:0,info:0};for(const item of issues)counts[item.severity]=(counts[item.severity]||0)+1;return{...counts,total:issues.length,healthy:counts.critical===0&&counts.error===0};}
function looksLikeRawCode(text){const head=String(text||'').slice(0,1500);return /^\s*(?:import\s+|export\s+|\(\(\)=>|const\s+\w+\s*=|function\s+\w+)/.test(head)||(!/<html[\s>]/i.test(head)&&/document\.querySelector|addEventListener|THREE\./.test(head));}
async function scalar(db,sql){try{const row=await db.prepare(sql).first();return row?Number(row.c):null;}catch{return null;}}
async function rows(db,sql){try{const result=await db.prepare(sql).all();return result.results||[];}catch{return[];}}
function mapIssue(row){return{key:row.issue_key,category:row.category,severity:row.severity,title:row.title,detail:row.detail,entityType:row.entity_type,entityId:row.entity_id,sourceUrl:row.source_url,status:row.status,firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,meta:parseJson(row.meta_json)};}
function parseJson(value){try{return JSON.parse(value||'{}')}catch{return{}}}
