import { BLUE_VAULT_DATABASE } from './data/blue-vault-database.js';
import { HISTORY_SOURCES, ERAS, TIMELINE_EVENTS, TROPHIES, GOAL_LEADERS, CLUB_RECORDS } from './data/leeds-history-data.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sourceFor = key => HISTORY_SOURCES[key] || null;
const eventById = new Map(TIMELINE_EVENTS.map(event => [event.id, event]));
const vaultPlayerSlugs = new Set((BLUE_VAULT_DATABASE.players||[]).map(player => player.slug));
const sortedEvents = TIMELINE_EVENTS.map((event,index)=>({...event,__order:index})).sort((a,b) => a.year - b.year || a.__order - b.__order);
let activeIndex = 0;
let archiveData = null;
let archiveTab = 'seasons';

function playerLink(slug){ return slug ? `/white-vault?player=${encodeURIComponent(slug)}` : '#'; }
function sourceLink(key, text = 'VIEW SOURCE'){ const source = sourceFor(key); return source ? `<a href="${source.url}" target="_blank" rel="noopener">${text} ↗</a>` : ''; }
function eventTypeLabel(type){ return ({trophy:'TROPHY',match:'MATCH',season:'SEASON',manager:'MANAGER',club:'CLUB MILESTONE'})[type] || 'LEEDS UNITED HISTORY'; }
function eraForYear(year){ return ERAS.find(era => year >= era.start && year <= era.end) || ERAS[ERAS.length-1]; }

function renderDecades(){
  const decades = [1919,1920,1930,1940,1950,1960,1970,1980,1990,2000,2010,2020];
  $('#decadeJumps').innerHTML = decades.map((year,index) => `<button type="button" data-year="${year}" class="${index===0?'active':''}">${year===1919?'1919':`${year}s`}</button>`).join('');
  $$('#decadeJumps button').forEach(button => button.addEventListener('click', () => jumpToYear(Number(button.dataset.year))));
}

