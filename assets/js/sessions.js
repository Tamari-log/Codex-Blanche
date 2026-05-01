(function initSessionsModule(global){
  const CONTEXT_LIMITS = { gemini: 15000, openai: 5000 };
  function createInitialUiState(){ return { showSystemPresetPanel: false, activePersonaId: null }; }
  global.appSessions = { CONTEXT_LIMITS, createInitialUiState };
})(window);
