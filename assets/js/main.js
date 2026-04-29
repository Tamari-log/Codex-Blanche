// --- 1. 変数と初期化 ---
let chatHistory = JSON.parse(localStorage.getItem('codex_history')) || [];
const chatArea = document.getElementById('chat-area');
const userInput = document.getElementById('user-input');
const apiKeyInput = document.getElementById('api-key');

// ページ読み込み時の処理
window.addEventListener('DOMContentLoaded', () => {
    updateModeButton(); // ボタンの☀️/🌙表示
    renderHistory();    // 履歴の描画
    apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
});

// --- 2. 履歴の描画と保存 ---

// 履歴をlocalStorageに保存する
function saveHistory() {
    localStorage.setItem('codex_history', JSON.stringify(chatHistory));
}

// 画面をリセットして履歴をすべて描き出す
function renderHistory() {
    chatArea.innerHTML = '';
    chatHistory.forEach((item, index) => {
        addBubble(item.text, item.role, index);
    });
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 吹き出しを生成する（編集機能付き）
function addBubble(text, role, index = null) {
    const div = document.createElement('div');
    const isUser = role === 'user';
    
    // CSSで定義したクラスを適用
    div.className = isUser ? "user-msg" : "ai-msg";
    div.style.marginBottom = "1rem"; // 吹き出し間の余白
    
    // 内容を編集可能にする
    div.contentEditable = true;
    div.innerText = text;
    
    // 編集が終わってフォーカスが外れたら履歴を更新して保存
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

// 履歴をすべて消去する
function clearHistory() {
    if(confirm('全ての写本を焼却しますか？（会話履歴を消去します）')) {
        chatHistory = [];
        saveHistory();
        renderHistory();
    }
}

// --- 3. UIの制御 (ダークモード・入力欄) ---

// ダークモードのボタン表示を更新
function updateModeButton() {
    const btn = document.getElementById('mode-toggle-btn');
    if (!btn) return;
    
    if (document.documentElement.classList.contains('dark')) {
        btn.innerHTML = '☀️ ライトモードへ';
    } else {
        btn.innerHTML = '🌙 ダークモードへ';
    }
}

// ダークモードの切り替え
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.theme = isDark ? 'dark' : 'light';
    updateModeButton();
}

// 入力欄の高さを文字数に合わせて自動調整
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    
    // 高くなりすぎたらスクロールさせる
    if (this.scrollHeight > 150) {
        this.style.overflowY = 'scroll';
        this.style.height = '150px';
    } else {
        this.style.overflowY = 'hidden';
    }
});

// 設定画面の開閉
function toggleSettings() {
    document.getElementById('settings-modal').classList.toggle('hidden');
}

// --- 4. 通信と送信処理 ---

async function handleSend() {
    const text = userInput.value.trim();
    const key = apiKeyInput.value.trim();
    
    if (!text) return;
    if (!key) {
        alert("秘術の鍵（APIキー）が設定されていません。設定画面から入力してください。");
        toggleSettings();
        return;
    }

    // 1. ユーザーの発言を保存・表示
    chatHistory.push({ role: 'user', text: text });
    saveHistory();
    renderHistory(); // 編集用インデックス確定のため再描画
    
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // 2. 「考え中」の仮吹き出しを表示
    const loading = addBubble('思索中...', 'ai');
    
    try {
        // gemini.js の関数を呼び出し
        const reply = await callGeminiAPI(text, key);
        
        // 3. AIの返答を保存・表示
        chatHistory.push({ role: 'ai', text: reply });
        saveHistory();
        renderHistory();
    } catch (e) {
        loading.innerText = "エラー：詠唱に失敗しました。Keyを確認してください。";
        console.error(e);
    }
}

// キー入力（Enter）で送信（スマホだと改行になる場合もあるので注意）
// Shift+Enterは改行、Enter単体は送信にしたい場合はここを調整
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

// APIキーの保存
apiKeyInput.onchange = () => {
    localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
};
