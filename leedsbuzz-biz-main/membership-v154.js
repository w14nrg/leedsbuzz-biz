(() => {
  if (window.__LEEDSBUZZ_BIZ_MEMBERSHIP__) return;
  window.__LEEDSBUZZ_BIZ_MEMBERSHIP__ = true;

  const SYNC_KEY = 'leeds_biz_member_sync';
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('leedsbuzz-biz-membership') : null;
  let auth = { authenticated: false, member: null, profile: null };
  let busy = false;
  let lastRefresh = 0;
  let authMode = 'login';

  const modal = document.createElement('div');
  modal.className = 'cb-member-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="cb-member-backdrop" data-member-close></div>
    <section class="cb-member-card" role="dialog" aria-modal="true" aria-labelledby="cbMemberTitle">
      <button class="cb-member-close" type="button" data-member-close aria-label="Close">×</button>
      <div class="cb-member-brand">LEEDS UNITED<span>.BIZ</span></div>
      <div id="cbMemberBody"></div>
    </section>`;
  document.body.appendChild(modal);

  const body = modal.querySelector('#cbMemberBody');
  modal.querySelectorAll('[data-member-close]').forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  refresh({ force: true });
  bindSessionSync();

  window.LeedsBuzzMembership = {
    open,
    close,
    refresh: () => refresh({ force: true }),
    getState: () => ({ ...auth }),
  };

  function open(mode = '') {
    if (mode === 'login' || mode === 'signup') authMode = mode;
    render();
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('cb-member-modal-open');
    setTimeout(() => modal.querySelector('input,button,a')?.focus(), 50);
  }

  function close() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('cb-member-modal-open');
  }

  async function refresh({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - lastRefresh < 1500) return auth;
    lastRefresh = now;
    try {
      const response = await fetch('/api/member/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      const data = await response.json();
      auth = data?.authenticated ? data : { authenticated: false, member: null, profile: null };
    } catch {
      auth = { authenticated: false, member: null, profile: null };
    }
    updateGuestControls();
    if (modal.classList.contains('is-open')) render();
    window.dispatchEvent(new CustomEvent('leeds:memberchange', { detail: auth }));
    return auth;
  }

  function bindSessionSync() {
    const refreshFromElsewhere = () => refresh({ force: true });
    channel?.addEventListener('message', refreshFromElsewhere);
    window.addEventListener('storage', e => { if (e.key === SYNC_KEY) refreshFromElsewhere(); });
    window.addEventListener('pageshow', refreshFromElsewhere);
    window.addEventListener('focus', refreshFromElsewhere);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshFromElsewhere();
    });
  }

  function announceSessionChange() {
    channel?.postMessage({ changedAt: Date.now() });
    try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch {}
  }

  function updateGuestControls() {
    let controls = findGuestControls();
    if (!controls.length) controls = [createFallbackControl()];
    controls = unique([...controls, createMobileControl()]);

    controls.forEach(control => {
      if (!control) return;
      control.classList.add('cb-member-trigger');
      control.classList.toggle('is-authenticated', Boolean(auth.authenticated));
      control.setAttribute('role', 'button');
      control.setAttribute('aria-label', auth.authenticated ? 'Open My Leeds account' : 'Log in or join LeedsBuzz.biz');
      if (control.tagName === 'A') control.setAttribute('href', auth.authenticated ? '/account' : '#login');
      control.innerHTML = auth.authenticated
        ? `<span class="cb-member-avatar">${escapeHtml(memberInitial())}</span><span class="cb-member-control-copy"><b>${escapeHtml(memberLabel())}</b><small>Leeds Member</small></span>`
        : `<span class="cb-member-dot"></span><span>Log in / Join</span>`;
      if (!control.dataset.memberBound) {
        control.dataset.memberBound = '1';
        control.addEventListener('click', e => {
          e.preventDefault();
          open(auth.authenticated ? '' : 'login');
        });
      }
    });
  }

  function findGuestControls() {
    const selector = '[data-member-control], .user-pill, .profile-pill, .guest-pill, .account-member-pill, header a, header button, nav a, nav button';
    const preferred = Array.from(document.querySelectorAll(selector));
    const matches = preferred.filter(el => /guest blue|sign up\s*\/\s*log in|join\s*\/\s*log in|log in\s*\/\s*join|blue member|my leeds/i.test((el.textContent || '').trim()));
    if (matches.length) return unique(matches);

    const all = Array.from(document.querySelectorAll('a,button,div,span'));
    return unique(all.filter(el => /^guest blue$/i.test((el.textContent || '').trim())).map(el => el.closest('a,button') || el));
  }

  function createMobileControl() {
    let mobile = document.querySelector('.cb-member-mobile-trigger');
    if (mobile) return mobile;
    mobile = document.createElement('button');
    mobile.type = 'button';
    mobile.className = 'cb-member-mobile-trigger';
    mobile.setAttribute('data-member-control', '');
    document.body.appendChild(mobile);
    return mobile;
  }

  function createFallbackControl() {
    let fallback = document.querySelector('.cb-member-fallback');
    if (fallback) return fallback;
    fallback = document.createElement('button');
    fallback.type = 'button';
    fallback.className = 'cb-member-fallback';
    fallback.setAttribute('data-member-control', '');
    document.body.appendChild(fallback);
    return fallback;
  }

  function unique(arr) { return [...new Set(arr)]; }

  function memberLabel() {
    const name = String(auth?.member?.displayName || '').trim();
    return name || 'My Leeds';
  }

  function memberInitial() {
    const name = String(auth?.member?.displayName || auth?.member?.email || 'C').trim();
    return (name[0] || 'C').toUpperCase();
  }

  function render() {
    if (!body) return;
    if (auth.authenticated) renderMember();
    else renderAuth(authMode);
  }

  function renderAuth(mode = 'login', message = '', emailValue = '') {
    authMode = mode === 'signup' ? 'signup' : 'login';
    const isLogin = authMode === 'login';
    body.innerHTML = `
      <div class="cb-auth-tabs" role="tablist" aria-label="LeedsBuzz.biz membership">
        <button type="button" role="tab" data-auth-mode="login" class="${isLogin ? 'is-active' : ''}" aria-selected="${isLogin}">Log in</button>
        <button type="button" role="tab" data-auth-mode="signup" class="${!isLogin ? 'is-active' : ''}" aria-selected="${!isLogin}">Create account</button>
      </div>
      <span class="cb-member-kicker">${isLogin ? 'WELCOME BACK' : 'FREE LEEDS MEMBERSHIP'}</span>
      <h2 id="cbMemberTitle">${isLogin ? 'Log in to LeedsBuzz.biz' : 'Create your free account'}</h2>
      <p class="cb-member-lead">${isLogin
        ? 'Enter the email you used when you joined. We’ll send a fresh, secure login link.'
        : 'Enter your email to create a free Leeds Member account. No payment details are required.'}</p>
      <form id="cbMemberAuthForm" class="cb-member-form">
        <label>Email address<input id="cbMemberEmail" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com" value="${escapeHtml(emailValue)}"></label>
        <button type="submit" class="cb-member-primary">${isLogin ? 'Email me a login link' : 'Create free account'}</button>
      </form>
      ${message ? `<div class="cb-member-message">${escapeHtml(message)}</div>` : ''}
      <div class="cb-member-benefits">
        <span>✓ Free Leeds Member account</span>
        <span>✓ Secure email login</span>
        <span>✓ Stay signed in for 30 days</span>
        <span>✓ No payment details</span>
      </div>
      <p class="cb-member-small cb-member-browser-note"><b>Important:</b> use a normal browser to stay signed in. Incognito/private windows erase the session when they close.</p>
      <details class="cb-member-explainer"><summary>Why is there no password?</summary><p>Every passwordless login uses a fresh one-time email link. Receiving another email is a login, not another signup. The link expires after 15 minutes.</p></details>`;

    body.querySelectorAll('[data-auth-mode]').forEach(button => {
      button.addEventListener('click', () => {
        const email = String(body.querySelector('#cbMemberEmail')?.value || '').trim();
        renderAuth(button.dataset.authMode, '', email);
      });
    });
    body.querySelector('#cbMemberAuthForm')?.addEventListener('submit', requestLink);
  }

  async function requestLink(e) {
    e.preventDefault();
    if (busy) return;
    const email = String(body.querySelector('#cbMemberEmail')?.value || '').trim();
    if (!email) return;
    busy = true;
    const button = body.querySelector('.cb-member-primary');
    if (button) { button.disabled = true; button.textContent = authMode === 'login' ? 'Sending login link…' : 'Creating…'; }
    try {
      const response = await fetch('/api/member/request-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, returnTo: '/account', intent: authMode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.code === 'NO_ACCOUNT') {
          renderAuth('signup', data?.error || 'No account was found. Create one below.', email);
          return;
        }
        if (data?.code === 'ACCOUNT_EXISTS') {
          renderAuth('login', data?.error || 'That account already exists. Log in below.', email);
          return;
        }
        throw new Error(data?.error || 'Could not send the email.');
      }
      renderCheckEmail(email, data?.message || 'Check your email.', authMode);
    } catch (error) {
      renderAuth(authMode, error?.message || 'Could not send the email right now.', email);
    } finally {
      busy = false;
    }
  }

  function renderCheckEmail(email, message, mode) {
    const isLogin = mode === 'login';
    body.innerHTML = `
      <div class="cb-member-mail-icon">✉</div>
      <span class="cb-member-kicker">CHECK YOUR INBOX</span>
      <h2 id="cbMemberTitle">${isLogin ? 'Your login link is on its way' : 'Confirm your free account'}</h2>
      <p class="cb-member-lead">${escapeHtml(message)}</p>
      <div class="cb-member-email-chip">${escapeHtml(email)}</div>
      <p class="cb-member-small">${isLogin
        ? 'This email logs you back into your existing account. It does not create another account.'
        : 'Open the email link to finish creating your Leeds Member account.'}</p>
      <p class="cb-member-small">Open it in the same normal browser you use for LeedsBuzz.biz. The link expires in 15 minutes.</p>
      <button class="cb-member-secondary" type="button" id="cbMemberBack">Back</button>`;
    body.querySelector('#cbMemberBack')?.addEventListener('click', () => renderAuth(mode, '', email));
  }

  function renderMember() {
    const m = auth.member || {};
    body.innerHTML = `
      <div class="cb-member-identity">
        <div class="cb-member-big-avatar">${escapeHtml(memberInitial())}</div>
        <div><span class="cb-member-kicker">SIGNED IN · LEEDS MEMBER</span><h2 id="cbMemberTitle">${escapeHtml(memberLabel())}</h2></div>
      </div>
      <p class="cb-member-lead">This is your Leeds United account. Your profile and preferences can now follow you around LeedsBuzz.biz.</p>
      <div class="cb-member-account-row"><span>${escapeHtml(m.email || '')}</span><b>FREE</b></div>
      <nav class="cb-member-menu" aria-label="Member account">
        <a href="/account"><span>My Leeds</span><small>Profile and account</small></a>
        <span class="is-coming"><span>Saved conversations</span><small>Coming next</small></span>
        <span class="is-coming"><span>Predictions</span><small>Coming next</small></span>
        <span class="is-coming"><span>My XI</span><small>Coming next</small></span>
      </nav>
      <button class="cb-member-secondary" id="cbMemberLogout" type="button">Log out</button>`;
    body.querySelector('#cbMemberLogout')?.addEventListener('click', logout);
  }

  async function logout() {
    if (busy) return;
    busy = true;
    try {
      await fetch('/api/member/logout', { method: 'POST', credentials: 'same-origin' });
      auth = { authenticated: false, member: null, profile: null };
      authMode = 'login';
      updateGuestControls();
      renderAuth('login', 'You’re logged out.');
      announceSessionChange();
      window.dispatchEvent(new CustomEvent('leeds:memberchange', { detail: auth }));
    } finally {
      busy = false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }
})();
