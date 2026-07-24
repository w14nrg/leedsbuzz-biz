(() => {
  if (window.__LEEDSBUZZ_BIZBOT_WIDGET__) return;
  window.__LEEDSBUZZ_BIZBOT_WIDGET__ = true;

  const path = location.pathname.toLowerCase();
  if (path.endsWith('/bizbot') || path === '/ask-blue' || path.endsWith('/bizbot-admin.html') || path === '/bizbot-admin') return;

  const CHAT_STORAGE_KEY = 'leedsbuzz.biz.bizbot.conversation.v1';
  const CHAT_STORAGE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const MAX_STORED_TURNS = 24;
  const MAX_VISIBLE_TURNS = 14;
  const NUDGE_KEY = 'leedsbuzz.biz.bizbot.widget.nudged.v1';

  let busy = false;
  let open = false;
  let chatHistory = loadConversation();
  let matchdaySnapshot = null;
  let matchdayContext = '';

  const pageInfo = getPageInfo();
  const root = document.createElement('div');
  root.className = 'bb-widget-root';
  root.innerHTML = `
    <div class="bb-widget-nudge" id="bbWidgetNudge" role="status">
      <span>${esc(pageInfo.nudge)}</span>
      <button type="button" aria-label="Dismiss BizBot message">×</button>
    </div>

    <button class="bb-widget-launcher" id="bbWidgetLauncher" type="button" aria-label="Chat with BizBot, your Leeds United companion" aria-expanded="false">
      <span class="bb-widget-pulse" aria-hidden="true"></span>
      <span class="bb-mini-avatar" aria-hidden="true">
        <i class="bb-hair"></i><i class="bb-face"></i><i class="bb-glasses"></i><i class="bb-eye bb-eye-l"></i><i class="bb-eye bb-eye-r"></i><i class="bb-mouth"></i><i class="bb-shirt">BIZ</i>
      </span>
      <span class="bb-launch-label"><b>BizBot</b><small>Your Leeds United companion</small></span>
    </button>

    <section class="bb-widget-panel" id="bbWidgetPanel" aria-label="Chat with BizBot" aria-hidden="true">
      <header class="bb-widget-header">
        <div class="bb-widget-head-avatar" aria-hidden="true">
          <span class="bb-mini-avatar">
            <i class="bb-hair"></i><i class="bb-face"></i><i class="bb-glasses"></i><i class="bb-eye bb-eye-l"></i><i class="bb-eye bb-eye-r"></i><i class="bb-mouth"></i><i class="bb-shirt">BIZ</i>
          </span>
        </div>
        <div class="bb-widget-heading">
          <strong>BizBot</strong>
          <span><i id="bbWidgetStatusDot"></i><em id="bbWidgetStatusText">Your Leeds United companion</em></span>
        </div>
        <button class="bb-widget-icon-btn" id="bbWidgetNew" type="button" title="New chat" aria-label="Start a new BizBot chat">＋</button>
        <button class="bb-widget-icon-btn" id="bbWidgetClose" type="button" title="Close" aria-label="Close BizBot">×</button>
      </header>

      <div class="bb-widget-context">
        <span>${esc(pageInfo.label)}</span>
        <b>Chat. Debate. Ask anything.</b>
      </div>

      <div class="bb-matchday-card" id="bbMatchdayCard" hidden>
        <div class="bb-matchday-topline">
          <span id="bbMatchdayKicker">MATCHDAY</span>
          <button type="button" id="bbMatchdayRefresh" aria-label="Refresh matchday information" title="Refresh matchday information">↻</button>
        </div>
        <div class="bb-matchday-fixture" id="bbMatchdayFixture"></div>
        <div class="bb-matchday-meta" id="bbMatchdayMeta"></div>
        <div class="bb-matchday-actions" id="bbMatchdayActions"></div>
      </div>

      <div class="bb-widget-messages" id="bbWidgetMessages" aria-live="polite"></div>

      <div class="bb-widget-starters" id="bbWidgetStarters"></div>

      <form class="bb-widget-composer" id="bbWidgetForm">
        <textarea id="bbWidgetInput" rows="1" maxlength="1200" placeholder="Talk Leeds United with BizBot…" aria-label="Talk Leeds United with BizBot"></textarea>
        <button type="submit" aria-label="Send message">➜</button>
      </form>

      <footer class="bb-widget-footer">
        <a href="/bizbot">Open full BizBot chat</a>
        <span>Same conversation follows you around LeedsBuzz.biz</span>
      </footer>
    </section>
  `;
  document.body.appendChild(root);
  if (pageInfo.key === 'matchday') mountMatchdayPageCompanion();

  const launcher = root.querySelector('#bbWidgetLauncher');
  const panel = root.querySelector('#bbWidgetPanel');
  const closeBtn = root.querySelector('#bbWidgetClose');
  const newBtn = root.querySelector('#bbWidgetNew');
  const messages = root.querySelector('#bbWidgetMessages');
  const starters = root.querySelector('#bbWidgetStarters');
  const form = root.querySelector('#bbWidgetForm');
  const input = root.querySelector('#bbWidgetInput');
  const nudge = root.querySelector('#bbWidgetNudge');
  const nudgeClose = nudge?.querySelector('button');
  const statusDot = root.querySelector('#bbWidgetStatusDot');
  const statusText = root.querySelector('#bbWidgetStatusText');
  const matchdayCard = root.querySelector('#bbMatchdayCard');
  const matchdayKicker = root.querySelector('#bbMatchdayKicker');
  const matchdayFixture = root.querySelector('#bbMatchdayFixture');
  const matchdayMeta = root.querySelector('#bbMatchdayMeta');
  const matchdayActions = root.querySelector('#bbMatchdayActions');
  const matchdayRefresh = root.querySelector('#bbMatchdayRefresh');

  renderConversation();
  renderStarters();
  checkHealth();
  scheduleNudge();
  if (pageInfo.key === 'matchday') {
    loadMatchdaySnapshot();
    window.setInterval(loadMatchdaySnapshot, 60 * 1000);
  }

  launcher?.addEventListener('click', () => setOpen(!open));
  closeBtn?.addEventListener('click', () => setOpen(false));
  nudgeClose?.addEventListener('click', dismissNudge);
  nudge?.addEventListener('click', e => {
    if (e.target === nudgeClose) return;
    dismissNudge();
    setOpen(true);
  });
  newBtn?.addEventListener('click', resetConversation);
  matchdayRefresh?.addEventListener('click', loadMatchdaySnapshot);

  form?.addEventListener('submit', e => {
    e.preventDefault();
    ask(input?.value);
  });

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form?.requestSubmit();
    }
  });

  input?.addEventListener('input', resizeInput);

  window.addEventListener('storage', e => {
    if (e.key !== CHAT_STORAGE_KEY) return;
    chatHistory = loadConversation();
    renderConversation();
  });

  function setOpen(next) {
    open = Boolean(next);
    panel?.classList.toggle('is-open', open);
    panel?.setAttribute('aria-hidden', String(!open));
    launcher?.classList.toggle('is-open', open);
    launcher?.setAttribute('aria-expanded', String(open));
    dismissNudge();
    if (open) {
      chatHistory = loadConversation();
      renderConversation();
      setTimeout(() => input?.focus(), 160);
    }
  }

  function scheduleNudge() {
    let already = false;
    try { already = sessionStorage.getItem(NUDGE_KEY) === '1'; } catch {}
    if (already || window.innerWidth < 560) return;
    setTimeout(() => {
      if (open || !nudge) return;
      nudge.classList.add('show');
      try { sessionStorage.setItem(NUDGE_KEY, '1'); } catch {}
      setTimeout(() => nudge.classList.remove('show'), 9000);
    }, 3500);
  }

  function dismissNudge() {
    nudge?.classList.remove('show');
  }

  function mountMatchdayPageCompanion() {
    const main = document.querySelector('main');
    if (!main || document.getElementById('bbMatchdayPageCompanion')) return;
    const section = document.createElement('section');
    section.id = 'bbMatchdayPageCompanion';
    section.className = 'bb-matchday-page-companion';
    section.innerHTML = `
      <div class="bbmp-copy">
        <span class="bbmp-eyebrow">BIZBOT MATCHDAY COMPANION</span>
        <h2>Your Leeds United match. One conversation.</h2>
        <p>Preview it. Debate the XI. Talk tactics during the game. Give your verdict after the whistle.</p>
        <div class="bbmp-buttons">
          <button type="button" data-bbmp-open>Open match chat</button>
          <button type="button" data-bbmp-prompt="Give me the Leeds United match preview.">Match preview</button>
          <button type="button" data-bbmp-prompt="Using Leeds United's current squad and latest player availability, what XI would you pick for the next match? Search the latest team and transfer information first.">Pick your XI</button>
        </div>
      </div>
      <div class="bbmp-fixture" aria-live="polite">
        <span>Matchday</span>
        <strong id="bbmpFixtureText">Loading Leeds United fixture…</strong>
        <small id="bbmpFixtureMeta">BizBot will keep this match in context while you chat.</small>
      </div>
    `;
    main.insertBefore(section, main.firstChild);
    section.querySelector('[data-bbmp-open]')?.addEventListener('click', () => setOpen(true));
    section.querySelectorAll('[data-bbmp-prompt]').forEach(btn => btn.addEventListener('click', () => {
      setOpen(true);
      ask(btn.dataset.bbmpPrompt || 'Let’s talk about the Leeds United match.');
    }));
  }

  function updateMatchdayPageCompanion(match, phase, hasScore) {
    const fixtureText = document.getElementById('bbmpFixtureText');
    const fixtureMeta = document.getElementById('bbmpFixtureMeta');
    const section = document.getElementById('bbMatchdayPageCompanion');
    if (!fixtureText || !fixtureMeta || !match) return;
    const home = cleanClubName(match.homeTeam || 'Home');
    const away = cleanClubName(match.awayTeam || 'Away');
    fixtureText.textContent = `${home} ${hasScore ? `${match.homeScore}–${match.awayScore}` : 'v'} ${away}`;
    fixtureMeta.textContent = [match.playedAt ? formatKickoff(match.playedAt) : '', match.competition || '', match.venue || ''].filter(Boolean).join(' · ');
    section?.setAttribute('data-phase', phase || 'upcoming');
  }

  function getPageInfo() {
    const dataPage = String(document.body?.dataset?.page || '').toLowerCase();
    const title = String(document.title || '').replace(/\s*\|\s*Leeds United\.biz.*$/i, '').trim();
    const heading = String(document.querySelector('main h1, main h2')?.textContent || '').replace(/\s+/g, ' ').trim();
    const key = dataPage || inferPageKey(path);
    const map = {
      home: {
        label: 'LeedsBuzz.biz',
        nudge: 'Fancy a Leeds United chat?',
        starters: ['Where do you think Leeds United will finish?', 'Let’s talk about Leeds United right now.']
      },
      matchday: {
        label: 'Matchday',
        nudge: 'Want to talk about the match?',
        starters: ['Give me the match preview.', 'What XI would you play?', 'What’s the key tactical battle?', 'Give me your score prediction.']
      },
      transfers: {
        label: 'Transfers',
        nudge: 'Seen a transfer you want to debate?',
        starters: ['Let’s talk Leeds United transfers.', 'Which position should Leeds United strengthen next?']
      },
      vault: {
        label: 'White Vault',
        nudge: 'Want to talk Leeds United legends?',
        starters: ['Tell me about a Leeds United legend.', 'Who is Leeds United’s greatest ever player?']
      },
      history: {
        label: 'History',
        nudge: 'Fancy going back in Leeds United history?',
        starters: ['Take me back to a classic Leeds United season.', 'Give me a Leeds United history question.']
      },
      xi: {
        label: 'Build XI',
        nudge: 'Need a second opinion on your Leeds XI?',
        starters: ['Help me build an all-time Leeds XI.', 'Who gets into your all-time Leeds United midfield?']
      },
      games: {
        label: 'Games',
        nudge: 'Up for a Leeds United challenge?',
        starters: ['Give me a Leeds United quiz.', 'Test my Leeds United knowledge.']
      },
      news: {
        label: 'News',
        nudge: 'Want to talk about the latest Leeds United news?',
        starters: ['What’s the biggest Leeds United story right now?', 'Let’s talk about today’s Leeds United news.']
      },
      community: {
        label: 'Community',
        nudge: 'Got a Leeds United opinion to argue?',
        starters: ['Give me a Leeds United debate topic.', 'What’s your hottest Leeds United take?']
      },
      shop: {
        label: 'Shop',
        nudge: 'Want to talk Leeds United shirts and kits?',
        starters: ['What’s Leeds United’s greatest ever kit?', 'Let’s rank classic Leeds United shirts.']
      }
    };
    const info = map[key] || map.home;
    return {
      key,
      label: info.label,
      nudge: info.nudge,
      starters: info.starters,
      context: [info.label, title, heading].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ').slice(0, 220)
    };
  }

  function inferPageKey(p) {
    if (p.includes('matchday')) return 'matchday';
    if (p.includes('transfer')) return 'transfers';
    if (p.includes('blue-vault')) return 'vault';
    if (p.includes('history')) return 'history';
    if (p.includes('build-your-xi')) return 'xi';
    if (p.includes('games')) return 'games';
    if (p.includes('news')) return 'news';
    if (p.includes('community')) return 'community';
    if (p.includes('shop')) return 'shop';
    return 'home';
  }

  function buildCurrentPageContext() {
    return [pageInfo.context, matchdayContext].filter(Boolean).join(' | ').slice(0, 720);
  }

  async function loadMatchdaySnapshot() {
    if (pageInfo.key !== 'matchday' || !matchdayCard) return;
    matchdayRefresh?.classList.add('is-loading');
    try {
      const response = await fetch('/api/bizbot/matchday', { cache: 'no-store' });
      const data = response.ok ? await response.json() : null;
      if (!data?.ok || !data.focus) throw new Error('No matchday snapshot');
      matchdaySnapshot = data;
      renderMatchdaySnapshot(data);
    } catch {
      matchdaySnapshot = null;
      matchdayContext = '';
      matchdayCard.hidden = true;
    } finally {
      matchdayRefresh?.classList.remove('is-loading');
    }
  }

  function renderMatchdaySnapshot(data) {
    const match = data?.focus;
    if (!match || !matchdayCard) return;
    const now = Date.now();
    const kick = match.playedAt ? new Date(match.playedAt).getTime() : NaN;
    const started = Number.isFinite(kick) && kick <= now;
    const hasScore = Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
    const phase = String(data.phase || 'upcoming');

    let kicker = 'NEXT UP';
    if (phase === 'matchday') kicker = started ? 'MATCHDAY NOW' : 'MATCHDAY';
    if (phase === 'recent' || (!data.next && started)) kicker = 'LAST MATCH';

    const home = cleanClubName(match.homeTeam || 'Home');
    const away = cleanClubName(match.awayTeam || 'Away');
    const middle = hasScore ? `<strong class="bb-matchday-score">${match.homeScore}–${match.awayScore}</strong>` : '<span class="bb-matchday-v">v</span>';
    matchdayKicker.textContent = kicker;
    matchdayFixture.innerHTML = `<strong>${esc(home)}</strong>${middle}<strong>${esc(away)}</strong>`;

    const when = match.playedAt ? formatKickoff(match.playedAt) : '';
    const meta = [when, match.competition, match.venue].filter(Boolean).join(' · ');
    matchdayMeta.textContent = meta;
    updateMatchdayPageCompanion(match, phase, hasScore);

    const prompts = getMatchdayPrompts({ phase, started, hasScore, home, away });
    matchdayActions.innerHTML = prompts.map(item => `<button type="button" data-prompt="${esc(item.prompt)}">${esc(item.label)}</button>`).join('');
    matchdayActions.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => ask(btn.dataset.prompt || btn.textContent.trim())));

    matchdayContext = [
      `Matchday companion focus: ${home} ${hasScore ? `${match.homeScore}-${match.awayScore}` : 'v'} ${away}`,
      match.playedAt ? `kick-off ${new Date(match.playedAt).toISOString()}` : '',
      match.competition ? `competition ${match.competition}` : '',
      match.venue ? `venue ${match.venue}` : '',
      `matchday phase ${phase}`,
      `snapshot refreshed ${data.refreshedAt || new Date().toISOString()}`
    ].filter(Boolean).join('; ');

    // Make the nudge specific once we know the fixture.
    const nudgeText = nudge?.querySelector('span');
    if (nudgeText) nudgeText.textContent = `${home} v ${away} — fancy a match chat?`;
    matchdayCard.hidden = false;
  }

  function getMatchdayPrompts({ phase, started, hasScore, home, away }) {
    if (phase === 'recent') {
      return [
        { label: 'Your verdict', prompt: `Give me your honest verdict on ${home} v ${away}.` },
        { label: 'What went right?', prompt: `What did Leeds United do well in ${home} v ${away}?` },
        { label: 'What went wrong?', prompt: `What went wrong for Leeds United in ${home} v ${away}?` },
        { label: 'Player ratings', prompt: `Let’s talk player ratings from ${home} v ${away}.` },
      ];
    }
    if (started || (phase === 'matchday' && hasScore)) {
      return [
        { label: 'What are you seeing?', prompt: `What are you seeing tactically in ${home} v ${away} right now?` },
        { label: 'Who would you change?', prompt: `Who would you change for Leeds United in ${home} v ${away}, and why?` },
        { label: 'Tactical battle', prompt: `What is the key tactical battle in ${home} v ${away}?` },
        { label: 'Your verdict so far', prompt: `What’s your verdict on Leeds United so far in ${home} v ${away}?` },
      ];
    }
    return [
      { label: 'Quick preview', prompt: `Give me a quick preview of ${home} v ${away}.` },
      { label: 'Your Leeds XI', prompt: `Using Leeds United's current squad and latest player availability, what Leeds XI would you pick for ${home} v ${away}? Search the latest team and transfer information first.` },
      { label: 'Tactical battle', prompt: `What is the key tactical battle for ${home} v ${away}?` },
      { label: 'Score prediction', prompt: `Give me your score prediction for ${home} v ${away} and why.` },
    ];
  }

  function cleanClubName(value) {
    return String(value || '').replace(/\s+(Football Club|FC|AFC)$/i, '').trim();
  }

  function formatKickoff(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function renderStarters() {
    if (!starters) return;
    starters.innerHTML = pageInfo.starters.map(text => `<button type="button">${esc(text)}</button>`).join('');
    starters.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => ask(btn.textContent.trim())));
  }

  function loadConversation() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || 'null');
      if (!saved || !Array.isArray(saved.history) || !saved.savedAt) return [];
      if (Date.now() - Number(saved.savedAt) > CHAT_STORAGE_MAX_AGE) {
        localStorage.removeItem(CHAT_STORAGE_KEY);
        return [];
      }
      return saved.history
        .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-MAX_STORED_TURNS);
    } catch {
      return [];
    }
  }

  function saveConversation() {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), history: chatHistory.slice(-MAX_STORED_TURNS) }));
    } catch {}
  }

  function resetConversation() {
    chatHistory = [];
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
    renderConversation();
    input?.focus();
  }

  function renderConversation() {
    if (!messages) return;
    const visible = chatHistory.slice(-MAX_VISIBLE_TURNS);
    if (!visible.length) {
      messages.innerHTML = botHtml('Alright. I’m with you wherever you are on LeedsBuzz.biz. Ask me anything about Leeds United or just have a chat.');
    } else {
      messages.innerHTML = visible.map(item => item.role === 'user' ? userHtml(item.content) : botHtml(item.content)).join('');
    }
    messages.scrollTop = messages.scrollHeight;
  }

  async function ask(value) {
    const q = String(value || '').trim();
    if (!q || busy) return;
    busy = true;
    dismissNudge();

    const priorHistory = chatHistory.slice(-18);
    chatHistory.push({ role: 'user', content: q });
    saveConversation();
    appendUser(q);
    const thinkingId = appendThinking();

    if (input) {
      input.value = '';
      input.disabled = true;
      resizeInput();
    }
    starters?.classList.add('is-hidden');
    launcher?.classList.add('is-thinking');

    try {
      const response = await fetch('/api/bizbot/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, history: priorHistory, pageContext: buildCurrentPageContext() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && !data.answer) throw new Error(data.error || 'BizBot request failed.');
      const answer = String(data.answer || data.error || 'I couldn’t answer that just now.');
      chatHistory.push({ role: 'assistant', content: answer });
      if (chatHistory.length > MAX_STORED_TURNS) chatHistory.splice(0, chatHistory.length - MAX_STORED_TURNS);
      saveConversation();
      replaceThinking(thinkingId, answer, data.sources || []);
    } catch {
      const answer = 'I couldn’t connect properly just then. Give that one another go in a moment.';
      chatHistory.push({ role: 'assistant', content: answer });
      saveConversation();
      replaceThinking(thinkingId, answer, []);
    } finally {
      busy = false;
      launcher?.classList.remove('is-thinking');
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  }

  function appendUser(text) {
    messages?.insertAdjacentHTML('beforeend', userHtml(text));
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function appendThinking() {
    const id = `bbw-thinking-${Date.now()}`;
    messages?.insertAdjacentHTML('beforeend', `<div class="bbw-msg bot" id="${id}"><span class="bbw-bot-dot">BB</span><div class="bbw-bubble thinking"><i></i><i></i><i></i></div></div>`);
    if (messages) messages.scrollTop = messages.scrollHeight;
    return id;
  }

  function replaceThinking(id, answer, sources) {
    const el = document.getElementById(id);
    const html = botHtml(answer, sources);
    if (el) el.outerHTML = html;
    else messages?.insertAdjacentHTML('beforeend', html);
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function userHtml(text) {
    return `<div class="bbw-msg user"><div class="bbw-bubble">${formatText(text)}</div></div>`;
  }

  function botHtml(text, sources = []) {
    const links = (sources || []).slice(0, 5).filter(s => s?.url).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher || s.title || 'Source')}</a>`).join('');
    return `<div class="bbw-msg bot"><span class="bbw-bot-dot">BB</span><div><div class="bbw-bubble">${formatText(text)}</div>${links ? `<details class="bbw-sources"><summary>Sources</summary><div>${links}</div></details>` : ''}</div></div>`;
  }

  function formatText(text) {
    return esc(String(text || '')).replace(/\n/g, '<br>');
  }

  async function checkHealth() {
    try {
      const response = await fetch('/api/bizbot/health', { cache: 'no-store' });
      const data = response.ok ? await response.json() : {};
      const ready = Boolean(data.ai);
      statusDot?.classList.toggle('online', ready);
      if (statusText) statusText.textContent = ready ? 'Online now' : 'Connecting…';
    } catch {
      if (statusText) statusText.textContent = 'Temporarily offline';
    }
  }

  function resizeInput() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 104)}px`;
  }

  function esc(value = '') {
    return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
})();
