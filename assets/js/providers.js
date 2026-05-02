function normalizeGeminiContents(messages) {
  const normalized = [];

  messages
    .filter((msg) => msg.role !== 'system')
    .filter((msg) => {
      const textOk = typeof msg.text === 'string' && msg.text.trim().length > 0;
      const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
      const hasImage = attachments.some(
        (item) => item?.type === 'image' && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')
      );
      const hasFile = attachments.some((item) => item?.type === 'file' && typeof item.name === 'string' && item.name.trim().length > 0);
      return textOk || hasImage || hasFile;
    })
    .forEach((msg) => {
      const role = msg.role === 'ai' ? 'model' : 'user';
      const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
      const fileLines = attachments
        .filter((item) => item?.type === 'file' && typeof item.name === 'string' && item.name.trim().length > 0)
        .map((item) => {
          const mime = typeof item.mimeType === 'string' && item.mimeType.trim().length ? item.mimeType.trim() : 'unknown';
          return `- ${item.name.trim()} (${mime})`;
        });
      let text = typeof msg.text === 'string' ? msg.text.trim() : '';
      if (fileLines.length) {
        const fileBlock = ['[添付ファイル（ファイル内容は送信されず名前のみ）]', ...fileLines].join('\n');
        text = text ? `${text}\n\n${fileBlock}` : fileBlock;
      }
      if (!text && attachments.some((item) => item?.type === 'image')) {
        text = '(添付のみ)';
      }
      const imageParts = attachments
        .filter((item) => item?.type === 'image' && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/'))
        .map((item) => {
          const [, payload = ''] = item.dataUrl.split(',', 2);
          return { inline_data: { mime_type: item.mimeType || 'image/png', data: payload } };
        });
      const prev = normalized[normalized.length - 1];

      if (prev && prev.role === role) {
        prev.parts.push({ text });
        prev.parts.push(...imageParts);
      } else {
        normalized.push({ role, parts: [{ text }, ...imageParts] });
      }
    });

  while (normalized.length && normalized[0].role !== 'user') {
    normalized.shift();
  }

  return normalized;
}

async function callGeminiAPI(messages, apiKey, options = {}) {
  const model = options.model || 'gemini-3.1-pro-preview';
  const hasOnChunk = typeof options.onChunk === 'function';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContentStream?alt=sse`;
  console.info('[stream][gemini][req] start', {
    model,
    hasOnChunk,
    messageCount: Array.isArray(messages) ? messages.length : 0,
  });

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
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  console.info('[stream][gemini][req] response', {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    hasBody: !!response.body,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const err = await response.json();
      detail = err?.error?.message || JSON.stringify(err);
    } catch {
      detail = await response.text();
    }
    throw new Error(`Gemini API リクエストに失敗しました（${response.status}）: ${detail}`);
  }
  if (!response.body) {
    throw new Error('Gemini API が読み取り可能なストリームを返しませんでした');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  const flushEvent = (eventText) => {
    const chunks = [];
    const lines = eventText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const firstCandidate = parsed?.candidates?.[0];
      if (firstCandidate?.finishReason === 'SAFETY') {
        throw new Error('Geminiの安全フィルタにより応答がブロックされました');
      }
      const delta = firstCandidate?.content?.parts?.map((part) => part?.text || '').join('') || '';
      if (!delta) continue;
      chunks.push(delta);
    }
    return chunks;
  };

  async function* streamGeminiChunks() {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const eventText of events) {
        for (const delta of flushEvent(eventText)) {
          yield delta;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const delta of flushEvent(buffer)) {
        yield delta;
      }
    }
  }

  for await (const chunkText of streamGeminiChunks()) {
    fullText += chunkText;
    if (hasOnChunk) {
      options.onChunk(chunkText, fullText);
    }
  }

  console.info('[stream][gemini][res] parsed', {
    hasCandidates: fullText.length > 0,
    candidateCount: fullText.length > 0 ? 1 : 0,
  });
  return fullText || '応答を取得できませんでした。';
}

async function callOpenAIAPI(messages, apiKey, options = {}) {
  const model = options.model || 'gpt-5.3';
  const instructions = messages.find((m) => m.role === 'system')?.text || '';
  const toOpenAIContentParts = (message) => {
    const parts = [];
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    const fileLines = attachments
      .filter((item) => item?.type === 'file' && typeof item.name === 'string' && item.name.trim().length > 0)
      .map((item) => {
        const mime = typeof item.mimeType === 'string' && item.mimeType.trim().length ? item.mimeType.trim() : 'unknown';
        return `- ${item.name.trim()} (${mime})`;
      });
    let text = typeof message.text === 'string' ? message.text : '';
    if (fileLines.length) {
      const fileBlock = ['[添付ファイル（ファイル内容は送信されず名前のみ）]', ...fileLines].join('\n');
      text = text.trim().length ? `${text.trim()}\n\n${fileBlock}` : fileBlock;
    }
    if (typeof text === 'string' && text.trim().length) {
      parts.push({ type: 'input_text', text: text.trim() });
    }
    attachments
      .filter((item) => item?.type === 'image' && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/'))
      .forEach((item) => {
        parts.push({ type: 'input_image', image_url: item.dataUrl });
      });
    return parts.length ? parts : [{ type: 'input_text', text: '' }];
  };

  const input = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'ai' ? 'assistant' : m.role,
      content: toOpenAIContentParts(m),
    }));

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
    throw new Error(`OpenAI API リクエストに失敗しました（${response.status}）: ${detail}`);
  }
  const data = await response.json();
  return data.output_text || '応答を取得できませんでした。';
}
