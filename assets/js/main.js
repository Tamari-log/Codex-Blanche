let chatHistory = JSON.parse(localStorage.getItem('codex_history')) || [];
const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const apiKeyInput = document.getElementById('api-key');

// 起動時に保存された履歴を展開する
window.addEventListener('DOMContentLoaded', () => {
    updateModeButton();
    renderHistory();
    apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
});

// 履歴を画面に描画する（編集ボタン付き）
function renderHistory() {
    chatArea.innerHTML = '';
    chatHistory.forEach((item, index) => {
        addBubble(item.text, item.role, index);
    });
}

// 吹き出しを追加（indexを付与して編集可能に）
function addBubble(text, role, index = null) {
    const div = document.createElement('div');
    const isUser = role === 'user';
    div.className = isUser ? "user-msg" : "ai-msg";
    
    // 中身をテキストエリアのように編集可能にする
    div.contentEditable = true;
    div.innerText = text;
    
    // 編集が終わったら保存する
    div.onblur = () => {
        if (index !== null) {
            chatHistory[index].text = div.innerText;
            saveHistory();
        }
    };

    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
}

// 履歴をlocalStorageに刻む
function saveHistory() {
    localStorage.setItem('codex_history', JSON.stringify(chatHistory));
}

async function handleSend() {
    const text = userInput.value.trim();
    const key = apiKeyInput.value.trim();
    if (!text || !key) return;

    // 自分の発言を保存
    chatHistory.push({ role: 'user', text: text });
    const userIdx = chatHistory.length - 1;
    addBubble(text, 'user', userIdx);
    
    userInput.value = '';
    userInput.style.height = 'auto';
    
    const loading = addBubble('思索中...', 'ai');
    
    try {
        const reply = await callGeminiAPI(text, key);
        // AIの返答を保存
        chatHistory.push({ role: 'ai', text: reply });
        saveHistory();
        renderHistory(); // 編集インデックスを確定させるために再描画
    } catch (e) {
        loading.innerText = "エラー：詠唱失敗。";
    }
}
