import { TROPHIES, TIMELINE_EVENTS, HISTORY_SOURCES } from '../data/leeds-history-data.js';



const MANAGER_PROFILES = {
  'don revie': 'Built the defining Leeds United side, winning two league titles, the FA Cup, League Cup and two Inter-Cities Fairs Cups.',
  'jimmy armfield': 'Stabilised the club after the Revie era and guided Leeds to the 1975 European Cup final.',
  'allan clarke': 'Returned to Elland Road as manager during a difficult transition at the start of the 1980s.',
  'eddie gray': 'Served Leeds as player and manager, developing young talent during a demanding period.',
  'billy bremner': 'The great captain returned as manager and helped restore pride and direction in the Second Division.',
  'howard wilkinson': 'Won promotion in 1990 and made Leeds champions of England in 1991/92.',
  'george graham': 'Rebuilt defensive organisation and returned Leeds to European qualification.',
  'david o leary': 'Led a gifted young side to UEFA Cup and Champions League semi-finals.',
  'simon grayson': 'Guided Leeds out of League One and delivered the memorable FA Cup victory at Old Trafford.',
  'marcelo bielsa': 'Transformed the football, reconnected club and supporters, and won promotion as Championship champions.',
  'daniel farke': 'Led Leeds through the Championship rebuild and the 2024/25 title-winning promotion campaign.'
};

const MANAGER_HONOUR_KEYS = {
  'don revie':['1963-64|second division championship title','1967-68|league cup','1967-68|inter cities fairs cup','1968-69|english league title','1969-70|fa charity shield','1970-71|inter cities fairs cup','1971-72|fa cup','1973-74|english league title'],
  'howard wilkinson':['1989-90|second division championship title','1991-92|english league title','1992-93|fa charity shield'],
  'marcelo bielsa':['2019-20|second division championship title'],
  'daniel farke':['2024-25|second division championship title']
};

