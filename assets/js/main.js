const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const dom = {};

const STORAGE_KEYS = window.appSettings?.STORAGE_KEYS || {};

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DEFAULT_DRIVE_FOLDER_NAME = 'CodexBlanche';
const DEFAULT_DRIVE_FILE_NAME = 'codex_data.json';
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CONFLICT_TIME_BUFFER_MS = 1000;
const DEV_LOG_LIMIT = 200;
const SAFE_NOOP = () => {};

function resolveAppDependency(name, fallback = null) {
  const dep = globalThis[name];
  if (dep) return dep;
  console.error(`[init] ${name} が見つかりません。script の読み込み順を確認してください。`);
  return fallback;
}

const appUi = resolveAppDependency('appUi', {
  setThinkingMode: SAFE_NOOP,
  revealWithQuillEffect: async () => {},
  addTransientDeleteButton: SAFE_NOOP,
  isMobileInputMode: () => false,
});
const appApi = resolveAppDependency('appApi');
const appSync = resolveAppDependency('appSync');
const appState = resolveAppDependency('appState');
const appDom = resolveAppDependency('appDom');


function getErrorMessage(error, fallback = '不明なエラー') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error.error === 'string') return error.error;
  if (typeof error.message === 'string') return error.message;
  try { return JSON.stringify(error); } catch { return fallback; }
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

const DEFAULT_SETTINGS = window.appSettings?.DEFAULT_SETTINGS || {};
const createInitialSettings = window.appSettings?.createInitialSettings || (() => ({}));

function createInitialState() {
  return {
    sessions: readJSON(STORAGE_KEYS.sessions, []),
    activeSessionId: localStorage.getItem(STORAGE_KEYS.activeSessionId),
    personas: readJSON(STORAGE_KEYS.personas, []),
    hiddenSystemPersonaIds: readJSON(STORAGE_KEYS.hiddenSystemPersonaIds, []),
    settings: createInitialSettings(),
    ui: { showSystemPresetPanel: false, activePersonaId: null },
    devLogs: [],
  };
}

const initialState = createInitialState();
const stateStore = appState?.createStore ? appState.createStore(initialState) : { getState: () => initialState };
const state = stateStore.getState();
const CONTEXT_LIMITS = window.appSessions?.CONTEXT_LIMITS || { gemini: 15000, openai: 5000 };
const MOBILE_MEDIA_QUERY = '(max-width: 768px), (pointer: coarse)';
const SEND_BUTTON_DEFAULT_ICON = '🖋️';
const SEND_BUTTON_STOP_ICON = '⏹️';
const SCROLL_BOTTOM_THRESHOLD_PX = 32;
const MAX_SHARED_FILES = 10;
const BACKGROUND_WARNING_TEXT = '※ バックグラウンド中はOS制限で処理が中断される場合があります。';
const CHAT_IMPORT_PREFIX = window.appImportExport?.CHAT_IMPORT_PREFIX || '__CODEX_CHATS__';
let historySearchKeyword = '';
const SYSTEM_PERSONAS = window.appPersona?.SYSTEM_PERSONAS || [];
const MODEL_OPTIONS = window.appSettings?.MODEL_OPTIONS || {};
const settingsNav = { stack: ['settings-view-root'] };

function scrollChatToTop() {
  chatArea.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollChatToBottom() {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

function updateScrollToBottomButtonVisibility() {
  const btn = dom.scrollToBottomBtn;
  if (!btn || !chatArea) return;
  const distanceFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
  btn.classList.toggle('is-visible', distanceFromBottom > SCROLL_BOTTOM_THRESHOLD_PX);
}


function appendDevLog(level, args) {
  const text = args.map((arg) => {
    if (typeof arg === 'string') return arg;
    try { return JSON.stringify(arg); } catch { return String(arg); }
  }).join(' ');
  state.devLogs.push({ at: new Date().toISOString(), level, text });
  if (state.devLogs.length > DEV_LOG_LIMIT) state.devLogs.shift();
  renderDevLogs();
}

function normalizeEditableText(rawText = '') {
  return String(rawText).replace(/\r\n/g, '\n').trim();
}

function renderDevLogs() {
  if (!dom.devLogList) return;
  dom.devLogList.innerHTML = '';
  if (!state.devLogs.length) {
    const li = document.createElement('li');
    li.className = 'text-sm text-slate-500 dark:text-slate-300';
    li.innerText = 'ログはまだありません。';
    dom.devLogList.appendChild(li);
    return;
  }
  [...state.devLogs].reverse().forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'text-xs border rounded p-2 dark:text-white whitespace-pre-wrap break-words overflow-wrap-anywhere';
    li.innerText = `[${entry.level}] ${new Date(entry.at).toLocaleTimeString('ja-JP')} ${entry.text}`;
    dom.devLogList.appendChild(li);
  });
}

function installConsoleLogHook() {
  ['log', 'warn', 'error'].forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      try {
        appendDevLog(level.toUpperCase(), args);
      } catch (e) {
        original('[devlog-fallback] appendDevLog failed:', e);
      }
      original(...args);
    };
  });
}

let driveSync = null;

let selectedConversationSourceFile = null;
let selectedConversationHistoryOnlySourceFile = null;


const SENSITIVE_CONVERSATION_KEYS = new Set([
  'geminiKey',
  'openaiKey',
  'googleAccessToken',
  'googleClientId',
]);

function sanitizeConversationJsonNode(node) {
  if (Array.isArray(node)) return node.map((item) => sanitizeConversationJsonNode(item));
  if (!node || typeof node !== 'object') return node;
  const next = {};
  Object.entries(node).forEach(([key, value]) => {
    if (SENSITIVE_CONVERSATION_KEYS.has(key)) return;
    next[key] = sanitizeConversationJsonNode(value);
  });
  return next;
}

function normalizeWorldName(rawName, fallback = 'default') {
  const text = String(rawName || '').trim();
  return text || fallback;
}

function extractConversationGroupsByWorld(data) {
  const groups = {};
  const ensureWorld = (worldName) => {
    const key = normalizeWorldName(worldName);
    if (!groups[key]) groups[key] = [];
    return groups[key];
  };
  const pushSession = (worldName, session) => {
    if (!session || !Array.isArray(session.messages)) return;
    const normalized = normalizeImportedSession(session, ensureWorld(worldName).length);
    if (normalized.messages.length === 0) return;
    const safeWorld = normalizeWorldName(worldName);
    const safeSession = sanitizeConversationJsonNode({
      worldSetting: safeWorld,
      id: normalized.id,
      title: normalized.title,
      messages: normalized.messages,
      persona: session?.persona || session?.character || null,
      model: session?.model || session?.modelName || session?.settings?.model || null,
      temperature: session?.temperature ?? session?.settings?.temperature ?? null,
      context: session?.context || session?.contextSettings || session?.settings?.context || null,
    });
    ensureWorld(worldName).push(safeSession);
  };

  if (Array.isArray(data)) {
    data.forEach((session, index) => pushSession(`world-${index + 1}`, session));
  }

  if (Array.isArray(data?.sessions)) {
    data.sessions.forEach((session) => {
      const worldName = session?.worldSetting || session?.world || session?.settings?.world || session?.meta?.world || 'default';
      pushSession(worldName, session);
    });
  }

  if (Array.isArray(data?.worlds)) {
    data.worlds.forEach((world, worldIndex) => {
      const worldName = world?.name || world?.id || `world-${worldIndex + 1}`;
      const candidates = Array.isArray(world?.sessions) ? world.sessions : Array.isArray(world?.conversations) ? world.conversations : [];
      candidates.forEach((session) => pushSession(worldName, session));
    });
  }

  Object.keys(groups).forEach((key) => { if (!groups[key].length) delete groups[key]; });
  return groups;
}

