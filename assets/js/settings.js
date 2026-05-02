(function initSettingsModule(global){
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
    rememberApiKeys: 'remember_api_keys',
    rememberGoogleLogin: 'remember_google_login',
    googleClientId: 'google_client_id',
    driveFolderName: 'drive_folder_name',
    driveFileName: 'drive_file_name',
    systemPrompt: 'system_prompt',
    temperature: 'temperature',
    maxTokens: 'max_tokens',
    userSignature: 'user_signature',
    renderSpeed: 'render_speed',
    localUpdatedAt: 'codex_local_updated_at',
    lastRemoteModifiedAt: 'codex_last_remote_modified_at',
    deletedAt: 'codex_deleted_at',
  };

  const DEFAULT_SETTINGS = {
    provider: 'gemini',
    geminiModel: 'gemini-3.1-pro-preview',
    openaiModel: 'gpt-5.3',
    userSignature: 'Blanche',
    temperature: 0.7,
    maxTokens: 2048,
    renderSpeed: 'normal',
  };

  const CONTEXT_LIMITS = {
    gemini: 15000,
    openai: 5000,
  };

  const MODEL_OPTIONS = {
    gemini: [
      { value: 'gemini-3-flash-preview', label: 'gemini 3 flash（高速）' },
      { value: 'gemini-3.1-flash-lite-preview', label: 'gemini 3.1 flash lite（新しい高速）' },
      { value: 'gemini-3.1-pro-preview', label: 'gemini 3.1 pro（高性能）' },
    ],
    openai: [
      { value: 'gpt-5.3', label: 'gpt-5.3（最新世代）' },
      { value: 'gpt-5.4-thinking', label: 'gpt-5.4-thinking（推論重視）' },
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini（高速）' },
    ],
  };

  function createInitialSettings() {
    return {
      provider: localStorage.getItem(STORAGE_KEYS.provider) || DEFAULT_SETTINGS.provider,
      geminiModel: localStorage.getItem(STORAGE_KEYS.geminiModel) || DEFAULT_SETTINGS.geminiModel,
      openaiModel: localStorage.getItem(STORAGE_KEYS.openaiModel) || DEFAULT_SETTINGS.openaiModel,
      geminiKey: sessionStorage.getItem(STORAGE_KEYS.geminiKey) || localStorage.getItem(STORAGE_KEYS.geminiKey) || '',
      openaiKey: sessionStorage.getItem(STORAGE_KEYS.openaiKey) || localStorage.getItem(STORAGE_KEYS.openaiKey) || '',
      googleClientId: localStorage.getItem(STORAGE_KEYS.googleClientId) || '',
      driveFolderName: localStorage.getItem(STORAGE_KEYS.driveFolderName) || 'CodexBlanche',
      driveFileName: localStorage.getItem(STORAGE_KEYS.driveFileName) || 'codex_data.json',
      systemPrompt: localStorage.getItem(STORAGE_KEYS.systemPrompt) || '',
      userSignature: localStorage.getItem(STORAGE_KEYS.userSignature) || DEFAULT_SETTINGS.userSignature,
      temperature: Number(localStorage.getItem(STORAGE_KEYS.temperature) || DEFAULT_SETTINGS.temperature),
      maxTokens: Number(localStorage.getItem(STORAGE_KEYS.maxTokens) || DEFAULT_SETTINGS.maxTokens),
      renderSpeed: localStorage.getItem(STORAGE_KEYS.renderSpeed) || DEFAULT_SETTINGS.renderSpeed,
      rememberApiKeys: localStorage.getItem(STORAGE_KEYS.rememberApiKeys) === 'true',
      rememberGoogleLogin: localStorage.getItem(STORAGE_KEYS.rememberGoogleLogin) === 'true',
    };
  }

  global.appSettings = { STORAGE_KEYS, DEFAULT_SETTINGS, MODEL_OPTIONS, CONTEXT_LIMITS, createInitialSettings };
})(window);
