const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const dom = {};

const STORAGE_KEYS = {
  sessions: 'codex_sessions',
  activeSessionId: 'codex_active_session_id',
  personas: 'codex_personas',
  hiddenSystemPersonaIds: 'codex_hidden_system_persona_ids',
  provider: 'provider',
  geminiModel: 'gemini_model',
  openaiModel: 'openai_model',
  geminiKey: 'gemini_api_key',
  openaiKey: 'openai_api_key',
  googleClientId: 'google_client_id',
  systemPrompt: 'system_prompt',
  temperature: 'temperature',
  maxTokens: 'max_tokens',
  userSignature: 'user_signature',
  localUpdatedAt: 'codex_local_updated_at',
  lastRemoteModifiedAt: 'codex_last_remote_modified_at',
};
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FOLDER_NAME = 'CodexBlanche';
const DRIVE_FILE_NAME = 'codex_data.json';


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

const state = { sessions: readJSON(STORAGE_KEYS.sessions, []), activeSessionId: localStorage.getItem(STORAGE_KEYS.activeSessionId), personas: readJSON(STORAGE_KEYS.personas, []), hiddenSystemPersonaIds: readJSON(STORAGE_KEYS.hiddenSystemPersonaIds, []), settings: { provider: localStorage.getItem(STORAGE_KEYS.provider) || 'gemini', geminiModel: localStorage.getItem(STORAGE_KEYS.geminiModel) || 'gemini-3.1-pro-preview', openaiModel: localStorage.getItem(STORAGE_KEYS.openaiModel) || 'gpt-4.1-mini', geminiKey: localStorage.getItem(STORAGE_KEYS.geminiKey) || '', openaiKey: localStorage.getItem(STORAGE_KEYS.openaiKey) || '', googleClientId: localStorage.getItem(STORAGE_KEYS.googleClientId) || '', systemPrompt: localStorage.getItem(STORAGE_KEYS.systemPrompt) || '', userSignature: localStorage.getItem(STORAGE_KEYS.userSignature) || 'Blanche', temperature: Number(localStorage.getItem(STORAGE_KEYS.temperature) || 0.7), maxTokens: Number(localStorage.getItem(STORAGE_KEYS.maxTokens) || 2048) }, ui: { showSystemPresetPanel: false, activePersonaId: null } };
const CONTEXT_LIMITS = { gemini: 150000, openai: 50000 };
const MOBILE_MEDIA_QUERY = '(max-width: 768px), (pointer: coarse)';
const SEND_BUTTON_DEFAULT_ICON = '🖋️';
const SEND_BUTTON_STOP_ICON = '⏹️';
const SYSTEM_PERSONAS = [{ id: 'sys-neutral', name: '標準', settings: { systemPrompt: '' } }, { id: 'sys-creative', name: '創作補助', settings: { temperature: 1.0, systemPrompt: 'あなたは創作支援に強いアシスタントです。複数案を提示し、改善点を具体的に示してください。' } }, { id: 'sys-concise', name: '簡潔回答', settings: { temperature: 0.3, systemPrompt: '要点を短く、箇条書き中心で回答してください。' } }];
const MODEL_OPTIONS = { gemini: [{ value: 'gemini-3-flash-preview', label: 'gemini 3 flash（高速）' }, { value: 'gemini-3.1-flash-lite-preview', label: 'gemini 3.1 flash lite（新しい高速）' }, { value: 'gemini-3.1-pro-preview', label: 'gemini 3.1 pro（高性能）' }], openai: [{ value: 'gpt-4.1-mini', label: 'gpt-4.1-mini（高速）' }, { value: 'gpt-4.1', label: 'gpt-4.1（高性能）' }, { value: 'gpt-4o-mini', label: 'gpt-4o-mini（軽量）' }] };

