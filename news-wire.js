(() => {
  const state={kind:'all',items:[],automation:{}};
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  boot();
  function boot(){ $$('.wire-controls button').forEach(button=>button.addEventListener('click',()=>{$$('.wire-controls button').forEach(x=>x.classList.remove('active'));button.classList.add('active');state.kind=button.dataset.kind;render()}));load();setInterval(load,5*60*1000); }
  async function load(){
    try{
      const newsRes=await fetch('/api/news/latest?limit=80',{cache:'no-store'});
      const news=await newsRes.json();if(!newsRes.ok||!news.ok)throw new Error(news.error||'Wire unavailable');
      state.items=news.items||[];state.automation=news.automation||{};render();setStatus(state.automation.mode==='automatic'&&!state.automation.lastError?'live':'offline',state.automation.mode==='automatic'?(state.automation.lastError?`Automatic feed connected · last check needs attention: ${trim(state.automation.lastError,120)}`:`Automatic feed active · last successful check ${relative(state.automation.lastSuccessfulRefreshAt)||'waiting'}`):'The trusted news wire is temporarily unavailable');
    }catch(error){setStatus('offline',error.message||'Trusted wire unavailable');$('#wireFeed').innerHTML='<div class="wire-loading">The trusted Leeds United wire could not load right now.</div>';}
  }
  function render(){const items=state.kind==='all'?state.items:state.items.filter(item=>item.kind===state.kind);$('#wireFeed').innerHTML=items.length?items.map(card).join(''):'<div class="wire-loading">No approved posts are loaded in this category yet.</div>';}
  function card(item){const initials=String(item.source_name||item.source_handle||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();const radar=item.player_slug?`<a class="radar-link" href="/transfers#${encodeURIComponent(item.player_slug)}">RADAR →</a>`:'';return `<article class="wire-card"><header><div class="wire-source"><span class="wire-avatar">${esc(initials)}</span><div><b>${esc(item.source_name||item.source_handle)}</b><span>@${esc(item.source_handle||'source')}</span></div></div><time>${relative(item.published_at)}</time></header><span class="wire-kind">${esc(kindLabel(item.kind))}</span><h2>${esc(item.headline)}</h2><p>${esc(item.summary||'')}</p><footer><div class="credibility"><i style="--score:${Math.max(0,Math.min(100,Number(item.credibility||0)))}%"></i>${Number(item.credibility||0)}/100</div><div><a href="${safe(item.source_url)}" target="_blank" rel="noopener">ORIGINAL POST ↗</a>${radar}</div></footer></article>`;}
  function setStatus(mode,text){const el=$('#wireStatus');el.classList.remove('live','offline');el.classList.add(mode);el.querySelector('b').textContent=text;}
  function kindLabel(kind){return ({transfer:'TRANSFER RADAR',official:'OFFICIAL LEEDS UNITED', 'team-news':'TEAM NEWS',general:'LEEDS UNITED UPDATE'})[kind]||'LEEDS UNITED UPDATE';}
  function relative(value){if(!value)return'WAITING';const t=Date.parse(value),d=Date.now()-t;if(!Number.isFinite(t))return String(value);const m=Math.max(0,Math.round(d/60000));if(m<1)return'NOW';if(m<60)return`${m}M AGO`;const h=Math.round(m/60);if(h<24)return`${h}H AGO`;return`${Math.round(h/24)}D AGO`;}
  function trim(value,max){const text=String(value||'').trim();return text.length>max?`${text.slice(0,max-1)}…`:text}
  function safe(value){try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'#'}catch{return'#'}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
})();