function extractConversationHistoryOnly(data) {
  const sessions = [];
  const pushSession = (session) => {
    if (!session || !Array.isArray(session.messages)) return;
    const normalized = normalizeImportedSession(session, sessions.length);
    if (!normalized.messages.length) return;
    sessions.push({ messages: normalized.messages });
  };

  if (Array.isArray(data)) data.forEach(pushSession);
  if (Array.isArray(data?.sessions)) data.sessions.forEach(pushSession);
  if (Array.isArray(data?.worlds)) {
    data.worlds.forEach((world) => {
      const candidates = Array.isArray(world?.sessions) ? world.sessions : Array.isArray(world?.conversations) ? world.conversations : [];
      candidates.forEach(pushSession);
    });
  }
  return sessions;
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toSafeFilename(value, fallback = 'world') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text
    .replace(/[\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^\w\-.ぁ-んァ-ヶ一-龠]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '') || fallback;
}

async function handleConversationJsonPick() {
  dom.conversationJsonInput?.click();
}

async function handleConversationJsonInputChange(event) {
  selectedConversationSourceFile = event?.target?.files?.[0] || null;
  if (dom.conversationJsonStatus) dom.conversationJsonStatus.textContent = selectedConversationSourceFile ? `選択中: ${selectedConversationSourceFile.name}` : '未選択';
}

async function runConversationJsonExtraction() {
  if (!selectedConversationSourceFile) {
    window.alert('先にJSONファイルを選択してください。');
    return;
  }
  try {
    const sourceText = await selectedConversationSourceFile.text();
    const parsed = JSON.parse(sourceText);
    const groups = extractConversationGroupsByWorld(parsed);
    const worldCount = Object.keys(groups).length;
    if (!worldCount) throw new Error('会話形式JSONを検出できませんでした。');
    const exportedAt = new Date().toISOString();
    const timestamp = Date.now();
    Object.entries(groups).forEach(([worldName, sessions], index) => {
      const output = sanitizeConversationJsonNode({
        exportedAt,
        sourceFileName: selectedConversationSourceFile.name,
        worldName,
        sessions,
      });
      const worldToken = toSafeFilename(worldName, `world-${index + 1}`);
      downloadJsonFile(`conversation_${worldToken}_${timestamp}.json`, output);
    });
    if (dom.conversationJsonStatus) dom.conversationJsonStatus.textContent = `${worldCount}件の世界設定ごとにJSONを分けて保存しました。`;
  } catch (error) {
    const message = `抽出失敗: ${getErrorMessage(error)}`;
    if (dom.conversationJsonStatus) dom.conversationJsonStatus.textContent = message;
    window.alert(message);
  }
}

async function handleConversationHistoryOnlyJsonPick() {
  dom.conversationHistoryOnlyJsonInput?.click();
}

async function handleConversationHistoryOnlyJsonInputChange(event) {
  selectedConversationHistoryOnlySourceFile = event?.target?.files?.[0] || null;
  if (dom.conversationHistoryOnlyJsonStatus) dom.conversationHistoryOnlyJsonStatus.textContent = selectedConversationHistoryOnlySourceFile ? `選択中: ${selectedConversationHistoryOnlySourceFile.name}` : '未選択';
}

async function runConversationHistoryOnlyJsonExtraction() {
  if (!selectedConversationHistoryOnlySourceFile) {
    window.alert('先にJSONファイルを選択してください。');
    return;
  }
  try {
    const sourceText = await selectedConversationHistoryOnlySourceFile.text();
    const parsed = JSON.parse(sourceText);
    const sessions = extractConversationHistoryOnly(parsed);
    if (!sessions.length) throw new Error('会話履歴を検出できませんでした。');
    const output = sanitizeConversationJsonNode({ exportedAt: new Date().toISOString(), sourceFileName: selectedConversationHistoryOnlySourceFile.name, sessions });
    downloadJsonFile(`conversation_history_only_${Date.now()}.json`, output);
    if (dom.conversationHistoryOnlyJsonStatus) dom.conversationHistoryOnlyJsonStatus.textContent = `${sessions.length}件の会話履歴を抽出して保存しました。`;
  } catch (error) {
    const message = `抽出失敗: ${getErrorMessage(error)}`;
    if (dom.conversationHistoryOnlyJsonStatus) dom.conversationHistoryOnlyJsonStatus.textContent = message;
    window.alert(message);
  }
}

async function persistState({ syncDrive = true } = {}) { localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions)); localStorage.setItem(STORAGE_KEYS.personas, JSON.stringify(state.personas)); localStorage.setItem(STORAGE_KEYS.activeSessionId, state.activeSessionId || ''); localStorage.setItem(STORAGE_KEYS.hiddenSystemPersonaIds, JSON.stringify(state.hiddenSystemPersonaIds)); if (driveSync) driveSync.setLocalUpdatedAt(); if (syncDrive && driveSync?.accessToken) { try { await driveSync.push(); } catch (e) { driveSync.setStatus(`Drive同期失敗: ${e.message}`); } } }