function renderTimeline(){
  $('#timelineRail').innerHTML = sortedEvents.map((event,index) => `
    <article class="timeline-card ${event.featured?'featured':''} ${index===0?'active':''}" data-event-id="${event.id}" data-index="${index}">
      <div class="timeline-year">${event.year}</div>
      <span class="timeline-type">${eventTypeLabel(event.type)}</span>
      <h3>${event.title}</h3>
      <p>${event.summary}</p>
      <footer><span>${event.date}</span><button type="button" data-open-event="${event.id}">OPEN →</button></footer>
    </article>`).join('');
  $$('[data-open-event]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); openEvent(button.dataset.openEvent); }));
  $$('.timeline-card').forEach(card => card.addEventListener('click', () => setActiveEvent(Number(card.dataset.index), true)));
}

function renderEras(){
  $('#eraGrid').innerHTML = ERAS.map((era,index) => `
    <article class="era-card" data-era-id="${era.id}" data-number="0${index+1}" tabindex="0">
      <span>${era.label} · ${era.start}–${era.end===2026?'TODAY':era.end}</span>
      <h3>${era.title}</h3>
      <p>${era.description}</p>
      <footer><b>${sortedEvents.filter(event=>event.era===era.id).length} milestones</b><i>EXPLORE →</i></footer>
    </article>`).join('');
  $$('.era-card').forEach(card => {
    const activate = () => { const era = ERAS.find(item => item.id === card.dataset.eraId); jumpToYear(era.start); $('#timeline').scrollIntoView({behavior:'smooth',block:'start'}); };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', event => { if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();} });
  });
}

function renderTrophies(filter='all'){
  const rows = TROPHIES.filter(trophy => filter === 'all' || trophy.group === filter);
  $('#trophyGrid').innerHTML = rows.map(trophy => `
    <article class="trophy-card">
      <div class="trophy-icon">${trophy.icon}</div><div class="trophy-count">${trophy.count}</div>
      <h3>${trophy.name}</h3>
      <div class="seasons">${trophy.seasons.map(season=>`<span>${season}</span>`).join('')}</div>
      ${sourceLink(trophy.source)}
    </article>`).join('');
}

function appearanceLeaders(){
  const preferred = ['jack-charlton','billy-bremner','paul-reaney','norman-hunter','paul-madeley','peter-lorimer','eddie-gray','gary-kelly','johnny-giles','david-harvey'];
  const bySlug = new Map((BLUE_VAULT_DATABASE.players||[]).map(player => [player.slug,player]));
  return preferred.map((slug,index) => {
    const player = bySlug.get(slug);
    return player ? { rank:index+1,name:player.displayName||player.fullName,slug,value:Number(player.appearances)||0 } : null;
  }).filter(Boolean);
}

function renderLeaderRows(rows, sourceKey, unit){
  const max = Math.max(...rows.map(row=>row.value),1);
  return `<div class="leader-list">${rows.map(row => `
    <div class="leader-row">
      <span class="rank">${String(row.rank).padStart(2,'0')}</span>
      <div>${vaultPlayerSlugs.has(row.slug)?`<a href="${playerLink(row.slug)}">${row.name}</a>`:`<b>${row.name}</b>`}<div class="record-bar"><i style="width:${Math.max(8,(row.value/max)*100)}%"></i></div></div>
      <strong>${row.value.toLocaleString('en-GB')}<small>${unit}</small></strong>
      ${vaultPlayerSlugs.has(row.slug)?`<a class="open-player" href="${playerLink(row.slug)}" aria-label="Open ${row.name} in the White Vault">→</a>`:'<span class="open-player" aria-hidden="true">—</span>'}
    </div>`).join('')}</div><div class="record-source">${sourceLink(sourceKey,'OFFICIAL RECORD SOURCE')}</div>`;
}

function renderRecordBoard(tab='appearances'){
  if(tab==='appearances') $('#recordBoard').innerHTML = renderLeaderRows(appearanceLeaders(),'appearances','');
  if(tab==='goals') $('#recordBoard').innerHTML = renderLeaderRows(GOAL_LEADERS,'goals','');
  if(tab==='records') $('#recordBoard').innerHTML = `<div class="club-record-grid">${CLUB_RECORDS.map(record => `
    <article class="club-record"><span>${record.label}</span><strong>${record.value}</strong>${record.slug&&vaultPlayerSlugs.has(record.slug)?`<a href="${playerLink(record.slug)}">${record.holder}</a>`:`<b>${record.holder}</b>`}<p>${record.note}</p><footer>${sourceLink(record.source,'SOURCE')}</footer></article>`).join('')}</div>`;
}

function renderSources(){
  const keys = Object.keys(HISTORY_SOURCES);
  $('#sourceList').innerHTML = keys.map(key => { const source=sourceFor(key); return source ? `<a href="${source.url}" target="_blank" rel="noopener"><b>${source.label}</b><span>${source.tier} ↗</span></a>` : ''; }).join('');
}

function updateRangeBubble(year){
  const input=$('#yearRange'); const bubble=$('#yearBubble');
  const min=Number(input.min),max=Number(input.max); const percent=(year-min)/(max-min);
  bubble.style.left=`calc(${percent*100}% + ${(0.5-percent)*22}px)`; bubble.value=year; bubble.textContent=year;
}

function updateFeatured(event){
  $('#featuredEvent').innerHTML = `<div class="featured-year">${event.year}</div><div><span class="event-date">${event.date} · ${eventTypeLabel(event.type)}</span><h3>${event.title}</h3><p>${event.summary}</p></div><button type="button" data-feature-open="${event.id}">OPEN THE MOMENT</button>`;
  $('[data-feature-open]').addEventListener('click',()=>openEvent(event.id));
}

function setActiveEvent(index, scroll=false){
  activeIndex=clamp(index,0,sortedEvents.length-1); const event=sortedEvents[activeIndex]; const era=eraForYear(event.year);
  $$('.timeline-card').forEach((card,i)=>card.classList.toggle('active',i===activeIndex));
  const card=$(`.timeline-card[data-index="${activeIndex}"]`); if(scroll&&card)card.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  $('#selectedYear').textContent=event.year; $('#selectedEra').textContent=era.label; $('#yearRange').value=event.year; updateRangeBubble(event.year); updateFeatured(event);
  $('#timelineProgress').style.width=`${((activeIndex+1)/sortedEvents.length)*100}%`;
  $$('#decadeJumps button').forEach(button=>{const start=Number(button.dataset.year),next=start===1919?1920:start+10;button.classList.toggle('active',event.year>=start&&event.year<next)});
}

function jumpToYear(year){
  let nearest=0,distance=Infinity;
  sortedEvents.forEach((event,index)=>{const current=Math.abs(event.year-year);if(current<distance){distance=current;nearest=index}});
  setActiveEvent(nearest,true);
}

function openEvent(id){
  const event=eventById.get(id); if(!event)return; const source=sourceFor(event.source);
  $('#historyModalType').textContent=eventTypeLabel(event.type); $('#historyModalTitle').textContent=event.title; $('#historyModalDate').textContent=event.date;
  $('#historyModalBody').textContent=event.detail||event.summary;
  $('#historyModalLinks').innerHTML=`${source?`<a href="${source.url}" target="_blank" rel="noopener">READ VERIFIED SOURCE ↗</a>`:''}${event.trophy?`<a href="#trophyRoom" data-close-history-modal>OPEN TROPHY ROOM</a>`:''}`;
  const roomLink=$('#historyModalLinks [data-close-history-modal]'); if(roomLink)roomLink.addEventListener('click',closeModal);
  $('#historyModal').setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; $('.history-modal-close').focus();
}
function closeModal(){ $('#historyModal').setAttribute('aria-hidden','true'); document.body.style.overflow=''; }

function setupRailDrag(){
  const rail=$('#timelineRail'); let down=false,startX=0,startScroll=0;
  rail.addEventListener('pointerdown',event=>{down=true;startX=event.clientX;startScroll=rail.scrollLeft;rail.setPointerCapture(event.pointerId)});
  rail.addEventListener('pointermove',event=>{if(down)rail.scrollLeft=startScroll-(event.clientX-startX)});
  rail.addEventListener('pointerup',()=>down=false); rail.addEventListener('pointercancel',()=>down=false);
  let timer; rail.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{const centre=rail.scrollLeft+rail.clientWidth/2;let nearest=0,d=Infinity;$$('.timeline-card').forEach((card,index)=>{const c=card.offsetLeft+card.offsetWidth/2;const dist=Math.abs(c-centre);if(dist<d){d=dist;nearest=index}});setActiveEvent(nearest,false)},90)});
  rail.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();setActiveEvent(activeIndex+1,true)}if(event.key==='ArrowLeft'){event.preventDefault();setActiveEvent(activeIndex-1,true)}});
}


