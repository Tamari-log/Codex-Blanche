const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const apiKeyInput = document.getElementById('api-key');

// 保存されたKeyを呼び出す
apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
apiKeyInput.onchange = () => localStorage.setItem('gemini_api_key', apiKeyInput.value);

function toggleSettings() {
    document.getElementById('settings-modal').classList.toggle('hidden');
}

const userInput = document.getElementById('user-input');

userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    
    if (this.scrollHeight > 150) {
        this.style.overflowY = 'scroll';
        this.style.height = '150px';
    } else {
        this.style.overflowY = 'hidden';
    }
});

async function handleSend() {
    const text = userInput.value.trim();
    const key = apiKeyInput.value.trim();
    
    if (!text || !key) return;

    addBubble(text, 'user');
    userInput.value = '';
    userInput.style.height = 'auto'; // 高さを元に戻す
    
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

function updateModeButton() {
    const btn = document.getElementById('mode-toggle-btn');
    if (!btn) return;
    if (document.documentElement.classList.contains('dark')) {
        btn.innerHTML = '☀️ ライトモードへ';
    } else {
        btn.innerHTML = '🌙 ダークモードへ';
    }
}

// 既存の toggleDarkMode の最後に updateModeButton() を呼ぶ
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    updateModeButton();
}

// 起動時にボタンを正しく表示
window.addEventListener('DOMContentLoaded', updateModeButton);