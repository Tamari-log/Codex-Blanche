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
  el.innerText = text || '';
  void el.offsetWidth;
  el.classList.add('reveal-fade-in');
}

window.appUi = { setThinkingMode, isMobileInputMode, addTransientDeleteButton, revealWithQuillEffect };