export async function getHistoryArchive(db, options = {}) {
  const currentYear = new Date().getUTCFullYear();
  const fromYear = clampYear(options.fromYear, 1919, currentYear, 1919);
  const toYear = clampYear(options.toYear, fromYear, currentYear, currentYear);
  const [seasonRows, managerRows, honourRows, iconicRows] = await Promise.all([
    safeAll(db, `SELECT s.id,s.label,
      COUNT(m.id) AS matches,
      SUM(CASE WHEN lower(m.home_team) LIKE '%leeds%' AND m.home_score>m.away_score THEN 1
               WHEN lower(m.away_team) LIKE '%leeds%' AND m.away_score>m.home_score THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN m.home_score IS NOT NULL AND m.away_score IS NOT NULL AND m.home_score=m.away_score THEN 1 ELSE 0 END) AS draws,
      SUM(CASE WHEN lower(m.home_team) LIKE '%leeds%' AND m.home_score<m.away_score THEN 1
               WHEN lower(m.away_team) LIKE '%leeds%' AND m.away_score<m.home_score THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN lower(m.home_team) LIKE '%leeds%' THEN COALESCE(m.home_score,0) ELSE COALESCE(m.away_score,0) END) AS goals_for,
      SUM(CASE WHEN lower(m.home_team) LIKE '%leeds%' THEN COALESCE(m.away_score,0) ELSE COALESCE(m.home_score,0) END) AS goals_against,
      MIN(m.played_at) AS first_match_at,MAX(m.played_at) AS last_match_at,
      COUNT(DISTINCT c.id) AS competition_count
    FROM seasons s
    LEFT JOIN matches m ON m.season_id=s.id AND (lower(m.home_team) LIKE '%leeds%' OR lower(m.away_team) LIKE '%leeds%')
    LEFT JOIN competitions c ON c.id=m.competition_id
    GROUP BY s.id,s.label ORDER BY s.label ASC`),
    safeAll(db, `SELECT id,full_name,nationality,started_on,ended_on,is_interim,notes
      FROM managers ORDER BY COALESCE(started_on,'1900-01-01') ASC,full_name ASC`),
    safeAll(db, `SELECT h.id,h.name,h.season,h.competition,h.notes,h.verified,
      s.title AS source_title,s.publisher,s.url AS source_url
      FROM honours h LEFT JOIN sources s ON s.id=h.source_id
      ORDER BY COALESCE(h.season,'0000') DESC,h.name ASC`),
    safeAll(db, `SELECT m.id,m.played_at,m.round_name,m.venue,m.home_team,m.away_team,m.home_score,m.away_score,
      c.name AS competition_name,s.title AS source_title,s.publisher,s.url AS source_url
      FROM matches m LEFT JOIN competitions c ON c.id=m.competition_id LEFT JOIN sources s ON s.id=m.source_id
      WHERE (lower(m.home_team) LIKE '%leeds%' OR lower(m.away_team) LIKE '%leeds%')
        AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
      ORDER BY datetime(m.played_at) DESC LIMIT 80`),
  ]);

  const expectedLabels = buildSeasonLabels(fromYear, toYear);
  const baseManagers = managerRows.map(mapManager);
  const loadedSeasons = new Map(seasonRows.map(row => [normaliseSeasonLabel(row.label), row]));
  const staticHonours = buildStaticHonours();
  const honours = mergeHonours(honourRows, staticHonours);
  const staticMatches = buildStaticIconicMatches();
  const iconicMatches = mergeMatches(iconicRows.map(mapMatch), staticMatches);

  const seasons = expectedLabels.map(label => {
    const row = loadedSeasons.get(label);
    const managers = managersForSeason(baseManagers, label);
    const seasonHonours = honours.filter(item => seasonEquals(item.season, label));
    const milestones = TIMELINE_EVENTS.filter(event => seasonEventMatches(event, label)).map(event => ({
      id:event.id,
      year:event.year,
      date:event.date,
      title:event.title,
      type:event.type,
      summary:event.summary,
      source:sourceFromKey(event.source),
    }));
    const matchLoaded = Boolean(row && Number(row.matches || 0) > 0);
    const sourceBacked = matchLoaded || seasonHonours.length > 0 || milestones.length > 0 || managers.length > 0;
    return {
      label,
      loaded: matchLoaded,
      sourceBacked,
      matches: Number(row?.matches || 0),
      wins: Number(row?.wins || 0),
      draws: Number(row?.draws || 0),
      losses: Number(row?.losses || 0),
      goalsFor: Number(row?.goals_for || 0),
      goalsAgainst: Number(row?.goals_against || 0),
      competitionCount: Number(row?.competition_count || 0),
      firstMatchAt: row?.first_match_at || null,
      lastMatchAt: row?.last_match_at || null,
      managers,
      honours: seasonHonours,
      milestones,
      verification: matchLoaded ? 'match-source-loaded' : sourceBacked ? 'archive-source-backed' : 'pending',
    };
  }).reverse();

  const managers = enrichManagers(baseManagers, seasons, honours);
  const matchRecords = seasonRows.reduce((sum,row)=>sum+Number(row.matches||0),0);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    coverage: {
      expectedSeasons: seasons.length,
      loadedSeasons: seasons.filter(season => season.loaded).length,
      sourceBackedSeasons: seasons.filter(season => season.sourceBacked).length,
      managerRecords: managers.length,
      honourRecords: honours.length,
      matchRecords,
      iconicMatchRecords: iconicMatches.length,
    },
    seasons,
    managers,
    honours,
    iconicMatches,
  };
}

function buildStaticHonours() {
  const result=[];
  for (const trophy of TROPHIES || []) {
    for (const season of trophy.seasons || []) {
      result.push({
        id:`static:${trophy.id}:${normaliseSeasonLabel(season)}`,
        name:trophy.name,
        season:normaliseSeasonLabel(season),
        competition:trophy.name,
        notes:`Leeds won the ${trophy.name}.`,
        verified:true,
        source:sourceFromKey(trophy.source),
        group:trophy.group || null,
      });
    }
  }
  return result;
}

function mergeHonours(rows, fallback) {
  const map=new Map();
  for (const item of fallback) map.set(`${normaliseSeasonLabel(item.season)}|${normaliseName(item.name)}`,item);
  for (const row of rows || []) {
    const item={
      id:row.id,
      name:row.name,
      season:normaliseSeasonLabel(row.season || ''),
      competition:row.competition || row.name || null,
      notes:row.notes || null,
      verified:Boolean(Number(row.verified || 0)),
      source:row.source_url ? { title:row.source_title || row.publisher || 'Source',publisher:row.publisher || null,url:row.source_url } : null,
      group:null,
    };
    map.set(`${normaliseSeasonLabel(item.season)}|${normaliseName(item.name)}`,item);
  }
  return [...map.values()].sort((a,b)=>String(b.season||'').localeCompare(String(a.season||''))||String(a.name||'').localeCompare(String(b.name||'')));
}

