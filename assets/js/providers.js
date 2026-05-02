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
        prev.parts[0].text = `${prev.parts[0].text}

${text}`;
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
  const systemMessage = options.systemInstruction || messages.find((msg) => msg.role === 'system')?.text || '';
  const contents = normalizeGeminiContents(messages);

  if (!contents.length) {
    throw new Error('Gemini向けの履歴が不正です（最初の発話はユーザーである必要があります）');
  }

  const generationConfig = {};
  if (typeof options.temperature === 'number') generationConfig.temperature = options.temperature;
  if (typeof options.maxTokens === 'number') generationConfig.maxOutputTokens = options.maxTokens;

  const body = { contents };
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
  if (systemMessage) body.system_instruction = { parts: [{ text: systemMessage }] };

  const isStreaming = typeof options.onDelta === 'function';
  const endpoint = isStreaming ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    signal: options.signal,
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

  if (!isStreaming) {
    const data = await response.json();
    const firstCandidate = data.candidates?.[0];
    if (firstCandidate?.finishReason === 'SAFETY') {
      throw new Error('SAFETY_REFUSAL: Gemini safety filter blocked the response');
    }
    return firstCandidate?.content?.parts?.[0]?.text || '応答を取得できませんでした。';
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Geminiのストリームを開始できませんでした。');
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const line = chunk.split('\n').find((entry) => entry.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      const data = JSON.parse(payload);
      const piece = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (piece) {
        fullText += piece;
        options.onDelta(piece, fullText);
      }
    }
  }

  return fullText || '応答を取得できませんでした。';
}

async function callOpenAIAPI(messages, apiKey, options = {}) {
  const model = options.model || 'gpt-5.3';
  const instructions = messages.find((m) => m.role === 'system')?.text || '';
  const input = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: [{ type: 'input_text', text: m.text }],
    }));

  const isStreaming = typeof options.onDelta === 'function';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      instructions: instructions || undefined,
      temperature: options.temperature,
      max_output_tokens: options.maxTokens,
      stream: isStreaming,
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

  if (!isStreaming) {
    const data = await response.json();
    return data.output_text || '応答を取得できませんでした。';
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('OpenAIのストリームを開始できませんでした。');
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      const event = JSON.parse(payload);
      const delta = event.delta || event.output_text_delta || '';
      if (delta) {
        fullText += delta;
        options.onDelta(delta, fullText);
      }
      if (event.type === 'response.completed' && event.response?.output_text) {
        fullText = event.response.output_text;
      }
    }
  }

  return fullText || '応答を取得できませんでした。';
}
