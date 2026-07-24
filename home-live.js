(()=>{
  const track=document.querySelector('#liveTickerTrack');
  const title=document.querySelector('#homeNewsTitle');
  const summary=document.querySelector('#homeNewsSummary');
  const fallback=[
    {label:'WHITE VAULT',text:'Explore 95 Leeds United player profiles',url:'/white-vault'},
    {label:'WHITE DNA',text:'Compare Leeds United players across eras',url:'/white-vault'},
    {label:'HISTORY',text:'Travel from 1919 to the present day',url:'/history'},
    {label:'TROPHY ROOM',text:'See every major men’s first-team honour',url:'/history#trophyRoom'},
    {label:'RECORD ROOM',text:'Leeds United appearance and goals leaders',url:'/history#recordRoom'},
    {label:'MANAGERS',text:'Explore Leeds United managerial eras and honours',url:'/history#seasonArchive'},
    {label:'BUILD XI',text:'Create and share your Leeds United team',url:'/build-your-xi'},
    {label:'BIZBOT',text:'Ask Leeds United questions across history and today',url:'/bizbot'},
    {label:'FAN RATINGS',text:'Rate players and save favourites',url:'/white-vault'},
    {label:'MY LEEDS',text:'Save teams, favourites and preferences',url:'/account'}
  ];
  boot();
  async function boot(){
    const items=[...fallback];
    try{
      const [newsRes,completedRes,activeRes]=await Promise.all([
        fetch('/api/news/latest?limit=6',{cache:'no-store'}),
        fetch('/api/transfers/radar?completed=1',{cache:'no-store'}),
        fetch('/api/transfers/radar',{cache:'no-store'})
      ]);
      const news=newsRes.ok?await newsRes.json():{};
      const completed=completedRes.ok?await completedRes.json():{};
      const active=activeRes.ok?await activeRes.json():{};
      const latest=(news.items||[])[0];
      if(latest){
        title.textContent=latest.headline||'Latest Leeds United update';
        summary.textContent=latest.summary||'Open the original source on the trusted wire.';
        items.unshift({label:'LATEST',text:latest.headline,url:'/news'});
      }
      const signed=(completed.targets||[]).find(x=>x.playerSlug==='morgan-rogers')||(completed.targets||[])[0];
      if(signed)items.unshift({label:'COMPLETED',text:`${signed.playerName} is a Leeds United player`,url:'/transfers?view=completed'});
      const moving=(active.targets||[]).find(x=>Number(x.stage)>=3)||(active.targets||[])[0];
      if(moving)items.unshift({label:loadingLabel(moving.stage),text:`${moving.playerName}: ${moving.stageLabel}`,url:`/transfers#${encodeURIComponent(moving.playerSlug)}`});
    }catch(error){console.warn('Homepage live items unavailable',error);}
    render(dedupe(items).slice(0,14));
  }
  function render(items){
    const html=items.map(item=>`<a href="${safe(item.url)}"><b>${esc(item.label)}</b><span>${esc(item.text)}</span></a>`).join('<i>•</i>');
    track.innerHTML=`<span class="ticker-set">${html}</span><span class="ticker-set" aria-hidden="true">${html}</span>`;
  }
  function dedupe(items){const seen=new Set();return items.filter(item=>{const key=String(item.text||'').toLowerCase();if(!key||seen.has(key))return false;seen.add(key);return true;});}
  function loadingLabel(stage){return ({1:'RUMOUR',2:'INTEREST',3:'CREDIBLE',4:'ADVANCED',5:'IMMINENT',6:'COMPLETED'})[Number(stage)]||'RADAR';}
  function safe(value){return String(value||'/').startsWith('/')?String(value):'/';}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
})();