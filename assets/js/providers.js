async function callGeminiAPI(messages, apiKey, options = {}) {
  const model = options.model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemMessage = messages.find((msg) => msg.role === 'system')?.text || '';
  const contents = messages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

  const body = {
    contents,
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    },
  };

  if (systemMessage) {
    body.systemInstruction = { parts: [{ text: systemMessage }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error('Gemini API request failed');
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '応答を取得できませんでした。';
}

async function callOpenAIAPI(messages, apiKey, options = {}) {
  const model = options.model || 'gpt-4.1-mini';

  const formattedMessages = messages.map((m) => ({
    role: m.role === 'ai' ? 'assistant' : m.role,
    content: m.text,
  }));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
  });

  if (!response.ok) throw new Error('OpenAI API request failed');
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '応答を取得できませんでした。';
}