// below mostly original
function renderModelOptions() {
  const model = dom.model;
  if (!model) return;

  const provider = dom.provider?.value || state.settings.provider;
  const options = MODEL_OPTIONS[provider] || [];
  const selected = dom.model?.value || (provider === 'gemini' ? state.settings.geminiModel : state.settings.openaiModel);

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
  const maxTokens = dom.maxTokens;
  const provider = dom.provider?.value || state.settings.provider;
  const limit = CONTEXT_LIMITS[provider] || 8192;
  maxTokens.max = String(limit);
  if (state.settings.maxTokens > limit) {
    state.settings.maxTokens = limit;
    saveSettings();
  }
}
const getActiveSession=()=>state.sessions.find((s)=>s.id===state.activeSessionId);
function createSessionOverrides(overrides={}){return { provider: overrides.provider || null, geminiModel: overrides.geminiModel || null, openaiModel: overrides.openaiModel || null, temperature: Number.isFinite(overrides.temperature)?Number(overrides.temperature):null, maxTokens: Number.isFinite(overrides.maxTokens)?Number(overrides.maxTokens):null, systemPrompt: typeof overrides.systemPrompt==='string'?overrides.systemPrompt:null };}
function getSessionOverrides(session){if(!session||typeof session!=='object')return createSessionOverrides();session.overrides=createSessionOverrides(session.overrides||{});return session.overrides;}
function normalizeImportedSession(raw,index){const id=typeof raw.id==='string'&&raw.id?raw.id:crypto.randomUUID();const title=typeof raw.title==='string'&&raw.title.trim()?raw.title.trim():`インポート会話 ${index+1}`;const messages=Array.isArray(raw.messages)?raw.messages.filter((m)=>m&&(m.role==='user'||m.role==='ai')&&typeof m.text==='string').map((m)=>({role:m.role,text:m.text})):[];const systemPrompt=typeof raw.systemPrompt==='string'?raw.systemPrompt:'';const overrides=createSessionOverrides(raw.overrides||{systemPrompt});return {id,title,messages,pinned:Boolean(raw.pinned),systemPrompt,overrides};}
function decodeChatPayloadFromJs(source=''){const text=source.trim();if(!text)return null;try{return JSON.parse(text);}catch{}const markerIndex=text.indexOf(CHAT_IMPORT_PREFIX);if(markerIndex<0)return null;const jsonText=text.slice(markerIndex+CHAT_IMPORT_PREFIX.length).trim();if(!jsonText)return null;try{return JSON.parse(jsonText);}catch{return null;}}
function extractSessionsFromImportedPayload(payload){if(Array.isArray(payload))return payload;if(!payload||typeof payload!=='object')return null;if(Array.isArray(payload.sessions))return payload.sessions;if(Array.isArray(payload.worlds)){const sessions=payload.worlds.flatMap((world)=>Array.isArray(world?.sessions)?world.sessions:[]);if(sessions.length)return sessions;}return null;}
async function importSessionsFromJsFile(){const input=dom.chatImportInput;if(!input)return;input.click();}
async function handleChatImportInputChange(event){const file=event?.target?.files?.[0];if(!file)return;try{const source=await file.text();const parsed=decodeChatPayloadFromJs(source);const importedSessions=extractSessionsFromImportedPayload(parsed);if(!Array.isArray(importedSessions))throw new Error('会話データが見つかりません。JSON配列またはsessions/worlds形式を使用してください。');const nextSessions=importedSessions.map((entry,index)=>normalizeImportedSession(sanitizeConversationJsonNode(entry),index)).filter((s)=>s.messages.length>0);if(!nextSessions.length)throw new Error('有効な会話データがありません。');const ok=window.confirm(`${nextSessions.length}件の会話を読み込みます。現在の会話履歴は上書きされます。よろしいですか？`);if(!ok)return;state.sessions=nextSessions;state.activeSessionId=nextSessions[0].id;await persistState();renderHistory();renderSessionList();renderPersonaTabs();closeSystemPresetPanel();}catch(e){window.alert(`読み込みに失敗しました: ${getErrorMessage(e)}`);}finally{event.target.value='';}}
function injectSelectedFileToInput(file,kind){if(!file||!userInput)return;const prefix=kind==='image'?'[画像添付]':'[ファイル添付]';const nextLine=`${prefix} ${file.name}`;userInput.value=[userInput.value.trim(),nextLine].filter(Boolean).join('\n');userInput.dispatchEvent(new Event('input'));userInput.focus();}
function openAttachTypeSelector(){const backdrop=document.createElement('div');backdrop.className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';const panel=document.createElement('div');panel.className='w-full max-w-xs rounded-2xl bg-white dark:bg-slate-800 shadow-xl p-4 space-y-3';const title=document.createElement('p');title.className='text-sm font-semibold text-slate-700 dark:text-slate-100';title.innerText='添付する種類を選択してください';const buttons=document.createElement('div');buttons.className='grid grid-cols-1 gap-2';const mkBtn=(label,onClick)=>{const btn=document.createElement('button');btn.type='button';btn.className='w-full rounded-lg bg-slate-200 dark:bg-slate-700 dark:text-white py-2 px-3 text-sm';btn.innerText=label;btn.onclick=()=>{close();onClick();};return btn;};const close=()=>backdrop.remove();buttons.appendChild(mkBtn('画像を添付',()=>dom.imageUploadInput?.click()));buttons.appendChild(mkBtn('ファイルを添付',()=>dom.fileUploadInput?.click()));const cancel=mkBtn('キャンセル',()=>{});cancel.className='w-full rounded-lg bg-slate-100 dark:bg-slate-600 dark:text-white py-2 px-3 text-sm';panel.appendChild(title);panel.appendChild(buttons);panel.appendChild(cancel);backdrop.appendChild(panel);backdrop.addEventListener('click',(event)=>{if(event.target===backdrop)close();});document.body.appendChild(backdrop);}
function closeAllItemMenus(){document.querySelectorAll('.item-menu.is-open').forEach((menu)=>menu.classList.remove('is-open'));}
async function startNewSession({ systemPrompt = '', activePersonaId = null } = {}){const id=crypto.randomUUID();state.settings.systemPrompt=systemPrompt;state.ui.activePersonaId=activePersonaId;saveSettings();state.sessions.unshift({id,title:`会話 ${new Date().toLocaleString('ja-JP')}`,messages:[],systemPrompt,overrides:createSessionOverrides({systemPrompt})});state.activeSessionId=id;await persistState();renderHistory();renderSessionList();renderPersonaTabs();}
function renderHistory(){chatArea.innerHTML='';const session=getActiveSession();if(!session||session.messages.length===0){addBubble('ようこそ、白い写本へ。','ai',null,false);updateScrollToBottomButtonVisibility();return;}session.messages.forEach((item,index)=>addBubble(item.text,item.role,index,true,item.attachments||[]));updateScrollToBottomButtonVisibility();}
function renderMessageAttachments(attachments=[]){const validAttachments=Array.isArray(attachments)?attachments.filter((attachment)=>attachment&&typeof attachment==='object'):[];if(!validAttachments.length)return null;const tray=document.createElement('div');tray.className='message-attachment-tray';validAttachments.forEach((attachment,index)=>{const item=document.createElement('div');item.className='message-attachment-item';const name=attachment.name||`添付ファイル${index+1}`;const isImage=attachment.type==='image'&&typeof attachment.dataUrl==='string'&&attachment.dataUrl.startsWith('data:image');if(isImage){const thumb=document.createElement('img');thumb.className='message-attachment-thumb';thumb.src=attachment.dataUrl;thumb.alt=name;item.appendChild(thumb);}else{const icon=document.createElement('span');icon.className='message-attachment-icon';icon.textContent='📎';item.appendChild(icon);}const label=document.createElement('span');label.className='message-attachment-name';label.textContent=name;item.appendChild(label);tray.appendChild(item);});return tray;}
function addBubble(text,role,index=null,editable=true,attachments=[]){const wrap=document.createElement('div');wrap.className='space-y-1';const div=document.createElement('div');div.className=role==='user'?'user-msg':'ai-msg';if(role==='user'){const session=getActiveSession();const signature=session?.userSignature||state.settings.userSignature||'Blanche';div.dataset.signature=`${signature}:`;}const startEditable=index===null&&editable;div.contentEditable=startEditable;div.innerText=text;const beginEdit=()=>{div.contentEditable='true';div.focus();const range=document.createRange();range.selectNodeContents(div);range.collapse(false);const sel=window.getSelection();sel?.removeAllRanges();sel?.addRange(range);};const endEdit=()=>{div.contentEditable='false';};div.onblur=()=>{if(index===null)return;div.innerText=normalizeEditableText(div.innerText);const session=getActiveSession();if(session?.messages[index]){session.messages[index].text=div.innerText;persistState();}endEdit();};wrap.appendChild(div);if(role==='user'){const tray=renderMessageAttachments(attachments);if(tray)wrap.appendChild(tray);}if(index!==null){const controls=document.createElement('div');controls.className='flex justify-end gap-2 text-xs';const edit=document.createElement('button');edit.className='px-2 py-1 rounded bg-amber-600 text-white';edit.innerText='編集';edit.onclick=()=>beginEdit();controls.appendChild(edit);const del=document.createElement('button');del.className='px-2 py-1 rounded bg-slate-700 text-white';del.innerText='削除';del.onclick=()=>deleteMessage(index);controls.appendChild(del);if(role==='user'){const retry=document.createElement('button');retry.className='px-2 py-1 rounded bg-indigo-600 text-white';retry.innerText='やり直し';retry.onclick=()=>regenerateAt(index);controls.appendChild(retry);}wrap.appendChild(controls);}chatArea.appendChild(wrap);if(role==='user')chatArea.scrollTop=chatArea.scrollHeight;updateScrollToBottomButtonVisibility();return {wrap,div};}

function openSessionConfigEditor(sessionId){const session=state.sessions.find((x)=>x.id===sessionId);if(!session)return;const current=getSessionOverrides(session);const backdrop=document.createElement('div');backdrop.className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';const panel=document.createElement('div');panel.className='w-full max-w-xl rounded-2xl bg-white dark:bg-slate-800 shadow-xl p-4 space-y-3';panel.innerHTML=`<h3 class="text-lg font-bold dark:text-white">会話設定を編集</h3><p class="text-xs text-slate-600 dark:text-slate-300">この会話だけに適用されます。</p>`;const form=document.createElement('div');form.className='grid grid-cols-1 md:grid-cols-2 gap-3';const provider=document.createElement('select');provider.className='border rounded-lg p-2 dark:bg-slate-700 dark:text-white';provider.innerHTML='<option value="">AI種別（既定）</option><option value="gemini">Gemini</option><option value="openai">ChatGPT</option>';provider.value=current.provider||'';const model=document.createElement('select');model.className='border rounded-lg p-2 dark:bg-slate-700 dark:text-white';const updateModelOptions=()=>{const p=provider.value||state.settings.provider;const options=MODEL_OPTIONS[p]||[];const selected=p==='gemini'?(current.geminiModel||''):(current.openaiModel||'');model.innerHTML=`<option value="">${p==='gemini'?'Gemini':'ChatGPT'}モデル（既定）</option>`+options.map((opt)=>`<option value="${opt.value}">${opt.label}</option>`).join('');model.value=selected;};updateModelOptions();const signature=document.createElement('input');signature.className='border rounded-lg p-2 md:col-span-2 dark:bg-slate-700 dark:text-white';signature.placeholder='署名 (任意)';signature.value=session.userSignature||'';const tempWrap=document.createElement('div');tempWrap.className='md:col-span-2';const tempLabel=document.createElement('label');tempLabel.className='text-sm dark:text-white';const tempValue=document.createElement('span');tempValue.innerText=String(current.temperature??state.settings.temperature);tempLabel.innerText='温度 ';tempLabel.appendChild(tempValue);const temp=document.createElement('input');temp.type='range';temp.min='0';temp.max='2';temp.step='0.1';temp.className='w-full';temp.value=String(current.temperature??state.settings.temperature);temp.oninput=()=>{tempValue.innerText=temp.value;};tempWrap.append(tempLabel,temp);const maxWrap=document.createElement('div');maxWrap.className='md:col-span-2';const providerForLimit=current.provider||state.settings.provider;const limit=CONTEXT_LIMITS[providerForLimit]||5000;const maxLabel=document.createElement('label');maxLabel.className='text-sm dark:text-white';const maxValue=document.createElement('span');maxValue.innerText=String(current.maxTokens??Math.min(state.settings.maxTokens,limit));maxLabel.innerText='コンテキスト長（トークン） ';maxLabel.appendChild(maxValue);const maxTokens=document.createElement('input');maxTokens.type='range';maxTokens.min='256';maxTokens.max=String(limit);maxTokens.step='256';maxTokens.className='w-full';maxTokens.value=String(current.maxTokens??Math.min(state.settings.maxTokens,limit));maxTokens.oninput=()=>{maxValue.innerText=maxTokens.value;};provider.onchange=()=>{updateModelOptions();const p=provider.value||state.settings.provider;const l=CONTEXT_LIMITS[p]||5000;maxTokens.max=String(l);if(Number(maxTokens.value)>l){maxTokens.value=String(l);maxValue.innerText=maxTokens.value;}};maxWrap.append(maxLabel,maxTokens);const systemPrompt=document.createElement('textarea');systemPrompt.className='border rounded-lg p-2 min-h-[120px] md:col-span-2 dark:bg-slate-700 dark:text-white';systemPrompt.placeholder='システムプロンプト (任意)';systemPrompt.value=current.systemPrompt ?? session.systemPrompt ?? '';form.append(provider,model,signature,tempWrap,maxWrap,systemPrompt);const actions=document.createElement('div');actions.className='flex justify-end gap-2';const cancel=document.createElement('button');cancel.className='px-3 py-2 rounded bg-slate-200 dark:bg-slate-600 dark:text-white';cancel.innerText='キャンセル';const save=document.createElement('button');save.className='px-3 py-2 rounded bg-indigo-600 text-white';save.innerText='保存';const close=()=>backdrop.remove();cancel.onclick=close;save.onclick=async()=>{const selectedProvider=provider.value||null;const next={provider:selectedProvider,geminiModel:selectedProvider==='gemini'?(model.value||null):null,openaiModel:selectedProvider==='openai'?(model.value||null):null,temperature:temp.value===''?null:Number(temp.value),maxTokens:maxTokens.value===''?null:Number(maxTokens.value),systemPrompt:systemPrompt.value};session.overrides=createSessionOverrides(next);session.systemPrompt=systemPrompt.value;session.userSignature=signature.value.trim();await persistState();if(state.activeSessionId===session.id){renderHistory();}renderPersonaTabs();close();};actions.append(cancel,save);panel.append(form,actions);backdrop.appendChild(panel);backdrop.addEventListener('click',(e)=>{if(e.target===backdrop)close();});document.body.appendChild(backdrop);}
function openPresetConfigEditor(index){const preset=state.personas[index];if(!preset)return;const draft={...state.settings,...(preset.settings||{})};const backdrop=document.createElement('div');backdrop.className='fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4';const panel=document.createElement('div');panel.className='w-full max-w-xl rounded-2xl bg-white dark:bg-slate-800 shadow-xl p-4 space-y-3';panel.innerHTML=`<h3 class="text-lg font-bold dark:text-white">会話設定を編集</h3><p class="text-xs text-slate-600 dark:text-slate-300">このカスタムプリセットに適用されます。</p>`;const form=document.createElement('div');form.className='grid grid-cols-1 md:grid-cols-2 gap-3';const name=document.createElement('input');name.className='border rounded-lg p-2 md:col-span-2 dark:bg-slate-700 dark:text-white';name.placeholder='プリセット名';name.value=preset.name||'';const provider=document.createElement('select');provider.className='border rounded-lg p-2 dark:bg-slate-700 dark:text-white';provider.innerHTML='<option value="gemini">Gemini</option><option value="openai">ChatGPT</option>';provider.value=draft.provider||state.settings.provider;const model=document.createElement('select');model.className='border rounded-lg p-2 dark:bg-slate-700 dark:text-white';const updateModelOptions=()=>{const p=provider.value||state.settings.provider;const options=MODEL_OPTIONS[p]||[];const selected=p==='gemini'?(draft.geminiModel||state.settings.geminiModel):(draft.openaiModel||state.settings.openaiModel);model.innerHTML=options.map((opt)=>`<option value="${opt.value}">${opt.label}</option>`).join('');if(options.some((opt)=>opt.value===selected)){model.value=selected;}else if(options[0]){model.value=options[0].value;}};updateModelOptions();const tempWrap=document.createElement('div');tempWrap.className='md:col-span-2';const tempLabel=document.createElement('label');tempLabel.className='text-sm dark:text-white';const tempValue=document.createElement('span');tempValue.innerText=String(draft.temperature??state.settings.temperature);tempLabel.innerText='温度 ';tempLabel.appendChild(tempValue);const temp=document.createElement('input');temp.type='range';temp.min='0';temp.max='2';temp.step='0.1';temp.className='w-full';temp.value=String(draft.temperature??state.settings.temperature);temp.oninput=()=>{tempValue.innerText=temp.value;};tempWrap.append(tempLabel,temp);const maxWrap=document.createElement('div');maxWrap.className='md:col-span-2';const initialLimit=CONTEXT_LIMITS[provider.value||state.settings.provider]||5000;const maxLabel=document.createElement('label');maxLabel.className='text-sm dark:text-white';const maxValue=document.createElement('span');maxValue.innerText=String(draft.maxTokens??Math.min(state.settings.maxTokens,initialLimit));maxLabel.innerText='コンテキスト長（トークン） ';maxLabel.appendChild(maxValue);const maxTokens=document.createElement('input');maxTokens.type='range';maxTokens.min='256';maxTokens.max=String(initialLimit);maxTokens.step='256';maxTokens.className='w-full';maxTokens.value=String(draft.maxTokens??Math.min(state.settings.maxTokens,initialLimit));maxTokens.oninput=()=>{maxValue.innerText=maxTokens.value;};provider.onchange=()=>{updateModelOptions();const p=provider.value||state.settings.provider;const l=CONTEXT_LIMITS[p]||5000;maxTokens.max=String(l);if(Number(maxTokens.value)>l){maxTokens.value=String(l);maxValue.innerText=maxTokens.value;}};maxWrap.append(maxLabel,maxTokens);const systemPrompt=document.createElement('textarea');systemPrompt.className='border rounded-lg p-2 min-h-[120px] md:col-span-2 dark:bg-slate-700 dark:text-white';systemPrompt.placeholder='システムプロンプト (任意)';systemPrompt.value=draft.systemPrompt??'';form.append(name,provider,model,tempWrap,maxWrap,systemPrompt);const actions=document.createElement('div');actions.className='flex justify-end gap-2';const cancel=document.createElement('button');cancel.className='px-3 py-2 rounded bg-slate-200 dark:bg-slate-600 dark:text-white';cancel.innerText='キャンセル';const save=document.createElement('button');save.className='px-3 py-2 rounded bg-indigo-600 text-white';save.innerText='保存';const close=()=>backdrop.remove();cancel.onclick=close;save.onclick=async()=>{const nextName=name.value.trim();if(!nextName)return;const selectedProvider=provider.value||state.settings.provider;preset.name=nextName;preset.settings={...state.settings,...preset.settings,provider:selectedProvider,geminiModel:selectedProvider==='gemini'?model.value:state.settings.geminiModel,openaiModel:selectedProvider==='openai'?model.value:state.settings.openaiModel,temperature:Number(temp.value),maxTokens:Number(maxTokens.value),systemPrompt:systemPrompt.value};await persistState();renderPersonaTabs();close();};actions.append(cancel,save);panel.append(form,actions);backdrop.appendChild(panel);backdrop.addEventListener('click',(e)=>{if(e.target===backdrop)close();});document.body.appendChild(backdrop);}

function renderPersonaTabs(){const w=document.getElementById('system-persona-tabs');w.innerHTML='';const customPresets=state.personas.map((p,idx)=>({...p,customIndex:idx,isSystem:false,id:`custom-${idx}`}));const addMenu=(anchor,items)=>{const menu=document.createElement('div');menu.className='item-menu';const closeMenu=()=>menu.classList.remove('is-open');const toggle=document.createElement('button');toggle.type='button';toggle.className='item-menu-toggle';toggle.innerText='⋯';toggle.onclick=()=>{const nextOpen=!menu.classList.contains('is-open');closeAllItemMenus();menu.classList.toggle('is-open',nextOpen);};menu.appendChild(toggle);const pop=document.createElement('div');pop.className='item-menu-pop';items.forEach(({label,action})=>{const b=document.createElement('button');b.innerText=label;b.onclick=async()=>{closeMenu();toggle.blur();await action();};pop.appendChild(b);});menu.appendChild(pop);anchor.appendChild(menu);};const mkSection=(title,rows)=>{const sec=document.createElement('details');sec.className='preset-sidebar-group';sec.open=true;sec.innerHTML=`<summary>${title}<span class="preset-sidebar-chevron">▾</span></summary>`;const list=document.createElement('div');list.className='preset-sidebar-list';rows.forEach((row)=>list.appendChild(row));if(rows.length===0){const empty=document.createElement('p');empty.className='text-xs text-[#8b7355] dark:text-slate-400 px-2 py-1';empty.innerText='項目がありません';list.appendChild(empty);}sec.appendChild(list);w.appendChild(sec);};
const panelTools=document.createElement('div');panelTools.className='preset-panel-tools';const historySearchInput=document.createElement('input');historySearchInput.className='preset-search-input';historySearchInput.type='search';historySearchInput.placeholder='チャット履歴を検索';historySearchInput.value=historySearchKeyword;historySearchInput.setAttribute('aria-label','チャット履歴を検索');historySearchInput.oninput=(e)=>{historySearchKeyword=e.target.value.trim().toLowerCase();renderPersonaTabs();};panelTools.appendChild(historySearchInput);w.appendChild(panelTools);
const customRows=customPresets.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)).map((p)=>{const row=document.createElement('div');row.className='persona-row';const btn=document.createElement('button');btn.className='persona-tab-btn';if(state.ui.activePersonaId===p.id)btn.classList.add('active');btn.innerText=`${p.pinned?'📌 ':''}${p.name}`;btn.onclick=async()=>{await startNewSession({systemPrompt:p.settings?.systemPrompt||'',activePersonaId:p.id});closeSystemPresetPanel();};row.appendChild(btn);addMenu(row,[{label:'会話設定を編集',action:async()=>openPresetConfigEditor(p.customIndex)},{label:'名前を編集',action:async()=>{const name=window.prompt('プリセット名を入力',p.name);if(!name?.trim())return;state.personas[p.customIndex].name=name.trim();await persistState();renderPersonaTabs();}},{label:p.pinned?'ピン留め解除':'ピン留め',action:async()=>{state.personas[p.customIndex].pinned=!state.personas[p.customIndex].pinned;await persistState();renderPersonaTabs();}},{label:'削除',action:async()=>deletePersona(p)}]);return row;});
const sessionRows=[...state.sessions].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)).filter((s)=>!historySearchKeyword||s.title.toLowerCase().includes(historySearchKeyword)).map((s)=>{const row=document.createElement('div');row.className='persona-row';const btn=document.createElement('button');btn.className='persona-tab-btn';btn.innerText=`${s.pinned?'📌 ':''}${s.title}`;btn.onclick=()=>{closeAllItemMenus();state.activeSessionId=s.id;persistState();renderHistory();closeSystemPresetPanel();};row.appendChild(btn);addMenu(row,[{label:'名前を編集',action:async()=>renameSessionById(s.id)},{label:s.pinned?'ピン留め解除':'ピン留め',action:async()=>{const t=state.sessions.find((x)=>x.id===s.id);if(!t)return;t.pinned=!t.pinned;await persistState();renderPersonaTabs();}},{label:'会話設定を編集',action:async()=>openSessionConfigEditor(s.id)},{label:'削除',action:async()=>deleteSessionById(s.id)},{label:'JSファイルから履歴読込',action:async()=>importSessionsFromJsFile()}]);return row;});
mkSection('カスタムプリセット',customRows);mkSection('チャット履歴',sessionRows);}
function applyPersona(persona){if(!persona)return;closeAllItemMenus();state.settings={...state.settings,...persona.settings};state.ui.activePersonaId=persona.id;applySettingsToUI();saveSettings();renderPersonaTabs();}
function getAiSettingsDraftFromUI(){const provider=dom.provider?.value||state.settings.provider;const model=dom.model?.value||'';const next={provider,geminiModel:state.settings.geminiModel,openaiModel:state.settings.openaiModel,systemPrompt:dom.systemPrompt?.value??state.settings.systemPrompt,temperature:Number(dom.temperature?.value??state.settings.temperature),maxTokens:Number(dom.maxTokens?.value??state.settings.maxTokens)};if(provider==='gemini'&&model)next.geminiModel=model;if(provider==='openai'&&model)next.openaiModel=model;return next;}
async function savePersona(){const name=document.getElementById('persona-name').value.trim();if(!name)return;state.personas.push({name,settings:{...state.settings,...getAiSettingsDraftFromUI()}});await persistState();renderPersonaTabs();document.getElementById('persona-name').value='';}
async function deletePersona(persona){if(!persona||!window.confirm(`プリセット「${persona.name}」を削除しますか？`))return;if(persona.isSystem)state.hiddenSystemPersonaIds.push(persona.id);else if(typeof persona.customIndex==='number')state.personas.splice(persona.customIndex,1);await persistState();renderPersonaTabs();}
function renderSessionList(){const list=document.getElementById('session-list');list.innerHTML='';state.sessions.forEach((s)=>{const row=document.createElement('div');row.className='flex items-center gap-2';const btn=document.createElement('button');btn.className='flex-1 text-left p-2 rounded border dark:text-white';btn.innerText=s.title;btn.onclick=()=>{state.activeSessionId=s.id;persistState();renderHistory();toggleHistoryPanel();};const edit=document.createElement('button');edit.className='px-2 py-1 rounded bg-amber-600 text-white text-sm';edit.innerText='✏️';edit.setAttribute('aria-label',`会話「${s.title}」の名前を編集`);edit.onclick=()=>renameSessionById(s.id);const del=document.createElement('button');del.className='px-2 py-1 rounded bg-rose-700 text-white text-sm font-bold';del.innerText='×';del.setAttribute('aria-label',`会話「${s.title}」を削除`);del.onclick=()=>deleteSessionById(s.id);row.appendChild(btn);row.appendChild(edit);row.appendChild(del);list.appendChild(row);});}
function saveSettings(){Object.entries({[STORAGE_KEYS.provider]:state.settings.provider,[STORAGE_KEYS.geminiModel]:state.settings.geminiModel,[STORAGE_KEYS.openaiModel]:state.settings.openaiModel,[STORAGE_KEYS.googleClientId]:state.settings.googleClientId,[STORAGE_KEYS.driveFolderName]:state.settings.driveFolderName,[STORAGE_KEYS.driveFileName]:state.settings.driveFileName,[STORAGE_KEYS.systemPrompt]:state.settings.systemPrompt,[STORAGE_KEYS.userSignature]:state.settings.userSignature,[STORAGE_KEYS.temperature]:state.settings.temperature,[STORAGE_KEYS.maxTokens]:state.settings.maxTokens,[STORAGE_KEYS.rememberApiKeys]:state.settings.rememberApiKeys,[STORAGE_KEYS.rememberGoogleLogin]:state.settings.rememberGoogleLogin}).forEach(([k,v])=>localStorage.setItem(k,v));sessionStorage.setItem(STORAGE_KEYS.geminiKey,state.settings.geminiKey);sessionStorage.setItem(STORAGE_KEYS.openaiKey,state.settings.openaiKey);if(state.settings.rememberApiKeys){localStorage.setItem(STORAGE_KEYS.geminiKey,state.settings.geminiKey);localStorage.setItem(STORAGE_KEYS.openaiKey,state.settings.openaiKey);}else{localStorage.removeItem(STORAGE_KEYS.geminiKey);localStorage.removeItem(STORAGE_KEYS.openaiKey);}}
function applySettingsToUI(){syncContextSliderLimit();dom.provider.value=state.settings.provider;renderModelOptions();dom.geminiKey.value=state.settings.geminiKey;dom.openaiKey.value=state.settings.openaiKey;dom.rememberApiKeys.checked=state.settings.rememberApiKeys;dom.rememberGoogleLogin.checked=state.settings.rememberGoogleLogin;dom.googleClientId.value=state.settings.googleClientId;dom.driveFolderName.value=state.settings.driveFolderName;dom.driveFileName.value=state.settings.driveFileName;dom.systemPrompt.value=state.settings.systemPrompt;dom.userSignature.value=state.settings.userSignature;dom.temperature.value=state.settings.temperature;dom.temperatureValue.innerText=state.settings.temperature;dom.maxTokens.value=state.settings.maxTokens;dom.maxTokensValue.innerText=`${state.settings.maxTokens} / ${dom.maxTokens.max}`;}
function getEffectiveSettings(){const session=getActiveSession();const overrides=getSessionOverrides(session);const provider=overrides.provider||state.settings.provider;const systemPrompt=typeof overrides.systemPrompt==='string'?overrides.systemPrompt:(typeof session?.systemPrompt==='string'?session.systemPrompt:(typeof dom.systemPrompt?.value==='string'?dom.systemPrompt.value:state.settings.systemPrompt));const geminiModel=overrides.geminiModel||state.settings.geminiModel;const openaiModel=overrides.openaiModel||state.settings.openaiModel;const temperature=Number.isFinite(overrides.temperature)?overrides.temperature:state.settings.temperature;const maxTokens=Number.isFinite(overrides.maxTokens)?overrides.maxTokens:state.settings.maxTokens;const userSignature=session?.userSignature||state.settings.userSignature;return {...state.settings,provider,geminiModel,openaiModel,temperature,maxTokens,systemPrompt,userSignature};}
function bindSettings(){const {provider,model,geminiKey,openaiKey,rememberApiKeys,rememberGoogleLogin,googleClientId,driveFolderName,driveFileName,systemPrompt,userSignature,temperature,maxTokens,clearSystemPromptBtn,systemPresetToggle,googleLoginBtn,googleLogoutBtn}=dom;provider.onchange=()=>{syncContextSliderLimit();renderModelOptions();};model.onchange=()=>{};geminiKey.onchange=()=>{state.settings.geminiKey=geminiKey.value.trim();saveSettings();};openaiKey.onchange=()=>{state.settings.openaiKey=openaiKey.value.trim();saveSettings();};rememberApiKeys.onchange=()=>{state.settings.rememberApiKeys=rememberApiKeys.checked;saveSettings();};rememberGoogleLogin.onchange=()=>{state.settings.rememberGoogleLogin=rememberGoogleLogin.checked;saveSettings();};googleClientId.onchange=()=>{state.settings.googleClientId=googleClientId.value.trim();driveSync.tokenClient=null;saveSettings();};driveFolderName.onchange=()=>{state.settings.driveFolderName=driveFolderName.value.trim()||DEFAULT_DRIVE_FOLDER_NAME;driveSync.folderId=null;driveSync.fileId=null;saveSettings();};driveFileName.onchange=()=>{state.settings.driveFileName=driveFileName.value.trim()||DEFAULT_DRIVE_FILE_NAME;driveSync.fileId=null;saveSettings();};systemPrompt.oninput=()=>{};systemPrompt.onchange=()=>{};userSignature.onchange=()=>{state.settings.userSignature=userSignature.value.trim()||'Blanche';saveSettings();renderHistory();};temperature.oninput=()=>{dom.temperatureValue.innerText=temperature.value;};maxTokens.oninput=()=>{dom.maxTokensValue.innerText=`${maxTokens.value} / ${maxTokens.max}`;};clearSystemPromptBtn.onclick=()=>{systemPrompt.value='';};systemPresetToggle.onclick=()=>{state.ui.showSystemPresetPanel=!state.ui.showSystemPresetPanel;renderSystemPresetPanel();};googleLoginBtn.onclick=async()=>{try{await driveSync.signIn(!state.settings.rememberGoogleLogin);await driveSync.pull();}catch(e){driveSync.setStatus(`Drive接続失敗: ${getErrorMessage(e)}`);}};googleLogoutBtn.onclick=async()=>{try{state.settings.rememberGoogleLogin=false;saveSettings();if(dom.rememberGoogleLogin)dom.rememberGoogleLogin.checked=false;await driveSync.signOut();}catch(e){driveSync.setStatus(`Drive接続解除失敗: ${getErrorMessage(e)}`);}};}

