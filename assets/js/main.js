const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');

const ui = {
  provider: document.getElementById('provider'),
  model: document.getElementById('model'),
  geminiKey: document.getElementById('gemini-key'),
  openaiKey: document.getElementById('openai-key'),
  systemPrompt: document.getElementById('system-prompt'),
  temperature: document.getElementById('temperature'),
  temperatureValue: document.getElementById('temperature-value'),
  maxTokens: document.getElementById('max-tokens'),
  maxTokensValue: document.getElementById('max-tokens-value'),
  personaName: document.getElementById('persona-name'),
  systemPersonaTabs: document.getElementById('system-persona-tabs'),
  clearSystemPromptBtn: document.getElementById('clear-system-prompt-btn'),
  systemPresetToggle: document.getElementById('system-preset-toggle'),
  systemPresetPanel: document.getElementById('system-preset-panel'),
};

const state = {
  sessions: JSON.parse(localStorage.getItem('codex_sessions') || '[]'),
  activeSessionId: localStorage.getItem('codex_active_session_id'),
  personas: JSON.parse(localStorage.getItem('codex_personas') || '[]'),
  hiddenSystemPersonaIds: JSON.parse(localStorage.getItem('codex_hidden_system_persona_ids') || '[]'),
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
  ui: {
    showSystemPresetPanel: false,
    activePersonaId: null,
  },
};

const CONTEXT_LIMITS = {
  gemini: 150000,
  openai: 50000,
};



const SYSTEM_PERSONAS = [
  {
    id: 'sys-neutral',
    name: '標準',
    settings: { systemPrompt: '' },
  },
  {
    id: 'sys-creative',
    name: '創作補助',
    settings: {
      temperature: 1.0,
      systemPrompt: 'あなたは創作支援に強いアシスタントです。複数案を提示し、改善点を具体的に示してください。',
    },
  },
  {
    id: 'sys-concise',
    name: '簡潔回答',
    settings: {
      temperature: 0.3,
      systemPrompt: '要点を短く、箇条書き中心で回答してください。',
    },
  },
];

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
  if (!ui.model) return;
  const provider = state.settings.provider;
  const options = MODEL_OPTIONS[provider] || [];
  const selected = provider === 'gemini' ? state.settings.geminiModel : state.settings.openaiModel;
  ui.model.innerHTML = '';
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    ui.model.appendChild(option);
  });
  if (options.some((opt) => opt.value === selected)) {
    ui.model.value = selected;
  } else if (options[0]) {
    ui.model.value = options[0].value;
    if (provider === 'gemini') state.settings.geminiModel = options[0].value;
    if (provider === 'openai') state.settings.openaiModel = options[0].value;
    saveSettings();
  }
}

function syncContextSliderLimit() {
  const limit = CONTEXT_LIMITS[state.settings.provider] || 8192;
  ui.maxTokens.max = String(limit);
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
  localStorage.setItem('codex_hidden_system_persona_ids', JSON.stringify(state.hiddenSystemPersonaIds));
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
  ui.systemPersonaTabs.innerHTML = '';

  const systemPersonas = SYSTEM_PERSONAS
    .filter((p) => !state.hiddenSystemPersonaIds.includes(p.id))
    .map((p) => ({ ...p, isSystem: true }));
  const customPersonas = state.personas.map((p, idx) => ({ ...p, customIndex: idx, isSystem: false, id: `custom-${idx}` }));

  const allPersonas = [...systemPersonas, ...customPersonas];

  allPersonas.forEach((p) => {
    const btn = document.createElement('button');
    const group = document.createElement('div');
    group.className = 'flex items-center gap-1';

    btn.className = 'persona-tab-btn';
    if (state.ui.activePersonaId === p.id) btn.classList.add('active');
    btn.innerText = p.name;
    btn.onclick = () => applyPersona(p);

    const del = document.createElement('button');
    del.className = 'px-2 py-1 rounded-full text-xs border border-rose-400 text-rose-600 dark:text-rose-300';
    del.innerText = '×';
    del.title = `${p.name} を削除`;
    del.onclick = () => deletePersona(p);

    group.appendChild(btn);
    group.appendChild(del);
    ui.systemPersonaTabs.appendChild(group);
  });
}

