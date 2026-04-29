let chatHistory = JSON.parse(localStorage.getItem('codex_history')) || [];
const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const apiKeyInput = document.getElementById('api-key');

window.addEventListener('DOMContentLoaded', () => {
    updateModeButton();
    renderHistory();
    apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
});

function saveHistory() {
    localStorage.setItem('codex_history', JSON.stringify(chatHistory));
}

function renderHistory() {
    chatArea.innerHTML = '';
    chatHistory.forEach((item, index) => {
        addBubble(item.text, item.role, index);
    });
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 吹き出し（Bubble）から、エントリ（Entry）へ進化
function addBubble(text, role, index = null) {
    const div = document.createElement('div');
    // CSSで定義した「紙の書き込み」スタイルを適用
    div.className = role === 'user' ? "user-msg" : "ai-msg";
    
    div.contentEditable = true;
    div.innerText = text;
    
    div.onblur = () => {
        if (index !== null && chatHistory[index]) {
            chatHistory[index].text = div.innerText;
            saveHistory();
        }
    };

    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
}

function clearHistory() {
    if(confirm('全ての写本を焼却しますか？')) {
        chatHistory = [];
        saveHistory();
        renderHistory();
    }
}

function updateModeButton() {
    const btn = document.getElementById('mode-toggle-btn');
    if (!btn) return;
    btn.innerHTML = document.documentElement.classList.contains('dark') ? '☀️ ライトモードへ' : '🌙 ダークモードへ';
}

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    updateModeButton();
}

userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

function toggleSettings() {
    document.getElementById('settings-modal').classList.toggle('hidden');
}

async function handleSend() {
    const text = userInput.value.trim();
    const key = apiKeyInput.value.trim();
    if (!text || !key) return;

    chatHistory.push({ role: 'user', text: text });
    saveHistory();
    renderHistory();
    
    userInput.value = '';
    userInput.style.height = 'auto';
    
    const loading = addBubble('思索中...', 'ai');
    
    try {
        const reply = await callGeminiAPI(text, key);
        chatHistory.push({ role: 'ai', text: reply });
        saveHistory();
        renderHistory();
    } catch (e) {
        loading.innerText = "エラー：詠唱に失敗しました。";
    }
}

apiKeyInput.onchange = () => {
    localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
};