function closeSystemPresetPanel(){state.ui.showSystemPresetPanel=false;renderSystemPresetPanel();}
function renderSystemPresetPanel(){const p=document.getElementById('system-preset-panel');const t=document.getElementById('system-preset-toggle');const b=document.getElementById('system-preset-backdrop');p.classList.toggle('is-open',state.ui.showSystemPresetPanel);t.classList.toggle('is-open',state.ui.showSystemPresetPanel);b?.classList.toggle('is-open',state.ui.showSystemPresetPanel);t.setAttribute('aria-expanded',state.ui.showSystemPresetPanel?'true':'false');}
let currentRequestController = null;
let wakeLockSentinel = null;
let selectedImageAttachments = [];
let selectedFileAttachments = [];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('画像読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

function ensureAttachmentCapacity(newCount) {
  const currentCount = selectedImageAttachments.length + selectedFileAttachments.length;
  const available = Math.max(0, MAX_SHARED_FILES - currentCount);
  if (available <= 0) {
    window.alert(`添付ファイルは最大${MAX_SHARED_FILES}件までです。不要な添付を削除してください。`);
    return 0;
  }
  if (newCount > available) window.alert(`添付ファイルは最大${MAX_SHARED_FILES}件までです。先頭${available}件のみ追加します。`);
  return Math.min(newCount, available);
}

async function createImageAttachments(files) {
  const attachments = [];
  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    attachments.push({ file, dataUrl, mimeType: file.type || 'image/png' });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return attachments;
}

function renderImagePreview() {
  const wrap = document.getElementById('image-preview-wrap');
  const list = document.getElementById('image-preview-list');
  if (!wrap || !list) return;

  if (!selectedImageAttachments.length) {
    wrap.classList.add('hidden');
    list.innerHTML = '';
    syncComposerGrowOffset();
    return;
  }

  wrap.classList.remove('hidden');
  list.innerHTML = '';

  selectedImageAttachments.forEach((attachment, index) => {
    const item = document.createElement('div');
    item.className = 'image-preview-item';

    const img = document.createElement('img');
    img.src = attachment.dataUrl;
    img.alt = attachment.file?.name || `添付画像${index + 1}`;
    img.className = 'image-preview-thumb';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'image-preview-remove-btn';
    removeBtn.setAttribute('aria-label', `${attachment.file?.name || `添付画像${index + 1}`} を削除`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      selectedImageAttachments.splice(index, 1);
      renderImagePreview();
    });

    item.append(img, removeBtn);
    list.appendChild(item);
  });

  syncComposerGrowOffset();
}

