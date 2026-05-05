function generateAssistantReply({ provider, messages, apiKey, settings, signal, onChunk }) {
  console.info('[stream][api] generateAssistantReply', {
    provider,
    hasOnChunk: typeof onChunk === 'function',
  });
  if (provider === 'gemini') {
    return callGeminiAPI(messages, apiKey, {
      model: settings.geminiModel,
      allowSearch: Boolean(settings.allowGeminiSearch),
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
    allowSearch: Boolean(settings.allowOpenaiSearch),
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    thinkingLevel: settings.thinkingLevel,
    signal,
  });
}

window.appApi = { generateAssistantReply };