function applyPersona(persona) {
  if (!persona) return;
  state.settings = { ...state.settings, ...persona.settings };
  state.ui.activePersonaId = persona.id;
  applySettingsToUI();
  saveSettings();
  renderPersonaTabs();
}

function savePersona() {
  const name = ui.personaName.value.trim();
  if (!name) return;
  state.personas.push({ name, settings: { ...state.settings } });
  persist();
  renderPersonaTabs();
  ui.personaName.value = '';
}


function deletePersona(persona) {
  if (!persona) return;
  const ok = window.confirm(`プリセット「${persona.name}」を削除しますか？`);
  if (!ok) return;

  if (persona.isSystem) {
    state.hiddenSystemPersonaIds.push(persona.id);
  } else if (typeof persona.customIndex === 'number') {
    state.personas.splice(persona.customIndex, 1);
  }

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
    return `【SAFETY_REFUSAL】AI安全機構により出力が拒否されました: ${message}`;
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
  ui.provider.value = state.settings.provider;
  renderModelOptions();
  ui.geminiKey.value = state.settings.geminiKey;
  ui.openaiKey.value = state.settings.openaiKey;
  ui.systemPrompt.value = state.settings.systemPrompt;
  ui.temperature.value = state.settings.temperature;
  ui.temperatureValue.innerText = state.settings.temperature;
  ui.maxTokens.value = state.settings.maxTokens;
  ui.maxTokensValue.innerText = `${state.settings.maxTokens} / ${ui.maxTokens.max}`;
}

function bindSettings() {
  ui.provider.onchange = () => {
    state.settings.provider = ui.provider.value;
    syncContextSliderLimit();
    applySettingsToUI();
    saveSettings();
  };
  ui.model.onchange = () => {
    if (state.settings.provider === 'gemini') {
      state.settings.geminiModel = ui.model.value;
    } else {
      state.settings.openaiModel = ui.model.value;
    }
    saveSettings();
  };
  ui.geminiKey.onchange = () => { state.settings.geminiKey = ui.geminiKey.value.trim(); saveSettings(); };
  ui.openaiKey.onchange = () => { state.settings.openaiKey = ui.openaiKey.value.trim(); saveSettings(); };
  ui.systemPrompt.onchange = () => { state.settings.systemPrompt = ui.systemPrompt.value; saveSettings(); };
  ui.temperature.oninput = () => {
    state.settings.temperature = Number(ui.temperature.value);
    ui.temperatureValue.innerText = ui.temperature.value;
    saveSettings();
  };
  ui.maxTokens.oninput = () => {
    state.settings.maxTokens = Number(ui.maxTokens.value);
    ui.maxTokensValue.innerText = `${ui.maxTokens.value} / ${ui.maxTokens.max}`;
    saveSettings();
  };

  ui.clearSystemPromptBtn.onclick = () => {
    state.settings.systemPrompt = '';
    ui.systemPrompt.value = '';
    saveSettings();
  };

  ui.systemPresetToggle.onclick = () => {
    state.ui.showSystemPresetPanel = !state.ui.showSystemPresetPanel;
    renderSystemPresetPanel();
  };
}

function renderSystemPresetPanel() {
  ui.systemPresetPanel.classList.toggle('hidden', !state.ui.showSystemPresetPanel);
  ui.systemPresetToggle.classList.toggle('is-open', state.ui.showSystemPresetPanel);
  ui.systemPresetToggle.setAttribute('aria-expanded', state.ui.showSystemPresetPanel ? 'true' : 'false');
  ui.systemPresetToggle.innerText = '☰';
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
  renderSystemPresetPanel();
});
