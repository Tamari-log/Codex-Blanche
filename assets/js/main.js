const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');

const state = {
  sessions: JSON.parse(localStorage.getItem('codex_sessions') || '[]'),
  activeSessionId: localStorage.getItem('codex_active_session_id'),
  personas: JSON.parse(localStorage.getItem('codex_personas') || '[]'),
  settings: {
    provider: localStorage.getItem('provider') || 'gemini',
    geminiKey: localStorage.getItem('gemini_api_key') || '',
    openaiKey: localStorage.getItem('openai_api_key') || '',
    systemPrompt: localStorage.getItem('system_prompt') || '',
    temperature: Number(localStorage.getItem('temperature') || 0.7),
    maxTokens: Number(localStorage.getItem('max_tokens') || 2048),
  },
};

function getActiveSession() {
  return state.sessions.find((s) => s.id === state.activeSessionId);
}

function persist() {
  localStorage.setItem('codex_sessions', JSON.stringify(state.sessions));
  localStorage.setItem('codex_personas', JSON.stringify(state.personas));
  localStorage.setItem('codex_active_session_id', state.activeSessionId || '');
}

function startNewSession() {
  const id = crypto.randomUUID();
  state.sessions.unshift({ id, title: `会話 ${new Date().toLocaleString('ja-JP')}`, messages: [] });
  state.activeSessionId = id;
  persist();
  renderHistory();
  renderSessionList();
}

function renderHistory() {
  chatArea.innerHTML = '';
  const session = getActiveSession();
  if (!session || session.messages.length === 0) {
    addBubble('こんにちは。知恵の鏡へようこそ。', 'ai', null, false);
    return;
  }
  session.messages.forEach((item, index) => addBubble(item.text, item.role, index));
}

function addBubble(text, role, index = null, editable = true) {
  const div = document.createElement('div');
  div.className = role === 'user' ? 'user-msg' : 'ai-msg';
  div.contentEditable = editable;
  div.innerText = text;
  div.onblur = () => {
    const session = getActiveSession();
    if (index !== null && session?.messages[index]) {
      session.messages[index].text = div.innerText;
      persist();
    }
  };
  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
  return div;
}

function renderPersonaTabs() {
  const wrap = document.getElementById('persona-tabs');
  wrap.innerHTML = '';
  state.personas.forEach((p, idx) => {
    const btn = document.createElement('button');
    btn.className = 'px-3 py-1 rounded-full text-sm border dark:text-white';
    btn.innerText = p.name;
    btn.onclick = () => applyPersona(idx);
    wrap.appendChild(btn);
  });
}

function applyPersona(idx) {
  const p = state.personas[idx];
  if (!p) return;
  state.settings = { ...state.settings, ...p.settings };
  applySettingsToUI();
  saveSettings();
}

function savePersona() {
  const name = document.getElementById('persona-name').value.trim();
  if (!name) return;
  state.personas.push({ name, settings: { ...state.settings } });
  persist();
  renderPersonaTabs();
  document.getElementById('persona-name').value = '';
}

function renderSessionList() {
  const list = document.getElementById('session-list');
  list.innerHTML = '';
  state.sessions.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'w-full text-left p-2 rounded border dark:text-white';
    btn.innerText = s.title;
    btn.onclick = () => {
      state.activeSessionId = s.id;
      persist();
      renderHistory();
      toggleHistoryPanel();
    };
    list.appendChild(btn);
  });
}

function saveSettings() {
  localStorage.setItem('provider', state.settings.provider);
  localStorage.setItem('gemini_api_key', state.settings.geminiKey);
  localStorage.setItem('openai_api_key', state.settings.openaiKey);
  localStorage.setItem('system_prompt', state.settings.systemPrompt);
  localStorage.setItem('temperature', state.settings.temperature);
  localStorage.setItem('max_tokens', state.settings.maxTokens);
}

function applySettingsToUI() {
  document.getElementById('provider').value = state.settings.provider;
  document.getElementById('gemini-key').value = state.settings.geminiKey;
  document.getElementById('openai-key').value = state.settings.openaiKey;
  document.getElementById('system-prompt').value = state.settings.systemPrompt;
  document.getElementById('temperature').value = state.settings.temperature;
  document.getElementById('temperature-value').innerText = state.settings.temperature;
  document.getElementById('max-tokens').value = state.settings.maxTokens;
  document.getElementById('max-tokens-value').innerText = state.settings.maxTokens;
}

function bindSettings() {
  const provider = document.getElementById('provider');
  const geminiKey = document.getElementById('gemini-key');
  const openaiKey = document.getElementById('openai-key');
  const systemPrompt = document.getElementById('system-prompt');
  const temperature = document.getElementById('temperature');
  const maxTokens = document.getElementById('max-tokens');

  provider.onchange = () => { state.settings.provider = provider.value; saveSettings(); };
  geminiKey.onchange = () => { state.settings.geminiKey = geminiKey.value.trim(); saveSettings(); };
  openaiKey.onchange = () => { state.settings.openaiKey = openaiKey.value.trim(); saveSettings(); };
  systemPrompt.onchange = () => { state.settings.systemPrompt = systemPrompt.value; saveSettings(); };
  temperature.oninput = () => {
    state.settings.temperature = Number(temperature.value);
    document.getElementById('temperature-value').innerText = temperature.value;
    saveSettings();
  };
  maxTokens.oninput = () => {
    state.settings.maxTokens = Number(maxTokens.value);
    document.getElementById('max-tokens-value').innerText = maxTokens.value;
    saveSettings();
  };
}

async function handleSend() {
  const text = userInput.value.trim();
  if (!text) return;
  const session = getActiveSession();
  if (!session) return;

  const apiKey = state.settings.provider === 'gemini' ? state.settings.geminiKey : state.settings.openaiKey;
  if (!apiKey) return;

  userInput.disabled = true;
  session.messages.push({ role: 'user', text });
  persist();
  renderHistory();
  userInput.value = '';

  const loading = addBubble('思索中...', 'ai');
  try {
    const messages = [
      ...(state.settings.systemPrompt ? [{ role: 'system', text: state.settings.systemPrompt }] : []),
      ...session.messages,
    ];
    const reply = state.settings.provider === 'gemini'
      ? await callGeminiAPI(messages, apiKey, { temperature: state.settings.temperature, maxTokens: state.settings.maxTokens })
      : await callOpenAIAPI(messages, apiKey, { temperature: state.settings.temperature, maxTokens: state.settings.maxTokens });
    session.messages.push({ role: 'ai', text: reply });
    persist();
    renderHistory();
  } catch (e) {
    loading.innerText = `エラー：${e.message}`;
  } finally {
    userInput.disabled = false;
    userInput.focus();
  }
}

function toggleSettings() { document.getElementById('settings-modal').classList.toggle('hidden'); }
function toggleHistoryPanel() { document.getElementById('history-panel').classList.toggle('hidden'); }
function updateModeButton() {
  const btn = document.getElementById('mode-toggle-btn');
  btn.innerHTML = document.documentElement.classList.contains('dark') ? '☀️ ライトモードへ' : '🌙 ダークモードへ';
}
function toggleDarkMode() { document.documentElement.classList.toggle('dark'); localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'; updateModeButton(); }

userInput.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = `${this.scrollHeight}px`; });
userInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });

window.addEventListener('DOMContentLoaded', () => {
  if (!state.sessions.length) startNewSession();
  if (!state.activeSessionId) state.activeSessionId = state.sessions[0].id;
  updateModeButton();
  applySettingsToUI();
  bindSettings();
  renderHistory();
  renderSessionList();
  renderPersonaTabs();
});
