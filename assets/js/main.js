const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const apiKeyInput = document.getElementById('api-key');

// 保存されたKeyを呼び出す
apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.onchange = () => localStorage.setItem('gemini_api_key', apiKeyInput.value);

function toggleSettings() {
    document.getElementById('settings-modal').classList.toggle('hidden');
}

function addBubble(text, role) {
    const div = document.createElement('div');
    div.className = role === 'user' ? 
        "bg-slate-700 text-white p-4 rounded-2xl rounded-tr-none ml-auto max-w-[85%] shadow-md mb-2" : 
        "bg-slate-200 text-slate-800 p-4 rounded-2xl rounded-tl-none mr-auto max-w-[85%] shadow-sm mb-2";
    div.innerText = text;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
}

async function handleSend() {
    const text = userInput.value.trim();
    const key = apiKeyInput.value.trim();
    
    if (!text) return;
    if (!key) { alert("APIキーが設定されていません"); toggleSettings(); return; }

    addBubble(text, 'user');
    userInput.value = '';
    
    const loading = addBubble('思索中...', 'ai');
    
    try {
        const reply = await callGeminiAPI(text, key);
        loading.innerText = reply;
    } catch (e) {
        loading.innerText = "エラー：詠唱に失敗しました。Keyを確認してください。";
    }
}

// Enterキー対応
userInput.onkeypress = (e) => { if(e.key === 'Enter') handleSend(); };

function toggleDarkMode() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
    }
}