function clearSelectedImageAttachment() {
  selectedImageAttachments = [];
  renderImagePreview();
}

async function requestWakeLockIfAvailable() {
  if (!('wakeLock' in navigator)) return false;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel?.addEventListener?.('release', () => {
      wakeLockSentinel = null;
    });
    return true;
  } catch (e) {
    console.warn('[wakelock] 取得に失敗しました。', e);
    return false;
  }
}

function releaseWakeLock() {
  if (!wakeLockSentinel) return;
  wakeLockSentinel.release().catch(()=>{});
  wakeLockSentinel = null;
}

function handleVisibilityDuringGeneration() {
  if (!currentRequestController) return;
  if (document.hidden) {
    console.warn(BACKGROUND_WARNING_TEXT);
    return;
  }
  requestWakeLockIfAvailable();
}

async function handleSend(){if(currentRequestController){currentRequestController.abort();return;}const text=userInput.value.trim();if(!text&&!selectedImageAttachments.length&&!selectedFileAttachments.length)return;const s=getActiveSession();if(!s)return;const effectiveSettings=getEffectiveSettings();const provider=effectiveSettings.provider||state.settings.provider;const apiKey=provider==='gemini'?state.settings.geminiKey:state.settings.openaiKey;if(!apiKey)return;const controller=new AbortController();currentRequestController=controller;await requestWakeLockIfAvailable();appUi.setThinkingMode(dom.sendBtn, true, { default: SEND_BUTTON_DEFAULT_ICON, stop: SEND_BUTTON_STOP_ICON });const outgoing={role:'user',text};const attachments=[];if(selectedImageAttachments.length){attachments.push(...selectedImageAttachments.map((attachment)=>({type:'image',mimeType:attachment.mimeType,dataUrl:attachment.dataUrl,name:attachment.file.name})));}if(selectedFileAttachments.length){attachments.push(...selectedFileAttachments.map((attachment)=>({type:'file',mimeType:attachment.mimeType,name:attachment.name})));}if(attachments.length){outgoing.attachments=attachments;}s.messages.push(outgoing);await persistState();renderHistory();userInput.value='';userInput.dispatchEvent(new Event('input'));clearSelectedImageAttachment();selectedFileAttachments=[];const loading=addBubble(`思索中...
${BACKGROUND_WARNING_TEXT}`,'ai');let streamedReply='';let hasStreamStarted=false;const shouldStream=provider==='gemini';console.info('[stream][send] request start',{provider,shouldStream,messageCount:s.messages.length});const onChunk=(delta,fullText)=>{if(!hasStreamStarted){console.info('[stream][send] first chunk',{provider,deltaLength:(delta||'').length});}hasStreamStarted=true;streamedReply=fullText||`${streamedReply}${delta||''}`;loading.div.innerText=streamedReply;updateScrollToBottomButtonVisibility();chatArea.scrollTop=chatArea.scrollHeight;};try{const reply=await appApi.generateAssistantReply({ provider, messages: [...s.messages], apiKey, settings: effectiveSettings, signal: controller.signal, onChunk: shouldStream?onChunk:undefined });const finalReply=reply||streamedReply;console.info('[stream][send] request end',{provider,hasStreamStarted,replyLength:(reply||'').length,streamedReplyLength:streamedReply.length,finalReplySource:reply?'reply':'streamedReply'});if(!hasStreamStarted){await appUi.revealWithQuillEffect(chatArea, loading.div, finalReply);}s.messages.push({role:'ai',text:finalReply});await persistState();renderHistory();}catch(e){console.error('[stream][send] request failed',{provider,errorName:e?.name,errorMessage:e?.message,streamedReplyLength:streamedReply.length});if(e?.name==='AbortError'){loading.div.innerText=streamedReply||'生成を中断しました。';}else{const detail=`

エラー：${e.message||e}`;loading.div.innerText=`${streamedReply||''}${detail}`.trim();}appUi.addTransientDeleteButton(loading.wrap);}finally{currentRequestController=null;releaseWakeLock();appUi.setThinkingMode(dom.sendBtn, false, { default: SEND_BUTTON_DEFAULT_ICON, stop: SEND_BUTTON_STOP_ICON });userInput.focus();}}
async function deleteMessage(index){const s=getActiveSession();if(!s?.messages[index])return;s.messages.splice(index,1);await persistState();renderHistory();}
async function regenerateAt(index){const s=getActiveSession();if(!s?.messages[index])return;const target=s.messages[index];if(target.role!=='user'&&target.role!=='ai')return;const effectiveSettings=getEffectiveSettings();const provider=effectiveSettings.provider||state.settings.provider;const apiKey=provider==='gemini'?state.settings.geminiKey:state.settings.openaiKey;if(!apiKey)return;const context=target.role==='user'?s.messages.slice(0,index+1):s.messages.slice(0,index);s.messages=context;await persistState();renderHistory();const loading=addBubble('思索中...','ai');try{const reply=await appApi.generateAssistantReply({ provider, messages: context, apiKey, settings: effectiveSettings });s.messages.push({role:'ai',text:reply});await persistState();await appUi.revealWithQuillEffect(chatArea, loading.div, reply);renderHistory();}catch(e){loading.div.innerText=`エラー：${e.message||e}`;appUi.addTransientDeleteButton(loading.wrap);}}
async function deleteSessionById(sessionId){const target=state.sessions.find((x)=>x.id===sessionId);if(!target)return;const confirmed=window.confirm(`会話「${target.title}」を削除しますか？\nこの操作は取り消せません。`);if(!confirmed)return;state.sessions=state.sessions.filter((x)=>x.id!==target.id);if(state.sessions.length===0){await startNewSession();return;}if(state.activeSessionId===target.id)state.activeSessionId=state.sessions[0].id;renderHistory();renderSessionList();renderPersonaTabs();await persistState();}
async function deleteActiveSession(){const s=getActiveSession();if(!s)return;await deleteSessionById(s.id);}
async function renameSessionById(sessionId){const session=state.sessions.find((x)=>x.id===sessionId);if(!session)return;const nextName=window.prompt('会話名を入力してください',session.title);if(nextName===null)return;const normalized=nextName.trim();if(!normalized)return;session.title=normalized;renderSessionList();renderPersonaTabs();await persistState();}

