function createDriveSync(deps) {
  const { state, dom, STORAGE_KEYS, DEFAULT_DRIVE_FOLDER_NAME, DEFAULT_DRIVE_FILE_NAME, DRIVE_SCOPE, TOMBSTONE_RETENTION_MS, CONFLICT_TIME_BUFFER_MS, getErrorMessage, startNewSession, persistState, renderHistory, renderSessionList, renderPersonaTabs } = deps;
  const renderSyncedViews = () => {
    renderHistory();
    renderSessionList();
    renderPersonaTabs();
  };
  function buildGoogleAuthErrorMessage(resp = {}) {
    const code = String(resp?.error || '').trim();
    const desc = String(resp?.error_description || '').trim();
    const origin = (window?.location?.origin || '').trim();
    const base = desc ? `${code}: ${desc}` : code;
    if (code === 'invalid_request' || code === 'unauthorized_client') {
      return `Google認証に失敗しました（${base || 'invalid_request'}）。Google Cloud Console の OAuth 設定で、現在のURLオリジン（${origin || 'unknown'}）を「承認済みの JavaScript 生成元」に追加してください。Client ID は「ウェブアプリ」種別を使用してください。`;
    }
    if (code === 'access_denied') {
      return 'Google認証がキャンセルされました。Google接続を再実行してください。';
    }
    if (code === 'popup_closed_by_user') {
      return 'Google認証ポップアップが閉じられました。もう一度お試しください。';
    }
    if (base) return `Google認証に失敗しました: ${base}`;
    return 'Google認証に失敗しました。Google Cloud の OAuth 設定を確認してください。';
  }
  return {
  tokenClient: null, accessToken: null, folderId: null, fileId: null,
  _initPromise: null,
  _opChain: Promise.resolve(),
  enqueue(operation) {
    const run = this._opChain.then(() => operation());
    this._opChain = run.catch(() => {});
    return run;
  },
  getDriveFolderName() { return (state.settings.driveFolderName || DEFAULT_DRIVE_FOLDER_NAME).trim(); },
  getDriveFileName() {
    const normalized = (state.settings.driveFileName || DEFAULT_DRIVE_FILE_NAME).trim();
    return normalized.endsWith('.json') ? normalized : `${normalized}.json`;
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
      this._ensureTokenClientReady();
      this.setStatus('Drive: Client準備完了（未接続）');
    })();
    return this._initPromise;
  },
  _ensureTokenClientReady() {
    if (this.tokenClient) return;
    if (!state.settings.googleClientId) return;
    if (!window.google?.accounts?.oauth2) return;
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: state.settings.googleClientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response?.error) return;
        this.accessToken = response.access_token;
        gapi.client.setToken({ access_token: response.access_token });
        this.setStatus('Drive: 接続済み');
      },
    });
  },
  async ensureTokenClient() {
    await this.init();
    if (!state.settings.googleClientId) throw new Error('Google Client ID を設定してください');
    if (!window.google?.accounts?.oauth2) throw new Error('Google Identity Services が未読み込みです');
    this._ensureTokenClientReady();
    if (!this.tokenClient) throw new Error('Google認証クライアントの初期化に失敗しました');
  },
  async signIn(interactive = true) {
    if (interactive) {
      this._ensureTokenClientReady();
      if (!this.tokenClient) {
        throw new Error('Google認証の準備が未完了です。数秒待ってから再度お試しください。');
      }
    } else {
      await this.ensureTokenClient();
    }
    await new Promise((resolve, reject) => {
      const prev = this.tokenClient.callback;
      this.tokenClient.callback = (resp) => {
        if (resp?.error) {
          if (resp.error === 'popup_failed_to_open') {
            reject(new Error('Google認証ポップアップを開けませんでした。サイトのポップアップ許可設定を確認してください。'));
            return;
          }
          if (!interactive && (resp.error === 'popup_closed_by_user' || resp.error === 'interaction_required' || resp.error === 'consent_required' || resp.error === 'login_required')) {
            reject(new Error('Drive自動接続には再認証が必要です。設定から「Google接続」を押してください。'));
            return;
          }
          reject(new Error(buildGoogleAuthErrorMessage(resp)));
          return;
        }
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
    const folderName = this.getDriveFolderName().replace(/'/g, "\\'");
    const fileName = this.getDriveFileName().replace(/'/g, "\\'");
    const folderQ = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const folder = await gapi.client.drive.files.list({ q: folderQ, fields: 'files(id,name)' });
    this.folderId = folder.result.files?.[0]?.id;
    if (!this.folderId) {
      const created = await gapi.client.drive.files.create({ resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
      this.folderId = created.result.id;
    }
    const fileQ = `name='${fileName}' and '${this.folderId}' in parents and trashed=false`;
    const fileList = await gapi.client.drive.files.list({ q: fileQ, fields: 'files(id,name,modifiedTime)' });
    this.fileId = fileList.result.files?.[0]?.id || null;
  },
  payload() { return { sessions: state.sessions, personas: state.personas, deletedAt: this.getDeletedAt() || null }; },
  getLocalUpdatedAt() { return Number(localStorage.getItem(STORAGE_KEYS.localUpdatedAt) || 0); },
  setLocalUpdatedAt(timestamp = Date.now()) { localStorage.setItem(STORAGE_KEYS.localUpdatedAt, String(timestamp)); },
  getLastRemoteModifiedAt() { return Date.parse(localStorage.getItem(STORAGE_KEYS.lastRemoteModifiedAt) || '') || 0; },
  setLastRemoteModifiedAt(isoTime = '') { if (isoTime) localStorage.setItem(STORAGE_KEYS.lastRemoteModifiedAt, isoTime); },
  getDeletedAt() { return Number(localStorage.getItem(STORAGE_KEYS.deletedAt) || 0); },
  setDeletedAt(timestamp = 0) {
    if (timestamp > 0) localStorage.setItem(STORAGE_KEYS.deletedAt, String(timestamp));
    else localStorage.removeItem(STORAGE_KEYS.deletedAt);
  },
  shouldKeepTombstone(timestamp = this.getDeletedAt(), now = Date.now()) {
    return timestamp > 0 && now - timestamp <= TOMBSTONE_RETENTION_MS;
  },
  hasSyncData() {
    const hasPersonas = state.personas.length > 0 || state.hiddenSystemPersonaIds.length > 0;
    const hasMessages = state.sessions.some((session) => (session.messages?.length || 0) > 0);
    return hasPersonas || hasMessages;
  },
  async _deleteRemoteFileInternal() {
    const deletedAt = Date.now();
    this.setDeletedAt(deletedAt);
    state.sessions = [];
    state.personas = [];
    await this._pushInternal();
    this.setStatus(`Drive: 削除マーク同期済み ${new Date().toLocaleTimeString('ja-JP')}`);
  },
  async deleteRemoteFile() {
    return this.enqueue(async () => {
      await this.ensureReady();
      await this._deleteRemoteFileInternal();
    });
  },
  async _pushInternal() {
    const hasData = this.hasSyncData();
    if (hasData) this.setDeletedAt(0);
    const deletedAt = this.getDeletedAt();
    if (!hasData && !this.shouldKeepTombstone(deletedAt)) {
      this.setDeletedAt(Date.now());
    }
    const meta = this.fileId
      ? { name: this.getDriveFileName(), mimeType: 'application/json' }
      : { name: this.getDriveFileName(), mimeType: 'application/json', parents: [this.folderId] };
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
      if (hasUnsyncedLocalChanges && localUpdatedAt - remoteModifiedAt > CONFLICT_TIME_BUFFER_MS) {
        await this._pushInternal();
        this.setStatus(`Drive: ローカルを優先して上書き同期 ${new Date().toLocaleTimeString('ja-JP')}`);
        return;
      }
      const r = await gapi.client.drive.files.get({ fileId: this.fileId, alt: 'media' });
      const remoteDeletedAt = Number(r.result?.deletedAt || 0);
      if (remoteDeletedAt > 0 && this.shouldKeepTombstone(remoteDeletedAt)) {
        if (localUpdatedAt <= remoteDeletedAt) {
          this.setDeletedAt(remoteDeletedAt);
          state.sessions = [];
          state.personas = [];
          if (!state.sessions.length) await startNewSession();
          await persistState({ syncDrive: false });
          if (fileMeta.result?.modifiedTime) this.setLastRemoteModifiedAt(fileMeta.result.modifiedTime);
          renderSyncedViews();
          this.setStatus(`Drive: 削除マークを適用 ${new Date().toLocaleTimeString('ja-JP')}`);
          return;
        }
      }
      if (Array.isArray(r.result?.sessions)) state.sessions = r.result.sessions;
      if (Array.isArray(r.result?.personas)) state.personas = r.result.personas;
      this.setDeletedAt(0);
      if (!state.sessions.length) await startNewSession();
      if (!state.activeSessionId || !state.sessions.find((s) => s.id === state.activeSessionId)) state.activeSessionId = state.sessions[0]?.id || null;
      await persistState({ syncDrive: false });
      if (fileMeta.result?.modifiedTime) this.setLastRemoteModifiedAt(fileMeta.result.modifiedTime);
      renderSyncedViews();
      this.setStatus(`Drive: 取得済み ${new Date().toLocaleTimeString('ja-JP')}`);
    });
  },
};
}

window.appSync = { createDriveSync };