function escapeArchive(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function formatArchiveDate(value){if(!value)return'Not yet verified';const date=new Date(value);return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(date);}
function seasonYear(label){return Number(String(label||'').slice(0,4))||0;}
function archiveFilters(){return {query:String($('#archiveSearch')?.value||'').trim().toLowerCase(),decade:String($('#archiveDecade')?.value||'all')};}
function archiveMatchesFilter(text,year){const {query,decade}=archiveFilters();if(query&&!String(text||'').toLowerCase().includes(query))return false;if(decade!=='all'&&Math.floor(Number(year||0)/10)*10!==Number(decade))return false;return true;}

async function loadCompleteArchive(){
  const board=$('#archiveBoard');if(!board)return;
  try{
    const response=await fetch('/api/history/archive',{cache:'no-store'});const data=await response.json();
    if(!response.ok||!data.ok)throw new Error(data.error||'Archive unavailable');
    archiveData=data;renderArchiveSummary();populateArchiveDecades();renderArchive();
  }catch(error){board.innerHTML=`<div class="archive-empty">The complete source-led archive could not load right now. The Time Machine, Trophy Room and Record Room above remain available.</div>`;$('#archiveCoverage').textContent=error.message||'Archive unavailable';}
}

function publishableSeasons(){
  return (archiveData?.seasons||[]).filter(row => row.loaded || row.sourceBacked || (row.managers||[]).length || (row.honours||[]).length || (row.milestones||[]).length);
}

function renderArchiveSummary(){
  const seasons=publishableSeasons();
  const managers=archiveData?.managers||[];
  const honours=archiveData?.honours||[];
  const matches=archiveData?.iconicMatches||[];
  const values=[seasons.length,managers.length,honours.length,matches.length];
  const boxes=$$('#archiveSummary>div strong');
  boxes.forEach((box,index)=>box.textContent=Number(values[index]||0).toLocaleString('en-GB'));
  const matchLoaded=Number(archiveData?.coverage?.loadedSeasons||0);
  $('#archiveCoverage').textContent=matchLoaded
    ? `${seasons.length} seasons are linked to verified managers, honours or milestones; ${matchLoaded} include match-by-match records.`
    : `${seasons.length} seasons are linked to verified managers, honours or club milestones.`;
}
function populateArchiveDecades(){
  const select=$('#archiveDecade');if(!select||select.options.length>1)return;const years=(archiveData?.seasons||[]).map(row=>seasonYear(row.label)).filter(Boolean);const decades=[...new Set(years.map(year=>Math.floor(year/10)*10))].sort((a,b)=>b-a);select.insertAdjacentHTML('beforeend',decades.map(decade=>`<option value="${decade}">${decade}s</option>`).join(''));
}

function renderArchive(){
  if(!archiveData)return;const board=$('#archiveBoard');
  if(archiveTab==='seasons'){
    const rows=publishableSeasons().filter(row=>archiveMatchesFilter(`${row.label} ${(row.managers||[]).map(x=>x.name).join(' ')} ${(row.honours||[]).map(x=>x.name).join(' ')} ${(row.milestones||[]).map(x=>x.title).join(' ')}`,seasonYear(row.label)));
    board.innerHTML=rows.length?`<div class="season-grid">${rows.map(row=>renderSeasonCard(row)).join('')}</div>`:'<div class="archive-empty">No seasons match this search.</div>';
  }
  if(archiveTab==='managers'){
    const rows=(archiveData.managers||[]).filter(row=>archiveMatchesFilter(`${row.name} ${row.nationality||''} ${row.notes||''} ${(row.seasons||[]).join(' ')} ${(row.honours||[]).map(x=>x.name).join(' ')}`,row.startedOn?Number(String(row.startedOn).slice(0,4)):0));
    board.innerHTML=rows.length?`<div class="manager-grid">${rows.map(row=>renderManagerCard(row)).join('')}</div>`:'<div class="archive-empty">No managers match this search.</div>';
  }
  if(archiveTab==='matches'){
    const rows=(archiveData.iconicMatches||[]).filter(row=>archiveMatchesFilter(`${row.title||''} ${row.homeTeam||''} ${row.awayTeam||''} ${row.competition||''} ${row.round||''}`,row.playedAt?Number(String(row.playedAt).slice(0,4)):0));
    board.innerHTML=rows.length?`<div class="match-grid">${rows.map(row=>renderMatchCard(row)).join('')}</div>`:'<div class="archive-empty">No verified matches or moments match this search.</div>';
  }
}

function renderSeasonCard(row){
  const status=row.loaded?'MATCH RECORD':'CLUB ARCHIVE';
  const managers=(row.managers||[]).map(x=>escapeArchive(x.name)+(x.interim?' (interim)':'')).join(', ');
  const honours=(row.honours||[]).map(item=>`<span class="archive-pill honour">${escapeArchive(item.name)}</span>`).join('');
  const milestones=(row.milestones||[]).slice(0,3).map(item=>`<li><b>${escapeArchive(item.title)}</b><span>${escapeArchive(item.summary||'')}</span></li>`).join('');
  const record=row.loaded?`<div class="season-record"><div><b>${row.wins}</b><small>WINS</small></div><div><b>${row.draws}</b><small>DRAWS</small></div><div><b>${row.losses}</b><small>LOSSES</small></div></div><p>${row.matches} sourced matches · ${row.goalsFor} scored · ${row.goalsAgainst} conceded</p>`:'';
  return `<article class="season-card"><header><strong>${escapeArchive(row.label)}</strong><span>${status}</span></header>${record}${managers?`<p><b>Manager${(row.managers||[]).length===1?'':'s'}:</b> ${managers}</p>`:''}${honours?`<div class="archive-pills">${honours}</div>`:''}${milestones?`<ul class="archive-highlights">${milestones}</ul>`:''}</article>`;
}
function renderManagerCard(row){
  const honours=(row.honours||[]).slice(0,8);
  const highlights=(row.highlights||[]).slice(0,4);
  const seasonRange=row.firstSeason?(row.firstSeason===row.lastSeason?row.firstSeason:`${row.firstSeason} → ${row.lastSeason}`):'';
  const badge=row.trophyWinner?'TROPHY-WINNING MANAGER':row.interim?'INTERIM MANAGER':'LEEDS UNITED MANAGER';
  const nationality=row.nationality?`<em>${escapeArchive(row.nationality)}</em>`:'';
  const dates=row.startedOn?`${formatArchiveDate(row.startedOn)}${row.endedOn?` → ${formatArchiveDate(row.endedOn)}`:''}`:'';
  return `<article class="manager-card ${row.trophyWinner?'winner':''}"><span>${badge}</span><h3>${escapeArchive(row.name)}</h3><div class="manager-meta"><b>${escapeArchive(row.eraLabel||'Leeds United archive')}</b>${nationality}</div>${dates?`<footer>${dates}</footer>`:''}<p class="manager-profile">${escapeArchive(row.profile||row.notes||'Leeds United managerial tenure.')}</p><div class="manager-stats"><div><b>${escapeArchive(row.tenureLabel&& !/pending/i.test(row.tenureLabel)?row.tenureLabel:'—')}</b><small>TENURE</small></div><div><b>${Number(row.seasonCount||0)}</b><small>SEASONS</small></div><div><b>${Number(honours.length)}</b><small>HONOURS</small></div></div>${seasonRange?`<p class="manager-record">${escapeArchive(seasonRange)}</p>`:''}${honours.length?`<div class="archive-pills">${honours.map(item=>`<span class="archive-pill honour">${escapeArchive(item.name)} · ${escapeArchive(item.season||'')}</span>`).join('')}</div>`:''}${highlights.length?`<ul class="archive-highlights">${highlights.map(item=>`<li><b>${escapeArchive(item.year)} · ${escapeArchive(item.title)}</b><span>${escapeArchive(item.summary||'')}</span></li>`).join('')}</ul>`:''}${row.notes&&row.notes!==row.profile?`<p class="manager-note">${escapeArchive(row.notes)}</p>`:''}</article>`;
}
function renderMatchCard(row){
  const title=row.title||`${row.homeTeam||'Leeds United'} v ${row.awayTeam||'Opponent'}`;
  const score=row.homeScore===null||row.homeScore===undefined?'':`<div class="match-score">${row.homeScore??'—'}–${row.awayScore??'—'}</div>`;
  return `<article class="match-card"><span>${escapeArchive(row.competition||'LEEDS UNITED MOMENT')}</span><h3>${escapeArchive(title)}</h3>${score}${row.summary?`<p>${escapeArchive(row.summary)}</p>`:`<p>${formatArchiveDate(row.playedAt)}${row.round?` · ${escapeArchive(row.round)}`:''}${row.venue?` · ${escapeArchive(row.venue)}`:''}</p>`}${row.source?`<a href="${row.source.url}" target="_blank" rel="noopener">VIEW SOURCE ↗</a>`:''}</article>`;
}

function bindArchiveControls(){
  $$('.archive-tabs button').forEach(button=>button.addEventListener('click',()=>{$$('.archive-tabs button').forEach(item=>item.classList.remove('active'));button.classList.add('active');archiveTab=button.dataset.archiveTab;renderArchive()}));
  $('#archiveSearch')?.addEventListener('input',renderArchive);$('#archiveDecade')?.addEventListener('change',renderArchive);
}

function bindControls(){
  $('#yearRange').addEventListener('input',event=>{const year=Number(event.target.value);$('#selectedYear').textContent=year;$('#selectedEra').textContent=eraForYear(year).label;updateRangeBubble(year)});
  $('#yearRange').addEventListener('change',event=>jumpToYear(Number(event.target.value)));
  $('#prevEvent').addEventListener('click',()=>setActiveEvent(activeIndex-1,true)); $('#nextEvent').addEventListener('click',()=>setActiveEvent(activeIndex+1,true));
  $$('#trophyFilter button').forEach(button=>button.addEventListener('click',()=>{$$('#trophyFilter button').forEach(item=>item.classList.remove('active'));button.classList.add('active');renderTrophies(button.dataset.trophy)}));
  $$('.record-tabs button').forEach(button=>button.addEventListener('click',()=>{$$('.record-tabs button').forEach(item=>item.classList.remove('active'));button.classList.add('active');renderRecordBoard(button.dataset.recordTab)}));
  $$('[data-close-history-modal]').forEach(item=>item.addEventListener('click',event=>{if(item.tagName!=='A')event.preventDefault();closeModal()}));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal()});
}

renderDecades(); renderTimeline(); renderEras(); renderTrophies(); renderRecordBoard(); renderSources(); bindControls(); bindArchiveControls(); setupRailDrag(); setActiveEvent(0,false); loadCompleteArchive();
