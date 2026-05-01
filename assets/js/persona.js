(function initPersonaModule(global){
  const SYSTEM_PERSONAS = [
    { id: 'sys-neutral', name: '標準', settings: { systemPrompt: '' } },
    { id: 'sys-creative', name: '創作補助', settings: { temperature: 1.0, systemPrompt: 'あなたは創作支援に強いアシスタントです。複数案を提示し、改善点を具体的に示してください。' } },
    { id: 'sys-concise', name: '簡潔回答', settings: { temperature: 0.3, systemPrompt: '要点を短く、箇条書き中心で回答してください。' } },
  ];
  global.appPersona = { SYSTEM_PERSONAS };
})(window);
