function generateAssistantReply({ provider, messages, apiKey, settings, signal, onChunk }) {
  console.info('[stream][api] generateAssistantReply', {
    provider,
    hasOnChunk: typeof onChunk === 'function',
  });
  if (provider === 'gemini') {
    if (typeof onChunk === 'function') {
      console.warn('[stream][api] onChunk was provided for gemini, but current provider implementation is non-streaming.');
    }
    return callGeminiAPI(messages, apiKey, {
      model: settings.geminiModel,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      systemInstruction: settings.systemPrompt,
      signal,
      onChunk,
    });
  }

  const openAIMessages = [
    ...(settings.systemPrompt ? [{ role: 'system', text: settings.systemPrompt }] : []),
    ...messages,
  ];

  return callOpenAIAPI(openAIMessages, apiKey, {
    model: settings.openaiModel,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    signal,
  });
}

window.appApi = { generateAssistantReply };
