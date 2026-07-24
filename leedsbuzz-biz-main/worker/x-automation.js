const X_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS automation_state(
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS x_content_opportunities(
    source_post_id TEXT PRIMARY KEY,
    source_handle TEXT NOT NULL,
    source_name TEXT,
    source_text TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_at TEXT,
    kind TEXT NOT NULL DEFAULT 'general',
    player_slug TEXT,
    transfer_stage INTEGER,
    confidence INTEGER NOT NULL DEFAULT 0,
    post_draft TEXT,
    reply_draft TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    auto_post_eligible INTEGER NOT NULL DEFAULT 0,
    auto_reply_eligible INTEGER NOT NULL DEFAULT 0,
    post_mode TEXT NOT NULL DEFAULT 'quote',
    reply_authorised INTEGER NOT NULL DEFAULT 0,
    alerted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS x_publications(
    id TEXT PRIMARY KEY,
    source_post_id TEXT,
    publication_type TEXT NOT NULL,
    x_post_id TEXT,
    text TEXT NOT NULL,
    status TEXT NOT NULL,
    error_text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    FOREIGN KEY(source_post_id) REFERENCES x_content_opportunities(source_post_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_x_opportunities_status ON x_content_opportunities(status,published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_x_publications_created ON x_publications(created_at DESC)`,
];

export async function ensureXAutomationSchema(db){
  for(const sql of X_SCHEMA)await db.prepare(sql).run();
  await ensureColumn(db,'x_content_opportunities','post_mode',`TEXT NOT NULL DEFAULT 'quote'`);
  await ensureColumn(db,'x_content_opportunities','reply_authorised',`INTEGER NOT NULL DEFAULT 0`);
  await ensureColumn(db,'x_content_opportunities','alerted_at',`TEXT`);
  await db.prepare(`INSERT INTO automation_state(key,value,updated_at) VALUES('x_auto_post_enabled','false',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='false',updated_at=CURRENT_TIMESTAMP`).run();
  await db.prepare(`UPDATE x_content_opportunities SET status='dismissed',auto_post_eligible=0 WHERE kind<>'transfer' OR player_slug IS NULL OR player_slug IN ('aston-villa','villa') OR lower(source_text) LIKE '%away shirt%' OR lower(source_text) LIKE '%kit launch%' OR lower(source_text) LIKE '%leeds app%' OR lower(source_text) LIKE '%download the app%' OR lower(source_text) LIKE '%home shirt%' OR lower(source_text) LIKE '%third shirt%' OR lower(source_text) LIKE '%club shop%' OR lower(source_text) LIKE '%tickets on sale%' OR lower(source_text) LIKE '%hospitality%' OR lower(source_text) LIKE '%travel package%' OR lower(source_text) LIKE '%lutv%'`).run();
}

async function ensureColumn(db,table,column,definition){
  try{const info=await db.prepare(`PRAGMA table_info(${table})`).all();if((info.results||[]).some(row=>row.name===column))return;await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();}
  catch(error){if(!/duplicate column|already exists/i.test(String(error?.message||error)))console.warn(`Could not ensure ${table}.${column}`,String(error?.message||error));}
}

export async function processXContentAutomation(env,options={}){
  if(!env.BLUE_ARCHIVE)throw new Error('BLUE_ARCHIVE binding missing');
  const db=env.BLUE_ARCHIVE;await ensureXAutomationSchema(db);
  const rows=await safeRows(db,`SELECT p.id,p.author_handle,p.author_name,p.source_weight,p.post_text,p.post_url,p.published_at,p.player_slug,p.stage,p.confidence,
    n.kind,n.headline,n.summary
    FROM transfer_posts p LEFT JOIN trusted_news_items n ON n.id=p.id
    LEFT JOIN x_content_opportunities q ON q.source_post_id=p.id
    WHERE q.source_post_id IS NULL AND n.kind='transfer' AND p.player_slug IS NOT NULL ORDER BY datetime(p.published_at) ASC LIMIT 60`);
  const created=[];
  for(const row of rows){
    if(!isRelevantOpportunityRow(row))continue;
    const opportunity=await buildOpportunity(env,row);
    await db.prepare(`INSERT OR IGNORE INTO x_content_opportunities(source_post_id,source_handle,source_name,source_text,source_url,published_at,kind,player_slug,transfer_stage,confidence,post_draft,reply_draft,status,auto_post_eligible,auto_reply_eligible,post_mode,reply_authorised)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'queued',?,?,?,?)`).bind(
        row.id,row.author_handle,row.author_name||row.author_handle,row.post_text,row.post_url,row.published_at,opportunity.kind,row.player_slug||null,
        Number(row.stage||0)||null,Number(row.confidence||0),opportunity.postDraft,opportunity.replyDraft,opportunity.autoPost?1:0,0,opportunity.postMode||'quote',0
      ).run();
    created.push({sourcePostId:row.id,sourceHandle:row.author_handle,sourceText:row.post_text,sourceUrl:row.post_url,publishedAt:row.published_at,...opportunity});
  }

  if(created.length)await sendOpportunityAlerts(env,db,created).catch(error=>console.error('Content alert failed',error));

  return {ok:true,created:created.length,published:[],settings:getXAutomationStatus(env,{autoPostEnabled:false,autoRepliesEnabled:false})};
}

export async function getXContentDesk(env){
  if(!env.BLUE_ARCHIVE)throw new Error('BLUE_ARCHIVE binding missing');const db=env.BLUE_ARCHIVE;await ensureXAutomationSchema(db);
  const [queue,publications,connectionState,controls]=await Promise.all([
    safeRows(db,`SELECT * FROM x_content_opportunities WHERE kind='transfer' AND player_slug IS NOT NULL ORDER BY CASE status WHEN 'queued' THEN 1 WHEN 'posted' THEN 2 ELSE 3 END,datetime(published_at) DESC LIMIT 100`),
    safeRows(db,`SELECT * FROM x_publications ORDER BY datetime(created_at) DESC LIMIT 100`),
    readXConnectionState(db),
    readAutomationControls(db),
  ]);
  return{ok:true,settings:getXAutomationStatus(env,{...connectionState,...controls}),connectionState,queue:queue.filter(isRelevantOpportunityRow).map(mapOpportunity),publications:publications.map(mapPublication)};
}

export async function publishQueuedXContent(env,payload={}){
  throw new Error('API publishing is disabled. Open the prepared post in X and publish it manually.');
  if(!env.BLUE_ARCHIVE)throw new Error('BLUE_ARCHIVE binding missing');const db=env.BLUE_ARCHIVE;await ensureXAutomationSchema(db);
  const id=String(payload.sourcePostId||'');
  const requested=String(payload.type||'post');
  const type=requested==='quote'?'quote':requested==='reply'?'reply':'post';
  const item=await db.prepare(`SELECT * FROM x_content_opportunities WHERE source_post_id=?`).bind(id).first();if(!item)throw new Error('Content opportunity not found.');
  if(type==='reply'&&!Number(item.reply_authorised||0))throw new Error('External replies must be posted by Brandon through the X reply composer.');
  const edited=cleanPostText(payload.text|| (type==='reply'?item.reply_draft:item.post_draft));if(!edited)throw new Error('Post text is empty.');
  if(type==='reply')item.reply_draft=edited;else item.post_draft=edited;
  return publishOpportunity(env,item,type,{manual:true});
}

export async function publishDirectXContent(env, payload = {}) {
  throw new Error('API publishing is disabled. Open X and publish the prepared post manually.');
  if (!env.BLUE_ARCHIVE) throw new Error('BLUE_ARCHIVE binding missing');
  if (!hasWriteCredentials(env)) throw new Error('X publishing credentials are not configured.');
  await ensureXAutomationSchema(env.BLUE_ARCHIVE);
  const text = cleanPostText(payload.text || '');
  if (!text) throw new Error('Post text is empty.');
  const duplicate = await env.BLUE_ARCHIVE.prepare(`SELECT id FROM x_publications WHERE text=? AND status='published' AND created_at>datetime('now','-30 days') LIMIT 1`).bind(text).first();
  if (duplicate?.id) throw new Error('Duplicate post blocked.');
  const id = crypto.randomUUID();
  await env.BLUE_ARCHIVE.prepare(`INSERT INTO x_publications(id,publication_type,text,status) VALUES(?,'original',?,'sending')`).bind(id,text).run();
  try {
    const result = await createXPost(env,{text,made_with_ai:Boolean(payload.madeWithAi)});
    await env.BLUE_ARCHIVE.prepare(`UPDATE x_publications SET x_post_id=?,status='published',published_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result.id,id).run();
    return {ok:true,xPostId:result.id,text};
  } catch(error) {
    await env.BLUE_ARCHIVE.prepare(`UPDATE x_publications SET status='error',error_text=? WHERE id=?`).bind(String(error?.message||error).slice(0,800),id).run();
    throw error;
  }
}

export async function updateXAutomationSettings(env,payload={}){
  if(!env.BLUE_ARCHIVE)throw new Error('BLUE_ARCHIVE binding missing');
  const db=env.BLUE_ARCHIVE;await ensureXAutomationSchema(db);
  await setAutomationState(db,'x_auto_post_enabled','false');
  await setAutomationState(db,'x_auto_post_enabled_at','');
  return{ok:true,autoPostEnabled:false,autoPostEnabledAt:null,autoRepliesEnabled:false,note:'API posting is disabled; Brandon publishes through X Web Intents.'};
}

export async function dismissXOpportunity(db,sourcePostId){await ensureXAutomationSchema(db);await db.prepare(`UPDATE x_content_opportunities SET status='dismissed',updated_at=CURRENT_TIMESTAMP WHERE source_post_id=?`).bind(String(sourcePostId||'')).run();return{ok:true};}

export function getXAutomationStatus(env,connection={}){return{
  readingConfigured:Boolean(cleanSecret(env.X_BEARER_TOKEN)),
  publishingConfigured:false,
  readingVerified:connection.readingStatus==='ok',
  publishingVerified:false,
  readingStatus:connection.readingStatus||'untested',
  publishingStatus:'manual-x-composer',
  publishingUsername:'TheLeedsBuzz',
  lastConnectionTestAt:connection.lastTestAt||null,
  connectionMessage:connection.message||null,
  autoPostEnabled:false,
  autoPostEnabledAt:connection.autoPostEnabledAt||null,
  autoReplyEnabled:false,
  alertConfigured:Boolean(cleanSecret(env.CONTENT_ALERT_WEBHOOK_URL)||(cleanSecret(env.TELEGRAM_BOT_TOKEN)&&cleanSecret(env.TELEGRAM_CHAT_ID))),
  aiReplyApprovalConfirmed:String(env.X_AI_REPLY_APPROVED||'').toLowerCase()==='true',
  mode:'manual-x-composer',
  note:'BizBot updates the site and drafts posts. Brandon opens X and publishes manually, avoiding X API posting charges.',
};}

export async function testXConnections(env,options={}){
  if(!env.BLUE_ARCHIVE)throw new Error('BLUE_ARCHIVE binding missing');
  const db=env.BLUE_ARCHIVE;await ensureXAutomationSchema(db);
  const testRead=options.testRead!==false;const testWrite=options.testWrite===true;
  const result={ok:true,testedAt:new Date().toISOString()};
  if(testRead){
    if(!cleanSecret(env.X_BEARER_TOKEN)) result.reading={ok:false,status:'missing',error:'X_BEARER_TOKEN is not configured.'};
    else result.reading=await testXReading(env);
  }
  if(testWrite){
    if(!hasWriteCredentials(env)&&!cleanSecret(env.X_USER_ACCESS_TOKEN)) result.publishing={ok:false,status:'missing',error:'X publishing credentials are not configured.'};
    else result.publishing=await testXPublishingIdentity(env);
  }
  await writeXConnectionState(db,result);
  result.ok=(!result.reading||result.reading.ok||result.reading.status==='credits-required')&&(!result.publishing||result.publishing.ok||result.publishing.status==='credits-required');
  return result;
}

async function buildOpportunity(env,row){
  const handle=String(row.author_handle||'');const official=/^LUFC$/i.test(handle);const confidence=Number(row.confidence||0);const kind=row.kind|| (row.player_slug?'transfer':'general');
  const sourceWeight=Number(row.source_weight||0);
  const autoPost=false;
  // Self-serve X accounts may publish original or quote posts automatically. Unsolicited
  // replies remain a human action in Brandon's reply composer.
  const autoReply=false;
  const postMode='post';
  const fallback=deterministicDrafts(row,official,postMode);
  if(!env.OPENAI_API_KEY)return{kind,autoPost,autoReply,postMode,...fallback};
  try{
    const generated=await generateDraftsWithAI(env,row,official,postMode);
    return{kind,autoPost,autoReply,postMode,postDraft:cleanPostText(generated.postDraft||fallback.postDraft),replyDraft:cleanPostText(generated.replyDraft||fallback.replyDraft)};
  }catch(error){console.warn('X draft generation fallback',String(error?.message||error));return{kind,autoPost,autoReply,postMode,...fallback};}
}

function deterministicDrafts(row,official,postMode='quote'){
  const stage=stageLabel(row.stage);const name=titleFromSlug(row.player_slug);const handle=String(row.author_handle||'source').replace(/^@/,'');
  if(official){
    const summary=cleanSentence(row.summary||row.headline||row.post_text,205);
    return{postDraft:`Official Leeds United update: ${summary}`,replyDraft:`This is the key point from Leeds United's announcement: ${cleanSentence(summary,190)}`};
  }
  if(name){
    const summary=cleanSentence(row.summary||row.post_text,155);
    const sourceLine=postMode==='quote'?'':`

Source: @${handle}`;
    return{postDraft:`${name}: ${stage}. ${summary}${sourceLine}`,replyDraft:`The important part here is ${cleanSentence(summary,175)}. That moves ${name} into the ${stage.toLowerCase()} area of the LeedsBuzz.biz Transfer Radar.`};
  }
  const summary=cleanSentence(row.summary||row.headline||row.post_text,195);
  return{postDraft:`Leeds United update: ${summary}${postMode==='quote'?'':`

Source: @${handle}`}`,replyDraft:`The key Leeds United angle here: ${cleanSentence(summary,200)}`};
}

async function generateDraftsWithAI(env,row,official,postMode='quote'){
  const prompt=`You are the social editor for LeedsBuzz.biz, an independent Leeds supporter site. Write two original X drafts based only on the source text below. Never invent a fact. Do not copy more than 10 consecutive words. British English. Post draft: fast, useful, confident, max 250 characters. It will be published as a quote post when postMode is quote, so do not add a link or repeat the whole source. When postMode is standalone, credit @${row.author_handle}. Reply draft: directly useful and conversational, max 230 characters, no link. No generic praise. No abuse. ${official?'This is an official Leeds United post.':'This is a trusted journalist report, not official confirmation.'}\nSource @${row.author_handle}: ${row.post_text}\nPlayer slug: ${row.player_slug||'none'}\nRadar stage: ${stageLabel(row.stage)}\nReturn JSON with postDraft and replyDraft.`;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:env.SOCIAL_AI_MODEL||'gpt-5-mini',input:prompt,max_output_tokens:350,text:{format:{type:'json_schema',name:'x_drafts',strict:true,schema:{type:'object',additionalProperties:false,properties:{postDraft:{type:'string'},replyDraft:{type:'string'}},required:['postDraft','replyDraft']}}}})});
  if(!response.ok)throw new Error(`OpenAI returned ${response.status}`);const data=await response.json();const text=extractResponseText(data);return JSON.parse(text);
}