function buildStaticIconicMatches() {
  return (TIMELINE_EVENTS || []).filter(event=>event.type==='match' || event.type==='trophy').map(event=>({
    id:`timeline:${event.id}`,
    playedAt:dateFromEvent(event),
    round:event.type==='trophy'?'Final / decisive moment':null,
    venue:null,
    homeTeam:'Leeds United',
    awayTeam:event.title,
    homeScore:null,
    awayScore:null,
    competition:event.trophy || event.title,
    title:event.title,
    summary:event.summary,
    source:sourceFromKey(event.source),
    timeline:true,
  }));
}

function mergeMatches(databaseRows, staticRows) {
  const result=[]; const seen=new Set();
  for (const item of databaseRows || []) {
    const key=`${item.playedAt||''}|${normaliseName(item.homeTeam)}|${normaliseName(item.awayTeam)}`;
    if(seen.has(key))continue; seen.add(key); result.push(item);
  }
  for (const item of staticRows || []) {
    const key=`${item.playedAt||''}|${normaliseName(item.title||item.awayTeam)}`;
    if(seen.has(key))continue; seen.add(key); result.push(item);
  }
  return result.sort((a,b)=>String(b.playedAt||'').localeCompare(String(a.playedAt||''))).slice(0,120);
}

function enrichManagers(managers, seasons, honours) {
  return managers.map(manager=>{
    const managedSeasons=seasons.filter(season=>(season.managers||[]).some(item=>item.id===manager.id || normaliseName(item.name)===normaliseName(manager.name)));
    const allowed=new Set(MANAGER_HONOUR_KEYS[normaliseName(manager.name)]||[]);
    const tenureHonours=honours.filter(honour=>allowed.has(`${normaliseSeasonLabel(honour.season)}|${normaliseName(honour.name)}`));
    const highlights=(TIMELINE_EVENTS||[]).filter(event=>{
      if(!manager.startedOn)return false;
      const eventTime=Date.parse(dateFromEvent(event));const start=Date.parse(manager.startedOn);const end=manager.endedOn?Date.parse(manager.endedOn):Date.now();
      return Number.isFinite(eventTime)&&eventTime>=start&&eventTime<=end&&(event.type==='manager'||event.type==='trophy'||event.type==='match');
    }).slice(-6).reverse().map(event=>({id:event.id,title:event.title,year:event.year,summary:event.summary,source:sourceFromKey(event.source)}));
    const seasonLabels=managedSeasons.map(season=>season.label).sort();
    const tenure=describeTenure(manager.startedOn,manager.endedOn);
    const profile=MANAGER_PROFILES[normaliseName(manager.name)] || buildManagerSummary(manager,seasonLabels,tenureHonours);
    return {
      ...manager,
      seasonCount:managedSeasons.length,
      seasons:seasonLabels,
      firstSeason:seasonLabels[0]||null,
      lastSeason:seasonLabels[seasonLabels.length-1]||null,
      tenureLabel:tenure.label,
      tenureDays:tenure.days,
      eraLabel:managerEra(manager.startedOn),
      profile,
      trophyWinner:tenureHonours.length>0,
      honours:tenureHonours,
      highlights,
    };
  }).sort((a,b)=>String(b.startedOn||'0000').localeCompare(String(a.startedOn||'0000'))||String(a.name).localeCompare(String(b.name)));
}

async function safeAll(db, sql) {
  try { const rows=await db.prepare(sql).all(); return rows.results || []; }
  catch (error) { console.warn('History archive query skipped',String(error?.message||error)); return []; }
}

