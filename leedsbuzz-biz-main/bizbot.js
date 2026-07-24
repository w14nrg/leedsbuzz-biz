(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const messages = $('#bizMessages');
  const form = $('#bizForm');
  const input = $('#bizInput');
  const statusText = $('#bizStatusText');
  const statusDot = $('#bizStatusDot');
  const avatar = $('#bizAvatar');
  const avatarSpeechText = $('#avatarSpeechText');
  const voiceToggle = $('#bizVoiceToggle');
  const voiceLabel = $('#bizVoiceLabel');

  const CHAT_STORAGE_KEY = 'leedsbuzz.biz.bizbot.conversation.v1';
  const VOICE_STORAGE_KEY = 'leedsbuzz.biz.bizbot.voice.v1';
  const CHAT_STORAGE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const MAX_STORED_TURNS = 24;
  const INITIAL_GREETING = 'Morning. I’m BizBot — your Leeds United companion. Ask me anything about Leeds United, or just talk to me. Matches, players, tactics, transfers, history, predictions, opinions — whatever’s on your mind.';

  let busy = false;
  let voiceEnabled = false;
  let talkTimer = null;

  const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

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

  const chatHistory = loadConversation();

  function saveConversation() {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), history: chatHistory.slice(-MAX_STORED_TURNS) }));
    } catch {}
  }

  function setAvatarState(state = 'idle', speech = '') {
    if (avatar) {
      avatar.classList.remove('state-idle', 'state-listening', 'state-thinking', 'state-talking');
      avatar.classList.add(`state-${state}`);
    }
    if (avatarSpeechText && speech) avatarSpeechText.textContent = speech;
  }

  function firstSentence(text, max = 150) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'I’m with you, Blue.';
    const match = clean.match(/^.*?[.!?](?:\s|$)/);
    const sentence = (match ? match[0] : clean).trim();
    return sentence.length > max ? `${sentence.slice(0, max - 1).trim()}…` : sentence;
  }

  function setVoiceUi() {
    voiceToggle?.setAttribute('aria-pressed', String(voiceEnabled));
    voiceToggle?.classList.toggle('active', voiceEnabled);
    if (voiceLabel) voiceLabel.textContent = voiceEnabled ? 'Voice on' : 'Voice off';
  }

  function loadVoiceSetting() {
    try { voiceEnabled = localStorage.getItem(VOICE_STORAGE_KEY) === 'on'; } catch { voiceEnabled = false; }
    setVoiceUi();
  }

  function stopSpeaking() {
    try { window.speechSynthesis?.cancel(); } catch {}
    if (talkTimer) clearTimeout(talkTimer);
    talkTimer = null;
  }

  function speak(text) {
    stopSpeaking();
    if (!voiceEnabled || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      setAvatarState('talking', firstSentence(text));
      talkTimer = setTimeout(() => {
        if (!busy) setAvatarState(input?.value.trim() ? 'listening' : 'idle', 'What do you reckon, Blue?');
      }, 1800);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(String(text || '').replace(/https?:\/\/\S+/g, ''));
    utterance.lang = 'en-GB';
    utterance.rate = 1.03;
    utterance.pitch = 0.96;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const preferred = voices.find(v => /^en-GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setAvatarState('talking', firstSentence(text));
    utterance.onend = () => { if (!busy) setAvatarState(input?.value.trim() ? 'listening' : 'idle', 'What do you reckon, Blue?'); };
    utterance.onerror = () => { if (!busy) setAvatarState('idle', 'What do you reckon, Blue?'); };
    window.speechSynthesis.speak(utterance);
  }

  async function health() {
    try {
      const r = await fetch('/api/bizbot/health', { cache: 'no-store' });
      if (!r.ok) throw new Error('offline');
      const data = await r.json();
      const ready = Boolean(data.ai);
      statusDot?.classList.toggle('online', ready);
      if (statusText) statusText.textContent = ready ? 'Online now' : 'Connecting…';
    } catch {
      if (statusText) statusText.textContent = 'Temporarily offline';
    }
  }

  function userMessageHtml(text) {
    return `<div class="biz-message user"><div class="message-wrap"><div class="message-bubble"><p>${esc(text).replace(/\n/g, '<br>')}</p></div></div></div>`;
  }

  function botMessageHtml(text, sources = []) {
    const sourceLinks = (sources || []).slice(0, 8).map(s => {
      const label = esc(s.publisher || s.title || 'Source');
      const url = esc(s.url || '#');
      return `<a class="biz-source" href="${url}" target="_blank" rel="noopener">${label}</a>`;
    }).join('');
    const sourcePanel = sourceLinks
      ? `<details class="biz-source-panel"><summary>Sources <span>${Math.min(sources.length, 8)}</span></summary><div class="biz-sources">${sourceLinks}</div></details>`
      : '';
    return `<div class="biz-message bot"><div class="message-avatar" aria-hidden="true"><span>BB</span></div><div class="message-wrap"><b>BizBot</b><div class="message-bubble"><p>${esc(text).replace(/\n/g, '<br>')}</p></div>${sourcePanel}</div></div>`;
  }

  function appendUser(text) {
    messages?.insertAdjacentHTML('beforeend', userMessageHtml(text));
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function appendStoredBot(text) {
    messages?.insertAdjacentHTML('beforeend', botMessageHtml(text));
  }

  function restoreConversation() {
    if (!messages || !chatHistory.length) return;
    messages.innerHTML = '';
    for (const item of chatHistory) {
      if (item.role === 'user') appendUser(item.content);
      else appendStoredBot(item.content);
    }
    messages.scrollTop = messages.scrollHeight;
    const lastAssistant = [...chatHistory].reverse().find(item => item.role === 'assistant');
    setAvatarState('idle', lastAssistant ? firstSentence(lastAssistant.content) : 'Morning. What’s on your mind?');
  }

  function resetConversation() {
    stopSpeaking();
    chatHistory.splice(0, chatHistory.length);
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
    if (messages) messages.innerHTML = botMessageHtml(INITIAL_GREETING);
    if (input) {
      input.value = '';
      input.style.height = 'auto';
      input.focus();
    }
    busy = false;
    setAvatarState('idle', 'Fresh chat, Blue. What are we talking about?');
  }

  function appendThinking() {
    const id = `thinking-${Date.now()}`;
    messages?.insertAdjacentHTML('beforeend', `<div id="${id}" class="biz-message bot thinking-message"><div class="message-avatar" aria-hidden="true"><span>BB</span></div><div class="message-wrap"><b>BizBot</b><div class="message-bubble thinking-bubble"><span></span><span></span><span></span></div></div></div>`);
    if (messages) messages.scrollTop = messages.scrollHeight;
    return id;
  }

  function appendBot(data, replaceId) {
    document.getElementById(replaceId)?.remove();
    const answer = String(data.answer || 'I could not answer that just now.');
    messages?.insertAdjacentHTML('beforeend', botMessageHtml(answer, data.sources || []));
    if (messages) messages.scrollTop = messages.scrollHeight;
    speak(answer);
  }

  async function ask(question) {
    const q = String(question || '').trim();
    if (!q || busy) return;

    busy = true;
    stopSpeaking();
    const priorHistory = chatHistory.slice(-18);
    appendUser(q);
    chatHistory.push({ role: 'user', content: q });
    saveConversation();

    setAvatarState('thinking', 'Let me have a look, Blue…');
    const thinkingId = appendThinking();
    if (input) {
      input.value = '';
      input.style.height = 'auto';
      input.disabled = true;
    }

    try {
      const r = await fetch('/api/bizbot/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, history: priorHistory })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok && !data.answer) throw new Error(data.error || 'BizBot request failed.');
      const answerText = String(data.answer || data.error || 'BizBot could not answer that just now.');
      chatHistory.push({ role: 'assistant', content: answerText });
      if (chatHistory.length > MAX_STORED_TURNS) chatHistory.splice(0, chatHistory.length - MAX_STORED_TURNS);
      saveConversation();
      appendBot({ ...data, answer: answerText }, thinkingId);
    } catch (error) {
      const answer = 'I couldn’t connect properly just then, Blue. Give that one another go in a moment.';
      chatHistory.push({ role: 'assistant', content: answer });
      saveConversation();
      appendBot({ answer }, thinkingId);
    } finally {
      busy = false;
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  }

  function resizeInput() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }

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

  input?.addEventListener('input', () => {
    resizeInput();
    if (!busy) setAvatarState(input.value.trim() ? 'listening' : 'idle', input.value.trim() ? 'Go on… I’m listening.' : 'What’s on your mind, Blue?');
  });

  $$('.biz-suggestion').forEach(btn => btn.addEventListener('click', () => ask(btn.textContent.trim())));
  $('#bizNewChat')?.addEventListener('click', resetConversation);

  voiceToggle?.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    try { localStorage.setItem(VOICE_STORAGE_KEY, voiceEnabled ? 'on' : 'off'); } catch {}
    setVoiceUi();
    if (!voiceEnabled) stopSpeaking();
    setAvatarState('idle', voiceEnabled ? 'Voice is on. I’ll talk you through it.' : 'Voice is off. We’ll keep it in the chat.');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeaking();
  });

  loadVoiceSetting();
  restoreConversation();
  health();
})();