const driveSync = {
  tokenClient: null, accessToken: null, folderId: null, fileId: null,
  _initPromise: null,
  _opChain: Promise.resolve(),
  enqueue(operation) {
    const run = this._opChain.then(() => operation());
    this._opChain = run.catch(() => {});
    return run;
  },
  setStatus(text) { if (dom.driveStatus) dom.driveStatus.textContent = text; },
  async waitForGoogleLibs(timeoutMs = 10000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (window.gapi && window.google?.accounts?.oauth2) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Google API ライブラリの読み込みがタイムアウトしました');
  },
  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      await this.waitForGoogleLibs();
      await new Promise((resolve, reject) => {
        gapi.load('client', {
          callback: resolve,
          onerror: () => reject(new Error('gapi client のロードに失敗しました')),
          timeout: 5000,
          ontimeout: () => reject(new Error('gapi client のロードがタイムアウトしました')),
        });
      });
      await gapi.client.init({ discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
      if (!gapi.client.drive?.files) throw new Error('Drive API の初期化に失敗しました');
      this.setStatus('Drive: Client準備完了（未接続）');
    })();
    return this._initPromise;
  },
  async ensureTokenClient() {
    await this.init();
    if (!state.settings.googleClientId) throw new Error('Google Client ID を設定してください');
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services が未読み込みです');
    if (!this.tokenClient) {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: state.settings.googleClientId,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response?.error) throw new Error(getErrorMessage(response));
          this.accessToken = response.access_token;
          gapi.client.setToken({ access_token: response.access_token });
          this.setStatus('Drive: 接続済み');
        },
      });
    }
  },
  async signIn(interactive = true) {
    await this.ensureTokenClient();
    await new Promise((resolve, reject) => {
      const prev = this.tokenClient.callback;
      this.tokenClient.callback = (resp) => {
        if (resp?.error) { reject(new Error(getErrorMessage(resp))); return; }
        this.accessToken = resp.access_token;
        gapi.client.setToken({ access_token: resp.access_token });
        this.setStatus('Drive: 接続済み');
        this.tokenClient.callback = prev;
        resolve();
      };
      this.tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  },
  async signOut() { await this.init(); this.accessToken = null; gapi.client.setToken(null); this.setStatus('Drive: 未接続'); },
  async ensureReady() { await this.init(); if (!this.accessToken) await this.signIn(false); await this.ensureFolderAndFile(); },
  async ensureFolderAndFile() {
    const folderQ = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const folder = await gapi.client.drive.files.list({ q: folderQ, fields: 'files(id,name)' });
    this.folderId = folder.result.files?.[0]?.id;
    if (!this.folderId) {
      const created = await gapi.client.drive.files.create({ resource: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
      this.folderId = created.result.id;
    }
    const fileQ = `name='${DRIVE_FILE_NAME}' and '${this.folderId}' in parents and trashed=false`;
    const fileList = await gapi.client.drive.files.list({ q: fileQ, fields: 'files(id,name,modifiedTime)' });
    this.fileId = fileList.result.files?.[0]?.id || null;
  },
  payload() { return { sessions: state.sessions, personas: state.personas }; },
  getLocalUpdatedAt() { return Number(localStorage.getItem(STORAGE_KEYS.localUpdatedAt) || 0); },
  setLocalUpdatedAt(timestamp = Date.now()) { localStorage.setItem(STORAGE_KEYS.localUpdatedAt, String(timestamp)); },
  getLastRemoteModifiedAt() { return Date.parse(localStorage.getItem(STORAGE_KEYS.lastRemoteModifiedAt) || '') || 0; },
  setLastRemoteModifiedAt(isoTime = '') { if (isoTime) localStorage.setItem(STORAGE_KEYS.lastRemoteModifiedAt, isoTime); },
  hasSyncData() {
    const hasPersonas = state.personas.length > 0 || state.hiddenSystemPersonaIds.length > 0;
    const hasMessages = state.sessions.some((session) => (session.messages?.length || 0) > 0);
    return hasPersonas || hasMessages;
  },
  async _deleteRemoteFileInternal() {
    if (!this.fileId) return;
    await gapi.client.drive.files.delete({ fileId: this.fileId });
    this.fileId = null;
    this.setStatus(`Drive: ファイル削除済み ${new Date().toLocaleTimeString('ja-JP')}`);
  },
  async deleteRemoteFile() {
    return this.enqueue(async () => {
      await this.ensureReady();
      await this._deleteRemoteFileInternal();
    });
  },
  async _pushInternal() {
    if (!this.hasSyncData()) {
      await this._deleteRemoteFileInternal();
      return;
    }
    const meta = { name: DRIVE_FILE_NAME, mimeType: 'application/json', parents: [this.folderId] };
    const boundary = 'foo_bar_baz';
    const body = JSON.stringify(this.payload());
    const multipartBody = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    await gapi.client.request({ path: this.fileId ? `/upload/drive/v3/files/${this.fileId}` : '/upload/drive/v3/files', method: this.fileId ? 'PATCH' : 'POST', params: { uploadType: 'multipart' }, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipartBody });
    if (!this.fileId) await this.ensureFolderAndFile();
    const fileMeta = this.fileId ? await gapi.client.drive.files.get({ fileId: this.fileId, fields: 'modifiedTime' }) : null;
    if (fileMeta?.result?.modifiedTime) this.setLastRemoteModifiedAt(fileMeta.result.modifiedTime);
    this.setStatus(`Drive: 同期済み ${new Date().toLocaleTimeString('ja-JP')}`);
  },
  async push() {
    return this.enqueue(async () => {
      await this.ensureReady();
      await this._pushInternal();
    });
  },
  async pull() {
    return this.enqueue(async () => {
      await this.ensureReady();
      if (!this.fileId) return;
      const fileMeta = await gapi.client.drive.files.get({ fileId: this.fileId, fields: 'modifiedTime' });
      const remoteModifiedAt = Date.parse(fileMeta.result?.modifiedTime || '') || 0;
      const localUpdatedAt = this.getLocalUpdatedAt();
      const lastRemoteModifiedAt = this.getLastRemoteModifiedAt();
      const hasUnsyncedLocalChanges = this.hasSyncData() && localUpdatedAt > lastRemoteModifiedAt;
      if (hasUnsyncedLocalChanges && localUpdatedAt > remoteModifiedAt) {
        await this._pushInternal();
        this.setStatus(`Drive: ローカルを優先して上書き同期 ${new Date().toLocaleTimeString('ja-JP')}`);
        return;
      }
      const r = await gapi.client.drive.files.get({ fileId: this.fileId, alt: 'media' });
      if (r.result?.sessions) state.sessions = r.result.sessions;
      if (r.result?.personas) state.personas = r.result.personas;
      if (!state.sessions.length) startNewSession();
      if (!state.activeSessionId || !state.sessions.find((s) => s.id === state.activeSessionId)) state.activeSessionId = state.sessions[0]?.id || null;
      await persistState({ syncDrive: false });
      if (fileMeta.result?.modifiedTime) this.setLastRemoteModifiedAt(fileMeta.result.modifiedTime);
      renderHistory(); renderSessionList(); renderPersonaTabs();
      this.setStatus(`Drive: 取得済み ${new Date().toLocaleTimeString('ja-JP')}`);
    });
  },
};

async function persistState({ syncDrive = true } = {}) { localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions)); localStorage.setItem(STORAGE_KEYS.personas, JSON.stringify(state.personas)); localStorage.setItem(STORAGE_KEYS.activeSessionId, state.activeSessionId || ''); localStorage.setItem(STORAGE_KEYS.hiddenSystemPersonaIds, JSON.stringify(state.hiddenSystemPersonaIds)); driveSync.setLocalUpdatedAt(); if (syncDrive && driveSync.accessToken) { try { await driveSync.push(); } catch (e) { driveSync.setStatus(`Drive同期失敗: ${e.message}`); } } }

// below mostly original
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
const getActiveSession=()=>state.sessions.find((s)=>s.id===state.activeSessionId);
async function startNewSession(){const id=crypto.randomUUID();state.sessions.unshift({id,title:`会話 ${new Date().toLocaleString('ja-JP')}`,messages:[]});state.activeSessionId=id;await persistState();renderHistory();renderSessionList();}
function renderHistory(){chatArea.innerHTML='';const session=getActiveSession();if(!session||session.messages.length===0){addBubble('ようこそ、白い写本へ。','ai',null,false);return;}session.messages.forEach((item,index)=>addBubble(item.text,item.role,index));}
function addBubble(text,role,index=null,editable=true){const wrap=document.createElement('div');wrap.className='space-y-1';const div=document.createElement('div');div.className=role==='user'?'user-msg':'ai-msg';if(role==='user')div.dataset.signature=`${state.settings.userSignature||'Blanche'}:`;div.contentEditable=editable;div.innerText=text;div.onblur=()=>{const session=getActiveSession();if(index!==null&&session?.messages[index]){session.messages[index].text=div.innerText;persistState();}};wrap.appendChild(div);if(index!==null){const controls=document.createElement('div');controls.className='flex justify-end gap-2 text-xs';const del=document.createElement('button');del.className='px-2 py-1 rounded bg-slate-700 text-white';del.innerText='削除';del.onclick=()=>deleteMessage(index);controls.appendChild(del);if(role==='ai'){const retry=document.createElement('button');retry.className='px-2 py-1 rounded bg-indigo-600 text-white';retry.innerText='やり直し';retry.onclick=()=>regenerateAt(index);controls.appendChild(retry);}wrap.appendChild(controls);}chatArea.appendChild(wrap);chatArea.scrollTop=chatArea.scrollHeight;return {wrap,div};}
function renderPersonaTabs(){const w=document.getElementById('system-persona-tabs');w.innerHTML='';[...SYSTEM_PERSONAS.filter((p)=>!state.hiddenSystemPersonaIds.includes(p.id)).map((p)=>({...p,isSystem:true})),...state.personas.map((p,idx)=>({...p,customIndex:idx,isSystem:false,id:`custom-${idx}`}))].forEach((p)=>{const btn=document.createElement('button');const g=document.createElement('div');g.className='persona-row';btn.className='persona-tab-btn';if(state.ui.activePersonaId===p.id)btn.classList.add('active');btn.innerText=p.name;btn.onclick=()=>applyPersona(p);const del=document.createElement('button');del.className='persona-delete-btn';del.innerText='×';del.onclick=()=>deletePersona(p);g.appendChild(btn);g.appendChild(del);w.appendChild(g);});}
function applyPersona(persona){if(!persona)return;state.settings={...state.settings,...persona.settings};state.ui.activePersonaId=persona.id;applySettingsToUI();saveSettings();renderPersonaTabs();}
async function savePersona(){const name=document.getElementById('persona-name').value.trim();if(!name)return;state.personas.push({name,settings:{...state.settings}});await persistState();renderPersonaTabs();document.getElementById('persona-name').value='';}
async function deletePersona(persona){if(!persona||!window.confirm(`プリセット「${persona.name}」を削除しますか？`))return;if(persona.isSystem)state.hiddenSystemPersonaIds.push(persona.id);else if(typeof persona.customIndex==='number')state.personas.splice(persona.customIndex,1);await persistState();renderPersonaTabs();}
function renderSessionList(){const list=document.getElementById('session-list');list.innerHTML='';state.sessions.forEach((s)=>{const row=document.createElement('div');row.className='flex items-center gap-2';const btn=document.createElement('button');btn.className='flex-1 text-left p-2 rounded border dark:text-white';btn.innerText=s.title;btn.onclick=()=>{state.activeSessionId=s.id;persistState();renderHistory();toggleHistoryPanel();};const edit=document.createElement('button');edit.className='px-2 py-1 rounded bg-amber-600 text-white text-sm';edit.innerText='✏️';edit.setAttribute('aria-label',`会話「${s.title}」の名前を編集`);edit.onclick=()=>renameSessionById(s.id);const del=document.createElement('button');del.className='px-2 py-1 rounded bg-rose-700 text-white text-sm font-bold';del.innerText='×';del.setAttribute('aria-label',`会話「${s.title}」を削除`);del.onclick=()=>deleteSessionById(s.id);row.appendChild(btn);row.appendChild(edit);row.appendChild(del);list.appendChild(row);});}
function saveSettings(){Object.entries({[STORAGE_KEYS.provider]:state.settings.provider,[STORAGE_KEYS.geminiModel]:state.settings.geminiModel,[STORAGE_KEYS.openaiModel]:state.settings.openaiModel,[STORAGE_KEYS.geminiKey]:state.settings.geminiKey,[STORAGE_KEYS.openaiKey]:state.settings.openaiKey,[STORAGE_KEYS.googleClientId]:state.settings.googleClientId,[STORAGE_KEYS.systemPrompt]:state.settings.systemPrompt,[STORAGE_KEYS.userSignature]:state.settings.userSignature,[STORAGE_KEYS.temperature]:state.settings.temperature,[STORAGE_KEYS.maxTokens]:state.settings.maxTokens}).forEach(([k,v])=>localStorage.setItem(k,v));}
function applySettingsToUI(){syncContextSliderLimit();dom.provider.value=state.settings.provider;renderModelOptions();dom.geminiKey.value=state.settings.geminiKey;dom.openaiKey.value=state.settings.openaiKey;dom.googleClientId.value=state.settings.googleClientId;dom.systemPrompt.value=state.settings.systemPrompt;dom.userSignature.value=state.settings.userSignature;dom.temperature.value=state.settings.temperature;dom.temperatureValue.innerText=state.settings.temperature;dom.maxTokens.value=state.settings.maxTokens;dom.maxTokensValue.innerText=`${state.settings.maxTokens} / ${dom.maxTokens.max}`;}
function bindSettings(){const {provider,model,geminiKey,openaiKey,googleClientId,systemPrompt,userSignature,temperature,maxTokens,clearSystemPromptBtn,systemPresetToggle,googleLoginBtn,googleLogoutBtn}=dom;provider.onchange=()=>{state.settings.provider=provider.value;syncContextSliderLimit();applySettingsToUI();saveSettings();};model.onchange=()=>{state.settings[state.settings.provider==='gemini'?'geminiModel':'openaiModel']=model.value;saveSettings();};geminiKey.onchange=()=>{state.settings.geminiKey=geminiKey.value.trim();saveSettings();};openaiKey.onchange=()=>{state.settings.openaiKey=openaiKey.value.trim();saveSettings();};googleClientId.onchange=()=>{state.settings.googleClientId=googleClientId.value.trim();driveSync.tokenClient=null;saveSettings();};systemPrompt.onchange=()=>{state.settings.systemPrompt=systemPrompt.value;saveSettings();};userSignature.onchange=()=>{state.settings.userSignature=userSignature.value.trim()||'Blanche';saveSettings();renderHistory();};temperature.oninput=()=>{state.settings.temperature=Number(temperature.value);dom.temperatureValue.innerText=temperature.value;saveSettings();};maxTokens.oninput=()=>{state.settings.maxTokens=Number(maxTokens.value);dom.maxTokensValue.innerText=`${maxTokens.value} / ${maxTokens.max}`;saveSettings();};clearSystemPromptBtn.onclick=()=>{state.settings.systemPrompt='';systemPrompt.value='';saveSettings();};systemPresetToggle.onclick=()=>{state.ui.showSystemPresetPanel=!state.ui.showSystemPresetPanel;renderSystemPresetPanel();};googleLoginBtn.onclick=async()=>{try{await driveSync.signIn(true);await driveSync.pull();}catch(e){driveSync.setStatus(`Drive接続失敗: ${getErrorMessage(e)}`);}};googleLogoutBtn.onclick=async()=>{try{await driveSync.signOut();}catch(e){driveSync.setStatus(`Drive接続解除失敗: ${getErrorMessage(e)}`);}};}

async function revealWithQuillEffect(el,text){
  el.classList.remove('reveal-fade-in');
  el.innerText=text||'';
  void el.offsetWidth;
  el.classList.add('reveal-fade-in');
  chatArea.scrollTop=chatArea.scrollHeight;
}

function renderSystemPresetPanel(){const p=document.getElementById('system-preset-panel');const t=document.getElementById('system-preset-toggle');p.classList.toggle('is-open',state.ui.showSystemPresetPanel);t.classList.toggle('is-open',state.ui.showSystemPresetPanel);t.setAttribute('aria-expanded',state.ui.showSystemPresetPanel?'true':'false');}
let currentRequestController = null;

function setThinkingMode(isThinking){if(!dom.sendBtn)return;dom.sendBtn.innerText=isThinking?SEND_BUTTON_STOP_ICON:SEND_BUTTON_DEFAULT_ICON;dom.sendBtn.setAttribute('aria-label',isThinking?'生成を中断':'送信');}
function isMobileInputMode(){return window.matchMedia(MOBILE_MEDIA_QUERY).matches;}
function addTransientDeleteButton(targetWrap){if(!targetWrap)return;const controls=document.createElement('div');controls.className='flex justify-end gap-2 text-xs';const del=document.createElement('button');del.className='px-2 py-1 rounded bg-slate-700 text-white';del.innerText='削除';del.onclick=()=>targetWrap.remove();controls.appendChild(del);targetWrap.appendChild(controls);}
async function handleSend(){if(currentRequestController){currentRequestController.abort();return;}const text=userInput.value.trim();if(!text)return;const s=getActiveSession();if(!s)return;const apiKey=state.settings.provider==='gemini'?state.settings.geminiKey:state.settings.openaiKey;if(!apiKey)return;const controller=new AbortController();currentRequestController=controller;setThinkingMode(true);s.messages.push({role:'user',text});await persistState();renderHistory();userInput.value='';userInput.dispatchEvent(new Event('input'));const loading=addBubble('思索中...','ai');try{const reply=await generateAssistantReply([...s.messages],apiKey,controller.signal);s.messages.push({role:'ai',text:reply});await persistState();await revealWithQuillEffect(loading.div,reply);renderHistory();}catch(e){if(e?.name==='AbortError'){loading.div.innerText='生成を中断しました。';}else{loading.div.innerText=`エラー：${e.message||e}`;}addTransientDeleteButton(loading.wrap);}finally{currentRequestController=null;setThinkingMode(false);userInput.focus();}}
async function generateAssistantReply(messages, apiKey, signal) { return state.settings.provider === 'gemini' ? callGeminiAPI(messages, apiKey, { model: state.settings.geminiModel, temperature: state.settings.temperature, maxTokens: state.settings.maxTokens, systemInstruction: state.settings.systemPrompt, signal }) : callOpenAIAPI([...(state.settings.systemPrompt ? [{ role: 'system', text: state.settings.systemPrompt }] : []), ...messages], apiKey, { model: state.settings.openaiModel, temperature: state.settings.temperature, maxTokens: state.settings.maxTokens, signal }); }
async function deleteMessage(index){const s=getActiveSession();if(!s?.messages[index])return;s.messages.splice(index,1);await persistState();renderHistory();}
async function regenerateAt(index){const s=getActiveSession();if(!s?.messages[index]||s.messages[index].role!=='ai')return;const apiKey=state.settings.provider==='gemini'?state.settings.geminiKey:state.settings.openaiKey;if(!apiKey)return;const context=s.messages.slice(0,index);s.messages=context;await persistState();renderHistory();const loading=addBubble('思索中...','ai');try{const reply=await generateAssistantReply(context,apiKey);s.messages.push({role:'ai',text:reply});await persistState();await revealWithQuillEffect(loading.div,reply);renderHistory();}catch(e){loading.div.innerText=`エラー：${e.message||e}`;addTransientDeleteButton(loading.wrap);}}
async function deleteSessionById(sessionId){const target=state.sessions.find((x)=>x.id===sessionId);if(!target)return;const confirmed=window.confirm(`会話「${target.title}」を削除しますか？\nこの操作は取り消せません。`);if(!confirmed)return;state.sessions=state.sessions.filter((x)=>x.id!==target.id);if(state.sessions.length===0){await startNewSession();return;}if(state.activeSessionId===target.id)state.activeSessionId=state.sessions[0].id;await persistState();renderHistory();renderSessionList();}
async function deleteActiveSession(){const s=getActiveSession();if(!s)return;await deleteSessionById(s.id);}
async function renameSessionById(sessionId){const session=state.sessions.find((x)=>x.id===sessionId);if(!session)return;const nextName=window.prompt('会話名を入力してください',session.title);if(nextName===null)return;const normalized=nextName.trim();if(!normalized)return;session.title=normalized;await persistState();renderSessionList();}
function toggleSettings() {
  document.getElementById('settings-modal').classList.toggle('hidden');
}

function toggleHistoryPanel() {
  document.getElementById('history-panel').classList.toggle('hidden');
}
function updateModeButton(){dom.modeToggleBtn.innerHTML=document.documentElement.classList.contains('dark')?'☀️ ライトモードへ':'🌙 ダークモードへ';}
function toggleDarkMode(){document.documentElement.classList.toggle('dark');localStorage.theme=document.documentElement.classList.contains('dark')?'dark':'light';updateModeButton();}
async function syncWithDrive(){try{await driveSync.pull();}catch(e){driveSync.setStatus(`同期失敗: ${e.message}`);}}
window.syncWithDrive = syncWithDrive;
document.addEventListener('click',(event)=>{const btn=event.target.closest('.settings-action-btn');if(!btn)return;btn.classList.remove('is-pressed');requestAnimationFrame(()=>{btn.classList.add('is-pressed');setTimeout(()=>btn.classList.remove('is-pressed'),170);});});
userInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = `${this.scrollHeight}px`;
});

userInput.addEventListener('keydown', function (e) {
  if (!isMobileInputMode() && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
window.addEventListener('DOMContentLoaded', async () => { ['provider','model','gemini-key','openai-key','google-client-id','system-prompt','user-signature','temperature','max-tokens','temperature-value','max-tokens-value','clear-system-prompt-btn','system-preset-toggle','mode-toggle-btn','google-login-btn','google-logout-btn','drive-status','send-btn'].forEach((id)=>{const key=id.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());dom[key]=document.getElementById(id);}); setThinkingMode(false); if (!state.sessions.length) await startNewSession(); if (!state.activeSessionId) state.activeSessionId = state.sessions[0].id; updateModeButton(); applySettingsToUI(); bindSettings(); renderHistory(); renderSessionList(); renderPersonaTabs(); renderSystemPresetPanel(); try { await driveSync.init(); } catch { driveSync.setStatus('Drive: 初期化失敗'); } });