function buildSeasonLabels(fromYear,toYear){const labels=[];for(let year=fromYear;year<=toYear;year+=1)labels.push(`${year}-${String(year+1).slice(-2)}`);return labels;}
function normaliseSeasonLabel(value){const text=String(value||'').trim().replace('/', '-');const full=text.match(/((?:18|19|20)\d{2})-(\d{2,4})/);if(full)return `${full[1]}-${String(Number(full[1])+1).slice(-2)}`;const single=text.match(/^((?:18|19|20)\d{2})$/);if(single)return `${single[1]}-${String(Number(single[1])+1).slice(-2)}`;return text;}
function seasonEquals(a,b){return normaliseSeasonLabel(a)===normaliseSeasonLabel(b);}
function seasonEventMatches(event,label){const year=Number(String(label).slice(0,4));const text=String(event.date||'');if(Number(event.year)===year||Number(event.year)===year+1){if(/\d{4}[\/-]\d{2,4}/.test(text)){const start=Number(text.match(/\d{4}/)?.[0]||0);return start===year;}return true;}return false;}
function managersForSeason(managers,label){const startYear=Number(String(label).slice(0,4));const start=Date.UTC(startYear,6,1);const end=Date.UTC(startYear+1,5,30,23,59,59);return managers.filter(manager=>{const began=manager.startedOn?Date.parse(manager.startedOn):-Infinity;const finished=manager.endedOn?Date.parse(manager.endedOn):Infinity;return began<=end&&finished>=start;}).map(manager=>({id:manager.id,name:manager.name,interim:manager.interim}));}
function managerCoversSeason(manager,label){if(!label||!manager.startedOn)return false;const startYear=Number(String(normaliseSeasonLabel(label)).slice(0,4));if(!Number.isFinite(startYear))return false;const seasonStart=Date.UTC(startYear,6,1);const seasonEnd=Date.UTC(startYear+1,5,30,23,59,59);const began=Date.parse(manager.startedOn);const finished=manager.endedOn?Date.parse(manager.endedOn):Infinity;return began<=seasonEnd&&finished>=seasonStart;}
function mapManager(row){return{id:row.id,name:row.full_name,nationality:row.nationality||null,startedOn:row.started_on||null,endedOn:row.ended_on||null,interim:Boolean(Number(row.is_interim||0)),notes:row.notes||null};}
function mapMatch(row){return{id:row.id,playedAt:row.played_at||null,round:row.round_name||null,venue:row.venue||null,homeTeam:row.home_team||null,awayTeam:row.away_team||null,homeScore:row.home_score===null||row.home_score===undefined?null:Number(row.home_score),awayScore:row.away_score===null||row.away_score===undefined?null:Number(row.away_score),competition:row.competition_name||null,title:null,summary:null,source:row.source_url?{title:row.source_title||row.publisher||'Source',publisher:row.publisher||null,url:row.source_url}:null,timeline:false};}
function sourceFromKey(key){const source=HISTORY_SOURCES?.[key];return source?{title:source.label,publisher:source.tier||null,url:source.url}:null;}
function dateFromEvent(event){const text=String(event.date||'');const iso=text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);if(iso){const parsed=Date.parse(`${iso[1]} ${iso[2]} ${iso[3]} UTC`);if(Number.isFinite(parsed))return new Date(parsed).toISOString().slice(0,10);}return `${Number(event.year)||1919}-01-01`;}
function normaliseName(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}


function describeTenure(startValue,endValue){
  const start=Date.parse(startValue||'');
  const end=endValue?Date.parse(endValue):Date.now();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return{days:null,label:'Tenure length pending verification'};
  const days=Math.max(1,Math.round((end-start)/86400000));
  if(days<60)return{days,label:`${days} day${days===1?'':'s'}`};
  const months=Math.round(days/30.4375);
  if(months<24)return{days,label:`${months} month${months===1?'':'s'}`};
  const years=days/365.2425;
  return{days,label:`${years.toFixed(years>=5?1:2)} years`};
}
function managerEra(startValue){const year=Number(String(startValue||'').slice(0,4));if(!Number.isFinite(year))return'Leeds archive';if(year<1961)return'Foundation years';if(year<1975)return'Revie era';if(year<1990)return'Rebuilding years';if(year<1997)return'Wilkinson era';if(year<2004)return'European nights';if(year<2018)return'The long road back';if(year<2023)return'Bielsa and Premier League return';return'Current era';}
function buildManagerSummary(manager,seasons,honours){
  const span=seasons.length?(seasons.length===1?seasons[0]:`${seasons[0]} to ${seasons[seasons.length-1]}`):'a tenure still being linked to the season archive';
  if(honours.length)return `${manager.name} managed Leeds United across ${span}, with ${honours.length} verified honour${honours.length===1?'':'s'} linked to the tenure.`;
  return `${manager.name} managed Leeds United across ${span}. The archive links the tenure to verified seasons and milestones without inventing incomplete match statistics.`;
}
function clampYear(value,min,max,fallback){const number=Number(value);return Math.max(min,Math.min(max,Number.isFinite(number)?Math.round(number):fallback));}
