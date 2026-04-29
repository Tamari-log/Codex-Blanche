function normalizeGeminiContents(messages) {
  const normalized = [];

  messages
    .filter((msg) => msg.role !== 'system')
    .filter((msg) => typeof msg.text === 'string' && msg.text.trim().length > 0)
    .forEach((msg) => {
      const role = msg.role === 'ai' ? 'model' : 'user';
      const text = msg.text.trim();
      const prev = normalized[normalized.length - 1];

      if (prev && prev.role === role) {
        prev.parts[0].text = `${prev.parts[0].text}\n\n${text}`;
      } else {
        normalized.push({ role, parts: [{ text }] });
      }
    });

  while (normalized.length && normalized[0].role !== 'user') {
    normalized.shift();
  }

  return normalized;
}

async function callGeminiAPI(messages, apiKey, options = {}) {
  const model = options.model || 'gemini-3.1-pro-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const systemMessage = options.systemInstruction
    || messages.find((msg) => msg.role === 'system')?.text
    || '';
  const contents = normalizeGeminiContents(messages);

  if (!contents.length) {
    throw new Error('Gemini向けの履歴が不正です（最初の発話はユーザーである必要があります）');
  }

  const generationConfig = {};
  if (typeof options.temperature === 'number') generationConfig.temperature = options.temperature;
  if (typeof options.maxTokens === 'number') generationConfig.maxOutputTokens = options.maxTokens;

  const body = { contents };
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  if (systemMessage) {
    body.system_instruction = { parts: [{ text: systemMessage }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const err = await response.json();
      detail = err?.error?.message || JSON.stringify(err);
    } catch {
      detail = await response.text();
    }
    throw new Error(`Gemini API request failed (${response.status}): ${detail}`);
  }
  const data = await response.json();
  const firstCandidate = data.candidates?.[0];
  if (firstCandidate?.finishReason === 'SAFETY') {
    throw new Error('SAFETY_REFUSAL: Gemini safety filter blocked the response');
  }
  return firstCandidate?.content?.parts?.[0]?.text || '応答を取得できませんでした。';
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

  if (!response.ok) {
    let detail = '';
    try {
      const err = await response.json();
      detail = err?.error?.message || JSON.stringify(err);
    } catch {
      detail = await response.text();
    }
    throw new Error(`OpenAI API request failed (${response.status}): ${detail}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '応答を取得できませんでした。';
}