function updateSettingsHeader(){
  const currentId = settingsNav.stack[settingsNav.stack.length - 1];
  const currentView = document.getElementById(currentId);
  const viewTitle = currentView?.dataset?.viewTitle || currentView?.querySelector('.settings-view-title')?.textContent || '設定';
  if (dom.settingsTitle) dom.settingsTitle.textContent = viewTitle;
  if (dom.settingsBackBtn) dom.settingsBackBtn.classList.toggle('hidden', settingsNav.stack.length <= 1);
}
function renderSettingsView(){
  document.querySelectorAll('.settings-view').forEach((view)=>view.classList.add('hidden'));
  const currentId = settingsNav.stack[settingsNav.stack.length - 1];
  const activeView = document.getElementById(currentId);
  if (activeView) activeView.classList.remove('hidden');
  updateSettingsHeader();
}
function goToSettingsView(viewId){
  if (!document.getElementById(viewId)) return;
  settingsNav.stack.push(viewId);
  renderSettingsView();
}
function goBackSettingsView(){
  if (settingsNav.stack.length <= 1) return;
  settingsNav.stack.pop();
  renderSettingsView();
}
function bindSettingsNavigation(){
  document.querySelectorAll('[data-settings-view]').forEach((btn)=>{
    btn.addEventListener('click',()=>goToSettingsView(btn.dataset.settingsView));
  });
  if (dom.settingsBackBtn) dom.settingsBackBtn.onclick = goBackSettingsView;
}
function toggleSettings() {
  const modal = document.getElementById('settings-modal');
  modal.classList.toggle('hidden');
  if (!modal.classList.contains('hidden')) {
    settingsNav.stack = ['settings-view-root'];
    renderSettingsView();
  }
}

