(()=>{
  const $=selector=>document.querySelector(selector);
  let token=sessionStorage.getItem('leedsContentDeskToken')||localStorage.getItem('leedsContentDeskToken')||'';
  let lastQueueIds=new Set(JSON.parse(localStorage.getItem('leedsDeskSeenIds')||'[]'));
  let pollTimer=null;
  let installPrompt=null;
  let firstLoad=true;

  $('#adminToken').value=token;
  $('#rememberToken').checked=Boolean(localStorage.getItem('leedsContentDeskToken'));
  bind();
  registerServiceWorker();
  updateAlertState();
  if(token){loadAll();startPolling();}

  function bind(){
    $('#saveToken').addEventListener('click',saveToken);
    $('#reloadDesk').addEventListener('click',()=>loadAll({notify:false}));
    $('#testX').addEventListener('click',testXConnection);
    $('#processNow').addEventListener('click',processNow);
    $('#runAudit').addEventListener('click',runAudit);
    $('#publishOriginal').addEventListener('click',publishOriginal);
    $('#originalText').addEventListener('input',()=>$('#charCount').textContent=[...$('#originalText').value].length);
    $('#enableAlerts').addEventListener('click',enableAlerts);
    $('#testAlert').addEventListener('click',()=>showDeskNotification({sourceHandle:'LeedsBuzz',sourceText:'Device alerts are working.',sourceUrl:location.href,replyDraft:'LeedsBuzz.biz alert test.'},true));
    $('#installDesk').addEventListener('click',installDesk);
    $('#opportunityList').addEventListener('click',handleQueueClick);
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#installDesk').hidden=false;});
    document.addEventListener('visibilitychange',()=>{if(token)startPolling();});
  }

  function saveToken(){
    token=$('#adminToken').value.trim();
    sessionStorage.setItem('leedsContentDeskToken',token);
    if($('#rememberToken').checked&&token)localStorage.setItem('leedsContentDeskToken',token);else localStorage.removeItem('leedsContentDeskToken');
    status(token?'Content Desk connected.':'Token removed.',Boolean(token));
    if(token){loadAll();startPolling();}else stopPolling();
  }

  async function registerServiceWorker(){
    if(!('serviceWorker' in navigator))return;
    try{await navigator.serviceWorker.register('/content-desk-sw.js',{scope:'/content-desk'});}catch(error){console.warn('Content Desk service worker unavailable',error);}
  }

  async function enableAlerts(){
    if(!('Notification' in window))return status('This browser does not support notifications.',false);
    const permission=await Notification.requestPermission();
    updateAlertState();
    if(permission==='granted'){
      localStorage.setItem('leedsDeskAlerts','on');
      await showDeskNotification({sourceHandle:'LeedsBuzz',sourceText:'LeedsBuzz.biz alerts are enabled on this device.',sourceUrl:location.href},true);
      status('Device alerts enabled.',true);
    }else status('Notification permission was not granted.',false);
  }

  async function installDesk(){
    if(!installPrompt)return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(()=>null);
    installPrompt=null;$('#installDesk').hidden=true;
  }

  function updateAlertState(){
    const granted='Notification' in window&&Notification.permission==='granted'&&localStorage.getItem('leedsDeskAlerts')==='on';
    $('#alertState').textContent=granted?'ON':'OFF';
    $('#enableAlerts').textContent=granted?'ALERTS ENABLED':'ENABLE DEVICE ALERTS';
  }

  function startPolling(){
    stopPolling();
    const delay=document.hidden?30000:12000;
    pollTimer=setInterval(()=>loadAll({notify:true,quiet:true}),delay);
  }
  function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

  async function loadAll(options={}){
    try{
      const [desk,audit]=await Promise.all([adminGet('/api/admin/x/desk'),adminGet('/api/admin/audit/report')]);
      renderStatus(desk.settings||{});
      renderQueue(desk.queue||[]);
      renderPublications(desk.publications||[]);
      renderAudit(audit);
      if(options.notify!==false)notifyNewRows(desk.queue||[]);
      if(!options.quiet)status('Live Content Desk connected.',true);
      firstLoad=false;
    }catch(error){if(!options.quiet)status(error.message,false);}
  }

  function notifyNewRows(rows){
    const queued=rows.filter(row=>row.status==='queued');
    const newRows=queued.filter(row=>!lastQueueIds.has(row.sourcePostId));
    const alertsOn='Notification' in window&&Notification.permission==='granted'&&localStorage.getItem('leedsDeskAlerts')==='on';
    if(!firstLoad&&alertsOn)newRows.slice(0,4).forEach(row=>showDeskNotification(row));
    queued.forEach(row=>lastQueueIds.add(row.sourcePostId));
    const ids=[...lastQueueIds].slice(-300);localStorage.setItem('leedsDeskSeenIds',JSON.stringify(ids));lastQueueIds=new Set(ids);
  }

  async function showDeskNotification(row,test=false){
    const title=test?'LeedsBuzz.biz alert test':`@${row.sourceHandle||'Leeds United'} posted`;
    const body=String(row.sourceText||row.postDraft||'New LeedsBuzz.biz content opportunity').slice(0,190);
    const data={url:'/content-desk'};
    try{
      const registration=await navigator.serviceWorker?.ready;
      if(registration)await registration.showNotification(title,{body,tag:test?'leeds-test':`leeds-${row.sourcePostId||Date.now()}`,renotify:true,data});
      else new Notification(title,{body,data});
    }catch(error){console.warn('Notification failed',error);}
    try{navigator.vibrate?.([220,90,220]);}catch{}
    beep();
  }

  function beep(){
    try{const AudioContext=window.AudioContext||window.webkitAudioContext;const ctx=new AudioContext();const oscillator=ctx.createOscillator();const gain=ctx.createGain();oscillator.frequency.value=880;gain.gain.value=.08;oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+.18);oscillator.addEventListener('ended',()=>ctx.close());}catch{}
  }

  async function processNow(){
    const button=$('#processNow');
    if(!confirm('This performs live X API reads and uses prepaid credit. The scheduled monitor already checks automatically. Run an extra check now?')) return;
    button.disabled=true;
    try{const data=await adminPost('/api/admin/x/process',{});$('#processResult').textContent=JSON.stringify(data,null,2);status(data.ok?'Latest X posts processed.':'X refresh completed with an issue.',Boolean(data.ok));await loadAll({notify:true});}
    catch(error){$('#processResult').textContent=error.message;status(error.message,false);}finally{button.disabled=false;}
  }

  async function testXConnection(){
    const button=$('#testX');button.disabled=true;
    try{if(!confirm('This performs one live X API read and may use a small amount of prepaid credit. Continue?'))return;const data=await adminPost('/api/admin/x/test',{readOnly:true});$('#processResult').textContent=JSON.stringify(data,null,2);const read=data.reading?.ok?'reading verified':data.reading?.status==='credits-required'?'reading needs credits':'reading failed';status(`X reading test: ${read}. Posting is done manually in X and is free.`,Boolean(data.reading?.ok));await loadAll({notify:false});}
    catch(error){status(error.message,false);}finally{button.disabled=false;}
  }

  async function runAudit(){const button=$('#runAudit');button.disabled=true;try{await adminPost('/api/admin/audit/run',{});await loadAll({notify:false});}catch(error){status(error.message,false);}finally{button.disabled=false;}}

  async function publishOriginal(){
    const text=$('#originalText').value.trim();if(!text)return status('Write the original post first.',false);
    await copyText(text);
    openXComposer(text);
    status('Post copied and opened in X. Brandon publishes it there for free.',true);
  }

  async function handleQueueClick(event){
    const button=event.target.closest('button[data-action]');if(!button)return;
    const card=button.closest('.opportunity');if(!card)return;
    const id=card.dataset.id;const action=button.dataset.action;
    if(action==='dismiss')return dismiss(id);
    if(action==='reply-intent')return openReplyComposer(id,card);
    if(action==='copy-reply')return copyReply(card);
    if(action==='open-post')return openPreparedPost(card);
  }

  async function openPreparedPost(card){
    const text=card.querySelector('textarea[data-type="post"]').value.trim();if(!text)return status('Prepared post is empty.',false);
    await copyText(text);
    openXComposer(text);
    status('Prepared post copied and opened in X. Brandon publishes it there for free.',true);
  }

  function openXComposer(text){
    const url=`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url,'leedsPost','noopener,noreferrer,width=680,height=700');
  }

  async function openReplyComposer(id,card){
    const text=card.querySelector('textarea[data-type="reply"]').value.trim();if(!text)return status('BizBot reply draft is empty.',false);
    await copyText(text);
    const url=`https://x.com/intent/tweet?in_reply_to=${encodeURIComponent(id)}&text=${encodeURIComponent(text)}`;
    window.open(url,'leedsReply','noopener,noreferrer,width=680,height=700');
    status('Reply copied and opened in X. Brandon makes the final post.',true);
  }

  async function copyReply(card){const text=card.querySelector('textarea[data-type="reply"]').value.trim();if(!text)return;await copyText(text);status('Reply copied.',true);}
  async function copyText(text){try{await navigator.clipboard.writeText(text);}catch{const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}}
  async function dismiss(id){try{await adminPost('/api/admin/x/dismiss',{sourcePostId:id});await loadAll({notify:false});}catch(error){status(error.message,false);}}

  function renderStatus(settings){
    const read=settings.readingVerified?'VERIFIED':settings.readingConfigured?(settings.readingStatus==='credits-required'?'NEEDS CREDITS':settings.readingStatus==='failed'?'AUTH FAILED':'READY'):'NEEDS TOKEN';
    const values=[read,'FREE X COMPOSER','DISABLED','BRANDON'];
    [...document.querySelectorAll('#statusGrid strong')].slice(0,4).forEach((element,index)=>element.textContent=values[index]);
  }

  function renderQueue(rows){
    const visible=rows.filter(row=>!['dismissed','replied'].includes(row.status));
    $('#opportunityList').innerHTML=visible.length?visible.map(row=>{
      const mode='PREPARED POST';
      const primaryLabel='OPEN POST IN X';
      return `<article class="opportunity" data-id="${esc(row.sourcePostId)}"><header><span>@${esc(row.sourceHandle)} · ${esc(row.kind)} · ${row.confidence}/100</span><time>${relative(row.publishedAt)}</time></header><div class="opportunity-meta"><span>${esc(mode)}</span>${row.playerSlug?`<a href="/transfers#${encodeURIComponent(row.playerSlug)}" target="_blank" rel="noopener">RADAR UPDATED ↗</a>`:'<span>NEWS WIRE UPDATED</span>'}</div><p class="source-text">${esc(row.sourceText)}</p><div class="draft-grid"><div class="draft-box"><label>FAST FACTUAL LEEDSBUZZ.BIZ POST</label><textarea maxlength="280" data-type="post">${esc(row.postDraft||'')}</textarea></div><div class="draft-box"><label>BIZBOT REPLY FOR BRANDON</label><textarea maxlength="280" data-type="reply">${esc(row.replyDraft||'')}</textarea></div></div><div class="draft-actions"><button class="primary" data-action="open-post">${primaryLabel}</button><button data-action="reply-intent">OPEN REPLY IN X</button><button data-action="copy-reply">COPY REPLY</button><a href="${safe(row.sourceUrl)}" target="_blank" rel="noopener"><button type="button">OPEN SOURCE ↗</button></a><button class="danger" data-action="dismiss">DISMISS</button></div></article>`;
    }).join(''):'No new opportunities are waiting.';
  }

  function renderPublications(rows){$('#publicationList').innerHTML=rows.length?rows.map(row=>`<div class="publication-row"><div><b>${esc(row.type.toUpperCase())} · ${esc(row.status)}</b><small>${esc(row.text)}</small></div><span class="tag">${relative(row.publishedAt||row.createdAt)}</span></div>`).join(''):'No LeedsBuzz.biz X posts have been recorded yet.';}
  function renderAudit(report){const issues=report.issues||[];const last=report.runs?.[0];$('#auditSummary').textContent=last?`${issues.length} open issues · last run ${relative(last.finished_at||last.started_at)}`:'No audit has run yet.';$('#auditIssues').innerHTML=issues.length?issues.slice(0,40).map(item=>`<div class="issue-row" data-severity="${esc(item.severity)}"><div><b>${esc(item.title)}</b><small>${esc(item.detail||'')}</small></div><strong>${esc(item.severity.toUpperCase())}</strong></div>`).join(''):'No open issues.';}

  async function adminGet(url){return request(url,{method:'GET'});}
  async function adminPost(url,payload){return request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});}
  async function request(url,options){token=$('#adminToken').value.trim()||token;if(!token)throw new Error('Paste the BIZBOT_ADMIN_TOKEN first.');const response=await fetch(url,{...options,headers:{...(options.headers||{}),authorization:`Bearer ${token}`},cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`);return data;}
  function status(message,live){const element=$('#deskStatus');element.textContent=message;element.classList.toggle('live',Boolean(live));}
  function relative(value){if(!value)return'WAITING';const time=Date.parse(value),difference=Date.now()-time;if(!Number.isFinite(time))return String(value);const minutes=Math.max(0,Math.round(difference/60000));if(minutes<1)return'NOW';if(minutes<60)return`${minutes}M AGO`;const hours=Math.round(minutes/60);if(hours<24)return`${hours}H AGO`;return`${Math.round(hours/24)}D AGO`;}
  function safe(value){try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:'#';}catch{return'#';}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
})();
