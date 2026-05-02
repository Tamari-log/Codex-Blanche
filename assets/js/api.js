function generateAssistantReply({ provider, messages, apiKey, settings, signal, onDelta }) {
  if (provider === 'gemini') {
    return callGeminiAPI(messages, apiKey, {
      model: settings.geminiModel,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      systemInstruction: settings.systemPrompt,
      signal,
      onDelta,
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
    onDelta,
  });
}

window.appApi = { generateAssistantReply };
