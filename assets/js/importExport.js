(function initImportExportModule(global){
  const CHAT_IMPORT_PREFIX = '__CODEX_CHATS__';
  const SENSITIVE_CONVERSATION_KEYS = new Set(['geminiKey','openaiKey','googleAccessToken','googleClientId']);
  function sanitizeConversationJsonNode(node){
    if (Array.isArray(node)) return node.map((item) => sanitizeConversationJsonNode(item));
    if (!node || typeof node !== 'object') return node;
    const next = {};
    Object.entries(node).forEach(([key, value]) => {
      if (SENSITIVE_CONVERSATION_KEYS.has(key)) return;
      next[key] = sanitizeConversationJsonNode(value);
    });
    return next;
  }
  global.appImportExport = { CHAT_IMPORT_PREFIX, sanitizeConversationJsonNode };
})(window);
