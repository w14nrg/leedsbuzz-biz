(() => {
  const loading = document.getElementById('accountLoading');
  const signedOut = document.getElementById('accountSignedOut');
  const dashboard = document.getElementById('accountDashboard');
  const welcome = document.getElementById('accountWelcome');
  const welcomeTitle = document.getElementById('accountWelcomeTitle');
  const form = document.getElementById('accountProfileForm');
  const status = document.getElementById('accountSaveStatus');
  let state = null;

  boot();
  window.addEventListener('leeds:memberchange', e => {
    state = e.detail;
    render();
  });

  async function boot() {
    showWelcomeMessage();
    try {
      const res = await fetch('/api/member/me', { cache: 'no-store', credentials: 'same-origin' });
      state = await res.json();
    } catch { state = { authenticated: false }; }
    render();
    if (state?.authenticated) { renderLocalActivity(); void loadPersonalCollections(); }
  }

  async function loadPersonalCollections() {
    const favourites = document.getElementById('accountFavourites');
    const ratings = document.getElementById('accountRatings');
    const xis = document.getElementById('accountXis');
    try {
      const [fanRes,xiRes] = await Promise.all([fetch('/api/member/fan',{cache:'no-store'}),fetch('/api/member/xis',{cache:'no-store'})]);
      const fan = await fanRes.json(), xi = await xiRes.json();
      const label = slug => String(slug||'').split('-').map(x=>x?x[0].toUpperCase()+x.slice(1):'').join(' ');
      if (favourites) favourites.innerHTML=(fan.favourites||[]).length?(fan.favourites||[]).map(x=>`<a href="/white-vault?player=${encodeURIComponent(x.playerSlug)}"><span>♥</span><b>${escape(label(x.playerSlug))}</b><small>OPEN PROFILE →</small></a>`).join(''):'<p>No favourites yet. Open the White Vault and tap the heart on any player.</p>';
      if (ratings) ratings.innerHTML=(fan.ratings||[]).length?(fan.ratings||[]).map(x=>`<a href="/white-vault?player=${encodeURIComponent(x.playerSlug)}"><span class="account-score">${x.score}</span><b>${escape(label(x.playerSlug))}</b><small>EDIT RATING →</small></a>`).join(''):'<p>You have not rated a player yet.</p>';
      if (xis) xis.innerHTML=(xi.xis||[]).length?(xi.xis||[]).map(x=>`<a href="/build-your-xi?saved=${encodeURIComponent(x.id||'')}"><div><b>${escape(x.title||'My Leeds XI')}</b><small>${escape(x.formation||'')} • ${(x.payload?.slots||[]).filter(s=>s.slug).length}/11 selected</small></div><span>OPEN →</span></a>`).join(''):'<p>No saved XIs yet. Build your first Leeds United team.</p>';
    } catch {
      if(favourites) favourites.innerHTML='<p>Your favourites could not load right now.</p>';
      if(ratings) ratings.innerHTML='<p>Your ratings could not load right now.</p>';
      if(xis) xis.innerHTML='<p>Your saved XIs could not load right now.</p>';
    }
  }
  function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}


  function renderLocalActivity(){
    const recentHolder=document.getElementById('accountRecentPlayers');
    const compareHolder=document.getElementById('accountRecentComparisons');
    const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}};
    const players=read('leedsBuzzRecentPlayersV1');
    const comparisons=read('leedsBuzzRecentComparisonsV1');
    if(recentHolder) recentHolder.innerHTML=players.length?players.map(row=>`<a href="/white-vault?player=${encodeURIComponent(row.slug)}"><span>◉</span><b>${escape(row.name||row.slug)}</b><small>${escape(row.position||'OPEN PROFILE')} →</small></a>`).join(''):'<p>No recently viewed players on this browser yet.</p>';
    if(compareHolder) compareHolder.innerHTML=comparisons.length?comparisons.map(row=>`<a href="/white-vault?player=${encodeURIComponent(row.a?.slug||'')}&compare=${encodeURIComponent(row.b?.slug||'')}"><span>⇄</span><b>${escape(row.a?.name||'Player')} v ${escape(row.b?.name||'Player')}</b><small>OPEN COMPARE →</small></a>`).join(''):'<p>No recent comparisons on this browser yet.</p>';
  }

  function showWelcomeMessage() {
    const params = new URLSearchParams(location.search);
    const authMessage = document.getElementById('accountAuthMessage');
    if (params.has('welcome')) {
      if (welcome) welcome.hidden = false;
      if (welcomeTitle) welcomeTitle.textContent = params.has('new') ? 'Welcome to LeedsBuzz.biz.' : 'Welcome back, Blue.';
    }
    if (params.get('error') === 'no-account' && authMessage) {
      authMessage.hidden = false;
      authMessage.textContent = 'No account was found for that login link. Create a free account instead.';
    } else if (params.has('error') && authMessage) {
      authMessage.hidden = false;
      authMessage.textContent = 'That sign-in link could not be used. Request a fresh login link below.';
    }
    if ([...params.keys()].length) history.replaceState({}, '', location.pathname + location.hash);
  }

  function render() {
    if (loading) loading.hidden = true;
    const authed = Boolean(state?.authenticated);
    if (signedOut) signedOut.hidden = authed;
    if (dashboard) dashboard.hidden = !authed;
    if (!authed) {
      if (welcome) welcome.hidden = true;
      return;
    }

    const member = state.member || {};
    const profile = state.profile || {};
    document.getElementById('accountGreeting').textContent = member.displayName ? `Alright, ${member.displayName}.` : 'Complete your Leeds United profile';
    document.getElementById('accountEmail').textContent = member.email || '';
    document.getElementById('accountJoined').textContent = member.joinedAt ? `Member since ${formatDate(member.joinedAt)}` : 'Free Leeds Member';

    set('displayName', member.displayName);
    set('favouriteCurrentPlayer', profile.favouriteCurrentPlayer);
    set('favouriteEverPlayer', profile.favouriteEverPlayer);
    set('favouriteEra', profile.favouriteEra);
    set('preferredFormation', profile.preferredFormation);
    set('predictedFinish', profile.predictedFinish);
    set('favouriteMemory', profile.favouriteMemory);
    const marketing = form?.elements?.marketingOptIn;
    if (marketing) marketing.checked = Boolean(member.marketingOptIn);
  }

  function set(name, value) {
    const el = form?.elements?.[name];
    if (el) el.value = value || '';
  }

  document.getElementById('accountLogin')?.addEventListener('click', () => window.LeedsBuzzMembership?.open('login'));
  document.getElementById('accountCreate')?.addEventListener('click', () => window.LeedsBuzzMembership?.open('signup'));

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (status) status.textContent = 'Saving…';
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.marketingOptIn = Boolean(form.elements.marketingOptIn?.checked);
    try {
      const res = await fetch('/api/member/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not save your profile.');
      state = { authenticated: true, member: data.member, profile: data.profile };
      if (status) status.textContent = 'Saved.';
      window.dispatchEvent(new CustomEvent('leeds:memberchange', { detail: state }));
      await window.LeedsBuzzMembership?.refresh?.();
      render();
      setTimeout(() => { if (status) status.textContent = ''; }, 2500);
    } catch (err) {
      if (status) status.textContent = err?.message || 'Save failed.';
    }
  });

  document.getElementById('accountLogout')?.addEventListener('click', async () => {
    await fetch('/api/member/logout', { method: 'POST', credentials: 'same-origin' });
    await window.LeedsBuzzMembership?.refresh?.();
    location.href = '/?loggedout=1';
  });

  document.getElementById('accountDelete')?.addEventListener('click', async () => {
    const confirmed = window.confirm('Delete your LeedsBuzz.biz account permanently? This cannot be undone.');
    if (!confirmed) return;
    const typed = window.prompt('Type DELETE to confirm.');
    if (typed !== 'DELETE') return;
    const res = await fetch('/api/member/delete', {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ confirm: 'DELETE' })
    });
    if (res.ok) location.href = '/?account=deleted';
    else alert('The account could not be deleted right now.');
  });

  function formatDate(value) {
    const d = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
    return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }
})();