function toggleHistoryPanel() {
  state.ui.showSystemPresetPanel = !state.ui.showSystemPresetPanel;
  renderSystemPresetPanel();
}
function updateModeButton(){dom.modeToggleBtn.innerHTML=document.documentElement.classList.contains('dark')?'☀️ ライトモードへ':'🌙 ダークモードへ';}
function toggleDarkMode(){document.documentElement.classList.toggle('dark');localStorage.theme=document.documentElement.classList.contains('dark')?'dark':'light';updateModeButton();}
async function syncWithDrive(){try{await driveSync.pull();}catch(e){driveSync.setStatus(`同期失敗: ${e.message}`);}}
window.syncWithDrive = syncWithDrive;
document.addEventListener('click',(event)=>{const btn=event.target.closest('.settings-action-btn');if(btn){btn.classList.remove('is-pressed');requestAnimationFrame(()=>{btn.classList.add('is-pressed');setTimeout(()=>btn.classList.remove('is-pressed'),170);});}document.querySelectorAll('.item-menu.is-open').forEach((menu)=>{if(!menu.contains(event.target))menu.classList.remove('is-open');});});
function syncComposerGrowOffset() {
  if (!userInput || !document?.documentElement) return;
  const computed = window.getComputedStyle(userInput);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 0;
  const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
  const baseHeight = lineHeight + paddingTop + paddingBottom;
  const growOffset = Math.max(0, userInput.offsetHeight - baseHeight);

  const previewWrap = document.getElementById('image-preview-wrap');
  let previewOffset = 0;
  if (previewWrap && !previewWrap.classList.contains('hidden')) {
    const previewStyle = window.getComputedStyle(previewWrap);
    const marginBottom = Number.parseFloat(previewStyle.marginBottom) || 0;
    previewOffset = previewWrap.offsetHeight + marginBottom;
  }

  document.documentElement.style.setProperty('--composer-grow-offset', `${growOffset}px`);
  document.documentElement.style.setProperty('--composer-preview-offset', `${previewOffset}px`);
}

userInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = `${this.scrollHeight}px`;
  syncComposerGrowOffset();
});

userInput.addEventListener('keydown', function (e) {
  if (!appUi.isMobileInputMode(MOBILE_MEDIA_QUERY) && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
window.addEventListener('DOMContentLoaded', async () => { Object.assign(dom, appDom?.createDomRegistry ? appDom.createDomRegistry(['provider','model','gemini-key','openai-key','remember-api-keys','remember-google-login','google-client-id','drive-folder-name','drive-file-name','system-prompt','user-signature','temperature','max-tokens','temperature-value','max-tokens-value','clear-system-prompt-btn','system-preset-toggle','mode-toggle-btn','google-login-btn','google-logout-btn','drive-status','send-btn','settings-title','chat-header','scroll-to-bottom-btn','settings-back-btn','dev-log-list','attach-menu-btn','image-upload-input','file-upload-input','chat-import-input','conversation-json-input','conversation-json-pick-btn','conversation-json-run-btn','conversation-json-status','conversation-history-only-json-input','conversation-history-only-json-pick-btn','conversation-history-only-json-run-btn','conversation-history-only-json-status']) : {}); const presetBackdrop=document.getElementById('system-preset-backdrop');presetBackdrop?.addEventListener('click',closeSystemPresetPanel);document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&state.ui.showSystemPresetPanel)closeSystemPresetPanel();}); installConsoleLogHook();
  document.addEventListener('visibilitychange', handleVisibilityDuringGeneration);
  dom.chatHeader?.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    scrollChatToTop();
  });
  dom.scrollToBottomBtn?.addEventListener('click', scrollChatToBottom);
  dom.attachMenuBtn?.addEventListener('click',openAttachTypeSelector);
  dom.imageUploadInput?.addEventListener('change',async (e)=>{const files=Array.from(e?.target?.files||[]);if(!files.length)return;try{const acceptedCount=ensureAttachmentCapacity(files.length);if(!acceptedCount)return;const attachments=await createImageAttachments(files.slice(0,acceptedCount));selectedImageAttachments=[...selectedImageAttachments,...attachments];renderImagePreview();}catch(err){window.alert(`画像の添付に失敗しました: ${getErrorMessage(err)}`);}finally{if(e?.target)e.target.value='';}});
  dom.fileUploadInput?.addEventListener('change',async (e)=>{const files=Array.from(e?.target?.files||[]);if(!files.length)return;const acceptedCount=ensureAttachmentCapacity(files.length);if(!acceptedCount){if(e?.target)e.target.value='';return;}const acceptedFiles=files.slice(0,acceptedCount);selectedFileAttachments=[...selectedFileAttachments,...acceptedFiles.map((file)=>({name:file.name,mimeType:file.type||'application/octet-stream'}))];injectSelectedFileToInput(acceptedFiles[0],'file');if(e?.target)e.target.value='';});
  dom.chatImportInput?.addEventListener('change',handleChatImportInputChange);
  dom.conversationJsonPickBtn?.addEventListener('click', handleConversationJsonPick);
  dom.conversationJsonInput?.addEventListener('change', handleConversationJsonInputChange);
  dom.conversationJsonRunBtn?.addEventListener('click', runConversationJsonExtraction);
  dom.conversationHistoryOnlyJsonPickBtn?.addEventListener('click', handleConversationHistoryOnlyJsonPick);
  dom.conversationHistoryOnlyJsonInput?.addEventListener('change', handleConversationHistoryOnlyJsonInputChange);
  dom.conversationHistoryOnlyJsonRunBtn?.addEventListener('click', runConversationHistoryOnlyJsonExtraction);
  chatArea?.addEventListener('scroll', updateScrollToBottomButtonVisibility);
  if (!appApi || !appSync) {
    console.error('[init] 必須依存(appApi/appSync)が不足しているため初期化を中止します。');
    return;
  }
  driveSync = appSync.createDriveSync({ state, dom, STORAGE_KEYS, DEFAULT_DRIVE_FOLDER_NAME, DEFAULT_DRIVE_FILE_NAME, DRIVE_SCOPE, TOMBSTONE_RETENTION_MS, CONFLICT_TIME_BUFFER_MS, getErrorMessage, startNewSession, persistState, renderHistory, renderSessionList, renderPersonaTabs }); appUi.setThinkingMode(dom.sendBtn, false, { default: SEND_BUTTON_DEFAULT_ICON, stop: SEND_BUTTON_STOP_ICON }); if (!state.sessions.length) await startNewSession(); if (!state.activeSessionId) state.activeSessionId = state.sessions[0].id; updateModeButton(); applySettingsToUI(); bindSettings(); bindSettingsNavigation(); renderSettingsView(); renderHistory(); renderSessionList(); renderPersonaTabs(); renderSystemPresetPanel(); renderDevLogs(); updateScrollToBottomButtonVisibility(); syncComposerGrowOffset(); try { await driveSync.init(); if (state.settings.rememberGoogleLogin) { try { await driveSync.signIn(false); await driveSync.pull(); } catch (e) { driveSync.setStatus(`Drive自動接続失敗: ${getErrorMessage(e)}`); } } } catch { driveSync.setStatus('Drive: 初期化失敗'); } });
