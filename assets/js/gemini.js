// Gemini APIを叩くための独立した関数
async function callGeminiAPI(text, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }]
        })
    });

    if (!response.ok) throw new Error('通信の儀式に失敗しました');
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}