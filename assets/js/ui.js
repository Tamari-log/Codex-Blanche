
function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdownText(text = '') {
  let html = escapeHtml(text).replace(/\r\n/g, '\n');
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  const lines = html.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${li[1]}</li>`);
      continue;
    }
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    out.push(line.trim() ? `<p>${line}</p>` : '');
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function applyBubbleText(el, text = '', { markdown = false } = {}) {
  if (!el) return;
  const normalized = text || '';
  el.dataset.rawText = normalized;
  if (markdown) {
    el.innerHTML = renderMarkdownText(normalized);
  } else {
    el.innerText = normalized;
  }
}

function setThinkingMode(sendBtn, isThinking, icons) {
  if (!sendBtn) return;
  sendBtn.innerText = isThinking ? icons.stop : icons.default;
  sendBtn.setAttribute('aria-label', isThinking ? '生成を中断' : '送信');
}

function isMobileInputMode(mediaQuery) {
  return window.matchMedia(mediaQuery).matches;
}

function addTransientDeleteButton(targetWrap) {
  if (!targetWrap) return;
  const controls = document.createElement('div');
  controls.className = 'flex justify-end gap-2 text-xs';
  const del = document.createElement('button');
  del.className = 'px-2 py-1 rounded bg-slate-700 text-white';
  del.innerText = '削除';
  del.onclick = () => targetWrap.remove();
  controls.appendChild(del);
  targetWrap.appendChild(controls);
}

async function revealWithQuillEffect(chatArea, el, text) {
  el.classList.remove('reveal-fade-in');
  applyBubbleText(el, text || '', { markdown: true });
  void el.offsetWidth;
  el.classList.add('reveal-fade-in');
}

window.appUi = { setThinkingMode, isMobileInputMode, addTransientDeleteButton, revealWithQuillEffect, applyBubbleText };
