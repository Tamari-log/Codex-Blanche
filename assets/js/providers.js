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

function buildProviderConnectionError(providerLabel, error) {
  if (error?.name === 'AbortError') return error;

  const rawMessage = (() => {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || '不明な通信エラー';
    if (typeof error?.message === 'string') return error.message;
    try { return JSON.stringify(error); } catch { return '不明な通信エラー'; }
  })();

  const lower = rawMessage.toLowerCase();
  const looksLikeTransportFailure = lower.includes('load failed')
    || lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('network request failed');
  const isOffline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;

  if (isOffline) {
    return new Error(`${providerLabel} APIへの接続に失敗しました（オフライン）。インターネット接続を確認してください。`);
  }
  if (looksLikeTransportFailure) {
    return new Error(
      `${providerLabel} APIへの接続に失敗しました（通信エラー）。`
      + ' ネットワーク、VPN/プロキシ、ブラウザ拡張機能、CORS制限を確認してください。'
      + ` 詳細: ${rawMessage}`
    );
  }

  return new Error(`${providerLabel} API呼び出し中にエラーが発生しました: ${rawMessage}`);
}

async function callGeminiAPI(messages, apiKey, options = {}) {
  const model = options.model || 'gemini-3.1-pro-preview';
  const hasOnChunk = typeof options.onChunk === 'function';
  const encodedApiKey = encodeURIComponent(apiKey || '');
  const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodedApiKey}`;
  const nonStreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodedApiKey}`;
  console.info('[stream][gemini][req] start', { model, hasOnChunk, messageCount: Array.isArray(messages) ? messages.length : 0 });

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
  if (options.allowSearch) body.tools = [{ google_search: {} }];
  if (systemMessage) {
    body.system_instruction = { parts: [{ text: systemMessage }] };
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  const readErrorDetail = async (response) => {
    try {
      const err = await response.json();
      return err?.error?.message || JSON.stringify(err);
    } catch {
      return response.text();
    }
  };

  const callGeminiNonStream = async () => {
    let response;
    try {
      response = await fetch(nonStreamUrl, {
        method: 'POST',
        signal: options.signal,
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw buildProviderConnectionError('Gemini', error);
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(`Gemini API リクエストに失敗しました（${response.status}）: ${detail}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error('Geminiの安全フィルタにより応答がブロックされました');
    }
    const text = candidate?.content?.parts?.map((part) => part?.text || '').join('') || '';
    return text || '応答を取得できませんでした。';
  };

  let response;
  try {
    response = await fetch(streamUrl, {
      method: 'POST',
      signal: options.signal,
      headers: {
        ...headers,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (!hasOnChunk || error?.name === 'AbortError') throw buildProviderConnectionError('Gemini', error);
    console.warn('[stream][gemini] 接続エラーのため通常応答へフォールバックします。', error);
    return callGeminiNonStream();
  }
  console.info('[stream][gemini][req] response', {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
    hasBody: !!response.body,
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    if (hasOnChunk && [400, 404, 405].includes(response.status)) {
      console.warn('[stream][gemini] ストリーミング未対応の可能性があるため通常応答へフォールバックします。', { status: response.status, detail });
      return callGeminiNonStream();
    }
    throw new Error(`Gemini API リクエストに失敗しました（${response.status}）: ${detail}`);
  }
  if (!response.body) {
    if (hasOnChunk) {
      console.warn('[stream][gemini] ストリームボディが無いため通常応答へフォールバックします。');
      return callGeminiNonStream();
    }
    throw new Error('Gemini API が読み取り可能なストリームを返しませんでした');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let pendingEventDataLines = [];
  let streamChunkCount = 0;
  let firstChunkAtMs = 0;
  const streamStartedAt = Date.now();

  const parseDeltaFromRaw = (rawText) => {
    const raw = String(rawText || '').trim();
    if (!raw || raw === '[DONE]') return '';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return '';
    }
    const firstCandidate = parsed?.candidates?.[0];
    if (firstCandidate?.finishReason === 'SAFETY') {
      throw new Error('Geminiの安全フィルタにより応答がブロックされました');
    }
    return firstCandidate?.content?.parts?.map((part) => part?.text || '').join('') || '';
  };

  const pushParsedText = (rawText, sink) => {
    const text = parseDeltaFromRaw(rawText);
    if (!text) return;
    sink.push(text);
  };

  const flushPendingEvent = (sink) => {
    if (!pendingEventDataLines.length) return;
    const raw = pendingEventDataLines.join('\n');
    pendingEventDataLines = [];
    pushParsedText(raw, sink);
  };

  async function* streamGeminiChunks() {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      const parsedChunks = [];
      for (const line of lines) {
        if (!line.trim()) {
          flushPendingEvent(parsedChunks);
          continue;
        }
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trimStart();
        if (!raw || raw === '[DONE]') continue;
        if (!pendingEventDataLines.length) {
          const singleLineDelta = parseDeltaFromRaw(raw);
          if (singleLineDelta) {
            parsedChunks.push(singleLineDelta);
            continue;
          }
        }
        pendingEventDataLines.push(raw);
      }
      for (const text of parsedChunks) {
        yield text;
      }
    }
    buffer += decoder.decode();
    const tailChunks = [];
    if (buffer.trim()) {
      if (buffer.startsWith('data:')) {
        pendingEventDataLines.push(buffer.slice(5).trimStart());
      } else {
        pushParsedText(buffer, tailChunks);
      }
    }
    flushPendingEvent(tailChunks);
    for (const text of tailChunks) {
      yield text;
    }
  }

  try {
    let chunksSinceUiYield = 0;
    for await (const chunkText of streamGeminiChunks()) {
      let deltaText = chunkText || '';
      if (fullText && deltaText.startsWith(fullText)) {
        deltaText = deltaText.slice(fullText.length);
      }
      if (!deltaText) continue;
      fullText += deltaText;
      streamChunkCount += 1;
      if (!firstChunkAtMs) firstChunkAtMs = Date.now();
      if (hasOnChunk) {
        options.onChunk(deltaText, fullText);
        chunksSinceUiYield += 1;
        // 受信ループが連続実行されるとブラウザ再描画が起きず、
        // 見た目が「一気に表示」になるため、定期的に制御を返す。
        if (chunksSinceUiYield >= 1) {
          chunksSinceUiYield = 0;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
  } catch (error) {
    if (!hasOnChunk || error?.name === 'AbortError') throw error;
    if (fullText.length > 0) {
      console.warn('[stream][gemini] 受信中エラーのため、受信済みテキストを返します。', error);
      return fullText;
    }
    console.warn('[stream][gemini] 受信中エラーのため通常応答へフォールバックします。', error);
    return callGeminiNonStream();
  }

  console.info('[stream][gemini][res] parsed', {
    hasCandidates: fullText.length > 0,
    candidateCount: fullText.length > 0 ? 1 : 0,
    streamChunkCount,
    firstChunkLatencyMs: firstChunkAtMs ? (firstChunkAtMs - streamStartedAt) : -1,
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

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
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
        tools: options.allowSearch ? [{ type: 'web_search_preview' }] : undefined,
        temperature: options.temperature,
        max_output_tokens: options.maxTokens,
      }),
    });
  } catch (error) {
    throw buildProviderConnectionError('OpenAI', error);
  }

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