async function publishOpportunity(env,item,type,options={}){
  if(!hasWriteCredentials(env))throw new Error('X publishing credentials are not configured.');
  if(type==='reply'&&(!Number(item.reply_authorised||0)||!autoReplyAllowed(env,options.manual)))throw new Error('This external reply is not authorised for API publishing. Use Brandon’s X reply composer.');
  const text=cleanPostText(type==='reply'?item.reply_draft:item.post_draft);if(!text)throw new Error('Draft is empty.');
  const duplicate=await env.BLUE_ARCHIVE.prepare(`SELECT id FROM x_publications WHERE text=? AND status='published' AND created_at>datetime('now','-30 days') LIMIT 1`).bind(text).first();if(duplicate?.id)throw new Error('Duplicate post blocked.');
  const payload={text,made_with_ai:true};if(type==='reply')payload.reply={in_reply_to_tweet_id:item.source_post_id};if(type==='quote')payload.quote_tweet_id=item.source_post_id;
  const publicationId=crypto.randomUUID();await env.BLUE_ARCHIVE.prepare(`INSERT INTO x_publications(id,source_post_id,publication_type,text,status) VALUES(?,?,?,?, 'sending')`).bind(publicationId,item.source_post_id,type,text).run();
  try{
    const result=await createXPost(env,payload);
    await env.BLUE_ARCHIVE.prepare(`UPDATE x_publications SET x_post_id=?,status='published',published_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result.id,publicationId).run();
    await env.BLUE_ARCHIVE.prepare(`UPDATE x_content_opportunities SET status=?,updated_at=CURRENT_TIMESTAMP WHERE source_post_id=?`).bind(type==='reply'?'replied':'posted',item.source_post_id).run();
    return{ok:true,type,xPostId:result.id,sourcePostId:item.source_post_id,text};
  }catch(error){await env.BLUE_ARCHIVE.prepare(`UPDATE x_publications SET status='error',error_text=? WHERE id=?`).bind(String(error?.message||error).slice(0,800),publicationId).run();throw error;}
}

async function createXPost(env,payload){
  const url='https://api.x.com/2/tweets';
  const response=await userContextFetch(env,url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const text=await response.text();let data={};try{data=JSON.parse(text)}catch{}
  if(!response.ok||!data?.data?.id)throw new Error(formatXError('create post',response.status,text));return data.data;
}

async function testXReading(env){
  const response=await fetch('https://api.x.com/2/users/by/username/LUFC?user.fields=username,name',{headers:{authorization:`Bearer ${cleanSecret(env.X_BEARER_TOKEN)}`}});
  const text=await response.text();if(response.ok)return{ok:true,status:'ok'};
  if(response.status===402)return{ok:false,status:'credits-required',error:formatXError('read test',response.status,text)};
  return{ok:false,status:'failed',error:formatXError('read test',response.status,text)};
}

async function testXPublishingIdentity(env){
  const response=await userContextFetch(env,'https://api.x.com/2/users/me?user.fields=username,name',{method:'GET'});
  const text=await response.text();let data={};try{data=JSON.parse(text)}catch{}
  if(response.ok&&data?.data?.username)return{ok:true,status:'ok',username:data.data.username,name:data.data.name||data.data.username};
  if(response.status===402)return{ok:false,status:'credits-required',error:formatXError('publishing identity test',response.status,text)};
  return{ok:false,status:'failed',error:formatXError('publishing identity test',response.status,text)};
}

async function userContextFetch(env,url,options={}){
  const oauth2=cleanSecret(env.X_USER_ACCESS_TOKEN);
  if(oauth2){
    return fetch(url,{...options,headers:{...(options.headers||{}),authorization:`Bearer ${oauth2}`}});
  }
  if(!hasWriteCredentials(env))throw new Error('X OAuth 1.0a credentials are not configured.');
  return oauth1Fetch(env,url,options);
}

async function oauth1Fetch(env,url,options={}){
  const parsed=new URL(url);const method=String(options.method||'GET').toUpperCase();
  const oauth={oauth_consumer_key:cleanSecret(env.X_API_KEY),oauth_nonce:randomNonce(),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_token:cleanSecret(env.X_ACCESS_TOKEN),oauth_version:'1.0'};
  const signatureParams={...oauth};for(const [key,value] of parsed.searchParams.entries())signatureParams[key]=value;
  oauth.oauth_signature=await oauthSignature(method,`${parsed.origin}${parsed.pathname}`,signatureParams,cleanSecret(env.X_API_SECRET),cleanSecret(env.X_ACCESS_TOKEN_SECRET));
  const authorization='OAuth '+Object.entries(oauth).sort(([a],[b])=>percent(a).localeCompare(percent(b))).map(([key,value])=>`${percent(key)}="${percent(value)}"`).join(', ');
  return fetch(url,{...options,method,headers:{...(options.headers||{}),authorization}});
}

async function oauthSignature(method,url,params,consumerSecret,tokenSecret){
  const encoded=Object.entries(params).map(([key,value])=>[percent(key),percent(value)]).sort(([aKey,aVal],[bKey,bVal])=>aKey===bKey?aVal.localeCompare(bVal):aKey.localeCompare(bKey));
  const paramString=encoded.map(([key,value])=>`${key}=${value}`).join('&');
  const base=[method.toUpperCase(),percent(url),percent(paramString)].join('&');const keyData=new TextEncoder().encode(`${percent(consumerSecret)}&${percent(tokenSecret)}`);const cryptoKey=await crypto.subtle.importKey('raw',keyData,{name:'HMAC',hash:'SHA-1'},false,['sign']);const signature=await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(base));return bytesToBase64(new Uint8Array(signature));
}

async function readAutomationControls(db){
  const rows=await safeRows(db,`SELECT key,value FROM automation_state WHERE key IN ('x_auto_post_enabled','x_auto_post_enabled_at')`);
  const map=Object.fromEntries(rows.map(row=>[row.key,row.value]));
  return{autoPostEnabled:String(map.x_auto_post_enabled||'').toLowerCase()==='true',autoPostEnabledAt:map.x_auto_post_enabled_at||null};
}
async function setAutomationState(db,key,value){await db.prepare(`INSERT INTO automation_state(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(key,String(value||'')).run();}

async function readXConnectionState(db){
  const rows=await safeRows(db,`SELECT key,value FROM automation_state WHERE key IN ('x_reading_status','x_publishing_status','x_publishing_username','x_connection_message','x_connection_test_at')`);
  const map=Object.fromEntries(rows.map(row=>[row.key,row.value]));return{readingStatus:map.x_reading_status||'untested',publishingStatus:map.x_publishing_status||'untested',publishingUsername:map.x_publishing_username||null,message:map.x_connection_message||null,lastTestAt:map.x_connection_test_at||null};
}

async function writeXConnectionState(db,result){
  const values={x_connection_test_at:result.testedAt||new Date().toISOString()};
  if(result.reading){values.x_reading_status=result.reading.status||'failed';}
  if(result.publishing){values.x_publishing_status=result.publishing.status||'failed';values.x_publishing_username=result.publishing.username||'';}
  values.x_connection_message=[result.reading?.error,result.publishing?.error].filter(Boolean).join(' | ').slice(0,1000);
  for(const [key,value] of Object.entries(values))await db.prepare(`INSERT INTO automation_state(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).bind(key,String(value||'')).run();
}

function formatXError(action,status,text){
  let detail='';try{const data=JSON.parse(text);detail=data.detail||data.title||data.error||data.errors?.[0]?.detail||text}catch{detail=text}
  detail=String(detail||'Unknown X error').replace(/\s+/g,' ').trim().slice(0,500);
  const hint=status===401?'The Consumer Key/Secret and Access Token/Secret do not match, are expired, or were copied incorrectly.':status===402?'The X developer account needs API credits.':status===403?'The app or token does not have permission for this action.':'';
  return `X ${action} returned ${status}: ${detail}${hint?` ${hint}`:''}`;
}

async function sendOpportunityAlerts(env,db,items){
  const fresh=(items||[]).filter(item=>item?.sourcePostId).slice(0,8);if(!fresh.length)return;
  const deskUrl=cleanSecret(env.CONTENT_DESK_URL)||'https://leedsbuzz.biz/content-desk';
  const lines=fresh.map(item=>`@${item.sourceHandle}: ${cleanSentence(item.sourceText,150)}`);
  const text=`LeedsBuzz.biz: ${fresh.length} new content opportunit${fresh.length===1?'y':'ies'}

${lines.join('\n\n')}

Open desk: ${deskUrl}`;
  const webhook=cleanSecret(env.CONTENT_ALERT_WEBHOOK_URL);
  if(webhook){const response=await fetch(webhook,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'LeedsBuzz.biz Content Desk',text,url:deskUrl,items:fresh})});if(!response.ok)throw new Error(`Alert webhook returned ${response.status}`);}
  const bot=cleanSecret(env.TELEGRAM_BOT_TOKEN),chat=cleanSecret(env.TELEGRAM_CHAT_ID);
  if(bot&&chat){const response=await fetch(`https://api.telegram.org/bot${encodeURIComponent(bot)}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text,disable_web_page_preview:true})});if(!response.ok)throw new Error(`Telegram alert returned ${response.status}`);}
  const ids=fresh.map(item=>item.sourcePostId);if(ids.length){const placeholders=ids.map(()=>'?').join(',');await db.prepare(`UPDATE x_content_opportunities SET alerted_at=CURRENT_TIMESTAMP WHERE source_post_id IN (${placeholders})`).bind(...ids).run();}
}

async function postBudget(db){const day=await db.prepare(`SELECT COUNT(*) AS c FROM x_publications WHERE publication_type IN ('post','quote','original') AND status='published' AND created_at>datetime('now','-24 hours')`).first();const hour=await db.prepare(`SELECT COUNT(*) AS c FROM x_publications WHERE publication_type IN ('post','quote','original') AND status='published' AND created_at>datetime('now','-1 hour')`).first();return{remaining:Math.max(0,Math.min(16-Number(day?.c||0),4-Number(hour?.c||0)))};}
async function replyBudget(db){const row=await db.prepare(`SELECT COUNT(*) AS c FROM x_publications WHERE publication_type='reply' AND status='published' AND created_at>datetime('now','-24 hours')`).first();const hour=await db.prepare(`SELECT COUNT(*) AS c FROM x_publications WHERE publication_type='reply' AND status='published' AND created_at>datetime('now','-1 hour')`).first();return{remaining:Math.max(0,Math.min(6-Number(row?.c||0),2-Number(hour?.c||0)))};}
function autoPostEnabled(env){return false;}
function autoReplyEnabled(){return false;}
function autoReplyAllowed(){return false;}
function cleanSecret(value){return String(value||'').trim();}
function hasWriteCredentials(env){return Boolean(cleanSecret(env.X_API_KEY)&&cleanSecret(env.X_API_SECRET)&&cleanSecret(env.X_ACCESS_TOKEN)&&cleanSecret(env.X_ACCESS_TOKEN_SECRET));}
function stageLabel(stage){return({1:'Rumour',2:'Reported interest',3:'Credible',4:'Advanced',5:'Imminent',6:'Completed'})[Number(stage)]||'Update';}
function titleFromSlug(slug){return String(slug||'').split('-').filter(Boolean).map(part=>part[0]?.toUpperCase()+part.slice(1)).join(' ');}
function cleanSentence(value,max){const text=String(value||'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();return text.length>max?`${text.slice(0,max-1).trim()}…`:text;}
function cleanPostText(value){let text=String(value||'').replace(/[\u0000-\u001f\u007f]/g,char=>char==='\n'?'\n':' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();if([...text].length>280)text=[...text].slice(0,279).join('').trimEnd()+'…';return text;}
function percent(value){return encodeURIComponent(String(value)).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);}
function randomNonce(){const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function bytesToBase64(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);}
function extractResponseText(data){if(typeof data?.output_text==='string')return data.output_text;const parts=[];for(const item of data?.output||[])for(const content of item?.content||[]){if(typeof content?.text==='string')parts.push(content.text);else if(typeof content?.text?.value==='string')parts.push(content.text.value);}return parts.join('\n');}
async function safeRows(db,sql,binds=[]){try{const query=db.prepare(sql);const result=binds.length?await query.bind(...binds).all():await query.all();return result.results||[];}catch(error){console.warn('X content query skipped',String(error?.message||error));return[];}}
function isRelevantOpportunityRow(row){
  const text=String(row?.source_text||row?.post_text||'').toLowerCase();
  if(String(row?.kind||'')!=='transfer'||!row?.player_slug)return false;
  if(['aston-villa','villa'].includes(String(row.player_slug)))return false;
  if(/\b(app|download the app|away shirt|home shirt|third shirt|kit launch|club shop|megastore|tickets? on sale|hospitality|travel package|fan app)\b/.test(text))return false;
  return true;
}

function mapOpportunity(row){return{sourcePostId:row.source_post_id,sourceHandle:row.source_handle,sourceName:row.source_name,sourceText:row.source_text,sourceUrl:row.source_url,publishedAt:row.published_at,kind:row.kind,playerSlug:row.player_slug,transferStage:row.transfer_stage,confidence:Number(row.confidence||0),postDraft:row.post_draft,replyDraft:row.reply_draft,status:row.status,autoPostEligible:Boolean(Number(row.auto_post_eligible)),autoReplyEligible:Boolean(Number(row.auto_reply_eligible)),postMode:row.post_mode||'quote',replyAuthorised:Boolean(Number(row.reply_authorised||0)),alertedAt:row.alerted_at||null,createdAt:row.created_at,updatedAt:row.updated_at};}
function mapPublication(row){return{id:row.id,sourcePostId:row.source_post_id,type:row.publication_type,xPostId:row.x_post_id,text:row.text,status:row.status,error:row.error_text,createdAt:row.created_at,publishedAt:row.published_at};}

export async function xWebhookCrcResponse(env, crcToken) {
  if (!env.X_API_SECRET) throw new Error('X_API_SECRET is not configured.');
  const signature = await hmacBase64('SHA-256', env.X_API_SECRET, String(crcToken || ''));
  return { response_token: `sha256=${signature}` };
}

export async function verifyXWebhookSignature(env, rawBody, suppliedSignature) {
  if (!env.X_API_SECRET || !suppliedSignature) return false;
  const expected = `sha256=${await hmacBase64('SHA-256', env.X_API_SECRET, String(rawBody || ''))}`;
  return timingSafeEqual(expected, String(suppliedSignature));
}

async function hmacBase64(hash, secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)), { name:'HMAC', hash }, false, ['sign']);
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value)));
  return bytesToBase64(new Uint8Array(result));
}

function timingSafeEqual(a,b){
  const left=new TextEncoder().encode(String(a));const right=new TextEncoder().encode(String(b));if(left.length!==right.length)return false;let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];return diff===0;
}
