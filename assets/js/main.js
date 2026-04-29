const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');

const state = {
  sessions: JSON.parse(localStorage.getItem('codex_sessions') || '[]'),
  activeSessionId: localStorage.getItem('codex_active_session_id'),
  personas: JSON.parse(localStorage.getItem('codex_personas') || '[]'),
  settings: {
    provider: localStorage.getItem('provider') || 'gemini',
    geminiModel: localStorage.getItem('gemini_model') || 'gemini-3.1-pro-preview',
    openaiModel: localStorage.getItem('openai_model') || 'gpt-4.1-mini',
    geminiKey: localStorage.getItem('gemini_api_key') || '',
    openaiKey: localStorage.getItem('openai_api_key') || '',
    systemPrompt: localStorage.getItem('system_prompt') || '',
    temperature: Number(localStorage.getItem('temperature') || 0.7),
    maxTokens: Number(localStorage.getItem('max_tokens') || 2048),
  },
};

const CONTEXT_LIMITS = {
  gemini: 150000,
  openai: 50000,
};

const MODEL_OPTIONS = {
  gemini: [
    { value: 'gemini-3-flash-preview', label: 'gemini 3 flash（高速）' },
    { value: 'gemini-3.1-flash-lite-preview', label: 'gemini 3.1 flash lite（新しい高速）' },
    { value: 'gemini-3.1-pro-preview', label: 'gemini 3.1 pro（高性能）' },
  ],
  openai: [
    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini（高速）' },
    { value: 'gpt-4.1', label: 'gpt-4.1（高性能）' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini（軽量）' },
  ],
};

function renderModelOptions() {
  const model = document.getElementById('model');
  if (!model) return;
  const provider = state.settings.provider;
  const options = MODEL_OPTIONS[provider] || [];
  const selected = provider === 'gemini' ? state.settings.geminiModel : state.settings.openaiModel;
  model.innerHTML = '';
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    model.appendChild(option);
  });
  if (options.some((opt) => opt.value === selected)) {
    model.value = selected;
  } else if (options[0]) {
    model.value = options[0].value;
    if (provider === 'gemini') state.settings.geminiModel = options[0].value;
    if (provider === 'openai') state.settings.openaiModel = options[0].value;
    saveSettings();
  }
}

function syncContextSliderLimit() {
  const maxTokens = document.getElementById('max-tokens');
  const limit = CONTEXT_LIMITS[state.settings.provider] || 8192;
  maxTokens.max = String(limit);
  if (state.settings.maxTokens > limit) {
    state.settings.maxTokens = limit;
    saveSettings();
  }
}

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
    addBubble('ようこそ、白い写本へ。', 'ai', null, false);
    return;
  }
  session.messages.forEach((item, index) => addBubble(item.text, item.role, index));
}

function addBubble(text, role, index = null, editable = true) {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-1';
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
  wrap.appendChild(div);

  if (index !== null) {
    const controls = document.createElement('div');
    controls.className = 'flex justify-end gap-2 text-xs';
    const del = document.createElement('button');
    del.className = 'px-2 py-1 rounded bg-slate-700 text-white';
    del.innerText = '削除';
    del.onclick = () => deleteMessage(index);
    controls.appendChild(del);

    if (role === 'ai') {
      const retry = document.createElement('button');
      retry.className = 'px-2 py-1 rounded bg-indigo-600 text-white';
      retry.innerText = 'やり直し';
      retry.onclick = () => regenerateAt(index);
      controls.appendChild(retry);
    }
    wrap.appendChild(controls);
  }

  chatArea.appendChild(wrap);
  chatArea.scrollTop = chatArea.scrollHeight;
  return { wrap, div };
}

