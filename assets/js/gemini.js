// Gemini APIを叩くための独立した関数
async function callGeminiAPI(messages, apiKey, options = {}) {
    const { model = 'gemini-1.5-flash', temperature, maxTokens, systemInstruction, signal, onChunk } = options;
    const useStream = typeof onChunk === 'function';
    const endpoint = useStream ? 'streamGenerateContent' : 'generateContent';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}${useStream ? '&alt=sse' : ''}`;

    const contents = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'ai') && typeof m.text === 'string')
      .map((m) => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

    const payload = {
      contents,
      generationConfig: {
        temperature: Number.isFinite(temperature) ? temperature : undefined,
        maxOutputTokens: Number.isFinite(maxTokens) ? maxTokens : undefined,
      },
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) throw new Error('通信の儀式に失敗しました');

    if (!useStream) {
      const data = await response.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (!response.body) throw new Error('ストリーミングレスポンスを取得できませんでした');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    const flushEvent = (chunk) => {
      const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        let parsed;
        try { parsed = JSON.parse(raw); } catch { continue; }
        const delta = parsed?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
        if (!delta) continue;
        fullText += delta;
        onChunk(delta, fullText);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      events.forEach(flushEvent);
    }

    if (buffer.trim()) flushEvent(buffer);
    return fullText;
}
