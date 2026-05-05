
function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MARKDOWN_RENDER_CACHE_LIMIT = 160;
const markdownRenderCache = new Map();

function getCachedMarkdownRender(source) {
  if (markdownRenderCache.has(source)) {
    const cached = markdownRenderCache.get(source);
    markdownRenderCache.delete(source);
    markdownRenderCache.set(source, cached);
    return cached;
  }
  const rendered = renderMarkdownTextUncached(source);
  markdownRenderCache.set(source, rendered);
  if (markdownRenderCache.size > MARKDOWN_RENDER_CACHE_LIMIT) {
    const oldestKey = markdownRenderCache.keys().next().value;
    markdownRenderCache.delete(oldestKey);
  }
  return rendered;
}

function renderMarkdownTextUncached(text = '') {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const codeBlockTokens = [];
  const tokenized = source.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = escapeHtml(String(lang || '').trim());
    const escapedCode = escapeHtml(String(code || '').trim());
    const className = language ? ` class="language-${language}"` : '';
    const token = `@@CODEBLOCK_${codeBlockTokens.length}@@`;
    codeBlockTokens.push(`<pre><code${className}>${escapedCode}</code></pre>`);
    return token;
  });

  const applyInlineMarkdown = (value = '') => {
    let line = escapeHtml(value);
    line = line.replace(/!\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2">');
    line = line.replace(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    line = line
      .split(/(<[^>]+>)/g)
      .map((segment) => {
        if (segment.startsWith('<')) return segment;
        return segment.replace(/(^|[\s(])(https?:\/\/[^\s<)"']+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
      })
      .join('');
    line = line.replace(/`([^`]+)`/g, '<code>$1</code>');
    line = line.replace(/~~(.*?)~~/g, '<del>$1</del>');
    line = line.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return line;
  };

  const lines = tokenized.split('\n');
  const out = [];
  let listType = '';
  const closeListIfNeeded = () => {
    if (!listType) return;
    out.push(listType === 'ol' ? '</ol>' : '</ul>');
    listType = '';
  };
  const parseTableCells = (line) => {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((cell) => cell.trim());
  };
  const isTableSeparatorLine = (line) => {
    const cells = parseTableCells(line);
    if (!cells.length) return false;
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  };
  const alignmentForCell = (cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const next = lines[i + 1] || '';
    const codeToken = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
    if (codeToken) {
      closeListIfNeeded();
      out.push(codeBlockTokens[Number(codeToken[1])] || '');
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeListIfNeeded();
      const level = Math.min(6, heading[1].length);
      out.push(`<h${level}>${applyInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (line.includes('|') && next.includes('|') && isTableSeparatorLine(next)) {
      closeListIfNeeded();
      const headerCells = parseTableCells(line).map((cell) => applyInlineMarkdown(cell));
      const alignCells = parseTableCells(next).map(alignmentForCell);
      if (headerCells.length < 2 || alignCells.length !== headerCells.length) {
        out.push(trimmed ? `<p>${applyInlineMarkdown(line)}</p>` : '');
        continue;
      }
      const bodyRows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        const rawCells = parseTableCells(lines[i]);
        if (rawCells.length !== headerCells.length || isTableSeparatorLine(lines[i])) break;
        const rowCells = rawCells.map((cell) => applyInlineMarkdown(cell));
        if (!rowCells.length) break;
        bodyRows.push(rowCells);
        i += 1;
      }
      i -= 1;

      const thead = `<thead><tr>${headerCells.map((cell, idx) => {
        const align = alignCells[idx] ? ` style="text-align:${alignCells[idx]}"` : '';
        return `<th${align}>${cell}</th>`;
      }).join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows.map((row) => `<tr>${row.map((cell, idx) => {
        const align = alignCells[idx] ? ` style="text-align:${alignCells[idx]}"` : '';
        return `<td${align}>${cell}</td>`;
      }).join('')}</tr>`).join('')}</tbody>`;
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      closeListIfNeeded();
      out.push('<hr>');
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeListIfNeeded();
      out.push(`<blockquote><p>${applyInlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }
    const ulItem = line.match(/^[-*+]\s+(.*)$/);
    if (ulItem) {
      if (listType !== 'ul') {
        closeListIfNeeded();
        out.push('<ul>');
        listType = 'ul';
      }
      const task = ulItem[1].match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
        out.push(`<li class="task-list-item"><input type="checkbox" disabled${checked}><span>${applyInlineMarkdown(task[2])}</span></li>`);
      } else {
        out.push(`<li>${applyInlineMarkdown(ulItem[1])}</li>`);
      }
      continue;
    }
    const olItem = line.match(/^\d+[.)]\s+(.*)$/);
    if (olItem) {
      if (listType !== 'ol') {
        closeListIfNeeded();
        out.push('<ol>');
        listType = 'ol';
      }
      const task = olItem[1].match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
        out.push(`<li class="task-list-item"><input type="checkbox" disabled${checked}><span>${applyInlineMarkdown(task[2])}</span></li>`);
      } else {
        out.push(`<li>${applyInlineMarkdown(olItem[1])}</li>`);
      }
      continue;
    }
    closeListIfNeeded();
    out.push(trimmed ? `<p>${applyInlineMarkdown(line)}</p>` : '');
  }
  closeListIfNeeded();
  return out.join('');
}

function applyBubbleText(el, text = '', { markdown = false } = {}) {
  if (!el) return;
  const normalized = text || '';
  const nextMode = markdown ? 'markdown' : 'plain';
  if (el.dataset.rawText === normalized && el.dataset.renderMode === nextMode) return;
  el.dataset.rawText = normalized;
  el.dataset.renderMode = nextMode;
  if (markdown) {
    el.innerHTML = getCachedMarkdownRender(normalized);
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

function createInkRevealer({ chatArea, el, mode = 'normal', canAutoScroll } = {}) {
  if (!el) {
    return {
      enqueue: () => {},
      finish: () => {},
      cancel: () => {},
      waitForIdle: () => Promise.resolve(),
    };
  }

  const speedPreset = {
    live: { minChars: 1, maxChars: 2, baseDelay: 24, jitter: 8, punctuationPause: 20 },
    slow: { minChars: 1, maxChars: 2, baseDelay: 52, jitter: 26, punctuationPause: 130 },
    batch: { minChars: 20, maxChars: 80, baseDelay: 260, jitter: 40, punctuationPause: 0 },
    normal: { minChars: 1, maxChars: 3, baseDelay: 34, jitter: 20, punctuationPause: 90 },
    fast: { minChars: 2, maxChars: 6, baseDelay: 20, jitter: 12, punctuationPause: 55 },
  };

  const preset = speedPreset[mode] || speedPreset.normal;
  const punctuationPattern = /[、。,.!?！？…]/;
  let queue = '';
  let rendered = '';
  let finalText = '';
  let closed = false;
  let cancelled = false;
  let loopRunning = false;
  let idleResolver = null;
  const idlePromise = new Promise((resolve) => { idleResolver = resolve; });

  const scrollToBottom = () => {
    if (!chatArea) return;
    if (typeof canAutoScroll === 'function' && !canAutoScroll()) return;
    chatArea.scrollTop = chatArea.scrollHeight;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const renderProgress = () => {
    if (cancelled) return;
    el.dataset.rawText = rendered;
    el.dataset.renderMode = 'plain';
    el.innerText = rendered;
    scrollToBottom();
  };

  const complete = () => {
    if (cancelled) return;
    const result = finalText || rendered;
    applyBubbleText(el, result, { markdown: true });
    scrollToBottom();
    if (idleResolver) {
      idleResolver();
      idleResolver = null;
    }
  };

  const computeTake = () => {
    const width = preset.maxChars - preset.minChars + 1;
    return preset.minChars + Math.floor(Math.random() * Math.max(1, width));
  };

  const computeDelay = () => {
    const last = rendered.charAt(rendered.length - 1);
    const punctuationPause = punctuationPattern.test(last)
      ? preset.punctuationPause + Math.floor(Math.random() * 35)
      : 0;
    const jitter = Math.floor((Math.random() * (preset.jitter * 2 + 1)) - preset.jitter);
    return Math.max(10, preset.baseDelay + jitter + punctuationPause);
  };

  const runLoop = async () => {
    if (loopRunning || cancelled) return;
    loopRunning = true;
    try {
      while (!cancelled) {
        if (queue.length > 0) {
          const take = computeTake();
          const slice = queue.slice(0, take);
          queue = queue.slice(slice.length);
          rendered += slice;
          renderProgress();
          await sleep(computeDelay());
          continue;
        }
        if (closed) {
          complete();
          break;
        }
        await sleep(16);
      }
    } finally {
      loopRunning = false;
    }
  };

  return {
    enqueue(delta = '') {
      if (cancelled || !delta) return;
      queue += String(delta);
      runLoop();
    },
    finish(nextFinalText = '') {
      if (cancelled) return;
      if (typeof nextFinalText === 'string' && nextFinalText.length) {
        finalText = nextFinalText;
        const totalLength = rendered.length + queue.length;
        if (nextFinalText.length > totalLength) {
          queue += nextFinalText.slice(totalLength);
        }
      } else {
        finalText = rendered + queue;
      }
      closed = true;
      runLoop();
    },
    cancel() {
      cancelled = true;
      if (idleResolver) {
        idleResolver();
        idleResolver = null;
      }
    },
    waitForIdle() {
      return idlePromise;
    },
  };
}

window.appUi = { setThinkingMode, isMobileInputMode, addTransientDeleteButton, revealWithQuillEffect, applyBubbleText, createInkRevealer };
