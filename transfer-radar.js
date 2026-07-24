(() => {
  const state = { data:null, direction:'all', selected:null, resizeTimer:null };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const stageRadius = {1:.43,2:.34,3:.255,4:.17,5:.075};

  boot();
  async function boot(){ const requested=new URLSearchParams(location.search).get('view');if(requested==='completed')state.direction='completed';bind();if(state.direction==='completed'){document.querySelectorAll('.direction-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.direction==='completed'));} await load(); window.addEventListener('resize',()=>{clearTimeout(state.resizeTimer);state.resizeTimer=setTimeout(renderRadar,120)}); }

  function bind(){
    $$('.direction-tabs button').forEach(button=>button.addEventListener('click',()=>{
      $$('.direction-tabs button').forEach(item=>item.classList.remove('active'));button.classList.add('active');state.direction=button.dataset.direction;renderAll();
    }));
    $('#refreshRadar')?.addEventListener('click',load);
  }

  async function load(){
    setStatus('checking','Checking approved sources…');
    try{
      // Load the active feed first so the very first visit cannot start two identical
      // X refreshes before the database has recorded a successful check.
      const activeRes=await fetch('/api/transfers/radar',{cache:'no-store'});
      const active=await activeRes.json();
      const completedRes=await fetch('/api/transfers/radar?completed=1',{cache:'no-store'});
      const completed=await completedRes.json();
      if(!activeRes.ok||!active.ok) throw new Error(active.error||'Radar unavailable');
      state.data={...active,completedTargets:completed.targets||[]};
      updateHeader();renderAll();
      const auto=active.automation||{};
      if(auto.mode==='automatic'&&auto.lastError) setStatus('offline',`Automatic feed connected · last check needs attention: ${trim(auto.lastError,120)}`);
      else if(auto.mode==='automatic') setStatus('live',(Number(auto.refreshTargetMinutes||15)===1?'Automatic radar active · checking priority X sources every minute':`Automatic radar active · checking approved X sources every ${auto.refreshTargetMinutes||15} minutes`));
      else setStatus('offline','The trusted transfer wire is temporarily unavailable');
    }catch(error){
      setStatus('offline',error.message||'Transfer Radar unavailable');
      $('#movementGrid').innerHTML='<div class="loading-card">The trusted transfer feed could not load right now.</div>';
    }
  }

  function updateHeader(){
    const targets=state.data?.targets||[];
    $('#activeTargetCount').textContent=targets.length;
    $('#advancedTargetCount').textContent=targets.filter(t=>t.stage>=4).length;
    $('#sourceCount').textContent=Number(state.data?.sourceCount||0);
    $('#lastRefresh').textContent=formatRelative(state.data?.automation?.lastSuccessfulRefreshAt)||'WAITING';
  }

  function renderAll(){ renderRadar();renderMovement();renderCompleted(); }

  function filteredTargets(){
    const all=(state.direction==='completed'?(state.data?.completedTargets||[]):(state.data?.targets||[])).filter(isValidTarget);
    if(state.direction==='all'||state.direction==='completed') return all;
    if(state.direction==='loans') return all.filter(t=>String(t.direction).startsWith('loan')||t.category==='loan');
    return all.filter(t=>t.direction===state.direction);
  }

  function renderRadar(){
    const wrap=$('#radarWrap'),container=$('#radarTargets');if(!wrap||!container||!state.data)return;
    const targets=filteredTargets().filter(t=>!t.completed&&t.stage<6);
    container.innerHTML='';
    $('#radarEmpty').hidden=targets.length>0;
    if(state.direction==='completed'){$('#radarEmpty').hidden=false;$('#radarEmpty strong').textContent='Completed deals sit below the radar.';$('#radarEmpty p').textContent='Use the Completed section to review official signings, exits and loans.';return;}
    const size=Math.min(wrap.clientWidth,wrap.clientHeight),centre=size/2;
    const perStage={};
    targets.forEach(target=>{perStage[target.stage]=(perStage[target.stage]||0)+1});
    const stageIndex={};
    targets.forEach((target,index)=>{
      stageIndex[target.stage]=(stageIndex[target.stage]||0)+1;
      const count=perStage[target.stage]||1,order=stageIndex[target.stage]-1;
      const baseAngle=(hash(target.playerSlug)%360)+(order*(360/count));
      const radius=stageRadius[target.stage]??.43;
      const jitter=((hash(target.playerSlug+'j')%17)-8)/100;
      const r=size*Math.max(.06,radius+jitter);
      const angle=(baseAngle-90)*Math.PI/180;
      const x=centre+Math.cos(angle)*r,y=centre+Math.sin(angle)*r;
      const button=document.createElement('button');button.type='button';button.className='radar-target';button.dataset.stage=target.stage;button.dataset.slug=target.playerSlug;button.style.left=`${x}px`;button.style.top=`${y}px`;
      button.innerHTML=`<span class="avatar">${initials(target.playerName)}</span><strong>${escapeHtml(target.playerName)}</strong><small>${escapeHtml(target.stageLabel)} · ${target.confidence}%</small><span class="move">${target.movement==='in'?'↘':target.movement==='out'?'↗':target.movement==='new'?'✦':'•'}</span>`;
      button.addEventListener('click',()=>selectTarget(target,button));container.appendChild(button);
    });
    if(state.selected){const current=targets.find(t=>t.playerSlug===state.selected.playerSlug);if(current)renderDeal(current);}
    const requested=decodeURIComponent(location.hash.slice(1));
    if(requested&&!state.selected){const target=targets.find(t=>t.playerSlug===requested);const button=target?container.querySelector(`[data-slug="${cssEscape(requested)}"]`):null;if(target&&button)selectTarget(target,button,false);}
  }

  function selectTarget(target,button,scroll=true){state.selected=target;$$('.radar-target').forEach(item=>item.classList.toggle('active',item===button));renderDeal(target);history.replaceState(null,'',`#${encodeURIComponent(target.playerSlug)}`);if(scroll&&innerWidth<1100)$('#dealPanel').scrollIntoView({behavior:'smooth',block:'start'});}

  function renderDeal(target){
    const posts=(state.data?.posts||[]).filter(post=>post.player_slug===target.playerSlug&&!isNoise(post.post_text)).slice(0,6);
    $('#dealPanel').innerHTML=`
      <span class="deal-eyebrow">${escapeHtml(target.direction.toUpperCase())} · ${escapeHtml(target.stageLabel.toUpperCase())}</span>
      <h2>${escapeHtml(target.playerName)}</h2>
      <p>${target.currentClub?`Currently reported at ${escapeHtml(target.currentClub)}.`:'Club information will appear when a trusted report states it.'}</p>
      <div class="deal-stage"><span>RADAR CONFIDENCE</span><strong>${target.confidence}/100</strong></div>
      <div class="deal-meter"><i style="width:${target.confidence}%"></i></div>
      <div class="deal-facts"><div><span>STRONGEST SOURCE</span><b>${escapeHtml(target.strongestSource||'Approved source')}</b></div><div><span>INDEPENDENT SOURCES</span><b>${target.independentSources}</b></div><div><span>EVIDENCE POSTS</span><b>${target.evidenceCount}</b></div><div><span>REPORTED FEE</span><b>${escapeHtml(target.reportedFee||'Not verified')}</b></div></div>
      <div class="evidence-list">${posts.length?posts.map(post=>`<a href="${safeUrl(post.post_url)}" target="_blank" rel="noopener"><b>${escapeHtml(trim(post.post_text,150))}</b><span>@${escapeHtml(post.author_handle)} · ${formatRelative(post.published_at)} ↗</span></a>`).join(''):'<p>No supporting post is available in this browser response yet.</p>'}</div>
      <div class="deal-note">${target.manual&&target.manualNote?escapeHtml(target.manualNote):'Position is calculated from source reliability, wording, corroboration and recency. It is not an official club confirmation.'}</div>`;
  }

  function renderMovement(){
    const posts=(state.data?.posts||[]).filter(post=>post.player_name&&!isNoise(post.post_text)).slice(0,12);
    $('#movementGrid').innerHTML=posts.length?posts.map(post=>`<article class="movement-card"><header><span>${escapeHtml(stageLabel(post.stage))}</span><time>${formatRelative(post.published_at)}</time></header><h3>${escapeHtml(post.player_name)}</h3><p>${escapeHtml(trim(post.post_text,220))}</p><footer><b>@${escapeHtml(post.author_handle)} · ${post.confidence||'—'}/100</b><a href="${safeUrl(post.post_url)}" target="_blank" rel="noopener">VIEW POST ↗</a></footer></article>`).join(''):'<div class="loading-card">No approved Leeds United transfer posts have been imported yet.</div>';
  }

  function renderCompleted(){
    const section=$('#completedSection'),grid=$('#completedGrid'),rows=(state.data?.completedTargets||[]).filter(isValidTarget);
    section.hidden=state.direction!=='completed'&&rows.length===0;
    if(state.direction==='completed')section.hidden=false;
    grid.innerHTML=rows.length?rows.map(target=>`<article class="completed-card"><strong>OFFICIALLY COMPLETED</strong><h3>${escapeHtml(target.playerName)}</h3><p>${escapeHtml(target.direction.replace('-', ' '))}${target.currentClub?` · from ${escapeHtml(target.currentClub)}`:''}${target.reportedFee?` · ${escapeHtml(target.reportedFee)}`:''}</p></article>`).join(''):'<div class="loading-card">No completed deals have been recorded in the current radar database.</div>';
    if(state.direction==='completed')section.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function isNoise(value){return /\b(app|download(?: the)? app|away shirt|home shirt|third shirt|kit launch|new kit|club shop|megastore|tickets? on sale|hospitality|travel package|lutv|subscription|retail collection)\b/i.test(String(value||''));}
  function isValidTarget(target){const name=String(target?.playerName||'').trim(),slug=String(target?.playerSlug||'').toLowerCase();return Boolean(name&&slug&&!isNoise(`${name} ${slug} ${target?.manualNote||''}`)&&!['leeds','leeds-fc','lufc','leeds-united'].includes(slug)&&!/^(leeds|leeds fc|lufc|leeds united)$/i.test(name));}
  function setStatus(mode,text){const el=$('#heroStatus');if(!el)return;el.classList.remove('live','offline');if(mode==='live')el.classList.add('live');if(mode==='offline')el.classList.add('offline');el.querySelector('span').textContent=text;}
  function stageLabel(stage){return ({1:'RUMOUR',2:'REPORTED INTEREST',3:'CREDIBLE',4:'ADVANCED',5:'IMMINENT',6:'COMPLETED'})[Number(stage)]||'UPDATE';}
  function initials(name){return String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();}
  function trim(value,max){const text=String(value||'').trim();return text.length>max?`${text.slice(0,max-1)}…`:text;}
  function formatRelative(value){if(!value)return'';const time=Date.parse(value),diff=Date.now()-time;if(!Number.isFinite(time))return String(value);const mins=Math.max(0,Math.round(diff/60000));if(mins<1)return'NOW';if(mins<60)return`${mins}M`;const hours=Math.round(mins/60);if(hours<24)return`${hours}H`;const days=Math.round(hours/24);return`${days}D`;}
  function hash(value){let h=2166136261;for(const c of String(value||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0;}
  function cssEscape(value){return window.CSS?.escape?CSS.escape(String(value||'')):String(value||'').replace(/[^a-z0-9_-]/gi,'');}
  function safeUrl(value){try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'#';}catch{return'#';}}
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
})();