function renderPersonaTabs() {
  const wrap = document.getElementById('persona-tabs');
  wrap.innerHTML = '';
  state.personas.forEach((p, idx) => {
    const btn = document.createElement('button');
    const group = document.createElement('div');
    group.className = 'flex items-center gap-1';

    btn.className = 'px-3 py-1 rounded-full text-sm border dark:text-white';
    btn.innerText = p.name;
    btn.onclick = () => applyPersona(idx);

    const del = document.createElement('button');
    del.className = 'px-2 py-1 rounded-full text-xs border border-rose-400 text-rose-600 dark:text-rose-300';
    del.innerText = '×';
    del.title = `${p.name} を削除`;
    del.onclick = () => deletePersona(idx);

    group.appendChild(btn);
    group.appendChild(del);
    wrap.appendChild(group);
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


function deletePersona(idx) {
  const persona = state.personas[idx];
  if (!persona) return;
  const ok = window.confirm(`プリセット「${persona.name}」を削除しますか？`);
  if (!ok) return;
  state.personas.splice(idx, 1);
  persist();
  renderPersonaTabs();
}

function formatAssistantError(error) {
  const message = (error && error.message) ? error.message : String(error || '不明なエラー');
  const lowered = message.toLowerCase();
  const safetyPatterns = [
    'safety',
    'blocked',
    'prohibited',
    'policy',
    'harmful',
    'responsibleai',
    'does not comply',
    'content filter',
  ];
  const isSafetyRefusal = safetyPatterns.some((pattern) => lowered.includes(pattern));
  if (isSafetyRefusal) {
    return `⚠️ 安全機構エラー（AI出力拒否）: ${message}`;
  }
  return `エラー：${message}`;
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
  localStorage.setItem('gemini_model', state.settings.geminiModel);
  localStorage.setItem('openai_model', state.settings.openaiModel);
  localStorage.setItem('gemini_api_key', state.settings.geminiKey);
  localStorage.setItem('openai_api_key', state.settings.openaiKey);
  localStorage.setItem('system_prompt', state.settings.systemPrompt);
  localStorage.setItem('temperature', state.settings.temperature);
  localStorage.setItem('max_tokens', state.settings.maxTokens);
}

function applySettingsToUI() {
  syncContextSliderLimit();
  document.getElementById('provider').value = state.settings.provider;
  renderModelOptions();
  document.getElementById('gemini-key').value = state.settings.geminiKey;
  document.getElementById('openai-key').value = state.settings.openaiKey;
  document.getElementById('system-prompt').value = state.settings.systemPrompt;
  document.getElementById('temperature').value = state.settings.temperature;
  document.getElementById('temperature-value').innerText = state.settings.temperature;
  document.getElementById('max-tokens').value = state.settings.maxTokens;
  document.getElementById('max-tokens-value').innerText = `${state.settings.maxTokens} / ${document.getElementById('max-tokens').max}`;
}

function bindSettings() {
  const provider = document.getElementById('provider');
  const model = document.getElementById('model');
  const geminiKey = document.getElementById('gemini-key');
  const openaiKey = document.getElementById('openai-key');
  const systemPrompt = document.getElementById('system-prompt');
  const temperature = document.getElementById('temperature');
  const maxTokens = document.getElementById('max-tokens');

  provider.onchange = () => {
    state.settings.provider = provider.value;
    syncContextSliderLimit();
    applySettingsToUI();
    saveSettings();
  };
  model.onchange = () => {
    if (state.settings.provider === 'gemini') {
      state.settings.geminiModel = model.value;
    } else {
      state.settings.openaiModel = model.value;
    }
    saveSettings();
  };
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
    document.getElementById('max-tokens-value').innerText = `${maxTokens.value} / ${maxTokens.max}`;
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
    const messages = [...session.messages];
    const reply = await generateAssistantReply(messages, apiKey);
    session.messages.push({ role: 'ai', text: reply });
    persist();
    renderHistory();
  } catch (e) {
    loading.div.innerText = formatAssistantError(e);
  } finally {
    userInput.disabled = false;
    userInput.focus();
  }
}

async function generateAssistantReply(messages, apiKey) {
  return state.settings.provider === 'gemini'
    ? callGeminiAPI(messages, apiKey, {
      model: state.settings.geminiModel,
      temperature: state.settings.temperature,
      maxTokens: state.settings.maxTokens,
      systemInstruction: state.settings.systemPrompt,
    })
    : callOpenAIAPI([
      ...(state.settings.systemPrompt ? [{ role: 'system', text: state.settings.systemPrompt }] : []),
      ...messages,
    ], apiKey, {
      model: state.settings.openaiModel,
      temperature: state.settings.temperature,
      maxTokens: state.settings.maxTokens,
    });
}

function deleteMessage(index) {
  const session = getActiveSession();
  if (!session?.messages[index]) return;
  session.messages.splice(index, 1);
  persist();
  renderHistory();
}

async function regenerateAt(index) {
  const session = getActiveSession();
  if (!session?.messages[index] || session.messages[index].role !== 'ai') return;
  const apiKey = state.settings.provider === 'gemini' ? state.settings.geminiKey : state.settings.openaiKey;
  if (!apiKey) return;
  const contextMessages = session.messages.slice(0, index);
  session.messages = contextMessages;
  persist();
  renderHistory();
  const loading = addBubble('思索中...', 'ai');
  try {
    const reply = await generateAssistantReply(contextMessages, apiKey);
    session.messages.push({ role: 'ai', text: reply });
    persist();
    renderHistory();
  } catch (e) {
    loading.div.innerText = formatAssistantError(e);
  }
}

function deleteActiveSession() {
  const session = getActiveSession();
  if (!session) return;
  state.sessions = state.sessions.filter((s) => s.id !== session.id);
  if (state.sessions.length === 0) {
    startNewSession();
    return;
  }
  state.activeSessionId = state.sessions[0].id;
  persist();
  renderHistory();
  renderSessionList();
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
